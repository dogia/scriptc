// Set support boundaries: what stays rejected at LOWERING, with specific
// messages. Elements share Map's key domain; unsupported forms remain fenced.

// Array seeds lower (`new Set(["a", "b"])` is a corpus program now); a
// other iterable seed — another Set — typechecks against the lib
// but keeps the fence: never silently an empty set.
const seeded = new Set(new Set(["a", "b"]));

// Boolean elements remain unsupported — the new-site diagnostic names the
// element type.
const byFlag = new Set<boolean>();

// Record elements now use pointer identity and cycle tracing.
const recs = new Set<{ id: number }>();

// Set-typed slots elsewhere report the ordinary unsupported-type diagnostic.
function useBad(s: Set<boolean>): number {
  return s.size;
}

// Nullable Set arms compile and remain as working context.
function maybeSet(cond: boolean): Set<string> | undefined {
  return undefined;
}

// Sets as array elements: ScrArr has no set element kind.
const rows: Set<string>[] = [];

// Sets are not JSON (Node stringifies them as the useless "{}" husk;
// scriptc rejects instead of shipping that).
const s = new Set<string>();
console.log(JSON.stringify(s));

// Set methods have no bound-value form — call them directly.
const adder = s.add;

// Reached: collection defers its diagnostics until a reference makes
// them relevant; these references are what makes them count.
useBad(new Set<boolean>());
maybeSet(true);
