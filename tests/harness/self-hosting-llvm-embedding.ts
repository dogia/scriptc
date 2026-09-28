import { inflateRawSync } from "node:zlib";
import type { IrModule } from "../../packages/compiler/src/ir/ir.js";

/** Parse exactly the LLVM byte-string grammar emitted by llvmBytes. */
function literalBytes(literal: string): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < literal.length; i++) {
    const code = literal.charCodeAt(i);
    if (code === 92) {
      const escape = literal.slice(i + 1, i + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(escape)) throw new Error("invalid LLVM byte escape");
      bytes.push(parseInt(escape, 16));
      i += 2;
    } else {
      if (code < 32 || code > 126 || code === 34) throw new Error("invalid LLVM literal byte");
      bytes.push(code);
    }
  }
  if (bytes.pop() !== 0) throw new Error("LLVM literal lacks its NUL terminator");
  return Buffer.from(bytes);
}

/** Different zlib implementations can produce different valid compressed
 * streams. Check payload bytes, array bounds and both table lengths before
 * canonicalizing only those encoding-dependent parts of the LLVM module. */
export function normalizedEmbeddingLlvm(text: string, mod: IrModule): string {
  let normalized = text;
  const check = (name: string, source: string): void => {
    const declaration = new RegExp(`@${name} = internal constant \\[(\\d+) x i8\\] c"([^"\\n]*)"`);
    const match = declaration.exec(normalized);
    if (!match) throw new Error(`missing embedded declaration ${name}`);
    const encoded = literalBytes(match[2]!);
    if (Number(match[1]) !== encoded.length + 1) throw new Error(`incorrect array length for ${name}`);
    const metadata = new RegExp(`ptr @${name}, (i32|i64) (\\d+), (i32|i64) (\\d+)`);
    const lengths = metadata.exec(normalized);
    if (!lengths) throw new Error(`missing length metadata for ${name}`);
    if (lengths[1] !== lengths[3]) throw new Error(`inconsistent length types for ${name}`);
    if (Number(lengths[2]) !== encoded.length) throw new Error(`incorrect encoded length for ${name}`);
    const rawLength = Number(lengths[4]);
    const decoded = rawLength === 0 ? encoded : inflateRawSync(encoded);
    if (!decoded.equals(Buffer.from(source, "utf8"))) throw new Error(`embedded source differs for ${name}`);
    if (rawLength !== 0 && rawLength !== decoded.length) throw new Error(`incorrect raw length for ${name}`);
    normalized = normalized.replace(declaration, `@${name} = internal constant [decoded] c"${decoded.toString("base64")}"`);
    normalized = normalized.replace(metadata, `ptr @${name}, ${lengths[1]} encoded, ${lengths[3]} ${rawLength}`);
  };
  for (const [index, module] of (mod.embedded?.modules ?? []).entries()) {
    check(`sc_npm_src_${index}`, module.source);
    if (module.esm !== undefined) check(`sc_npm_esm_${index}`, module.esm);
  }
  return normalized;
}
