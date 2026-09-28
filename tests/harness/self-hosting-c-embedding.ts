import { inflateRawSync } from "node:zlib";
import type { IrModule } from "../../packages/compiler/src/ir/ir.js";

/** Decode the C backend's byte-string literal grammar. This intentionally
 * accepts only its emitted forms, so a malformed escape or lost chunk fails
 * the native-emitter comparison instead of being normalized away. */
function literalBytes(literals: string): Buffer {
  const bytes: number[] = [];
  let offset = 0;
  while (offset < literals.length) {
    if (/\s/.test(literals[offset]!)) { offset++; continue; }
    if (literals[offset++] !== '"') throw new Error("expected C string chunk");
    let closed = false;
    while (offset < literals.length) {
      const ch = literals[offset++]!;
      if (ch === '"') { closed = true; break; }
      if (ch !== "\\") {
        const code = ch.charCodeAt(0);
        if (code < 32 || code > 126) throw new Error("non-ASCII C literal byte");
        bytes.push(code);
        continue;
      }
      const escape = literals[offset++]!;
      if (/[0-7]/.test(escape)) {
        const octal = escape + literals.slice(offset, offset + 2);
        if (!/^[0-7]{3}$/.test(octal)) throw new Error("invalid C octal byte");
        const byte = parseInt(octal, 8);
        if (byte > 255) throw new Error("C octal escape exceeds one byte");
        bytes.push(byte);
        offset += 2;
      } else if (escape === '"' || escape === "\\" || escape === "?") {
        bytes.push(escape.charCodeAt(0));
      } else {
        throw new Error(`unexpected C escape ${escape}`);
      }
    }
    if (!closed) throw new Error("unterminated C string chunk");
  }
  return Buffer.from(bytes);
}

/** zlib implementations can choose different valid DEFLATE streams. Verify
 * every byte of each inflated source/facade and its raw-length metadata,
 * then normalize only the encoded literal for the C text comparison. All
 * declarations, table rows, edge conditions and runtime setup remain exact. */
export function normalizedEmbeddingC(text: string, mod: IrModule): string {
  let normalized = text;
  const check = (name: string, source: string): void => {
    const declaration = new RegExp(`(static const char ${name}\\[\\] = [^\\n]*\\n)((?:\\s*"(?:[^"\\\\]|\\\\.)*"\\s*)+);`);
    const match = declaration.exec(normalized);
    if (!match) throw new Error(`missing embedded declaration ${name}`);
    const metadata = new RegExp(`\\b${name}, sizeof ${name} - 1, (\\d+)`).exec(normalized);
    if (!metadata) throw new Error(`missing raw-length metadata for ${name}`);
    const rawLength = Number(metadata[1]);
    const encoded = literalBytes(match[2]!);
    const bytes = rawLength === 0 ? encoded : inflateRawSync(encoded);
    const expected = Buffer.from(source, "utf8");
    if (!bytes.equals(expected)) throw new Error(`embedded source differs for ${name}`);
    if (rawLength !== 0 && rawLength !== bytes.length) throw new Error(`incorrect raw length for ${name}`);
    const canonical = `"${bytes.toString("base64")}"`;
    normalized = normalized.replace(declaration, (_all, prefix: string) => `${prefix}    ${canonical};`);
  };
  for (const [index, module] of (mod.embedded?.modules ?? []).entries()) {
    check(`sc_npm_src_${index}`, module.source);
    if (module.esm !== undefined) check(`sc_npm_esm_${index}`, module.esm);
  }
  return normalized;
}
