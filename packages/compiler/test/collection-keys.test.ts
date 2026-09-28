import { expect, test } from "vitest";
import { BOOL, F64, STRING, UNDEFINED_T, VOID, arrayOf, isIdentityCollectionKey, isSupportedMapKey, isSupportedSetElem, mapOf, setOf, type IrExpr, type IrModule, type IrType } from "../src/ir/ir.js";
import { validateModule } from "../src/ir/validate.js";
import { IR_VERSION } from "../src/ir/serialize.js";
import { mapKeyAccess, mapKeyKindC } from "../src/backend/c/types.js";
import { mapKeyAccess as llvmAccess, mapKeyKindNum } from "../src/backend/llvm/shapes.js";

const reference: IrType = { kind: "record", shapeId: "key" };
const references: IrType[] = [reference, { kind: "object", className: "Key" }, arrayOf(F64), { kind: "symbol" }, { kind: "netServer" }];
const union: IrType = { kind: "union", unionId: "keys" };

test.each(references)("identity key %j uses the reference ABI in both emitters", (type) => {
  expect(isIdentityCollectionKey(type)).toBe(true);
  expect(isSupportedMapKey(type)).toBe(true);
  expect(isSupportedSetElem(type)).toBe(true);
  expect(mapKeyAccess(type)).toBe("ref");
  expect(llvmAccess(type)).toBe("ref");
  expect(mapKeyKindC(type)).toBe("SCR_MAP_KEY_REF");
  expect(mapKeyKindNum(type)).toBe(2);
});

test("boxed reference keys select payload identity, not wrapper identity", () => {
  expect(isSupportedMapKey(union, references)).toBe(true);
  expect(isSupportedSetElem(union, references)).toBe(true);
  expect(mapKeyAccess(union)).toBe("ref");
  expect(llvmAccess(union)).toBe("ref");
  expect(mapKeyKindC(union)).toBe("SCR_MAP_KEY_UNION_REF");
  expect(mapKeyKindNum(union)).toBe(3);
});

test("unresolved, empty and mixed-value unions cannot enter the identity ABI", () => {
  expect(isSupportedMapKey(union)).toBe(false);
  expect(isSupportedMapKey(union, [])).toBe(false);
  for (const scalar of [F64, STRING, BOOL, UNDEFINED_T]) {
    expect(isSupportedMapKey(union, [reference, scalar])).toBe(false);
    expect(isSupportedSetElem(union, [reference, scalar])).toBe(false);
  }
  for (const unsupported of [BOOL, { kind: "date" } as IrType, { kind: "dyn" } as IrType, mapOf(STRING, F64), setOf(STRING)]) {
    expect(isSupportedMapKey(unsupported)).toBe(false);
  }
});

test("primitive key ABI constants remain stable", () => {
  expect([mapKeyKindC(F64), mapKeyKindNum(F64), mapKeyAccess(F64)]).toEqual(["SCR_MAP_KEY_F64", 0, "f64"]);
  expect([mapKeyKindC(STRING), mapKeyKindNum(STRING), mapKeyAccess(STRING)]).toEqual(["SCR_MAP_KEY_STR", 1, "str"]);
});

test.each(["map", "set"] as const)("validator checks the arms behind a %s key union", (kind) => {
  const loc = { file: "keys.ts", start: 0, end: 1 };
  const type = kind === "map" ? mapOf(union, F64) : setOf(union);
  const expr: IrExpr = kind === "map" ? { kind: "mapNew", type, loc } : { kind: "setNew", type, loc };
  const mod: IrModule = {
    irVersion: IR_VERSION, sourceFile: loc.file, entry: "main",
    records: [{ id: "key", fields: [{ name: "id", type: F64 }] }],
    unions: [{ id: "keys", arms: [reference, arrayOf(F64)] }],
    functions: [{ name: "main", params: [], locals: [], returnType: VOID, body: [{ kind: "exprStmt", expr, loc }], loc }],
  };
  expect(validateModule(mod)).toEqual([]);
  mod.unions![0]!.arms = [reference, F64];
  expect(validateModule(mod).some((error) => error.message.includes(kind === "map" ? "mapNew key kind union" : "setNew element kind union"))).toBe(true);
});
