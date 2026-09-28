import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { loadFfiProfile } from "./ffi-manifest.js";

test.each(["f32", "i8", "u16", "i16"])("%s requires format 6 at every ABI position", (cls) => {
  const dir = mkdtempSync(join(tmpdir(), "scriptc-ffi-version-"));
  const file = join(dir, "ffi.json");
  try {
    for (const placement of ["parameter", "return", "callback-parameter", "callback-return"]) {
      const callback = { id: "convert", params: [placement === "callback-parameter" ? cls : "f64"], returns: placement === "callback-return" ? cls : "f64", lifetime: "call" };
      const fn = { name: "native", symbol: "native", params: placement.startsWith("callback-") ? [{ callback }] : [placement === "parameter" ? cls : "f64"], returns: placement === "return" ? cls : "f64" };
      for (let format = placement.startsWith("callback-") ? 2 : 1; format <= 6; format++) {
        writeFileSync(file, JSON.stringify({ ffi_format: format, functions: [fn] }));
        const result = loadFfiProfile(file);
        if (format === 6) expect(result.ok).toBe(true);
        else {
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.diagnostics[0]?.message).toContain(`class '${cls}' requires ffi_format 6`);
        }
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mutable byte spans require format 6 and cannot be returns or callback arguments", () => {
  const dir = mkdtempSync(join(tmpdir(), "scriptc-ffi-mutable-"));
  const file = join(dir, "ffi.json");
  try {
    for (let format = 1; format <= 6; format++) {
      writeFileSync(file, JSON.stringify({ ffi_format: format, functions: [{ name: "fill", symbol: "fill", params: ["mutable-bytes"], returns: "void" }] }));
      const result = loadFfiProfile(file);
      expect(result.ok).toBe(format === 6);
      if (!result.ok) expect(result.diagnostics[0]?.message).toContain("requires ffi_format 6");
    }
    for (const fn of [
      { name: "fill", symbol: "fill", params: [], returns: "mutable-bytes" },
      { name: "fill", symbol: "fill", params: [{ callback: { id: "cb", params: ["mutable-bytes"], returns: "void", lifetime: "call" } }], returns: "void" },
    ]) {
      writeFileSync(file, JSON.stringify({ ffi_format: 6, functions: [fn] }));
      expect(loadFfiProfile(file).ok).toBe(false);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
