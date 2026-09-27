import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { checkPreflight, loadProgram } from "./program.js";

function requireOrderDiagnostics(source: string, dependency = "exports.value = 'ready';\n") {
  const dir = mkdtempSync(join(tmpdir(), "scriptc-require-order-"));
  const entry = join(dir, "main.cjs");
  writeFileSync(entry, source);
  writeFileSync(join(dir, "dep.cjs"), dependency);
  const load = loadProgram(entry);
  try {
    return checkPreflight(load);
  } finally {
    load.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
}

test.for([
  "exports.read = read;",
  "module.exports.renamed = read;",
  "module.exports = read;",
])("a hoisted function export before require is safe: %s", (publish) => {
  expect(requireOrderDiagnostics(`
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
${publish}
const dep = require('./dep.cjs');
function read() { return helper(); }
function helper() { return dep.value; }
`)).toEqual([]);
});

test.for([
  "exports.a = exports.b = void 0;",
  "exports.a = undefined; exports.b = 'literal'; exports.c = 1;",
  "exports.first = exports.second = read;",
])("literal and chained export prologues do not invoke functions: %s", (prefix) => {
  expect(requireOrderDiagnostics(`
Object.defineProperty(exports, '__esModule', { value: true });
${prefix}
exports.read = read;
const dep = require('./dep.cjs');
function read() { return dep.value; }
`)).toEqual([]);
});

test.for([
  ["direct call", "read();"],
  ["transitive call", "helper(); function helper() { return read(); }"],
  ["callback escape", "[1].map(read);"],
  ["export call", "exports.read();"],
  ["export alias call", "const alias = exports; alias.read();"],
  ["computed export name", "exports[read()] = read;"],
  ["export initializer call", "exports.value = read();"],
  ["class static initializer", "class Early { static value = read(); }"],
  ["extra descriptor effect", "Object.defineProperty(exports, '__esModule', { value: true, enumerable: read() });"],
  ["void initializer call", "exports.value = void read();"],
  ["prototype mutation", "exports.__proto__ = read;"],
  ["read-only marker", "Object.defineProperty(exports, '__esModule', { value: true }); exports.__esModule = read;"],
  ["replacement export property", "module.exports = read; module.exports.name = read;"],
  ["non-export assignment chain", "const box = {}; exports.alias = box.read = read;"],
])("require still refuses an early read through %s", ([, early]) => {
  const diagnostics = requireOrderDiagnostics(`
exports.read = read;
${early}
const dep = require('./dep.cjs');
function read() { return dep.value; }
`);
  expect(diagnostics.some((diag) => diag.code === "SC1013" && diag.message.includes("binding 'dep'")))
    .toBe(true);
});

test("publishing a require binding itself still reads it before initialization", () => {
  const diagnostics = requireOrderDiagnostics(`
exports.read = read;
const { read } = require('./dep.cjs');
`);
  expect(diagnostics.some((diag) => diag.code === "SC1013" && diag.message.includes("binding 'read'")))
    .toBe(true);
});

test.for([
  "var Object = null; Object.defineProperty(exports, '__esModule', { value: true }); exports.read = read;",
  "var exports = null; exports.read = read;",
  "var module = null; module.exports = read;",
])("source bindings cannot masquerade as a CommonJS prologue: %s", (prefix) => {
  const diagnostics = requireOrderDiagnostics(`
${prefix}
const dep = require('./dep.cjs');
function read() { return dep.value; }
`);
  expect(diagnostics.some((diag) => diag.code === "SC1013" && diag.message.includes("binding 'dep'")))
    .toBe(true);
});

test("an earlier declarator can call an export before the require initializes", () => {
  const diagnostics = requireOrderDiagnostics(`
exports.read = read;
const before = read(), dep = require('./dep.cjs');
function read() { return dep.value; }
`);
  expect(diagnostics.some((diag) => diag.code === "SC1013" && diag.message.includes("binding 'dep'")))
    .toBe(true);
});

test("a later declarator can call an export after the require initializes", () => {
  expect(requireOrderDiagnostics(`
exports.read = read;
const dep = require('./dep.cjs'), after = read();
function read() { return dep.value; }
`)).toEqual([]);
});

test("function publication does not admit CommonJS cycles", () => {
  const diagnostics = requireOrderDiagnostics(`
exports.read = read;
const dep = require('./dep.cjs');
function read() { return dep.value; }
`, "const main = require('./main.cjs'); exports.value = main.read();\n");
  expect(diagnostics.some((diag) => diag.code === "SC1016")).toBe(true);
});
