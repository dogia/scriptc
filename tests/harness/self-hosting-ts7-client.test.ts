import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { analyze, compile } from "@scriptc/compiler";
import { ts7Executable } from "../../packages/compiler/src/frontend/ts7/rpc-api.js";
import { TS7_FILE_SYSTEM_CALLBACKS } from "../../packages/compiler/src/frontend/ts7/rpc-filesystem.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const entry = join(root, "tests/fixtures/self-hosting/ts7-client.ts");
const tempRoot = process.platform === "win32" ? tmpdir() : "/tmp";

function result(child: ChildProcess): Promise<{ status: number | null; signal: string | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`TypeScript client timed out: ${stderr}`));
    }, 45_000);
    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("close", (status, signal) => {
      clearTimeout(timeout);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

async function runClient(command: string, args: string[], directory: string, report: string): Promise<string> {
  const server = spawn(ts7Executable(), ["--api", "--timing", "--cwd", directory, `--callbacks=${TS7_FILE_SYSTEM_CALLBACKS}`], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let serverStderr = "";
  server.stderr.setEncoding("utf8").on("data", (chunk: string) => { serverStderr += chunk; });
  const serverDone = new Promise<void>((resolve) => { server.once("close", () => resolve()); });
  let serverError: Error | undefined;
  server.on("error", (error) => { serverError = error; });
  try {
    // Node creates POSIX pipes nonblocking. Both consumers below use sync
    // reads; change that property before inheriting the underlying handles.
    if (process.platform !== "win32") {
      for (const stream of [server.stdin, server.stdout]) {
        (stream as unknown as { _handle: { setBlocking: (value: boolean) => void } })._handle.setBlocking(true);
      }
    }
    const child = spawn(command, [...args, directory, report], {
      cwd: root, stdio: ["ignore", "pipe", "pipe", server.stdout, server.stdin],
    });
    const actual = await result(child);
    expect(serverError).toBeUndefined();
    expect(actual.signal, actual.stderr + serverStderr).toBeNull();
    expect(actual.status, actual.stderr + serverStderr).toBe(0);
    expect(actual.stdout).toBe("");
    expect(actual.stderr).toBe("");
    expect(serverStderr).toBe("");
    return readFileSync(report, "utf8");
  } finally {
    server.stdin.destroy();
    server.stdout.destroy();
    server.kill();
    await serverDone;
  }
}

test("the production TypeScript RPC and filesystem client lowers entirely statically", () => {
  const { coverage } = analyze(entry, { dynamic: false });
  expect(coverage.preflightFailed).toBe(false);
  expect(coverage.stats.statementsTotal).toBeGreaterThan(200);
  expect(coverage.stats.statementsFailed, JSON.stringify(coverage.diagnostics)).toBe(0);
  expect(coverage.stats.statementsIsland).toBe(0);
  expect(coverage.stats.functionsSkipped).toBe(0);
});

for (const backend of ["c", "llvm"] as const) {
  test(`native TypeScript client talks directly to the pinned parser/checker (${backend})`, async () => {
    const dir = mkdtempSync(join(tempRoot, "scriptc-native-ts7-"));
    try {
      writeFileSync(join(dir, "disk.ts"), "export const disk = true;\n");
      // The callback must hide real content, and an empty virtual file must
      // override this invalid disk file instead of falling back to it.
      writeFileSync(join(dir, "hidden.ts"), "export const hidden = true;\n");
      writeFileSync(join(dir, "empty.ts"), "THIS IS NOT TYPESCRIPT !!!\n");
      const built = await compile(entry, {
        outDir: dir, outPath: join(dir, process.platform === "win32" ? "client.exe" : "client"),
        backend, dynamic: false, optimization: "dev", sanitize: process.env["SCRIPTC_SAN"] === "1",
      });
      if (!built.ok) throw new Error(built.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"));
      expect(built.backend).toBe(backend);
      const oracle = await runClient(process.execPath, ["--import", "tsx", entry], dir, join(dir, "oracle.json"));
      const native = await runClient(built.binaryPath, [], dir, join(dir, "native.json"));
      const { surrogateBoundary: oracleSurrogates, semanticSurrogateBoundary: oracleSemanticSurrogates, ...oracleFacts } = JSON.parse(oracle);
      const { surrogateBoundary: nativeSurrogates, semanticSurrogateBoundary: nativeSemanticSurrogates, ...nativeFacts } = JSON.parse(native);
      // The native runtime's documented UTF-16 limit must surface as an
      // explicit AST refusal; replacing a checker name would be corruption.
      expect(oracleSurrogates).toBe("preserved");
      expect(nativeSurrogates).toBe("refused");
      expect(oracleSemanticSurrogates).toBe("preserved");
      expect(nativeSemanticSurrogates).toBe("refused");
      expect(nativeFacts).toEqual(oracleFacts);
      expect(nativeFacts).toEqual({
        typeText: "42", symbol: "answer", diagnostics: [2322], echo: true, binaryAst: true, astIdentity: true, astViews: true, semanticModel: true, sessionLifecycle: true,
        virtualFiles: true, retainedSnapshot: true, serverErrorRecovery: true, protocolFailures: true,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
