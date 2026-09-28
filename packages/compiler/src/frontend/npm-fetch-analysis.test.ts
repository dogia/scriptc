import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test, vi } from "vitest";
import { NpmFetchAnalyzer, type FetchAnalysisModule } from "./npm-fetch-analysis.js";
import { Ts7Api } from "./ts7/rpc-api.js";
import type { Ts7FileSystem } from "./ts7/rpc-filesystem.js";

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function directory(): string {
  const dir = mkdtempSync(join(process.platform === "win32" ? tmpdir() : "/tmp", "scriptc-fetch-analysis-"));
  directories.push(dir);
  return dir;
}
function module(key: string, source: string): FetchAnalysisModule { return { key, source, format: "cjs" }; }

test("preserves original loader keys, ignores JSON, and isolates each module's bindings", () => {
  const analyzer = new NpmFetchAnalyzer((options) => new Ts7Api(options), directory());
  try {
    const files = [
      module("local", "const fetch = () => 1; fetch();"),
      module("bare", "fetch();"),
      module("C:\\包\\main.js", "globalThis.fetch();"),
      module("工作.mjs", "global.fetch();"),
      module("typed.ts", "module.exports = fetch;"),
      module("scr:import-trap:0", "globalThis.fetch;"),
      { key: "data.json", source: "fetch()", format: "json" as const },
    ];
    expect([...analyzer.analyze(files)]).toEqual(["bare", "C:\\包\\main.js", "工作.mjs", "typed.ts", "scr:import-trap:0"]);
  } finally { analyzer.close(); }
});

test("repeated analysis sees edits, removals, and reused names without retaining symbols", () => {
  const analyzer = new NpmFetchAnalyzer((options) => new Ts7Api(options), directory());
  try {
    expect([...analyzer.analyze([module("same.js", "fetch();")])]).toEqual(["same.js"]);
    expect([...analyzer.analyze([module("same.js", "const fetch = () => 1; fetch();")])]).toEqual([]);
    expect([...analyzer.analyze([])]).toEqual([]);
    expect([...analyzer.analyze([module("same.js", "globalThis.fetch();")])]).toEqual(["same.js"]);
  } finally { analyzer.close(); }
  analyzer.close();
  expect(() => analyzer.analyze([])).toThrow("closed");
});

test("a closed filesystem never reads ambient declarations or packages from disk", () => {
  const dir = directory();
  writeFileSync(join(dir, "ambient.d.ts"), "declare const fetch: () => void;");
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { types: ["node"] } }));
  let fs!: Ts7FileSystem;
  const analyzer = new NpmFetchAnalyzer((options) => { fs = options.fs; return new Ts7Api(options); }, dir);
  try {
    expect([...analyzer.analyze([module("main.js", "/// <reference path='./ambient.d.ts' />\nfetch();")])]).toEqual(["main.js"]);
    expect(fs.readFile(join(dir, "ambient.d.ts"))).toBeNull();
    expect(fs.fileExists(join(dir, "ambient.d.ts"))).toBe(false);
    expect(fs.getAccessibleEntries(dir)).toEqual({ files: [], directories: [] });
    expect(fs.readFile(join(dir, "main.js"))).toBeNull();
  } finally { analyzer.close(); }
});

test("rejects path aliases instead of attributing a capability to a different loader key", () => {
  const factory = vi.fn((options) => new Ts7Api(options));
  const analyzer = new NpmFetchAnalyzer(factory, directory());
  expect(() => analyzer.analyze([module("same", "fetch();"), module("same.js", "const fetch = 1;")])).toThrow("share a TypeScript path");
  expect(factory).not.toHaveBeenCalled();
});

test("closes an opened API after failure and allows a fresh subsequent analysis", () => {
  const dir = directory();
  let fail = true;
  const closes: ReturnType<typeof vi.spyOn>[] = [];
  const analyzer = new NpmFetchAnalyzer((options) => {
    const api = new Ts7Api(options);
    closes.push(vi.spyOn(api, "close"));
    if (fail) vi.spyOn(api, "updateSnapshot").mockImplementation(() => { throw new Error("snapshot failed"); });
    return api;
  }, dir);
  try {
    expect(() => analyzer.analyze([module("main.js", "fetch();")])).toThrow("snapshot failed");
    expect(closes[0]).toHaveBeenCalledTimes(1);
    fail = false;
    expect([...analyzer.analyze([module("main.js", "fetch();")])]).toEqual(["main.js"]);
    expect(closes[1]).toHaveBeenCalledTimes(1);
  } finally { analyzer.close(); }
});


test("relative imports bind local names in mixed ESM and CommonJS graphs", () => {
  const analyzer = new NpmFetchAnalyzer((options) => new Ts7Api(options), directory());
  try {
    expect([...analyzer.analyze([
      { key: "dep.js", source: "export const fetch = () => 1;", format: "esm" },
      { key: "importer.mjs", source: "import { fetch } from './dep.js'; export const result = fetch();", format: "esm" },
      module("cjs.cjs", "const {fetch} = require('./dep.js'); fetch();"),
      module("global.js", "fetch();"),
    ])]).toEqual(["global.js"]);
  } finally { analyzer.close(); }
});
