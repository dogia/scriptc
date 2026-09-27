import { expect, test } from "vitest";
import { F64, STRING, VOID, RUNTIME_EMITTER_CLASS, arrayOf, funcOf, mapOf, type IrModule, type IrRecordShape, type IrType } from "../ir/ir.js";
import { computeTraced } from "./cycle-analysis.js";
import { CEmitter } from "./c/c-emitter.js";
import { computeTraced as llvmTraced } from "./llvm/shapes.js";

const loc = { file: "cycles.ts", start: 0, end: 1 };
function module(): IrModule {
  return { irVersion: 12, sourceFile: loc.file, entry: "main", functions: [{ name: "main", locals: [], params: [], returnType: VOID, body: [], loc }] };
}
const ref = (shapeId: string): IrType => ({ kind: "record", shapeId });
const shape = (id: string, types: IrType[]): IrRecordShape => ({ id, fields: types.map((type, i) => ({ name: `field${i}`, type })) });

function check(mod: IrModule, shapes: string[], unions: string[] = []): void {
  const before = structuredClone(mod);
  const actual = computeTraced(mod);
  expect([...actual.shapes].sort()).toEqual(shapes.sort());
  expect([...actual.unions].sort()).toEqual(unions.sort());
  expect(llvmTraced(mod)).toEqual(actual);
  const c = new CEmitter(mod);
  expect(c.tracedShapes).toEqual(actual.shapes);
  expect(c.tracedUnions).toEqual(actual.unions);
  expect(mod).toEqual(before);
}

test("removes an entire acyclic dependency chain to a fixed point", () => {
  const mod = module();
  mod.records = [shape("a", [ref("b")]), shape("b", [ref("c")]), shape("c", [STRING, F64])];
  mod.unions = [{ id: "tail", arms: [ref("a"), { kind: "undefinedT" }] }];
  check(mod, []);
  mod.records.reverse();
  check(mod, []);
});

test("retains mutual cycles and every shape that can contain them", () => {
  const mod = module();
  mod.records = [shape("outer", [ref("a")]), shape("a", [ref("b")]), shape("b", [ref("a")]), shape("leaf", [F64])];
  check(mod, ["record:outer", "record:a", "record:b"]);
});

test("tracks cycles through unions, array elements and map values", () => {
  const mod = module();
  mod.records = [shape("node", [arrayOf(mapOf(STRING, { kind: "union", unionId: "link" }))]), shape("leaf", [STRING])];
  mod.unions = [
    { id: "link", arms: [ref("node"), { kind: "nullT" }] },
    { id: "leaf", arms: [ref("leaf"), F64] },
  ];
  check(mod, ["record:node"], ["link"]);
});

test("index-signature overflow participates in the same cycle graph", () => {
  const mod = module();
  mod.records = [
    { ...shape("recursive", []), indexValue: arrayOf(ref("recursive")) },
    { ...shape("scalar", []), indexValue: mapOf(STRING, F64) },
    { ...shape("promises", []), indexValue: { kind: "promise", inner: F64 } },
  ];
  check(mod, ["record:recursive", "record:promises"]);
});

test("closures and promises seed tracing even with scalar signatures", () => {
  const mod = module();
  mod.records = [shape("closure", [funcOf([], F64)]), shape("promise", [{ kind: "promise", inner: F64 }]), shape("bytes", [{ kind: "bytes", elem: "u8" }])];
  check(mod, ["record:closure", "record:promise"]);
});

test("a derived field requires a uniform header for the entire hierarchy", () => {
  const mod = module();
  mod.classes = [
    { name: "Derived", loc, base: "Base", fields: [{ name: "callback", type: funcOf([], VOID) }] },
    { name: "Sibling", loc, base: "Base", fields: [] },
    { name: "Base", loc, fields: [] },
    { name: "Independent", loc, fields: [{ name: "data", type: STRING }] },
  ];
  check(mod, ["object:Base", "object:Derived", "object:Sibling"]);
});

test("an acyclic hierarchy is removed as one unit", () => {
  const mod = module();
  mod.records = [shape("data", [F64])];
  mod.classes = [
    { name: "Derived", loc, base: "Base", fields: [{ name: "data", type: ref("data") }] },
    { name: "Base", loc, fields: [] },
  ];
  check(mod, []);
});

test("the runtime emitter and its descendants retain listener tracing", () => {
  const mod = module();
  mod.classes = [{ name: "Events", loc, base: RUNTIME_EMITTER_CLASS, fields: [] }, { name: RUNTIME_EMITTER_CLASS, loc, fields: [] }];
  check(mod, ["object:Events", `object:${RUNTIME_EMITTER_CLASS}`]);
});

test("separate calls do not share mutable fixed-point state", () => {
  const mod = module();
  mod.records = [shape("same", [ref("same")])];
  const previous = computeTraced(mod);
  mod.records = [shape("same", [STRING])];
  check(mod, []);
  expect([...previous.shapes]).toEqual(["record:same"]);
});
