/* IR ↔ JSON. Numeric literals preserve JavaScript's complete number domain:
 * JSON's null/zero spellings must not erase NaN, infinities or negative zero. */
import type { IrModule } from "./ir.js";

// Version 13 adds the NaN sentinel. Older readers interpret unknown tags
// as negative infinity, so accepting a newer document would miscompile it.
export const IR_VERSION = 13 as const;

export function serializeModule(mod: IrModule): string {
  return JSON.stringify(mod, (_key, value) => {
    if (typeof value === "number" && !Number.isFinite(value)) {
      return { $nonfinite: Number.isNaN(value) ? "nan" : value > 0 ? "inf" : "-inf" };
    }
    // JSON.stringify(-0) prints "0", silently losing the sign a numLit's
    // f64 semantics depend on (String(-0) is "0" but 1/-0 is -Infinity) —
    // the same sentinel mechanism carries it.
    if (typeof value === "number" && Object.is(value, -0)) {
      return { $nonfinite: "-0" };
    }
    return value;
  }, 2);
}

export function deserializeModule(json: string): IrModule {
  const mod = JSON.parse(json, (_key, value: unknown) => {
    if (typeof value === "object" && value !== null && "$nonfinite" in value) {
      const tag = (value as { $nonfinite: string }).$nonfinite;
      if (tag === "inf") return Infinity;
      if (tag === "-inf") return -Infinity;
      if (tag === "-0") return -0;
      if (tag === "nan") return NaN;
      throw new Error(`Invalid IR number sentinel: ${String(tag)}`);
    }
    return value;
  }) as IrModule;
  if (mod.irVersion !== IR_VERSION) {
    throw new Error(
      `IR version mismatch: file has ${String(mod.irVersion)}, compiler expects ${IR_VERSION}`,
    );
  }
  return mod;
}
