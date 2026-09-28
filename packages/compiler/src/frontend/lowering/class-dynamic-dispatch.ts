import { BOOL, DYN, STRING, VOID, isDynTypedRefType, typeEquals, typeKey, type IrExpr, type IrFunction, type IrStmt, type IrType } from "../../ir/ir.js";
import { varRef } from "../../ir/build.js";
import { everyStmtList, transformStmtList } from "../../ir/traverse.js";
import { dynUndefinedExpr, PoisonError, type Lowerer } from "./lowerer.js";
import { implicitDefaultInstance, type ParamShape } from "./lower-calls.js";
import { findGenericMethodOn, findMethodOn, upcastTo, type ClassInfo } from "./lower-classes.js";

type Invoke = Extract<IrExpr, { kind: "dynInvoke" }>;
interface Dispatch {
  source: Invoke;
  fn: IrFunction;
  classes: Set<string>;
}

/** Calls on native class capsules keep the instance's compiled methods. The
 * reachable-body fixed point discovers both the boxed classes and method
 * names before generating checked native dispatch; ordinary dyn receivers
 * continue through their existing runtime implementation. */
export class ClassDynamicDispatch {
  private readonly boxed = new Set<string>();
  private readonly dispatches = new Map<string, Dispatch>();
  private readonly generated = new Set<IrFunction>();

  process(lowerer: Lowerer, functions: readonly IrFunction[]): boolean {
    const seenTypes = new Set<string>();
    const discover = (type: IrType): void => {
      const key = typeKey(type);
      if (seenTypes.has(key)) return;
      seenTypes.add(key);
      if (isDynTypedRefType(type)) this.boxed.add(type.className);
      else if (type.kind === "array") discover(type.elem);
      else if (type.kind === "record") {
        const shape = lowerer.shapes.get(type.shapeId);
        shape?.fields.forEach((field) => discover(field.type));
        if (shape?.indexValue) discover(shape.indexValue);
      } else if (type.kind === "union") lowerer.unions.get(type.unionId)?.arms.forEach(discover);
      else if (type.kind === "func") discover(type.ret);
      else if (type.kind === "promise") discover(type.inner);
    };
    for (const fn of functions) everyStmtList(fn.body, {
      stmt: () => true,
      expr: (expr) => {
        if (expr.kind === "dynFrom") discover(expr.value.type);
        return true;
      },
    });
    if (this.boxed.size === 0) return false;
    let changed = false;
    const byMethod = new Map<string, ClassInfo[]>();
    const candidates = (method: string): ClassInfo[] => {
      const found = byMethod.get(method);
      if (found) return found;
      const matching = [...this.boxed].flatMap((name) => {
        const info = lowerer.classes.get(name);
        if (!info || info.fields.has(method) || info.builtinEmitter || info.builtinStream || info.builtinError) return [];
        return findMethodOn(lowerer, info, method) || findGenericMethodOn(lowerer, info, method) ? [info] : [];
      });
      byMethod.set(method, matching);
      return matching;
    };
    for (const fn of functions) {
      if (this.generated.has(fn)) continue;
      fn.body = transformStmtList(fn.body, {
        stmt: (stmt) => stmt,
        expr: (expr) => {
          if (expr.kind !== "dynInvoke" || candidates(expr.method).length === 0) return expr;
          const key = JSON.stringify([expr.method, expr.calleeName, expr.args.length]);
          let dispatch = this.dispatches.get(key);
          if (!dispatch) {
            const params = [expr.recv, ...expr.args].map((_, i) => ({ localId: `p.${i}`, name: `p${i}`, type: DYN }));
            const helper: IrFunction = {
              name: `%dyn.class.call.${this.dispatches.size}`, params, returnType: DYN,
              locals: params.map((p) => ({ id: p.localId, name: p.name, type: DYN, mutable: false })),
              body: [{ kind: "return", value: { ...expr, recv: varRef("p.0", DYN, expr.loc), args: expr.args.map((_, i) => varRef(`p.${i + 1}`, DYN, expr.loc)) }, loc: expr.loc }],
              loc: expr.loc,
            };
            dispatch = { source: expr, fn: helper, classes: new Set() };
            this.dispatches.set(key, dispatch);
            this.generated.add(helper);
            lowerer.liftedFns.push(helper);
            changed = true;
          }
          return { kind: "call", callee: dispatch.fn.name, args: [expr.recv, ...expr.args], type: DYN, loc: expr.loc };
        },
      });
    }
    for (const dispatch of this.dispatches.values()) {
      for (const info of candidates(dispatch.source.method)) {
        if (dispatch.classes.has(info.def.name)) continue;
        dispatch.classes.add(info.def.name);
        const loc = dispatch.source.loc;
        const type: IrType = { kind: "object", className: info.def.name };
        const receiver = varRef("p.0", DYN, loc);
        const before = lowerer.diags.length;
        let branch: IrStmt[];
        try {
          branch = this.methodBody(lowerer, dispatch, info, { kind: "dynCheck", value: receiver, type, loc });
        } catch (error) {
          if (!(error instanceof PoisonError) || !info.decl) throw error;
          const fence = lowerer.deferToRuntimeFence(before, info.decl, { kind: "statement" });
          if (!fence) throw error;
          branch = [fence];
        }
        dispatch.fn.body.unshift({
          kind: "if", cond: {
            kind: "libCall", fn: "dyn.typedRefIs", args: [receiver, { kind: "strLit", value: typeKey(type), type: STRING, loc }], type: BOOL, loc,
          }, then: branch, else_: null, loc,
        });
        changed = true;
      }
    }
    return changed;
  }

  private methodBody(lowerer: Lowerer, dispatch: Dispatch, info: ClassInfo, receiver: IrExpr): IrStmt[] {
    const { method, loc } = dispatch.source;
    const fence = (): IrStmt[] => [{ kind: "runtimeFence", code: "SC2020", message: `calling '${method}' on this native class through an untyped value is not supported yet`, loc }];
    const methodInfo = findMethodOn(lowerer, info, method);
    const generic = methodInfo ? null : findGenericMethodOn(lowerer, info, method);
    let params: ParamShape[];
    let result: IrType;
    let callee: string;
    let virtual = false;
    let owner: ClassInfo;
    if (methodInfo) {
      owner = methodInfo.declarer;
      params = methodInfo.sig.params;
      result = methodInfo.sig.ret;
      callee = `%${owner.def.name}.${method}`;
      virtual = lowerer.overrideBelow(owner, method) || methodInfo.sig.abstract === true;
    } else if (generic?.info.implicitParams && generic.declarer.decl && !lowerer.inHierarchy(info)) {
      owner = generic.declarer;
      // A failed eager specialization leaves a signature in the instance
      // cache, but no body. Later dispatch arities must retain the fence
      // instead of turning that cached signature into an unresolved call.
      const instance = implicitDefaultInstance(lowerer, generic.declarer.decl, generic.info);
      if (!lowerer.implicitFns.some((fn) => fn.name === instance.name)) return fence();
      params = instance.params;
      result = instance.returnType;
      callee = instance.name;
    } else return fence();
    const incoming = dispatch.source.args.map((_, i) => varRef(`p.${i + 1}`, DYN, loc));
    const args: IrExpr[] = [];
    let index = 0;
    for (const param of params) {
      if ((param.mode === "dynRest" || param.mode === "arguments") && param.type.kind === "dyn") {
        args.push({ kind: "dynArrLit", elems: param.mode === "arguments" ? incoming : incoming.slice(index), type: DYN, loc });
        index = incoming.length;
        continue;
      }
      if (param.mode === "rest" && param.type.kind === "array") {
        const element = param.type.elem;
        const elems = incoming.slice(index).map((value) => lowerer.coerceToExpected(value, element));
        if (elems.some((value) => !typeEquals(value.type, element))) return fence();
        args.push({ kind: "arrayLit", elems, type: param.type, loc });
        index = incoming.length;
        continue;
      }
      if (param.mode !== "required" && param.mode !== "omittable") return fence();
      const value = incoming[index++] ?? param.callDefault ?? dynUndefinedExpr(loc);
      const converted = lowerer.coerceToExpected(value, param.type);
      if (!typeEquals(converted.type, param.type)) return fence();
      args.push(converted);
    }
    const call: IrExpr = virtual
      ? { kind: "virtualCall", className: owner.def.name, method, args: [upcastTo(lowerer, receiver, owner.def.name), ...args], type: result, loc }
      : { kind: "call", callee, args: [upcastTo(lowerer, receiver, owner.def.name), ...args], type: result, loc };
    let body: IrStmt[];
    if (result.kind === "void") body = [
      { kind: "exprStmt", expr: { ...call, type: VOID }, loc },
      { kind: "return", value: dynUndefinedExpr(loc), loc },
    ];
    else {
      const boxed = lowerer.coerceToExpected(call, DYN);
      if (boxed.type.kind !== "dyn") return fence();
      body = [{ kind: "return", value: boxed, loc }];
    }
    if (methodInfo) {
      if (virtual) lowerer.noteVirtualEdge(owner, method);
      else lowerer.noteEdge(callee);
    }
    return body;
  }
}
