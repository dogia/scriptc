import type { IrModule, IrType } from "../ir/ir.js";
import { funcOf, mapOf, RUNTIME_EMITTER_CLASS, STRING, VOID } from "../ir/ir.js";

/** Cycle capability shared by both native backends.
 * Greatest fixpoint over shapes and unions: start optimistic (everything
 * cycle-capable), repeatedly drop shapes with no cycle-capable field and
 * unions with no cycle-capable arm until stable. Closures and promises
 * are always cycle-capable; strings never are; arrays/Sets inherit their
 * element type's capability and Maps inherit either key or value capability.
 * A HIERARCHY is one unit of capability
 * (a base-typed slot can hold any subclass and retain touches the cycle
 * header, so header presence must be uniform across an extends tree): a
 * unit is cycle-capable iff ANY member is — every backend uses the same grouping. */
export function computeTraced(mod: IrModule): { shapes: Set<string>; unions: Set<string> } {
  const tracedShapes = new Set<string>();
  const tracedUnions = new Set<string>();
  const classes = mod.classes ?? [];
  const shapeDefs = [
    ...classes.map((c) => ({
      key: `object:${c.name}`,
      fields: c.name === RUNTIME_EMITTER_CLASS
        ? [...c.fields, { name: "<listeners>", type: funcOf([], VOID) }]
        : c.fields,
    })),
    ...(mod.records ?? []).map((r) => ({
      key: `record:${r.id}`,
      fields: r.indexValue
        ? [...r.fields, { name: "<overflow>", type: mapOf(STRING, r.indexValue) }]
        : r.fields,
    })),
  ];
  for (const s of shapeDefs) tracedShapes.add(s.key);
  for (const u of mod.unions ?? []) tracedUnions.add(u.id);
  // Hierarchy units: root lookup over the base links (classes with a base
  // or a subclass — and the runtime emitter class — form units under their
  // root; standalone classes and records stay singleton units).
  const baseOf = new Map(classes.map((c) => [c.name, c.base ?? null] as const));
  const hasChildren = new Set<string>();
  for (const cls of classes) if (cls.base !== undefined) hasChildren.add(cls.base);
  const rootOf = (name: string): string => {
    let cur = name;
    for (let b = baseOf.get(cur); b !== null && b !== undefined; b = baseOf.get(cur)) cur = b;
    return cur;
  };
  const unitKeyOf = (key: string): string => {
    if (!key.startsWith("object:")) return key;
    const name = key.slice("object:".length);
    const inHierarchy =
      typeof baseOf.get(name) === "string" || hasChildren.has(name) || name === RUNTIME_EMITTER_CLASS;
    return inHierarchy ? `object:${rootOf(name)}` : key;
  };
  const units = new Map<string, typeof shapeDefs>();
  for (const s of shapeDefs) {
    const unit = unitKeyOf(s.key);
    let members = units.get(unit);
    if (!members) units.set(unit, (members = []));
    members.push(s);
  }
  const cycleCapable = (t: IrType): boolean => {
    switch (t.kind) {
      case "func":
      case "promise":
        return true;
      case "object":
        return tracedShapes.has(`object:${t.className}`);
      case "record":
        return tracedShapes.has(`record:${t.shapeId}`);
      case "union":
        return tracedUnions.has(t.unionId);
      case "map":
        return cycleCapable(t.key) || cycleCapable(t.value);
      case "set":
      case "array":
        return cycleCapable(t.elem);
      default:
        return false;
    }
  };
  let shrunk = true;
  while (shrunk) {
    shrunk = false;
    for (const members of units.values()) {
      if (
        tracedShapes.has(members[0]!.key) &&
        !members.some((s) => s.fields.some((f) => cycleCapable(f.type)))
      ) {
        for (const s of members) tracedShapes.delete(s.key);
        shrunk = true;
      }
    }
    for (const u of mod.unions ?? []) {
      if (tracedUnions.has(u.id) && !u.arms.some(cycleCapable)) {
        tracedUnions.delete(u.id);
        shrunk = true;
      }
    }
  }
  return { shapes: tracedShapes, unions: tracedUnions };
}
