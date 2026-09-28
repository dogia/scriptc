import { deflateRawSync } from "node:zlib";
import { expect, test } from "vitest";
import { llvmBytes } from "../../packages/compiler/src/backend/literals.js";
import { emitLlvmModule } from "../../packages/compiler/src/backend/llvm/emitter.js";
import { cEmitterCases } from "./self-hosting-c-emitter-cases.js";
import { normalizedEmbeddingLlvm } from "./self-hosting-llvm-embedding.js";

const item = cEmitterCases().find((item) => item.name === "level-nine module and facade compression")!;
const original = emitLlvmModule(item.module);

function withSource(bytes: Buffer): string {
  return original
    .replace(/@sc_npm_src_0 = internal constant \[\d+ x i8\] c"[^"\n]*"/, `@sc_npm_src_0 = internal constant [${bytes.length + 1} x i8] c"${llvmBytes(bytes)}"`)
    .replace(/(ptr @sc_npm_src_0, i64 )\d+/, `$1${bytes.length}`);
}

test("LLVM comparison accepts different valid encodings of the same source", () => {
  const source = item.module.embedded!.modules[0]!.source;
  const stored = deflateRawSync(source, { level: 0 });
  const compressed = deflateRawSync(source, { level: 9 });
  expect(stored.equals(compressed)).toBe(false);
  expect(normalizedEmbeddingLlvm(withSource(stored), item.module)).toBe(normalizedEmbeddingLlvm(withSource(compressed), item.module));
});

test("LLVM comparison rejects a corrupted DEFLATE stream", () => {
  expect(() => normalizedEmbeddingLlvm(withSource(Buffer.from([255, 255, 255])), item.module)).toThrow();
});

test("LLVM comparison rejects a valid stream containing different source", () => {
  const bytes = deflateRawSync("a different module");
  expect(() => normalizedEmbeddingLlvm(withSource(bytes), item.module)).toThrow("embedded source differs");
});

test("LLVM comparison verifies declared array and encoded lengths", () => {
  const array = original.replace(/(@sc_npm_src_0 = internal constant \[)\d+/, "$11");
  expect(() => normalizedEmbeddingLlvm(array, item.module)).toThrow("incorrect array length");
  const encoded = original.replace(/(ptr @sc_npm_src_0, i64 )\d+/, "$10");
  expect(() => normalizedEmbeddingLlvm(encoded, item.module)).toThrow("incorrect encoded length");
});

test("LLVM comparison verifies inflated byte length and NUL termination", () => {
  const raw = original.replace(/(ptr @sc_npm_src_0, i64 \d+, i64 )\d+/, "$11");
  expect(() => normalizedEmbeddingLlvm(raw, item.module)).toThrow("incorrect raw length");
  const terminator = original.replace(/(@sc_npm_src_0 = internal constant \[\d+ x i8\] c"[^"\n]*)\\00"/, "$1\\01\"");
  expect(() => normalizedEmbeddingLlvm(terminator, item.module)).toThrow("NUL terminator");
});

test("LLVM comparison preserves edge conditions and runtime installation", () => {
  const changed = original.replace("@scr_zlib_inflate_exact", "@wrong_inflater");
  expect(normalizedEmbeddingLlvm(changed, item.module)).not.toBe(normalizedEmbeddingLlvm(original, item.module));
  const changedEdge = original.replace(/(ptr @sc_npm_edge_0_to, i32 )\d+/, "$199");
  expect(changedEdge).not.toBe(original);
  expect(normalizedEmbeddingLlvm(changedEdge, item.module)).not.toBe(normalizedEmbeddingLlvm(original, item.module));
});

test("LLVM comparison checks ESM facades as well as source modules", () => {
  const changed = structuredClone(item.module);
  changed.embedded!.modules[0]!.esm = "export default 'wrong';";
  expect(() => normalizedEmbeddingLlvm(original, changed)).toThrow("embedded source differs for sc_npm_esm_0");
});
