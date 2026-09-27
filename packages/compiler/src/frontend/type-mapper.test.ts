import { describe, expect, test } from "vitest";
import { F64, STRING, UNDEFINED_T, VOID, mapOf, setOf, type IrType } from "../ir/ir.js";
import { formatIrType, genResultRecord, ShapeRegistry, UnionRegistry, withUndefinedArm } from "./type-mapper.js";

describe("nullable collection union builders", () => {
  test.each([mapOf(STRING, F64), setOf(STRING)])("optional %j fields and generator results share the same union", (type) => {
    const shapes = new ShapeRegistry();
    const unions = new UnionRegistry();
    const optional = withUndefinedArm(type, unions);
    expect(optional?.kind).toBe("union");
    if (optional?.kind !== "union") throw new Error("missing union");
    expect(unions.get(optional.unionId)?.arms).toContainEqual(type);
    expect(unions.get(optional.unionId)?.arms).toContainEqual(UNDEFINED_T);
    expect(withUndefinedArm(optional, unions)).toEqual(optional);
    const result = genResultRecord(type, VOID, shapes, unions);
    expect(result).not.toBeNull();
    expect(shapes.get(result!.shapeId)?.fields.find((field) => field.name === "value")?.type).toEqual(optional);
  });

  test("collection generators retain the data-sibling refusal", () => {
    expect(genResultRecord(mapOf(STRING, F64), STRING, new ShapeRegistry(), new UnionRegistry())).toBeNull();
    expect(genResultRecord(setOf(STRING), F64, new ShapeRegistry(), new UnionRegistry())).toBeNull();
  });
});

describe("IR type diagnostics", () => {
  test("preserves small types, repeated sibling shapes, and array precedence", () => {
    const shapes = new ShapeRegistry();
    const unions = new UnionRegistry();
    const record: IrType = { kind: "record", shapeId: shapes.intern([{ name: "value", type: F64 }]) };
    const union: IrType = { kind: "union", unionId: unions.intern([F64, STRING]) };
    const callback: IrType = { kind: "func", params: [record, record], ret: union };
    expect(formatIrType({ kind: "array", elem: callback }, shapes, unions))
      .toBe("(({ value: number }, { value: number }) => number | string)[]");
    expect(formatIrType({ kind: "array", elem: union }, shapes, unions)).toBe("(number | string)[]");
    expect(formatIrType({ kind: "map", key: STRING, value: { kind: "set", elem: F64 } }, shapes, unions))
      .toBe("Map<string, Set<number>>");
    expect(formatIrType({ kind: "generator", async: true, yieldT: record, retT: VOID, nextT: F64 }, shapes, unions))
      .toBe("AsyncGenerator<{ value: number }, void, number>");
  });

  test("breaks recursive record/union paths without hiding later siblings", () => {
    const shapes = new ShapeRegistry();
    const unions = new UnionRegistry();
    const record: IrType = { kind: "record", shapeId: shapes.intern([]) };
    const union: IrType = { kind: "union", unionId: unions.intern([record, STRING]) };
    shapes.get(record.shapeId)!.fields.push({ name: "next", type: union });
    const seen = new Set<string>();
    expect(formatIrType({ kind: "func", params: [record, record], ret: VOID }, shapes, unions, seen))
      .toBe("({ next: ... | string }, { next: ... | string }) => void");
    expect(seen.size).toBe(0);
  });

  test("keeps numeric tuple order, accessor spelling, and index signatures", () => {
    const shapes = new ShapeRegistry();
    const unions = new UnionRegistry();
    const tuple = shapes.intern([
      { name: "10", type: STRING }, { name: "2", type: F64 }, { name: "0", type: VOID },
    ], true);
    expect(formatIrType({ kind: "record", shapeId: tuple }, shapes, unions)).toBe("[void, number, string]");
    const shapeId = shapes.intern([
      { name: "%get:value", type: { kind: "func", params: [], ret: F64 } },
      { name: "%set:value", type: { kind: "func", params: [F64], ret: VOID } },
    ], false, STRING);
    expect(formatIrType({ kind: "record", shapeId }, shapes, unions))
      .toBe("{ get value(): number; set value(number); [key: string]: string }");
  });

  test("bounds expansion of a shared acyclic type graph", () => {
    const shapes = new ShapeRegistry();
    const unions = new UnionRegistry();
    let type: IrType = STRING;
    // Only sixteen shapes, but naive expansion repeats the leaf 65,536 times.
    for (let i = 0; i < 16; i++) {
      type = { kind: "record", shapeId: shapes.intern([{ name: "left", type }, { name: "right", type }]) };
    }
    const seen = new Set<string>();
    const text = formatIrType(type, shapes, unions, seen);
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toMatch(/^\{ left: \{ left:/);
    expect(text.endsWith("...")).toBe(true);
    expect(seen.size).toBe(0);
    expect(formatIrType(type, shapes, unions, seen)).toBe(text);
  });

  test("bounds deeply nested wrappers without overflowing the stack", () => {
    let type: IrType = STRING;
    for (let i = 0; i < 10_000; i++) type = { kind: "promise", inner: type };
    const text = formatIrType(type, new ShapeRegistry(), new UnionRegistry());
    expect(text.startsWith("Promise<Promise<")).toBe(true);
    expect(text).toContain("...");
    expect(text.length).toBeLessThanOrEqual(4096);
  });

  test("stops visiting wide unions and bounds long names", () => {
    const shapes = new ShapeRegistry();
    const unions = new UnionRegistry();
    const id = unions.intern([]);
    const arms = unions.get(id)!.arms;
    for (let i = 0; i < 2000; i++) arms.push(STRING);
    // Formatting must stop before reaching this arm, not slice a completed string.
    Object.defineProperty(arms, 1999, { get() { throw new Error("visited after output was full"); } });
    const text = formatIrType({ kind: "union", unionId: id }, shapes, unions);
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text.endsWith("...")).toBe(true);
    const longName = formatIrType({ kind: "object", className: "x".repeat(10_000) }, shapes, unions);
    expect(longName.length).toBeLessThanOrEqual(4096);
    expect(longName.endsWith("...")).toBe(true);
  });
});

describe("union discriminator identity", () => {
  test("equal storage layouts retain independent literal contracts", () => {
    const registry = new UnionRegistry();
    const arms: IrType[] = [{ kind: "record", shapeId: "empty" }, { kind: "record", shapeId: "value" }];
    const first = { field: "kind", cases: [{ tag: 0, values: ["empty"] }, { tag: 1, values: ["value"] }] };
    const second = { field: "kind", cases: [{ tag: 0, values: ["none"] }, { tag: 1, values: ["some"] }] };
    const a = registry.intern(arms, first);
    const b = registry.intern(arms, second);
    const plain = registry.intern(arms);
    expect(a).not.toBe(b);
    expect(a).not.toBe(plain);
    expect(registry.intern(arms, structuredClone(first))).toBe(a);
    expect(registry.get(a)?.discriminant).toEqual(first);
    expect(registry.get(b)?.discriminant).toEqual(second);
    expect(registry.get(plain)?.discriminant).toBeUndefined();
  });

  test("primitive literal kinds are not conflated", () => {
    const registry = new UnionRegistry();
    const arms: IrType[] = [{ kind: "record", shapeId: "a" }, { kind: "record", shapeId: "b" }];
    const numeric = registry.intern(arms, { field: "tag", cases: [{ tag: 0, values: [1] }, { tag: 1, values: [2] }] });
    const string = registry.intern(arms, { field: "tag", cases: [{ tag: 0, values: ["1"] }, { tag: 1, values: ["2"] }] });
    const bool = registry.intern(arms, { field: "tag", cases: [{ tag: 0, values: [false] }, { tag: 1, values: [true] }] });
    expect(new Set([numeric, string, bool]).size).toBe(3);
  });
});
