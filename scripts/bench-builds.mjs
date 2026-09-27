/* Reproducible CLI build latency: one empty-cache build, exact repeats, and
 * actual edits to an imported module. Each invocation owns a fresh cache so
 * an earlier benchmark cannot turn its edit cases into native object hits. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { iterations: { type: "string", default: "5" } } });
const iterations = Number(values.iterations);
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100) {
  throw new Error("--iterations must be an integer between 1 and 100");
}
if (process.env.SCRIPTC_TARGET && process.env.SCRIPTC_TARGET !== "native") {
  throw new Error("bench:builds runs host executables; unset SCRIPTC_TARGET");
}
const cli = fileURLToPath(new URL("../packages/cli/dist/bootstrap.js", import.meta.url));
await access(cli).catch(() => { throw new Error("Build the workspace with pnpm build before running bench:builds"); });
const root = await mkdtemp(join(process.platform === "win32" ? tmpdir() : "/tmp", "scriptc-bench-builds-"));
const cache = join(root, "cache");
const entry = join(root, "main.ts");
const binary = join(root, process.platform === "win32" ? "program.exe" : "program");
const env = { ...process.env, SCRIPTC_CACHE_DIR: cache };
delete env.SCRIPTC_NO_CACHE;
delete env.SCRIPTC_CACHE_MAX_MB;
delete env.SCRIPTC_TEST_STABLE_TOOLCHAIN;
const modules = 16;
const functions = 16;
const samples = [];

function moduleSource(module, offset) {
  return Array.from({ length: functions }, (_, fn) =>
    `export function value${fn}(n: number): number { return n * ${module + 1} + ${fn + offset}; }`,
  ).join("\n") + "\n";
}

function run(command, args) {
  const result = spawnSync(command, args, { env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 120_000 });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, `${command} received ${result.signal}`);
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

function build(phase) {
  const start = performance.now();
  const result = run(process.execPath, [cli, "build", entry, "--optimization=dev", "-o", binary]);
  const ms = Math.round((performance.now() - start) * 10) / 10;
  assert.equal(result.status, 0, result.stderr);
  // Correctness checks are outside the timed build and run after EVERY edit,
  // so a stale executable cannot masquerade as a faster rebuild.
  const oracle = run(process.execPath, [entry]);
  assert.equal(oracle.status, 0, oracle.stderr);
  assert.deepEqual(run(binary, []), oracle);
  samples.push({ phase, ms });
  process.stderr.write(`${phase}: ${ms} ms\n`);
}

function median(phase) {
  const sorted = samples.filter((sample) => sample.phase === phase).map((sample) => sample.ms).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return Math.round((sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
}

try {
  await mkdir(cache, { mode: 0o700 });
  await Promise.all(Array.from({ length: modules }, (_, i) => writeFile(join(root, `module${i}.ts`), moduleSource(i, 0))));
  await writeFile(entry, [
    ...Array.from({ length: modules }, (_, i) => `import * as m${i} from './module${i}.ts';`),
    "let total = 0;",
    ...Array.from({ length: modules }, (_, i) => `total += ${Array.from({ length: functions }, (_, fn) => `m${i}.value${fn}(2)`).join(" + ")};`),
    "console.log(total);",
    "",
  ].join("\n"));
  build("cold");
  for (let i = 0; i < iterations; i++) build("unchanged");
  for (let i = 1; i <= iterations; i++) {
    await writeFile(join(root, "module0.ts"), moduleSource(0, i));
    build("edit");
  }
  process.stdout.write(JSON.stringify({
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    optimization: "dev",
    modules: modules + 1,
    functions: modules * functions,
    iterations,
    median_ms: Object.fromEntries(["cold", "unchanged", "edit"].map((phase) => [phase, median(phase)])),
    samples,
  }, null, 2) + "\n");
} finally {
  await rm(root, { recursive: true, force: true });
}
