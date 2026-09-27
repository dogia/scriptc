import { expect, test } from "vitest";
import { BOOL, F64, NULL_T, STRING, UNDEFINED_T, VOID, arrayOf, type IrExpr, type IrModule, type IrType, type IrUnionDef } from "./ir.js";
import { deserializeModule, serializeModule } from "./serialize.js";
import { validateModule } from "./validate.js";

const loc = { file: "numeric-read.ts", start: 0, end: 0 };

function numericReadModule(overrides: Partial<IrExpr & { kind: "arrIntrinsic" }> = {}): IrModule {
  const read: IrExpr = {
    kind: "arrIntrinsic", method: "getNumber",
    receiver: { kind: "arrayLit", elems: [], type: arrayOf(F64), loc },
    args: [{ kind: "numLit", value: 0, type: F64, loc }],
    type: F64, loc, ...overrides,
  };
  return {
    irVersion: 11, sourceFile: loc.file, entry: "main",
    functions: [{ name: "main", params: [], locals: [], returnType: VOID, body: [{ kind: "exprStmt", expr: read, loc }], loc }],
  };
}

function expressionModule(expr: IrExpr, unions: IrUnionDef[]): IrModule {
  return {
    irVersion: 11, sourceFile: loc.file, entry: "main", unions,
    functions: [{ name: "main", params: [], locals: [], returnType: VOID, body: [{ kind: "exprStmt", expr, loc }], loc }],
  };
}

function optionalUnionModule(arms: IrType[] = [BOOL, F64, UNDEFINED_T]): IrModule {
  const type: IrType = { kind: "union", unionId: "receiver" };
  const tag = arms.findIndex((arm) => arm.kind === "f64");
  const receiver: IrExpr = tag >= 0
    ? { kind: "unionWrap", unionId: "receiver", tag, value: { kind: "numLit", value: 7, type: F64, loc }, type, loc }
    : {
      kind: "unionWrap", unionId: "receiver", tag: arms.findIndex((arm) => arm.kind === "undefinedT"),
      value: { kind: "unitLit", unit: "undefined", type: UNDEFINED_T, loc }, type, loc,
    };
  const chain: IrExpr = {
    kind: "optChain", id: "test", receiver,
    body: { kind: "chainRecv", id: "test", type, loc }, type, loc,
  };
  return expressionModule(chain, [{ id: "receiver", arms }]);
}

test("optional chains over several value arms bind the tagged receiver", () => {
  const mod = optionalUnionModule();
  expect(validateModule(mod)).toEqual([]);
  expect(deserializeModule(serializeModule(mod))).toEqual(mod);
});

test("optional chains reject bindings that discard a surviving variant", () => {
  const mod = optionalUnionModule();
  const statement = mod.functions[0]!.body[0]!;
  if (statement.kind !== "exprStmt" || statement.expr.kind !== "optChain") throw new Error("fixture");
  statement.expr.body = { kind: "chainRecv", id: "test", type: F64, loc };
  expect(validateModule(mod).some((error) => error.message.includes("chainRecv: expected"))).toBe(true);
});

test.each([
  [BOOL, F64],
  [NULL_T, UNDEFINED_T],
])("optional chains need both a present and an absent path %#", (...arms) => {
  expect(validateModule(optionalUnionModule(arms)).some((error) =>
    error.message.includes("must have unit arms and at least one non-unit arm"),
  )).toBe(true);
});

test("a single present arm still binds its payload", () => {
  const mod = optionalUnionModule([F64, UNDEFINED_T]);
  expect(validateModule(mod).some((error) => error.message.includes("chainRecv: expected"))).toBe(true);
  const statement = mod.functions[0]!.body[0]!;
  if (statement.kind !== "exprStmt" || statement.expr.kind !== "optChain") throw new Error("fixture");
  statement.expr.body = {
    kind: "unionWrap", unionId: "receiver", tag: 0,
    value: { kind: "chainRecv", id: "test", type: F64, loc },
    type: { kind: "union", unionId: "receiver" }, loc,
  };
  expect(validateModule(mod)).toEqual([]);
});

function keyedUnionModule(resultArms: IrType[], overflowOnly = false): IrModule {
  const stored: IrType = { kind: "union", unionId: "stored" };
  const result: IrType = { kind: "union", unionId: "result" };
  const record: IrType = { kind: "record", shapeId: "row" };
  const obj: IrExpr = {
    kind: "recordLit", type: record, loc,
    fields: [{ name: "value", value: {
      kind: "unionWrap", unionId: "stored", tag: 0,
      value: { kind: "numLit", value: 9, type: F64, loc }, type: stored, loc,
    } }],
  };
  const read: IrExpr = {
    kind: "recordKeyGet", obj, shapeId: "row",
    key: { kind: "strLit", value: overflowOnly ? "extra" : "value", type: STRING, loc },
    type: result, loc, ...(overflowOnly ? { overflowOnly: true as const } : {}),
  };
  const mod = expressionModule(read, [
    { id: "stored", arms: [F64, NULL_T] }, { id: "result", arms: resultArms },
  ]);
  mod.records = [{ id: "row", fields: [{ name: "value", type: stored }], indexValue: stored }];
  return mod;
}

test.each([false, true])("keyed union reads validate a payload-preserving widening (overflow=%s)", (overflow) => {
  const mod = keyedUnionModule([BOOL, F64, NULL_T, UNDEFINED_T], overflow);
  expect(validateModule(mod)).toEqual([]);
  expect(deserializeModule(serializeModule(mod))).toEqual(mod);
});

test.each([false, true])("keyed union reads refuse to discard a stored arm (overflow=%s)", (overflow) => {
  const errors = validateModule(keyedUnionModule([F64, STRING, UNDEFINED_T], overflow));
  expect(errors.some((error) => error.message.includes("cannot surface as the result type"))).toBe(true);
});

test("union array reads validate every element layout against the joined result", () => {
  const stored: IrType = { kind: "union", unionId: "stored" };
  const receiver: IrType = { kind: "union", unionId: "arrays" };
  const result: IrType = { kind: "union", unionId: "result" };
  const array: IrExpr = {
    kind: "arrayLit", elems: [{
      kind: "unionWrap", unionId: "stored", tag: 1,
      value: { kind: "unitLit", unit: "null", type: NULL_T, loc }, type: stored, loc,
    }],
    type: arrayOf(stored), loc,
  };
  const read: IrExpr = {
    kind: "unionKeyGet", unionId: "arrays",
    value: { kind: "unionWrap", unionId: "arrays", tag: 0, value: array, type: receiver, loc },
    key: { kind: "numLit", value: 0, type: F64, loc }, type: result, loc,
  };
  const mod = expressionModule(read, [
    { id: "stored", arms: [F64, NULL_T] },
    { id: "arrays", arms: [arrayOf(stored), arrayOf(STRING), UNDEFINED_T] },
    { id: "result", arms: [F64, NULL_T, STRING, UNDEFINED_T] },
  ]);
  expect(validateModule(mod)).toEqual([]);
  expect(deserializeModule(serializeModule(mod))).toEqual(mod);
  mod.unions![2]!.arms = [F64, STRING, UNDEFINED_T];
  expect(validateModule(mod).some((error) => error.message.includes("element union cannot surface"))).toBe(true);
});

test("numeric array-read intrinsic validates and round-trips", () => {
  const mod = numericReadModule();
  expect(validateModule(mod)).toEqual([]);
  expect(deserializeModule(serializeModule(mod))).toEqual(mod);
});

test("indexed equality validates primitive kinds, arguments, and result", () => {
  const args: IrExpr[] = [
    { kind: "numLit", value: 0, type: F64, loc },
    { kind: "arrayLit", elems: [], type: arrayOf(F64), loc },
    { kind: "numLit", value: 1, type: F64, loc },
  ];
  const mod = numericReadModule({ method: "indexEq", args, type: BOOL });
  expect(validateModule(mod)).toEqual([]);
  expect(deserializeModule(serializeModule(mod))).toEqual(mod);
  for (const override of [
    { args: [] }, { type: F64 },
    { args: [args[0]!, { kind: "arrayLit", elems: [], type: arrayOf(STRING), loc }, args[2]!] },
    { receiver: { kind: "arrayLit", elems: [], type: arrayOf(arrayOf(F64)), loc } },
  ] satisfies Partial<IrExpr & { kind: "arrIntrinsic" }>[]) {
    expect(validateModule(numericReadModule({ method: "indexEq", args, type: BOOL, ...override }))).not.toEqual([]);
  }
});

test.each([
  [{ receiver: { kind: "arrayLit", elems: [], type: arrayOf(STRING), loc } }, "requires f64 elements"],
  [{ args: [] }, "0 args, expected 1"],
  [{ args: [{ kind: "strLit", value: "0", type: STRING, loc }] }, "arg 0: expected f64"],
  [{ type: BOOL }, "must be f64"],
] satisfies [Partial<IrExpr & { kind: "arrIntrinsic" }>, string][])("numeric array-read intrinsic rejects malformed IR %#", (overrides, message) => {
  expect(validateModule(numericReadModule(overrides)).some((error) => error.message.includes(message))).toBe(true);
});
