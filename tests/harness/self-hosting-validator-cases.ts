import { BOOL, F64, STRING, VOID, arrayOf, mapOf, setOf, type IrExpr, type IrModule, type IrStmt, type IrType } from "../../packages/compiler/src/ir/ir.js";
import { boolLit, numLit, strLit, varRef } from "../../packages/compiler/src/ir/build.js";

const loc = { file: "validator-input.ts", start: 12, end: 34 };
const expression = (expr: IrExpr): IrStmt => ({ kind: "exprStmt", expr, loc });
const base = (): IrModule => ({
  irVersion: 13, sourceFile: loc.file, entry: "main",
  functions: [{ name: "main", params: [], locals: [], returnType: VOID, body: [], loc }],
});

export interface ValidatorCase {
  name: string;
  module: IrModule;
  /** A non-empty substring pins why malformed input is rejected. */
  diagnostic?: string;
}

/** Structurally well-formed IR with valid and deliberately invalid semantic
 * contracts. Each case can pass the checked JSON boundary; the production
 * validator then owns the decision and diagnostic ordering. */
export function validatorCases(): ValidatorCase[] {
  const cases: ValidatorCase[] = [];
  const add = (name: string, change: (module: IrModule) => void, diagnostic?: string): void => {
    const module = base();
    change(module);
    cases.push({ name, module, ...(diagnostic ? { diagnostic } : {}) });
  };
  add("empty module", () => {});
  add("duplicate function", (m) => { m.functions.push(structuredClone(m.functions[0]!)); }, "duplicate function");
  add("unknown local", (m) => { m.functions[0]!.body = [expression(varRef("missing", F64, loc))]; }, "missing");
  add("parameter without local", (m) => {
    m.functions[0]!.params = [{ name: "x", localId: "x", type: F64 }];
  }, "has no local entry");
  add("local read type", (m) => {
    m.functions[0]!.locals = [{ id: "x", name: "x", type: F64, mutable: true }];
    m.functions[0]!.body = [expression(varRef("x", STRING, loc))];
  }, "varRef");
  add("local initializer type", (m) => {
    m.functions[0]!.locals = [{ id: "x", name: "x", type: F64, mutable: true }];
    m.functions[0]!.body = [{ kind: "varDecl", localId: "x", init: strLit("wrong", loc), loc }];
  }, "expected f64");
  add("return type", (m) => {
    m.functions[0]!.returnType = F64;
    m.functions[0]!.body = [{ kind: "return", value: strLit("wrong", loc), loc }];
  }, "return value");
  add("missing return", (m) => { m.functions[0]!.returnType = F64; }, "return");
  add("complete return", (m) => {
    m.functions[0]!.returnType = F64;
    m.functions[0]!.body = [{ kind: "if", cond: boolLit(true, loc),
      then: [{ kind: "return", value: numLit(1, loc), loc }],
      else_: [{ kind: "return", value: numLit(2, loc), loc }], loc }];
  });
  add("condition type", (m) => {
    m.functions[0]!.body = [{ kind: "if", cond: numLit(1, loc), then: [], else_: null, loc }];
  }, "if condition");
  add("break outside loop", (m) => { m.functions[0]!.body = [{ kind: "break", loc }]; }, "break");
  add("continue outside loop", (m) => { m.functions[0]!.body = [{ kind: "continue", loc }]; }, "continue");
  add("label resolution", (m) => {
    m.functions[0]!.body = [{ kind: "while", cond: boolLit(true, loc),
      body: [{ kind: "break", label: "missing", loc }], loc }];
  }, "missing");
  add("loop control flow", (m) => {
    m.functions[0]!.body = [{ kind: "for", init: null, cond: null, update: null, labels: ["outer"],
      body: [{ kind: "while", cond: boolLit(true, loc), body: [{ kind: "break", label: "outer", loc }], loc }], loc }];
  });
  add("duplicate switch default", (m) => {
    m.functions[0]!.body = [{ kind: "switch", disc: numLit(1, loc), cases: [
      { test: null, body: [] }, { test: null, body: [] },
    ], loc }];
  }, "default clauses");
  add("unknown function call", (m) => {
    m.functions[0]!.body = [expression({ kind: "call", callee: "missing", args: [], type: VOID, loc })];
  }, "missing");
  add("call argument count", (m) => {
    m.functions[0]!.body = [expression({ kind: "call", callee: "main", args: [numLit(1, loc)], type: VOID, loc })];
  }, "args");
  add("array index type", (m) => {
    m.functions[0]!.body = [expression({ kind: "arrayGet", arr: { kind: "arrayLit", elems: [], type: arrayOf(F64), loc },
      index: strLit("wrong", loc), type: F64, loc })];
  }, "index");
  add("array element type", (m) => {
    m.functions[0]!.body = [expression({ kind: "arrayLit", elems: [strLit("wrong", loc)], type: arrayOf(F64), loc })];
  }, "expected f64");
  for (const collection of ["map", "set"] as const) {
    for (const mixed of [false, true]) {
      add(`${collection} ${mixed ? "mixed" : "identity"} key union`, (m) => {
        const reference: IrType = { kind: "record", shapeId: "key" };
        const key: IrType = { kind: "union", unionId: "keys" };
        m.records = [{ id: "key", fields: [{ name: "id", type: F64 }] }];
        m.unions = [{ id: "keys", arms: [reference, mixed ? STRING : arrayOf(F64)] }];
        const expr: IrExpr = collection === "map"
          ? { kind: "mapNew", type: mapOf(key, F64), loc }
          : { kind: "setNew", type: setOf(key), loc };
        m.functions[0]!.body = [expression(expr)];
      }, mixed ? (collection === "map" ? "mapNew key kind union" : "setNew element kind union") : undefined);
    }
  }
  add("library signature", (m) => {
    m.functions[0]!.body = [expression({ kind: "libCall", fn: "number.isFinite", args: [strLit("wrong", loc)], type: BOOL, loc })];
  }, "expected f64");
  add("duplicate records", (m) => { m.records = [{ id: "r", fields: [] }, { id: "r", fields: [] }]; }, "duplicate record");
  add("record ordering", (m) => {
    m.records = [{ id: "r", fields: [{ name: "z", type: F64 }, { name: "a", type: STRING }] }];
  }, "canonical");
  add("tuple positions", (m) => { m.records = [{ id: "r", tuple: true, fields: [{ name: "1", type: F64 }] }]; }, "tuple fields");
  add("tuple with ten positions", (m) => {
    m.records = [{ id: "tuple", tuple: true, fields: Array.from({ length: 12 }, (_, i) => ({ name: String(i), type: F64 }))
      .sort((a, b) => a.name < b.name ? -1 : 1) }];
  });
  add("tuple duplicate positions", (m) => {
    m.records = [{ id: "tuple", tuple: true, fields: [{ name: "0", type: F64 }, { name: "0", type: F64 }] }];
  }, "tuple fields");
  add("empty tuple", (m) => { m.records = [{ id: "tuple", tuple: true, fields: [] }]; }, "tuple fields");
  add("recursive records", (m) => {
    m.records = [{ id: "node", fields: [{ name: "children", type: arrayOf({ kind: "record", shapeId: "node" }) }] }];
  });
  add("undeclared record", (m) => {
    m.records = [{ id: "node", fields: [{ name: "child", type: { kind: "record", shapeId: "missing" } }] }];
  }, "undeclared shape");
  add("duplicate union arms", (m) => { m.unions = [{ id: "u", arms: [F64, F64] }]; }, "identical");
  add("short union", (m) => { m.unions = [{ id: "u", arms: [F64] }]; }, "fewer than 2");
  add("union payload", (m) => {
    m.unions = [{ id: "u", arms: [F64, STRING] }];
    m.functions[0]!.body = [expression({ kind: "unionWrap", unionId: "u", tag: 0,
      value: strLit("wrong", loc), type: { kind: "union", unionId: "u" }, loc })];
  }, "unionWrap value");
  add("discriminator valid", (m) => {
    m.records = [
      { id: "empty", fields: [{ name: "kind", type: STRING }] },
      { id: "value", fields: [{ name: "kind", type: STRING }, { name: "value", type: F64 }] },
    ];
    m.unions = [{ id: "u", arms: [{ kind: "record", shapeId: "empty" }, { kind: "record", shapeId: "value" }],
      discriminant: { field: "kind", cases: [{ tag: 0, values: ["empty"] }, { tag: 1, values: ["number", "value"] }] } }];
  });
  const discriminated = structuredClone(cases[cases.length - 1]!.module);
  for (const variant of ["missing tag", "duplicate value", "wrong literal type", "empty values"]) {
    const m = structuredClone(discriminated);
    const guard = m.unions![0]!.discriminant!;
    if (variant === "missing tag") guard.cases.pop();
    if (variant === "duplicate value") guard.cases[1]!.values = ["empty"];
    if (variant === "wrong literal type") guard.cases[0]!.values = [false];
    if (variant === "empty values") guard.cases[0]!.values = [];
    cases.push({ name: "discriminator " + variant, module: m, diagnostic: "discriminant" });
  }
  add("FFI scalar declaration", (m) => {
    m.ffiImports = [{ name: "sum", symbol: "native_sum", params: ["f64", "i32"], returns: "f64" }];
  });
  add("FFI callback and context", (m) => {
    m.ffiImports = [{ name: "visit", symbol: "native_visit", params: [
      { callback: { id: "cb", params: ["f64", { context: "cb" }], returns: "void", lifetime: "call", invoke: "script-thread" } },
      { context: "cb" },
    ], returns: "void" }];
  });
  add("FFI mismatched contexts", (m) => {
    m.ffiImports = [{ name: "visit", symbol: "native_visit", params: [
      { callback: { id: "cb", params: ["f64", { context: "cb" }], returns: "void", lifetime: "call", invoke: "script-thread" } },
    ], returns: "void" }];
  }, "inconsistent context");
  add("FFI foreign callback contract", (m) => {
    m.ffiImports = [{ name: "visit", symbol: "native_visit", params: [
      { callback: { id: "cb", params: ["f64"], returns: "f64", lifetime: "call", invoke: "foreign" } },
    ], returns: "void" }];
  }, "not retained");
  add("FFI release without registration", (m) => {
    m.ffiImports = [{ name: "release", symbol: "native_release", params: [
      { callback: { release: "register:cb", params: ["f64"], returns: "void" } },
    ], returns: "void" }];
  }, "no retained target");
  add("several independent diagnostics", (m) => {
    m.entry = "missing";
    m.records = [{ id: "tuple", tuple: true, fields: [] }];
    m.unions = [{ id: "u", arms: [F64, F64] }];
    m.functions[0]!.body = [{ kind: "break", loc }, expression(varRef("missing", F64, loc))];
  }, "missing");
  return cases;
}
