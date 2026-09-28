import * as ts from "../../ts7/adapter.js";
import type { Lowerer } from "../lowerer.js";
import { nodeThrowExpr } from "../lowerer.js";
import { BOOL, VOID, type IrExpr, type IrStmt, type IrType, typeEquals } from "../../../ir/ir.js";
import { varRef } from "../../../ir/build.js";
import { locOf } from "../../program.js";

/** Assign a common data field without projecting the union's records into
 * a new structural shape. Each tag writes the original record payload, so
 * aliases and identity-keyed collections observe the mutation. Accessors,
 * missing fields, and differently typed storage retain their own fences. */
export function lowerUnionFieldWrite(
  lowerer: Lowerer,
  access: ts.PropertyAccessExpression,
  rhs: ts.Expression,
): IrStmt | null {
  const mapped = lowerer.mapTypeOf(lowerer.typeOf(access.expression));
  if (access.questionDotToken || mapped?.kind !== "union") return null;
  const receiver = lowerer.maybeNarrow(lowerer.lowerExpr(access.expression), access.expression);
  if (receiver.type.kind !== "union") return null;
  const unionId = receiver.type.unionId;
  const arms = lowerer.unions.get(unionId)?.arms;
  if (!arms?.length) return null;
  const fields: ({ shapeId: string; type: IrType } | null)[] = [];
  let fieldType: IrType | null = null;
  for (const arm of arms) {
    if (arm.kind === "undefinedT" || arm.kind === "nullT") {
      fields.push(null);
      continue;
    }
    if (arm.kind !== "record") return null;
    const field = lowerer.shapes.get(arm.shapeId)?.fields.find((f) => f.name === access.name.text);
    if (!field || (fieldType !== null && !typeEquals(fieldType, field.type))) return null;
    fieldType = field.type;
    fields.push({ shapeId: arm.shapeId, type: field.type });
  }
  if (fieldType === null) return null;
  const loc = locOf(access);
  const object = lowerer.declareHiddenLocal("%unionWriteObject", receiver.type);
  const objectRef = varRef(object.id, object.type, loc);
  const value = lowerer.lowerExprExpecting(rhs, fieldType);
  const stored = lowerer.declareHiddenLocal("%unionWriteValue", value.type);
  // Snapshot the reference before evaluating the RHS, which can change the
  // original binding. Evaluate and retain the value once before dispatch.
  const body: IrStmt[] = [
    { kind: "varDecl", localId: object.id, init: receiver, loc },
    { kind: "varDecl", localId: stored.id, init: value, loc },
  ];
  let dispatch: IrStmt[] = [];
  for (let tag = fields.length - 1; tag >= 0; tag--) {
    const field = fields[tag];
    const obj: IrExpr | null = field ? {
      kind: "unionNarrow", unionId, tag, value: objectRef,
      type: { kind: "record", shapeId: field.shapeId }, loc,
    } : null;
    const write: IrStmt = field && obj ? {
      kind: "recordSet", obj, shapeId: field.shapeId, field: access.name.text,
      value: varRef(stored.id, stored.type, loc), loc,
    } : {
      kind: "exprStmt",
      expr: nodeThrowExpr(1, "", `Cannot set properties of ${arms[tag]!.kind === "nullT" ? "null" : "undefined"} (setting '${access.name.text}')`, VOID, loc), loc,
    };
    dispatch = tag === fields.length - 1 ? [write] : [{
      kind: "if",
      cond: { kind: "unionIsTag", unionId, tag, value: objectRef, negated: false, type: BOOL, loc },
      then: [write], else_: dispatch, loc,
    }];
  }
  return { kind: "block", body: [...body, ...dispatch], loc };
}
