import { deflateRawSync } from "node:zlib";
import { expect, test } from "vitest";
import { cStringLiteral } from "../../packages/compiler/src/backend/c/types.js";
import { normalizedEmbeddingC } from "./self-hosting-c-embedding.js";
import { cEmitterCases } from "./self-hosting-c-emitter-cases.js";
import { emitCModule } from "@scriptc/compiler";

const item = cEmitterCases().find((item) => item.name === "level-nine module and facade compression")!;
const original = emitCModule(item.module);
const declaration = /(static const char sc_npm_src_0\[\] = [^\n]*\n)((?:\s*"(?:[^"\\]|\\.)*"\s*)+);/;

function withSource(bytes: Buffer): string {
  return original.replace(declaration, (_match, prefix: string) => `${prefix}    ${cStringLiteral(bytes)};`);
}

test("different valid DEFLATE encodings compare by their full source bytes", () => {
  const source = item.module.embedded!.modules[0]!.source;
  const stored = deflateRawSync(source, { level: 0 });
  const compressed = deflateRawSync(source, { level: 9 });
  expect(stored.equals(compressed)).toBe(false);
  expect(normalizedEmbeddingC(withSource(stored), item.module)).toBe(normalizedEmbeddingC(withSource(compressed), item.module));
});

test("embedding comparison rejects a corrupted compressed payload", () => {
  expect(() => normalizedEmbeddingC(withSource(Buffer.from([255, 255, 255])), item.module)).toThrow();
});

test("embedding comparison rejects a valid stream containing the wrong source", () => {
  const wrong = deflateRawSync("a different module", { level: 9 });
  expect(() => normalizedEmbeddingC(withSource(wrong), item.module)).toThrow("embedded source differs");
});

test("embedding comparison checks the raw byte length including UTF-8", () => {
  const wrong = original.replace(/(sc_npm_src_0, sizeof sc_npm_src_0 - 1, )\d+/, "$11");
  expect(() => normalizedEmbeddingC(wrong, item.module)).toThrow("incorrect raw length");
});

test("embedding comparison checks every facade as well as the module", () => {
  const changed = { ...item.module, embedded: {
    ...item.module.embedded!,
    modules: [{ ...item.module.embedded!.modules[0]!, esm: "export default 'wrong';" }],
  } };
  expect(() => normalizedEmbeddingC(original, changed)).toThrow("embedded source differs for sc_npm_esm_0");
});

test("normalization preserves runtime setup and edge condition metadata", () => {
  const actual = normalizedEmbeddingC(original, item.module);
  expect(actual).toContain("scr_zlib_inflate_exact");
  expect(actual).toContain("sc_npm_edges");
  expect(actual).toContain('"/app/main.js", "large", "/node_modules/large/index.js", 2');
  const changed = original.replace("scr_zlib_inflate_exact", "incorrect_inflater");
  expect(normalizedEmbeddingC(changed, item.module)).not.toBe(actual);
});
