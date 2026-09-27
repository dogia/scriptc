import { commentText, unsignedHex } from "../literals.js";
import { InternalCompilerError } from "../../errors.js";
import type { IrFfiCallbackParamClass, IrFfiReturnClass, IrFfiValueParamClass } from "../../ir/ir.js";

/** User-controlled text embedded after an LLVM `;` comment marker. Preserve
 * ordinary output byte-for-byte, but encode control and line-separator code
 * units so a property name can never inject a line or invalid source byte. */
export function llvmCommentText(text: string): string {
  return commentText(text);
}

export function ffiNativeTypeLl(
  cls: IrFfiCallbackParamClass | IrFfiValueParamClass | IrFfiReturnClass,
): string {
  switch (cls) {
    case "f64":
      return "double";
    case "bool":
    case "u8":
      return "i8";
    case "u32":
    case "i32":
      return "i32";
    case "cstring":
      return "ptr";
    case "string":
    case "bytes":
      throw new InternalCompilerError(`llvm emitter bug: span class '${cls}' has no scalar LLVM type`);
    case "void":
      return "void";
  }
}

export function f64Lit(n: number): string {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, n);
  return `0x${[...bytes].map((b) => unsignedHex(b).padStart(2, "0")).join("").toUpperCase()}`;
}

export const F64_INF = f64Lit(Infinity);
