import { BOOL, F64, STRING, type IrExpr, type IrType, type SrcLoc } from "../../ir/ir.js";
import { numLit, varRef } from "../../ir/build.js";
import type { Lowerer } from "./lowerer.js";

/** A number-keyed string property read whose declared result includes
 * undefined. Unlike charAt, property lookup does not truncate fractions or
 * convert NaN to zero. Capture both operands before testing the index: even
 * a plain receiver variable can be reassigned while evaluating the key. */
export function lowerOptionalStringIndex(
  lowerer: Lowerer,
  receiver: IrExpr,
  index: IrExpr,
  type: IrType,
  loc: SrcLoc,
): IrExpr {
  const textLocal = lowerer.declareHiddenLocal("%indexedString", STRING);
  const indexLocal = lowerer.declareHiddenLocal("%stringIndex", F64);
  const text = varRef(textLocal.id, STRING, loc);
  const key = varRef(indexLocal.id, F64, loc);
  const inBounds: IrExpr = {
    kind: "logical", op: "&&",
    left: { kind: "bin", op: ">=", left: key, right: numLit(0, loc), type: BOOL, loc },
    right: { kind: "bin", op: "<", left: key,
      right: { kind: "strIntrinsic", method: "length", receiver: text, args: [], type: F64, loc }, type: BOOL, loc },
    type: BOOL, loc,
  };
  const integral: IrExpr = {
    kind: "bin", op: "===", left: key,
    right: { kind: "libCall", fn: "math.floor", args: [key], type: F64, loc },
    type: BOOL, loc,
  };
  const read: IrExpr = { kind: "strIntrinsic", method: "charAt", receiver: text, args: [key], type: STRING, loc };
  return {
    kind: "seqExpr",
    stmts: [
      { kind: "varDecl", localId: textLocal.id, init: receiver, loc },
      { kind: "varDecl", localId: indexLocal.id, init: index, loc },
    ],
    result: {
      kind: "ternary", cond: { kind: "logical", op: "&&", left: inBounds, right: integral, type: BOOL, loc },
      then: lowerer.coerceToExpected(read, type),
      else_: lowerer.wrappedUndefined(type, loc)!, type, loc,
    },
    type, loc,
  };
}
