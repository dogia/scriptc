import { expect, test } from "vitest";
import { BOOL, DYN, F64, NULL_T, STRING, UNDEFINED_T, VOID, arrayOf, mapOf, setOf, type IrExpr, type IrModule, type IrType, type IrUnionDef } from "./ir.js";
import { deserializeModule, serializeModule } from "./serialize.js";
import { validateModule } from "./validate.js";

const loc = { file: "numeric-read.ts", start: 0, end: 0 };

test.each([mapOf(STRING, F64), setOf(STRING), { kind: "promise", inner: F64 } as IrType])("nullable %j payloads preserve an explicit absence tag", (type) => {
  const mod = expressionModule({ kind: "numLit", value: 0, type: F64, loc }, [
    { id: "nullable", arms: [type, NULL_T, UNDEFINED_T] },
  ]);
  expect(validateModule(mod)).toEqual([]);
  expect(deserializeModule(serializeModule(mod))).toEqual(mod);
});

test.each([mapOf(STRING, F64), setOf(STRING), { kind: "promise", inner: F64 } as IrType])("%j payloads still refuse unrelated data siblings", (type) => {
  const mod = expressionModule({ kind: "numLit", value: 0, type: F64, loc }, [
    { id: "mixed", arms: [type, STRING, UNDEFINED_T] },
  ]);
  expect(validateModule(mod).map((error) => error.message)).toContain(`union mixed: ${type.kind} arm 0 beside non-unit arms`);
});

test("two differently typed Map payloads cannot silently share one tag test", () => {
  const mod = expressionModule({ kind: "numLit", value: 0, type: F64, loc }, [
    { id: "maps", arms: [mapOf(STRING, F64), mapOf(STRING, STRING), UNDEFINED_T] },
  ]);
  expect(validateModule(mod).filter((error) => error.message.includes("beside non-unit arms"))).toHaveLength(2);
});

function numericReadModule(overrides: Partial<IrExpr & { kind: "arrIntrinsic" }> = {}): IrModule {
  const read: IrExpr = {
    kind: "arrIntrinsic", method: "getNumber",
    receiver: { kind: "arrayLit", elems: [], type: arrayOf(F64), loc },
    args: [{ kind: "numLit", value: 0, type: F64, loc }],
    type: F64, loc, ...overrides,
  };
  return {
    irVersion: 13, sourceFile: loc.file, entry: "main",
    functions: [{ name: "main", params: [], locals: [], returnType: VOID, body: [{ kind: "exprStmt", expr: read, loc }], loc }],
  };
}

function expressionModule(expr: IrExpr, unions: IrUnionDef[]): IrModule {
  return {
    irVersion: 13, sourceFile: loc.file, entry: "main", unions,
    functions: [{ name: "main", params: [], locals: [], returnType: VOID, body: [{ kind: "exprStmt", expr, loc }], loc }],
  };
}

test.each(["callValue", "dynCall"] as const)("%s requires a checked-value receiver and preserves it in serialization", (kind) => {
  const funcType: IrType = { kind: "func", params: [], ret: DYN };
  const closure: IrExpr = { kind: "closure", fnName: "callback", captures: [], type: funcType, loc };
  const receiver: IrExpr = { kind: "dynFrom", value: { kind: "unitLit", unit: "undefined", type: UNDEFINED_T, loc }, type: DYN, loc };
  const call: IrExpr = kind === "callValue"
    ? { kind, callee: closure, receiver, args: [], type: DYN, loc }
    : { kind, callee: { kind: "dynFrom", value: closure, type: DYN, loc }, receiver, calleeName: "callback", args: [], type: DYN, loc };
  const mod = expressionModule(call, []);
  mod.functions.push({ name: "callback", params: [], locals: [], returnType: DYN, body: [{ kind: "return", value: receiver, loc }], loc });
  expect(validateModule(mod)).toEqual([]);
  expect(deserializeModule(serializeModule(mod))).toEqual(mod);
  call.receiver = { kind: "numLit", value: 1, type: F64, loc };
  expect(validateModule(mod).some((error) => error.message.includes(`${kind} receiver`))).toBe(true);
  call.receiver = { kind: "varRef", localId: "missing", type: DYN, loc };
  expect(validateModule(mod).some((error) => error.message.includes("missing"))).toBe(true);
});

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

function tdzModule(mutable = true): IrModule {
  const value: IrExpr = { kind: "numLit", value: 0, type: F64, loc };
  return {
    irVersion: 13, sourceFile: loc.file, entry: "main",
    functions: [{
      name: "main", params: [], returnType: VOID, loc,
      locals: [{ id: "value", name: "value", type: F64, mutable, boxed: true, tdz: true }],
      body: [
        { kind: "varDecl", localId: "value", init: null, loc },
        { kind: "assign", localId: "value", value, initializes: true, loc },
      ],
    }],
  };
}

test.each([true, false])("TDZ declarations round-trip their initialization marker (mutable=%s)", (mutable) => {
  const mod = tdzModule(mutable);
  expect(validateModule(mod)).toEqual([]);
  expect(deserializeModule(serializeModule(mod))).toEqual(mod);
});

test("an initialization marker cannot bypass an ordinary immutable binding", () => {
  const mod = tdzModule(false);
  delete mod.functions[0]!.locals[0]!.tdz;
  const messages = validateModule(mod).map((error) => error.message);
  expect(messages.some((message) => message.includes('initializing assign requires a TDZ binding "value"'))).toBe(true);
  expect(messages.some((message) => message.includes('assign to immutable local "value"'))).toBe(true);
});

test("global assignments cannot masquerade as lexical initialization", () => {
  const mod = tdzModule();
  mod.globals = [{ id: "value", name: "value", type: F64, mutable: true }];
  mod.functions[0]!.locals = [];
  mod.functions[0]!.body.shift();
  expect(validateModule(mod).some((error) => error.message.includes("initializing assign requires a TDZ binding"))).toBe(true);
});

test("TDZ globals require guarded pointer storage and round-trip initialization", () => {
  const mod = tdzModule();
  const type = { kind: "record", shapeId: "codec" } as const;
  mod.records = [{ id: "codec", fields: [{ name: "%TextEncoder", type: F64 }], declaredOrder: [] }];
  mod.globals = [{ id: "%g.value", name: "value", type, mutable: false, tdz: true }];
  mod.functions[0]!.locals = [];
  mod.functions[0]!.body = [{
    kind: "assign", localId: "%g.value", initializes: true, loc,
    value: { kind: "recordLit", fields: [{ name: "%TextEncoder", value: { kind: "numLit", value: -1, type: F64, loc } }], type, loc },
  }];
  expect(validateModule(mod)).toEqual([]);
  expect(deserializeModule(serializeModule(mod))).toEqual(mod);
  mod.globals[0]!.type = F64;
  expect(validateModule(mod).some((error) => error.message.includes('TDZ global "value" must have record, function, or checked-value storage'))).toBe(true);
});

test("legacy const TDZ declarations remain readable", () => {
  const mod = tdzModule(false);
  const store = mod.functions[0]!.body[1]!;
  if (store.kind !== "assign") throw new Error("fixture");
  delete store.initializes;
  expect(validateModule(mod)).toEqual([]);
});

test("TDZ initialization still checks the payload representation", () => {
  const mod = tdzModule();
  const store = mod.functions[0]!.body[1]!;
  if (store.kind !== "assign") throw new Error("fixture");
  store.value = { kind: "strLit", value: "wrong", type: STRING, loc };
  expect(validateModule(mod).some((error) => error.message.includes('assign "value"'))).toBe(true);
});

function overflowPresenceModule(): IrModule {
  const record: IrType = { kind: "record", shapeId: "dictionary" };
  const check: IrExpr = {
    kind: "recordOvfHas", shapeId: "dictionary",
    obj: { kind: "recordLit", fields: [], type: record, loc },
    key: { kind: "strLit", value: "key", type: STRING, loc }, type: BOOL, loc,
  };
  const mod = expressionModule(check, []);
  mod.records = [{ id: "dictionary", fields: [], indexValue: F64 }];
  return mod;
}

test("overflow presence checks validate and serialize", () => {
  const mod = overflowPresenceModule();
  expect(validateModule(mod)).toEqual([]);
  expect(deserializeModule(serializeModule(mod))).toEqual(mod);
});

test("overflow presence requires a map-bearing shape", () => {
  const mod = overflowPresenceModule();
  delete mod.records![0]!.indexValue;
  expect(validateModule(mod).some((error) => error.message.includes("requires an index-signature record"))).toBe(true);
});

test("overflow presence rejects an undeclared shape", () => {
  const mod = overflowPresenceModule();
  mod.records = [];
  expect(validateModule(mod).some((error) => error.message.includes("recordOvfHas on undeclared shape"))).toBe(true);
});

test.each(["receiver", "key", "result"] as const)("overflow presence checks its %s type", (slot) => {
  const mod = overflowPresenceModule();
  const statement = mod.functions[0]!.body[0]!;
  if (statement.kind !== "exprStmt" || statement.expr.kind !== "recordOvfHas") throw new Error("fixture");
  const check = statement.expr;
  const wrong: IrExpr = { kind: "numLit", value: 1, type: F64, loc };
  if (slot === "receiver") check.obj = wrong;
  else if (slot === "key") check.key = wrong;
  else check.type = F64;
  const message = slot === "result" ? "recordOvfHas must be bool" : `recordOvfHas ${slot}`;
  expect(validateModule(mod).some((error) => error.message.includes(message))).toBe(true);
});

test("TDZ locals require a shared box", () => {
  const mod = tdzModule();
  delete mod.functions[0]!.locals[0]!.boxed;
  expect(validateModule(mod).some((error) => error.message.includes('TDZ local "value" must be boxed'))).toBe(true);
});

function discriminatedModule(): IrModule {
  return {
    irVersion: 13, sourceFile: loc.file, entry: "main",
    functions: [{ name: "main", params: [], locals: [], returnType: VOID, body: [], loc }],
    records: [
      { id: "empty", fields: [{ name: "kind", type: STRING }] },
      { id: "value", fields: [{ name: "kind", type: STRING }, { name: "value", type: F64 }] },
    ],
    unions: [{
      id: "variants", arms: [NULL_T, { kind: "record", shapeId: "empty" }, { kind: "record", shapeId: "value" }, UNDEFINED_T],
      discriminant: { field: "kind", cases: [{ tag: 1, values: ["empty"] }, { tag: 2, values: ["number", "value"] }] },
    }],
  };
}

test("discriminator metadata validates and survives serialization", () => {
  const mod = discriminatedModule();
  expect(validateModule(mod)).toEqual([]);
  expect(deserializeModule(serializeModule(mod))).toEqual(mod);
});

test.each([
  ["missing arm", (m: IrModule) => { m.unions![0]!.discriminant!.cases.pop(); }, "missing discriminant"],
  ["unit arm", (m: IrModule) => { m.unions![0]!.discriminant!.cases[0]!.tag = 0; }, "invalid discriminant tag"],
  ["negative tag", (m: IrModule) => { m.unions![0]!.discriminant!.cases[0]!.tag = -1; }, "invalid discriminant tag"],
  ["fractional tag", (m: IrModule) => { m.unions![0]!.discriminant!.cases[0]!.tag = 1.5; }, "invalid discriminant tag"],
  ["missing field", (m: IrModule) => { m.unions![0]!.discriminant!.field = "absent"; }, "invalid discriminant tag"],
  ["duplicate tag", (m: IrModule) => { m.unions![0]!.discriminant!.cases.push({ tag: 1, values: ["other"] }); }, "invalid discriminant tag"],
  ["empty values", (m: IrModule) => { m.unions![0]!.discriminant!.cases[0]!.values = []; }, "empty discriminant values"],
  ["wrong primitive", (m: IrModule) => { m.unions![0]!.discriminant!.cases[0]!.values = [false]; }, "invalid or repeated"],
  ["shared literal", (m: IrModule) => { m.unions![0]!.discriminant!.cases[1]!.values = ["empty"]; }, "invalid or repeated"],
  ["duplicate literal", (m: IrModule) => { m.unions![0]!.discriminant!.cases[0]!.values = ["empty", "empty"]; }, "invalid or repeated"],
] as const)("discriminator metadata rejects %s", (_name, mutate, message) => {
  const mod = discriminatedModule();
  mutate(mod);
  expect(validateModule(mod).some((error) => error.message.includes(message))).toBe(true);
});

test("numeric discriminators reject non-finite values", () => {
  const mod = discriminatedModule();
  for (const record of mod.records!) record.fields[0]!.type = F64;
  const guard = mod.unions![0]!.discriminant!;
  guard.cases[0]!.values = [0];
  guard.cases[1]!.values = [1];
  expect(validateModule(mod)).toEqual([]);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    guard.cases[1]!.values = [invalid];
    expect(validateModule(mod).some((error) => error.message.includes("invalid or repeated"))).toBe(true);
  }
});

test("mixed literal discriminators resolve field unions declared later", () => {
  const mod = discriminatedModule();
  mod.records![1]!.fields[0]!.type = { kind: "union", unionId: "literal" };
  mod.unions![0]!.discriminant!.cases[1]!.values = ["value", 1];
  mod.unions!.push({ id: "literal", arms: [F64, STRING] });
  expect(validateModule(mod)).toEqual([]);
  mod.unions![0]!.discriminant!.cases[1]!.values.push(false);
  expect(validateModule(mod).some((error) => error.message.includes("invalid or repeated"))).toBe(true);
});
