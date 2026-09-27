import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { analyze, compile } from "@scriptc/compiler";

const root = fileURLToPath(new URL("../..", import.meta.url));

test("analyzes the compiler's IR validator without exhausting type diagnostics", () => {
  const entry = join(root, "tests/fixtures/self-hosting/validate.ts");
  const { coverage } = analyze(entry, { dynamic: false });
  expect(coverage.preflightFailed).toBe(false);
  expect(coverage.stats.statementsTotal).toBeGreaterThan(0);
});

// Keep these outside the ordinary corpus: they import implementation files
// beyond the fixture directory, which the corpus oracle cache does not hash.
// Node executes the actual TS modules through tsx's .js → .ts resolution.
for (const component of ["source-locations"]) {
  for (const backend of ["c", "llvm"] as const) {
    test(`self-hosting ${component}: ${backend} matches Node`, async () => {
      const entry = join(root, "tests/fixtures/self-hosting", `${component}.ts`);
      const outDir = mkdtempSync(join(process.platform === "win32" ? tmpdir() : "/tmp", "scriptc-self-hosting-"));
      try {
        const oracle = spawnSync(process.execPath, ["--import", "tsx", entry], {
          cwd: root, timeout: 30_000, maxBuffer: 1024 * 1024,
        });
        expect(oracle.error).toBeUndefined();
        expect(oracle.signal).toBeNull();
        expect(oracle.status, oracle.stderr.toString()).toBe(0);
        expect(oracle.stdout.length).toBeGreaterThan(0);
        const built = await compile(entry, {
          outDir,
          outPath: join(outDir, process.platform === "win32" ? "program.exe" : "program"),
          backend,
          dynamic: false,
          sanitize: process.env["SCRIPTC_SAN"] === "1",
        });
        if (!built.ok) throw new Error(built.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"));
        const native = spawnSync(built.binaryPath, [], { cwd: root, timeout: 30_000, maxBuffer: 1024 * 1024 });
        expect(native.error).toBeUndefined();
        expect(native.signal).toBeNull();
        expect(native.status, native.stderr.toString()).toBe(oracle.status);
        expect(native.stdout).toEqual(oracle.stdout);
        expect(native.stderr).toEqual(oracle.stderr);
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
    });
  }
}
