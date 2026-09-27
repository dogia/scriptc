import { streamRooted, unionWideningTags, type IrClassGraphNode } from "../../../packages/compiler/src/ir/analysis.js";
import { BOOL, F64, STRING, VOID, isRefCounted, typeEquals, type IrType } from "../../../packages/compiler/src/ir/ir.js";

// These are the compiler's real type comparison and ownership queries.
// Native callers pass recursive, nullable, and optional IR fields through
// the same APIs that the validator and both emitters use.
const types: IrType[] = [
  F64, STRING, BOOL, VOID,
  { kind: "nullT" }, { kind: "undefinedT" },
  { kind: "array", elem: F64 },
  { kind: "array", elem: STRING },
  { kind: "array", elem: { kind: "array", elem: F64 } },
  { kind: "bytes", elem: "u8" },
  { kind: "bytes", elem: "i32" },
  { kind: "map", key: STRING, value: { kind: "array", elem: F64 } },
  { kind: "map", key: STRING, value: { kind: "array", elem: STRING } },
  { kind: "set", elem: F64 },
  { kind: "set", elem: STRING },
  { kind: "record", shapeId: "first" },
  { kind: "record", shapeId: "second" },
  { kind: "union", unionId: "first" },
  { kind: "union", unionId: "second" },
  { kind: "object", className: "Example" },
  { kind: "object", className: "Other" },
  { kind: "classval", className: "Example" },
  { kind: "moduleNs", moduleId: "example" },
  { kind: "moduleNs", moduleId: "other" },
  { kind: "promise", inner: F64 },
  { kind: "promise", inner: { kind: "array", elem: STRING } },
  { kind: "func", params: [F64, STRING], ret: BOOL },
  { kind: "func", params: [STRING, F64], ret: BOOL },
  { kind: "func", params: [F64, STRING], ret: F64 },
  { kind: "func", params: [F64], ret: BOOL },
  { kind: "func", params: [F64], ret: BOOL, rest: true, restAbi: "typed" },
  { kind: "func", params: [F64], ret: BOOL, rest: true, restAbi: "jsval" },
  { kind: "func", params: [F64], ret: BOOL, rest: true, argumentsAll: true },
  { kind: "generator", yieldT: STRING, retT: VOID, nextT: F64 },
  { kind: "generator", yieldT: STRING, retT: VOID, nextT: F64, async: true },
  { kind: "generator", yieldT: F64, retT: VOID, nextT: F64 },
  { kind: "generator", yieldT: STRING, retT: F64, nextT: F64 },
  { kind: "generator", yieldT: STRING, retT: VOID, nextT: STRING },
];
let comparisons = 0;
for (let i = 0; i < types.length; i++) {
  for (let j = 0; j < types.length; j++) {
    const equal = typeEquals(types[i]!, types[j]!);
    if (equal !== (i === j)) throw new Error("type comparison mismatch: " + i + ":" + j);
    comparisons++;
  }
  console.log("owned", i, isRefCounted(types[i]!));
}
console.log("comparisons", comparisons);

// Compare independently constructed values, so identity cannot make a
// broken recursive comparator appear correct.
function nested(): IrType {
  return {
    kind: "map", key: STRING,
    value: { kind: "promise", inner: { kind: "array", elem: { kind: "record", shapeId: "leaf" } } },
  };
}
console.log("nested", typeEquals(nested(), nested()));
console.log("async flags", typeEquals(
  { kind: "generator", yieldT: F64, retT: VOID, nextT: STRING, async: true },
  { kind: "generator", yieldT: F64, retT: VOID, nextT: STRING, async: true },
));
console.log("typed rest", typeEquals(
  { kind: "func", params: [F64], ret: VOID, rest: true, restAbi: "typed" },
  { kind: "func", params: [F64], ret: VOID, rest: true, restAbi: "typed" },
));

// Tag mapping must use recursive ABI equality, preserve the source order,
// and refuse any missing payload layout rather than reinterpreting it.
const record: IrType = { kind: "record", shapeId: "payload" };
const original: IrType[] = [F64, record, { kind: "nullT" }];
const wider: IrType[] = [{ kind: "undefinedT" }, { kind: "nullT" }, record, STRING, F64];
console.log("widen", unionWideningTags(original, wider)?.join(","));
console.log("reverse", unionWideningTags(wider, original) === null);
console.log("nested widen", unionWideningTags([nested()], [BOOL, nested()])?.join(","));
console.log("missing shape", unionWideningTags([record], [{ kind: "record", shapeId: "other" }]) === null);
console.log("empty", unionWideningTags([], wider)?.length);

// Hierarchy traversal uses real recursive graph interfaces and nullable
// parents. Query several depths and distinct runtime/user roots.
const plain: IrClassGraphNode = { def: { name: "Plain" }, base: null, children: [] };
const stream: IrClassGraphNode = { def: { name: "%Readable" }, base: null, children: [] };
const child: IrClassGraphNode = { def: { name: "Child" }, base: stream, children: [] };
const grandchild: IrClassGraphNode = { def: { name: "Grandchild" }, base: child, children: [] };
const unrelated: IrClassGraphNode = { def: { name: "Unrelated" }, base: plain, children: [] };
console.log("roots", streamRooted(plain), streamRooted(stream), streamRooted(child), streamRooted(grandchild), streamRooted(unrelated));
