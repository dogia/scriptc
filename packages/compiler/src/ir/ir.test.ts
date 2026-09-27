import { describe, expect, test } from "vitest";
import { DYN, F64, HANDLE_KINDS, canDynCheckTo, isIslandCallbackParamType, isJsonSafeType, isJsonStringifySafeType, type IrRecordShape, type IrType, type IrUnionDef, POINTER_KINDS, STRING, arrayOf, typeEquals, typeKey } from "./ir.js";

describe("IR kind sets", () => {
  test("keeps procStream as the scalar handle exception", () => {
    expect(HANDLE_KINDS.has("procStream")).toBe(true);
    expect(POINTER_KINDS.has("procStream")).toBe(false);
    for (const kind of HANDLE_KINDS) {
      if (kind !== "procStream") expect(POINTER_KINDS.has(kind)).toBe(true);
    }
  });

  test("distinguishes pointer values from object-like scalars", () => {
    expect(POINTER_KINDS.has("record")).toBe(true);
    expect(POINTER_KINDS.has("date")).toBe(false);
  });

  test("distinguishes typed-rest closure ABIs", () => {
    const packed = arrayOf(STRING);
    const typedRest = {
      kind: "func" as const,
      params: [packed],
      ret: STRING,
      rest: true as const,
      restAbi: "typed" as const,
    };
    const fixed = { kind: "func" as const, params: [packed], ret: STRING };
    expect(typeEquals(typedRest, fixed)).toBe(false);
    expect(typeKey(typedRest)).toBe("func(array<string>,...typed[])=>string");
  });

  test("distinguishes full arguments from surplus rest closure ABIs", () => {
    const full = { kind: "func" as const, params: [STRING], ret: STRING, rest: true as const, argumentsAll: true as const };
    const surplus = { kind: "func" as const, params: [STRING], ret: STRING, rest: true as const };
    expect(typeEquals(full, surplus)).toBe(false);
    expect(typeKey(full)).toBe("func(string,arguments[])=>string");
  });
});


describe("checked records with opaque payloads", () => {
  const records = new Map<string, IrRecordShape>([
    ["payload", { id: "payload", fields: [{ name: "id", type: F64 }, { name: "value", type: DYN }] }],
    ["recursive", { id: "recursive", fields: [
      { name: "children", type: arrayOf({ kind: "record", shapeId: "recursive" }) },
      { name: "payload", type: DYN },
    ] }],
    ["tuple", { id: "tuple", tuple: true, fields: [{ name: "0", type: STRING }, { name: "1", type: DYN }] }],
    ["unsafe", { id: "unsafe", fields: [
      { name: "child", type: { kind: "record", shapeId: "unsafe" } },
      { name: "map", type: { kind: "map", key: STRING, value: F64 } },
    ] }],
  ]);
  const unions = new Map<string, IrUnionDef>([
    ["optional", { id: "optional", arms: [{ kind: "record", shapeId: "payload" }, { kind: "undefinedT" }] }],
  ]);
  const record = (id: string): IrRecordShape | undefined => records.get(id);
  const union = (id: string): IrUnionDef | undefined => unions.get(id);

  test.each(["payload", "recursive", "tuple"])("validates %s without declaring opaque slots JSON-safe", (id) => {
    const type: IrType = { kind: "record", shapeId: id };
    expect(canDynCheckTo(type, record, union)).toBe(true);
    expect(isJsonSafeType(type, record, union)).toBe(false);
    expect(isJsonStringifySafeType(type, record, union)).toBe(false);
    expect(isIslandCallbackParamType(type, record, union)).toBe(false);
  });

  test("opaque arrays and optional records retain their actual payload representation", () => {
    expect(canDynCheckTo(arrayOf(DYN), record, union)).toBe(true);
    expect(canDynCheckTo({ kind: "union", unionId: "optional" }, record, union)).toBe(true);
  });

  test("recursive back-edges cannot hide an unsupported sibling", () => {
    expect(canDynCheckTo({ kind: "record", shapeId: "unsafe" }, record, union)).toBe(false);
    expect(canDynCheckTo({ kind: "record", shapeId: "missing" }, record, union)).toBe(false);
    expect(canDynCheckTo({ kind: "union", unionId: "missing" }, record, union)).toBe(false);
  });
});
