import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { analyze, compile } from "../src/index.js";

const sanitize = process.env["SCRIPTC_SAN"] === "1";

test.each(["c", "llvm"] as const)("incompatible JS return overrides refuse only when called (%s)", async (backend) => {
  const dir = mkdtempSync(join(tmpdir(), "scriptc-override-returns-"));
  try {
    const entry = join(dir, "main.cjs");
    writeFileSync(entry, `
class Base {
  method(value, other) { return 1; }
  dispatch(value) { return this.method(value, undefined); }
}
class Derived extends Base {
  // @ts-expect-error Deliberately exercise the native override refusal.
  method(value, other) { console.log("must not execute", value, other); }
}
class Leaf extends Derived {
  callSuper(value) { super.method(value, undefined); }
}
class Short extends Base {
  // @ts-expect-error Deliberately exercise the native override refusal.
  method(value) { console.log("must not execute short", value); }
}
function argument(label) { console.log("argument", label); return label; }
const derived = new Derived();
try { derived.method(argument("direct first"), argument("direct second")); }
catch (error) { console.log("direct", String(error).includes("SC1090"), String(error).includes("different return type")); }
try { derived.dispatch(argument("virtual")); }
catch (error) { console.log("virtual", String(error).includes("SC1090")); }
try { new Leaf().callSuper(argument("super")); }
catch (error) { console.log("super", String(error).includes("SC1090")); }
try { new Short().dispatch(argument("short")); }
catch (error) { console.log("short", String(error).includes("SC1090")); }
console.log("after");
`);
    const { coverage } = analyze(entry, { dynamic: false });
    expect(coverage.diagnostics).toEqual([]);
    expect(coverage.stats.statementsIsland).toBe(0);
    expect(coverage.runtimeFences?.map((d) => [d.code, d.message])).toEqual([
      ["SC1090", expect.stringContaining("overriding method 'method' with a different return type")],
      ["SC1090", expect.stringContaining("overriding method 'method' with a different return type")],
    ]);
    const result = await compile(entry, { backend, dynamic: false, sanitize, outDir: dir, outPath: join(dir, "program") });
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    const child = spawnSync(result.binaryPath, [], { encoding: "utf8" });
    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    expect(child.stdout).toBe("argument direct first\nargument direct second\ndirect true true\nargument virtual\nvirtual true\nargument super\nsuper true\nargument short\nshort true\nafter\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test.each([
  ["parameter types", `class Base { method(value = 1) { return 1; } } class Derived extends Base { method(value = "x") { return "x"; } }`],
  ["async methods", `class Base { method() { return 1; } } class Derived extends Base { async method() { return "x"; } }`],
  ["generators", `class Base { method() { return 1; } } class Derived extends Base { *method() { yield "x"; } }`],
  ["accessors", `class Base { get value() { return 1; } } class Derived extends Base { get value() { return "x"; } }`],
])("%s retain their class signature refusal", (_name, source) => {
  const dir = mkdtempSync(join(tmpdir(), "scriptc-override-signatures-"));
  try {
    const entry = join(dir, "main.cjs");
    writeFileSync(entry, "// @ts-nocheck\n" + source + "\nnew Derived();\n");
    const { coverage } = analyze(entry, { dynamic: false });
    const diagnostics = [...coverage.diagnostics, ...(coverage.runtimeFences ?? [])];
    expect(diagnostics.some((d) => d.code === "SC1090" && /overriding.*different (signature|type)/.test(d.message)), JSON.stringify(diagnostics)).toBe(true);
    expect(diagnostics.some((d) => /different return type/.test(d.message))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test.each([
  ["TypeScript", "ts", ""],
  ["a TypeScript base", "cjs", "import { Base } from './base.ts';"],
])("%s keeps incompatible returns as class refusals", (_name, extension, importedBase) => {
  const dir = mkdtempSync(join(tmpdir(), "scriptc-typed-overrides-"));
  try {
    const entry = join(dir, `main.${extension}`);
    const base = "class Base { method() { return 1; } }";
    writeFileSync(join(dir, "base.ts"), "export " + base);
    writeFileSync(entry, `// @ts-nocheck\n${importedBase || base}\nclass Derived extends Base { method() { return 'x'; } }\nnew Derived();\n`);
    const { coverage } = analyze(entry, { dynamic: false });
    const diagnostics = [...coverage.diagnostics, ...(coverage.runtimeFences ?? [])];
    expect(diagnostics.some((d) => d.code === "SC1090" && d.message.includes("different signature")), JSON.stringify(diagnostics)).toBe(true);
    expect(diagnostics.some((d) => /different return type/.test(d.message))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
