/** Integer spelling for compiler-generated names and escapes. These
 * callers need exact nonnegative integers, not Number.toString's general
 * fractional-radix conversion. Division preserves all safe integer bits. */
export function unsignedHex(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("hexadecimal value must be a nonnegative safe integer");
  const digits = "0123456789abcdef";
  let result = "";
  do {
    result = digits.charAt(value % 16) + result;
    value = Math.floor(value / 16);
  } while (value !== 0);
  return result;
}

/** Three octal digits prevent a following source digit extending an escape. */
export function octalByte(value: number): string {
  const digits = "01234567";
  return digits.charAt((value >>> 6) & 3) + digits.charAt((value >>> 3) & 7) + digits.charAt(value & 7);
}

/** LLVM byte-string contents, without quotes or the c prefix. */
export function llvmBytes(bytes: Uint8Array, nulTerminated = true): string {
  let out = "";
  for (const byte of bytes) {
    out += byte >= 0x20 && byte < 0x7f && byte !== 0x22 && byte !== 0x5c
      ? String.fromCharCode(byte)
      : "\\" + unsignedHex(byte).padStart(2, "0").toUpperCase();
  }
  return nulTerminated ? out + "\\00" : out;
}

/** Metadata operands use the same UTF-8 escapes, without a trailing NUL. */
export function llvmQuoted(text: string): string {
  return '"' + llvmBytes(Buffer.from(text, "utf8"), false) + '"';
}

/** Escape UTF-16 source-control units without combining surrogate pairs. */
export function commentText(text: string): string {
  let out = "";
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) {
      out += text.slice(start, i) + "\\u" + unsignedHex(code).padStart(4, "0");
      start = i + 1;
    }
  }
  return out + text.slice(start);
}
