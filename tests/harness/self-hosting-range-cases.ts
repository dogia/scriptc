import { BOOL, F64, VOID, arrayOf, type IrExpr, type IrFunction, type IrModule, type IrStmt } from "../../packages/compiler/src/ir/ir.js";
import { IR_VERSION } from "../../packages/compiler/src/ir/serialize.js";

export interface RangeCase {
  name: string;
  module: IrModule;
  expected: { start: number; min: number | null; max: number | null; present?: boolean }[];
}

/** Source positions identify expression occurrences across serialization;
 * object identity is deliberately exercised inside the native fixture too. */
export function integerRangeCases(): RangeCase[] {
  let position = 0;
  const loc = () => ({ file: "ranges.ts", start: position++, end: position });
  const number = (value: number): IrExpr => ({ kind: "numLit", value, type: F64, loc: loc() });
  const reference = (localId = "x"): IrExpr => ({ kind: "varRef", localId, type: F64, loc: loc() });
  const binary = (op: Extract<IrExpr, { kind: "bin" }>["op"], left: IrExpr, right: IrExpr): IrExpr => ({ kind: "bin", op, left, right, type: F64, loc: loc() });
  const statement = (expr: IrExpr): IrStmt => ({ kind: "exprStmt", expr, loc: loc() });
  const assign = (value: IrExpr, localId = "x"): IrStmt => ({ kind: "assign", localId, value, loc: loc() });
  const bool = (): IrExpr => ({ kind: "boolLit", value: true, type: BOOL, loc: loc() });
  const fn = (body: IrStmt[]): IrFunction => ({ name: "main", params: [], locals: [{ id: "x", name: "x", type: F64, mutable: true }], returnType: VOID, body, loc: loc() });
  const cases: RangeCase[] = [];
  const add = (name: string, body: IrStmt[], expected: RangeCase["expected"], transform?: (fn: IrFunction) => void): void => {
    const func = fn(body);
    transform?.(func);
    cases.push({ name, module: { irVersion: IR_VERSION, sourceFile: "ranges.ts", entry: "main", functions: [func] }, expected });
  };
  const proof = (expr: IrExpr, min: number | null, max = min, present = true) => ({ start: expr.loc.start, min, max, present });

  for (const value of [0, -0, 1, -1, 0.5, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
    const input = number(value);
    const exact = Number.isSafeInteger(value) && !Object.is(value, -0) ? value : null;
    add(`literal ${Object.is(value, -0) ? "-0" : String(value)}`, [statement(input)], [proof(input, exact)]);
  }
  for (const op of ["|", "&", "^", "<<", ">>", ">>>"] as const) {
    const value = binary(op, reference(), number(0));
    add(`bitwise ${op}`, [statement(value)], [proof(value, op === ">>>" ? 0 : -2147483648, op === ">>>" ? 4294967295 : 2147483647)]);
  }
  for (const op of ["+", "-", "*", "/", "%"] as const) {
    const value = binary(op, reference(), number(3));
    add(`arithmetic ${op}`, [assign(number(9)), statement(value)], [proof(value, op === "+" ? 12 : op === "-" ? 6 : null)]);
  }
  const overflow = binary("+", number(Number.MAX_SAFE_INTEGER), number(1));
  add("inexact sum", [statement(overflow)], [proof(overflow, null)]);
  const bounded = binary("+", binary("|", reference(), number(0)), binary(">>>", reference(), number(0)));
  add("combined signed and unsigned bounds", [statement(bounded)], [proof(bounded, -2147483648, 6442450942)]);
  const unary: IrExpr = { kind: "unary", op: "~", operand: reference(), type: F64, loc: loc() };
  add("bitwise complement", [statement(unary)], [proof(unary, -2147483648, 2147483647)]);

  for (const storage of ["boxed", "tdz", "captured", "parameter", "global"] as const) {
    const read = reference(storage === "global" ? "global" : "x");
    const body = storage === "parameter" ? [statement(read)] : [assign(number(7)), statement(read)];
    add(`${storage} storage is conservative`, body, [proof(read, null)], (func) => {
      if (storage === "boxed") func.locals[0]!.boxed = true;
      if (storage === "tdz") func.locals[0]!.tdz = true;
      if (storage === "captured") func.captures = [{ localId: "x", name: "x", type: F64 }];
      if (storage === "parameter") func.params = [{ localId: "x", name: "x", type: F64 }];
    });
  }
  for (const suspension of ["async", "generator"] as const) {
    const value = number(9);
    add(`${suspension} suspends analysis`, [statement(value)], [proof(value, null, null, false)], (func) => {
      if (suspension === "async") func.async = true;
      else func.generator = { yieldT: F64, nextT: F64, resultType: { kind: "record", shapeId: "result" } };
    });
  }

  const regions = ["block", "if", "while", "doWhile", "for", "forOf", "switch", "tryCatch"] as const;
  for (const region of regions) {
    const before = reference();
    const inside = reference();
    const after = reference();
    const body = [assign(number(11)), statement(inside)];
    let control: IrStmt;
    switch (region) {
      case "block": control = { kind: "block", body, loc: loc() }; break;
      case "if": control = { kind: "if", cond: before, then: body, else_: [], loc: loc() }; break;
      case "while": control = { kind: "while", cond: before, body, loc: loc() }; break;
      case "doWhile": control = { kind: "doWhile", cond: before, body, loc: loc() }; break;
      case "for": control = { kind: "for", init: assign(before), cond: bool(), update: assign(number(100)), body, loc: loc() }; break;
      case "forOf": control = { kind: "forOf", localId: "x", iterable: { kind: "arrayLit", elems: [before], type: arrayOf(F64), loc: loc() }, body, loc: loc() }; break;
      case "switch": control = { kind: "switch", disc: before, cases: [{ test: number(1), body }, { test: null, body: [] }], loc: loc() }; break;
      case "tryCatch": control = { kind: "tryCatch", tryBody: body, catchBody: [statement(before)], catchLocalId: null, finallyBody: [], loc: loc() }; break;
    }
    const expected = [proof(inside, 11), proof(after, null)];
    if (region !== "block") expected.push(proof(before, null));
    add(`${region} regions start independent environments`, [assign(number(3)), control, statement(after)], expected);
  }
  const thenRead = reference();
  const elseRead = reference();
  add("branches never pass facts to their siblings", [{ kind: "if", cond: bool(), then: [assign(number(4)), statement(thenRead)], else_: [statement(elseRead)], loc: loc() }], [proof(thenRead, 4), proof(elseRead, null)]);
  const caught = reference();
  const final = reference();
  add("catch and finally have independent facts", [{ kind: "tryCatch", tryBody: [assign(number(4))], catchBody: [statement(caught), assign(number(5))], catchLocalId: null, finallyBody: [statement(final)], loc: loc() }], [proof(caught, null), proof(final, null)]);

  const children: IrExpr[] = [number(2), reference(), number(6)];
  const opaque: IrExpr = { kind: "seqExpr", stmts: [assign(children[0]!), statement(children[1]!)], result: children[2]!, type: F64, loc: loc() };
  const afterOpaque = reference();
  add("opaque expression traverses nested statements without deriving facts", [assign(number(1)), statement(opaque), statement(afterOpaque)], [...children.map((expr) => proof(expr, null)), proof(opaque, null), proof(afterOpaque, null)]);
  const left = reference();
  const hidden = reference();
  const right: IrExpr = { kind: "call", callee: "unknown", args: [hidden], type: F64, loc: loc() };
  const afterward = reference();
  add("opaque right operand preserves the already read left operand", [assign(number(5)), statement(binary("|", left, right)), statement(afterward)], [proof(left, 5), proof(hidden, null), proof(afterward, null)]);
  const stored = reference();
  const arr: IrExpr = { kind: "arrayLit", elems: [], type: arrayOf(F64), loc: loc() };
  const afterStore = reference();
  add("stores invalidate facts and visit all operands", [assign(number(3)), { kind: "arraySet", arr, index: number(0), value: stored, loc: loc() }, statement(afterStore)], [proof(stored, null), proof(afterStore, null)]);
  const declared = reference();
  const uninitialized = reference();
  add("declaration reset", [{ kind: "varDecl", localId: "x", init: number(6), loc: loc() }, statement(declared), { kind: "varDecl", localId: "x", init: null, loc: loc() }, statement(uninitialized)], [proof(declared, 6), proof(uninitialized, null)]);
  const returned = reference();
  const unreachable = reference();
  add("return ends straight-line facts", [assign(number(4)), { kind: "return", value: returned, loc: loc() }, statement(unreachable)], [proof(returned, 4), proof(unreachable, null)]);
  return cases;
}
