import type { IrExpr, IrFunction, IrStmt } from "./ir.js";
import { everyExprChild, everyStmtChild } from "./traverse.js";

/** Exactly representable integers, excluding negative zero. These facts
 * justify signed i64 arithmetic as well as unchecked ToUint32 conversion. */
export interface IntegerRange { min: number; max: number }
export type IntegerRanges = ReadonlyMap<IrExpr, IntegerRange | null>;
const SIGNED: IntegerRange = { min: -2147483648, max: 2147483647 };
const UNSIGNED: IntegerRange = { min: 0, max: 4294967295 };

/** Deliberately local range analysis. Facts flow only through straight-line
 * statements and numeric expression evaluation. Unknown expressions and
 * control-flow boundaries discard them; nested bodies start independently.
 * No assumptions about parameters, captures, globals or loop iterations. */
export function analyzeIntegerRanges(fn: IrFunction): IntegerRanges {
  const ranges = new Map<IrExpr, IntegerRange | null>();
  if (fn.async || fn.generator) return ranges;
  const captures = new Set((fn.captures ?? []).map((c) => c.localId));
  const eligible = new Set(fn.locals.filter((l) => l.type.kind === "f64" && !l.boxed && !l.tdz && !captures.has(l.id)).map((l) => l.id));
  type Facts = Map<string, IntegerRange>;

  function remember(e: IrExpr, range: IntegerRange | null): IntegerRange | null {
    // IR normally is a tree, but shared expression objects must be safe at
    // every occurrence. An unknown occurrence invalidates any earlier fact.
    const previous = ranges.get(e);
    ranges.set(e, previous === undefined ? range : previous && range ? {
      min: Math.min(previous.min, range.min), max: Math.max(previous.max, range.max),
    } : null);
    return range;
  }
  function opaqueExpr(value: IrExpr): boolean {
    ranges.set(value, null);
    return everyExprChild(value, opaqueExpr, opaqueStmt);
  }
  function opaqueStmt(value: IrStmt): boolean {
    return everyStmtChild(value, opaqueExpr, opaqueStmt);
  }
  function expr(e: IrExpr, facts: Facts): IntegerRange | null {
    let range: IntegerRange | null = null;
    switch (e.kind) {
      case "numLit":
        if (Number.isSafeInteger(e.value) && !Object.is(e.value, -0)) range = { min: e.value, max: e.value };
        break;
      case "varRef": range = facts.get(e.localId) ?? null; break;
      case "bin": {
        // Evaluate in source order: an opaque right operand may invalidate
        // locals, but cannot change the already-snapshotted left value.
        const left = expr(e.left, facts);
        const right = expr(e.right, facts);
        if (e.type.kind !== "f64") break;
        if (e.op === ">>>") range = UNSIGNED;
        else if (["&", "|", "^", "<<", ">>"].includes(e.op)) range = SIGNED;
        else if (left && right && (e.op === "+" || e.op === "-")) {
          const min = e.op === "+" ? left.min + right.min : left.min - right.max;
          const max = e.op === "+" ? left.max + right.max : left.max - right.min;
          if (Number.isSafeInteger(min) && Number.isSafeInteger(max)) range = { min, max };
        }
        break;
      }
      case "unary":
        expr(e.operand, facts);
        if (e.op === "~") range = SIGNED;
        break;
      default:
        facts.clear();
        opaqueExpr(e);
        return null;
    }
    return remember(e, range);
  }
  function body(stmts: IrStmt[]): void {
    const facts: Facts = new Map();
    for (const s of stmts) {
      switch (s.kind) {
        case "varDecl": case "assign": {
          const value = s.kind === "varDecl" ? s.init : s.value;
          const range = value ? expr(value, facts) : null;
          facts.delete(s.localId);
          if (range && eligible.has(s.localId)) facts.set(s.localId, range);
          break;
        }
        case "return":
          if (s.value) expr(s.value, facts);
          facts.clear();
          break;
        case "exprStmt": expr(s.expr, facts); break;
        default:
          facts.clear();
          // Only statement lists start fresh fact environments. Headers,
          // conditions and selectors stay opaque; typed traversal preserves
          // the original expression identities rather than taking snapshots.
          switch (s.kind) {
            case "block": body(s.body); break;
            case "if":
              opaqueExpr(s.cond);
              body(s.then);
              if (s.else_) body(s.else_);
              break;
            case "while": case "doWhile":
              opaqueExpr(s.cond);
              body(s.body);
              break;
            case "for":
              if (s.init) opaqueStmt(s.init);
              if (s.cond) opaqueExpr(s.cond);
              if (s.update) opaqueStmt(s.update);
              body(s.body);
              break;
            case "forOf":
              opaqueExpr(s.iterable);
              body(s.body);
              break;
            case "switch":
              opaqueExpr(s.disc);
              for (const c of s.cases) {
                if (c.test) opaqueExpr(c.test);
                body(c.body);
              }
              break;
            case "tryCatch":
              body(s.tryBody);
              if (s.catchBody) body(s.catchBody);
              if (s.finallyBody) body(s.finallyBody);
              break;
            default: opaqueStmt(s);
          }
      }
    }
  }
  body(fn.body);
  return ranges;
}
