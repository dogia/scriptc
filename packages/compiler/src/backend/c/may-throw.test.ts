import { expect, test } from "vitest";
import { F64, VOID, funcOf, type IrExpr, type IrFunction, type IrLocal, type IrModule, type IrStmt } from "../../ir/ir.js";
import { computeMayThrow } from "./may-throw.js";

const loc = { file: "tdz.ts", start: 0, end: 1 };
const value: IrExpr = { kind: "numLit", value: 1, type: F64, loc };
const local: IrLocal = { id: "value", name: "value", type: F64, mutable: true, boxed: true, tdz: true };
function fn(name: string, body: IrStmt[], locals: IrLocal[] = [local]): IrFunction {
  return { name, body, locals, params: [], returnType: VOID, loc };
}
function moduleWith(...functions: IrFunction[]): IrModule {
  return { irVersion: 12, sourceFile: loc.file, entry: "caller", functions };
}
const assignment: IrStmt = { kind: "assign", localId: local.id, value, loc };
const expression: IrExpr = { kind: "assignExpr", localId: local.id, value, type: F64, loc };
const increment: IrExpr = { kind: "incDec", localId: local.id, op: "+", prefix: false, type: F64, loc };
const read: IrExpr = { kind: "varRef", localId: local.id, type: F64, loc };
const exprStmt = (expr: IrExpr): IrStmt => ({ kind: "exprStmt", expr, loc });

test.each([
  ["store", assignment],
  ["assignment expression", exprStmt(expression)],
  ["increment", exprStmt(increment)],
  ["read", exprStmt(read)],
] as const)("TDZ %s propagates through the direct call graph", (_name, operation) => {
  const target = fn("target", [operation]);
  const middle = fn("middle", [exprStmt({ kind: "call", callee: "target", args: [], type: VOID, loc })], []);
  const caller = fn("caller", [exprStmt({ kind: "call", callee: "middle", args: [], type: VOID, loc })], []);
  const answer = computeMayThrow(moduleWith(caller, middle, target));
  expect([...answer.fns].sort()).toEqual(["caller", "middle", "target"]);
  expect(answer.indirect).toBe(false);
});

test("TDZ stores seed indirect-call propagation", () => {
  const closure: IrExpr = { kind: "closure", fnName: "target", captures: [], type: funcOf([], VOID), loc };
  const caller = fn("caller", [exprStmt({ kind: "callValue", callee: closure, args: [], type: VOID, loc })], []);
  const answer = computeMayThrow(moduleWith(caller, fn("target", [assignment])));
  expect(answer.indirect).toBe(true);
  expect([...answer.fns].sort()).toEqual(["caller", "target"]);
});

test.each([true, false])("declaration stores do not throw solely for TDZ (mutable=%s)", (mutable) => {
  const initialize: IrStmt = { ...assignment, initializes: true };
  expect(computeMayThrow(moduleWith(fn("caller", [initialize], [{ ...local, mutable }]))).fns.size).toBe(0);
});

test("legacy const TDZ stores remain initialization", () => {
  const immutable = { ...local, mutable: false };
  expect(computeMayThrow(moduleWith(fn("caller", [assignment], [immutable]))).fns.size).toBe(0);
});

test("ordinary boxed stores do not gain an exception edge", () => {
  const ordinary: IrLocal = { id: local.id, name: local.name, type: F64, mutable: true, boxed: true };
  expect(computeMayThrow(moduleWith(fn("caller", [assignment, exprStmt(expression), exprStmt(increment)], [ordinary]))).fns.size).toBe(0);
});

test("initializers still propagate exceptions from their right-hand side", () => {
  const initialize: IrStmt = {
    ...assignment, initializes: true,
    value: { kind: "call", callee: "failure", args: [], type: F64, loc },
  };
  const failure = fn("failure", [{ kind: "throw", value, loc }], []);
  expect([...computeMayThrow(moduleWith(fn("caller", [initialize]), failure)).fns].sort()).toEqual(["caller", "failure"]);
});
