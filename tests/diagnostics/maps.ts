// Map support boundaries at lowering. Keep accepted adjacent forms here
// as well so widening the value domain removes its old diagnostic.

// Boolean keys remain outside the scalar/reference key domain.
const byFlag = new Map<boolean, string>();

// Values exclude functions (no closure story in the uniform value slot yet).
const handlers = new Map<string, () => void>();

// Typed nested Maps retain their identity and are supported.
const nested = new Map<string, Map<string, number>>();

// Map-typed slots elsewhere report the ordinary unsupported-type diagnostic.
function useBad(m: Map<boolean, number>): number {
  return m.size;
}

// Nullable Map views are supported; no diagnostic should appear here.
function maybeMap(cond: boolean): Map<string, number> | undefined {
  return undefined;
}

// Maps as array elements: ScrArr has no map element kind.
const rows: Map<string, number>[] = [];

// Maps are not JSON (Node stringifies them as the useless "{}" husk;
// scriptc rejects instead of shipping that).
const m = new Map<string, number>();
console.log(JSON.stringify(m));

// Map methods have no bound-value form — call them directly.
const getter = m.get;

// Reached: collection defers its diagnostics until a reference makes
// them relevant; these references are what makes them count.
useBad(new Map<boolean, number>());
maybeMap(true);
