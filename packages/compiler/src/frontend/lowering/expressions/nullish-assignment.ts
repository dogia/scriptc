import * as ts from "../../ts7/adapter.js";
import { DYN, STRING, VOID, isUnitType, type IrExpr, type IrStmt, type IrType } from "../../../ir/ir.js";
import { varRef } from "../../../ir/build.js";
import { locOf } from "../../program.js";
import type { Lowerer } from "../lowerer.js";
import { arrayValueRead, arrayValueStore } from "../array-values.js";
import { fenceNodeModuleMutation } from "../lower-node-module.js";
import { globalSymbolKey } from "./global-symbols.js";
import { tryLowerExpression } from "./try-lower-expression.js";

/** The reference and its read evaluate once; the write exists only in the
 * nullish branch. In particular an accessor setter never runs for a kept value. */
export function lowerNullishAssignment(lowerer: Lowerer, expr: ts.BinaryExpression): IrExpr {
  const loc = locOf(expr);
  const prefix: IrStmt[] = [];
  const save = (value: IrExpr, name: string): IrExpr => {
    const local = lowerer.declareHiddenLocal(name, value.type);
    prefix.push({ kind: "varDecl", localId: local.id, init: value, loc: value.loc });
    return varRef(local.id, value.type, value.loc);
  };
  let target = expr.left;
  while (ts.isParenthesizedExpression(target)) target = target.expression;
  let read: IrExpr;
  let storage: IrType;
  let write: (value: IrExpr) => IrStmt;
  if (ts.isIdentifier(target)) {
    const binding = lowerer.resolveWritable(target);
    if (!binding) lowerer.rejectUnresolved(target, "nullish assignment to a non-writable binding");
    storage = binding.type;
    read = varRef(binding.id, binding.type, locOf(target));
    write = (value) => ({ kind: "assign", localId: binding.id, value, loc });
  } else if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
    fenceNodeModuleMutation(lowerer, target, "assignment");
    if (target.questionDotToken || target.expression.kind === ts.SyntaxKind.SuperKeyword) {
      lowerer.unsupported("SC1090", target, "nullish assignment through optional or super references");
    }
    const globalKey = ts.isElementAccessExpression(target) ? globalSymbolKey(lowerer, target.expression, target.argumentExpression) : null;
    if (globalKey) {
      const key = save(globalKey, "%nullishKey");
      storage = DYN;
      read = { kind: "libCall", fn: "dyn.globalSymbolGet", args: [key], type: DYN, loc };
      write = (value) => ({ kind: "exprStmt", expr: { kind: "libCall", fn: "dyn.globalSymbolSet", args: [key, value], type: VOID, loc }, loc });
    } else if (ts.isPropertyAccessExpression(target)) {
      const probed = tryLowerExpression(lowerer, target.expression);
      if (probed?.type.kind === "dyn") {
        const receiver = save(probed, "%nullishReceiver");
        const key: IrExpr = { kind: "strLit", value: target.name.text, type: STRING, loc };
        storage = DYN;
        read = { kind: "dynKeyGet", key, value: receiver, type: DYN, loc };
        write = (value) => ({ kind: "exprStmt", expr: { kind: "libCall", fn: "dyn.keySet", args: [receiver, key, value], type: VOID, loc }, loc });
      } else {
        const field = lowerer.fieldTarget(target);
        if (!field) lowerer.unsupported("SC1090", target, "nullish assignment to an unsupported property");
        field.obj = save(field.obj, "%nullishReceiver");
        read = lowerer.fieldGetExpr(field, locOf(target), target);
        storage = field.fieldType;
        const blame = target;
        write = (value) => lowerer.fieldSetStmt(field, value, loc, blame);
      }
    } else {
      const receiver = save(lowerer.lowerExpr(target.expression), "%nullishReceiver");
      let key = lowerer.lowerExpr(target.argumentExpression);
      if (receiver.type.kind === "dyn") {
        if (key.type.kind !== "string" && key.type.kind !== "f64" && key.type.kind !== "bool") {
          lowerer.unsupported("SC1090", target.argumentExpression, "nullish assignment with non-scalar property keys");
        }
        key = save(lowerer.ensureString(key, target.argumentExpression), "%nullishKey");
        storage = DYN;
        read = { kind: "dynKeyGet", key, value: receiver, type: DYN, loc };
        write = (value) => ({ kind: "exprStmt", expr: { kind: "libCall", fn: "dyn.keySet", args: [receiver, key, value], type: VOID, loc }, loc });
      } else if (receiver.type.kind === "array" && key.type.kind === "f64") {
        key = save(key, "%nullishKey");
        storage = receiver.type.elem;
        read = arrayValueRead(lowerer, receiver, key, storage, locOf(target));
        const element = storage;
        write = (value) => arrayValueStore(lowerer, receiver, key, value, element, loc);
      } else {
        lowerer.unsupported("SC1090", target, "nullish assignment through this indexed receiver");
      }
    }
  } else {
    lowerer.unsupported("SC1090", target, "nullish assignment to this reference");
  }
  const finish = (result: IrExpr): IrExpr => prefix.length === 0 ? result : { kind: "seqExpr", stmts: prefix, result, type: result.type, loc };
  if (!isUnitType(read.type) && read.type.kind !== "dyn" && read.type.kind !== "jsval" &&
      (read.type.kind !== "union" || !lowerer.unions.get(read.type.unionId)?.arms.some(isUnitType))) {
    return finish(read);
  }
  const value = lowerer.lowerExprExpecting(expr.right, storage);
  const assigned = lowerer.declareHiddenLocal("%nullishValue", value.type);
  const ref = varRef(assigned.id, value.type, loc);
  const result = lowerer.coerceInto(expr.right, ref, read.type);
  const right: IrExpr = {
    kind: "seqExpr", stmts: [{ kind: "varDecl", localId: assigned.id, init: value, loc }, write(ref)],
    result, type: result.type, loc,
  };
  if (isUnitType(read.type)) {
    prefix.push({ kind: "exprStmt", expr: read, loc });
    return finish(right);
  }
  return finish({ kind: "nullish", left: read, right, type: read.type, loc });
}
