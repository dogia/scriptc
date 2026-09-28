import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { API, type Snapshot } from "typescript/unstable/sync";
import { Ts7Api, ts7Executable } from "../../src/frontend/ts7/rpc-api.js";
import { Ts7RpcClient } from "../../src/frontend/ts7/rpc-client.js";
import type { Ts7FileSystem } from "../../src/frontend/ts7/rpc-filesystem.js";
import { spawnTs7Wire } from "../../src/frontend/ts7/rpc-process.js";

function tsgoPath(path: string): string {
  return process.platform === "win32" ? path.replaceAll("\\", "/") : path;
}

const tempRoot = process.platform === "win32" ? tmpdir() : "/tmp";
const fallback: Ts7FileSystem = {
  readFile: () => undefined,
  fileExists: () => undefined,
  directoryExists: () => undefined,
  realpath: () => undefined,
  getAccessibleEntries: () => undefined,
};

function programFacts(snapshot: Snapshot, config: string, path: string) {
  const project = snapshot.getProject(config)!;
  const file = project.program.getSourceFile(path)!;
  const checker = project.checker;
  const position = file.text.indexOf("answer");
  const type = checker.getTypeAtPosition(path, position)!;
  const symbol = checker.getSymbolAtPosition(path, position)!;
  return {
    roots: project.rootFiles,
    files: project.program.getSourceFileNames(),
    options: project.program.getCompilerOptions(),
    text: file.text,
    type: checker.typeToString(type),
    symbol: symbol.name,
    declaration: symbol.declarations[0]!.resolve()!.getText(file),
    syntactic: project.program.getSyntacticDiagnostics(path),
    semantic: project.program.getSemanticDiagnostics(path),
    globals: project.program.getGlobalDiagnostics(),
    config: project.program.getConfigFileParsingDiagnostics(),
    defaultLibrary: project.program.isSourceFileDefaultLibrary(file),
    externalLibrary: project.program.isSourceFileFromExternalLibrary(file),
  };
}

test("production RPC bridge preserves pinned SDK parser/checker behavior", () => {
  const dir = mkdtempSync(join(tempRoot, "scriptc-ts7-rpc-parity-"));
  const config = tsgoPath(join(dir, "tsconfig.json"));
  const path = tsgoPath(join(dir, "main.ts"));
  writeFileSync(config, JSON.stringify({ compilerOptions: { strict: true, noEmit: true, types: [] }, files: [path] }));
  writeFileSync(path, 'export const answer = 42;\nexport const invalid: number = "wrong";\n');
  const nativeClient = new Ts7Api({ cwd: dir, fs: fallback });
  const sdk = new API({ cwd: dir });
  try {
    expect(nativeClient.parseConfigFile(config)).toEqual(sdk.parseConfigFile(config));
    const expected = sdk.updateSnapshot({ openProjects: [config] });
    const actual = nativeClient.updateSnapshot({ openProjects: [config] });
    const facts = programFacts(actual, config, path);
    expect(facts).toEqual(programFacts(expected, config, path));
    expect(facts.type).toBe("42");
    expect(facts.symbol).toBe("answer");
    expect(facts.semantic.map((diagnostic) => diagnostic.code)).toEqual([2322]);
    const project = actual.getProject(config)!;
    const source = project.program.getSourceFile(path)!;
    expect(project.program.getSourceFile(path)).toBe(source);
    const first = project.checker.getTypeAtPosition(path, source.text.indexOf("answer"));
    expect(project.checker.getTypeAtPosition(path, source.text.indexOf("answer"))).toBe(first);
    const symbol = project.checker.getSymbolAtPosition(path, source.text.indexOf("answer"));
    expect(project.checker.getSymbolAtPosition(path, source.text.indexOf("answer"))).toBe(symbol);
    expect(symbol!.declarations[0]!.resolve()).toBe(symbol!.declarations[0]!.resolve());
  } finally {
    nativeClient.close();
    sdk.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("snapshots share unchanged source files and release independently", () => {
  const dir = mkdtempSync(join(tempRoot, "scriptc-ts7-rpc-snapshots-"));
  const config = tsgoPath(join(dir, "tsconfig.json"));
  const path = tsgoPath(join(dir, "main.ts"));
  writeFileSync(config, JSON.stringify({ compilerOptions: { types: [] }, files: [path] }));
  writeFileSync(path, "export const answer = 42;\n");
  const api = new Ts7Api({ cwd: dir, fs: fallback });
  try {
    const first = api.updateSnapshot({ openProjects: [config] });
    const firstFile = first.getProject(config)!.program.getSourceFile(path);
    const second = api.updateSnapshot({ openProjects: [] });
    expect(second.getProject(config)!.program.getSourceFile(path)).toBe(firstFile);
    first.dispose();
    first.dispose();
    expect(() => first.getProjects()).toThrow("disposed");
    expect(second.getProject(config)!.program.getSourceFile(path)).toBe(firstFile);
    // Disposing the latest snapshot retains its cache until the next one
    // takes ownership, matching the upstream API's reuse semantics.
    second.dispose();
    const third = api.updateSnapshot({ openProjects: [] });
    expect(third.getProject(config)!.program.getSourceFile(path)).toBe(firstFile);
    api.close();
    expect(third.isDisposed()).toBe(true);
    expect(() => api.parseConfigFile(config)).toThrow("closed");
    expect(() => api.updateSnapshot({ openProjects: [] })).toThrow("closed");
    expect(() => api.getTimingInfo()).toThrow("closed");
  } finally {
    api.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("virtual filesystem callbacks retain empty, hidden, and fallback files", () => {
  const dir = mkdtempSync(join(tempRoot, "scriptc-ts7-rpc-fs-"));
  const config = tsgoPath(join(dir, "virtual.json"));
  const empty = tsgoPath(join(dir, "empty.ts"));
  const hidden = tsgoPath(join(dir, "hidden.ts"));
  const real = tsgoPath(join(dir, "real.ts"));
  const virtual = tsgoPath(join(dir, "virtual.ts"));
  writeFileSync(empty, "invalid syntax !!!");
  writeFileSync(hidden, "export const hidden = 1;");
  writeFileSync(real, "export const real = 2;");
  const reads = new Set<string>();
  const fs: Ts7FileSystem = {
    ...fallback,
    readFile(path) {
      reads.add(path);
      if (path === config) return JSON.stringify({ compilerOptions: { types: [] }, files: [empty, hidden, real, virtual] });
      if (path === empty) return "";
      if (path === hidden) return null;
      if (path === virtual) return 'export const answer = "virtual";';
      return undefined;
    },
    fileExists: (path) => path === hidden ? false : path === empty || path === virtual || path === config ? true : undefined,
  };
  const api = new Ts7Api({ cwd: dir, fs });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [config] });
    const program = snapshot.getProject(config)!.program;
    expect(program.getSourceFile(empty)!.text).toBe("");
    expect(program.getSourceFile(hidden)).toBeUndefined();
    expect(program.getSourceFile(real)!.text).toBe("export const real = 2;");
    expect(program.getSourceFile(virtual)!.text).toContain('"virtual"');
    expect(program.getSyntacticDiagnostics()).toEqual([]);
    expect(reads.has(config)).toBe(true);
    expect(reads.has(real)).toBe(true);
  } finally {
    api.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("request and AST materialization timing keeps the existing public shape", () => {
  const dir = mkdtempSync(join(tempRoot, "scriptc-ts7-rpc-timing-"));
  const config = tsgoPath(join(dir, "tsconfig.json"));
  const path = tsgoPath(join(dir, "main.ts"));
  writeFileSync(config, JSON.stringify({ compilerOptions: { types: [] }, files: [path] }));
  writeFileSync(path, "export const answer = 42;\n");
  const api = new Ts7Api({ cwd: dir, fs: fallback, collectTiming: true });
  const disabled = new Ts7Api({ cwd: dir, fs: fallback });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [config] });
    programFacts(snapshot, config, path);
    const timing = api.getTimingInfo();
    expect(timing.enabled).toBe(true);
    expect(timing.totals.requestCount).toBeGreaterThan(10);
    expect(timing.totals.bytesSent).toBeGreaterThan(0);
    expect(timing.totals.bytesReceived).toBeGreaterThan(0);
    expect(timing.totals.sourceFilesFetched).toBe(1);
    expect(timing.totals.nodesMaterialized).toBeGreaterThan(0);
    expect(timing.totals.nodesFetched).toBeGreaterThanOrEqual(timing.totals.nodesMaterialized);
    expect(timing.recentRequests).toHaveLength(5);
    expect(api.getTimingInfo().totals.requestCount).toBe(timing.totals.requestCount);
    expect(disabled.getTimingInfo().enabled).toBe(false);
    expect(disabled.getTimingInfo().totals.requestCount).toBe(0);
  } finally {
    api.close();
    disabled.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("real server refusals leave the production process channel reusable", () => {
  const client = new Ts7RpcClient(spawnTs7Wire(ts7Executable(), ["--api", "--cwd", process.cwd()]));
  try {
    expect(() => client.requestText("scriptcUnknownMethod", "null")).toThrow();
    expect(client.requestText("echo", "after error")).toBe("after error");
    expect(JSON.parse(client.requestText("initialize", "null"))).toHaveProperty("currentDirectory");
  } finally {
    client.close();
  }
});

test("failed process startup has no uncaught error or leaked exit hook", async () => {
  const before = process.listenerCount("exit");
  expect(() => spawnTs7Wire(join(tempRoot, "scriptc-ts7-does-not-exist", "tsgo"), [])).toThrow("Unable to start TypeScript server");
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(process.listenerCount("exit")).toBe(before);
});

test("live process transports share one removable exit hook", () => {
  const before = process.listenerCount("exit");
  const first = spawnTs7Wire(ts7Executable(), ["--api", "--cwd", process.cwd()]);
  const second = spawnTs7Wire(ts7Executable(), ["--api", "--cwd", process.cwd()]);
  try {
    expect(process.listenerCount("exit")).toBe(before + 1);
    first.close();
    expect(process.listenerCount("exit")).toBe(before + 1);
    second.close();
    expect(process.listenerCount("exit")).toBe(before);
  } finally {
    first.close();
    second.close();
  }
});
