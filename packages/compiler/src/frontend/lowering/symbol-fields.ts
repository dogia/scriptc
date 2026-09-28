import * as ts from "../ts7/adapter.js";
import { bindingEarlyUse7 } from "../program.js";
import type { Lowerer } from "./lowerer.js";
import type { IrType } from "../../ir/ir.js";

export interface ClassSymbolKey {
  sym: ts.Symbol;
  /** Registry keys share identity across bindings and modules; ordinary
   * Symbol() calls retain the declaring binding's distinct identity. */
  identity: ts.Symbol | string;
  fieldName: string;
}

const keys = new WeakMap<Lowerer, Map<ts.Symbol, ClassSymbolKey | null>>();
const FIELD_PREFIX = "%symbol:";

export function symbolFieldDisplayName(field: string): string {
  return field.slice(FIELD_PREFIX.length);
}

/** CopyDataProperties includes symbols, unlike the string-keyed view used
 * by Object.keys/JSON. Refuse known symbol-bearing sources before boxing
 * erases their class type. A spread call argument supplies sources from
 * its array/tuple elements, rather than copying the container itself. */
export function fenceSymbolFieldCopy(lowerer: Lowerer, node: ts.Node, type: IrType, spread = false): void {
  if (type.kind === "union") {
    for (const arm of lowerer.unions.get(type.unionId)?.arms ?? []) fenceSymbolFieldCopy(lowerer, node, arm, spread);
  } else if (spread) {
    if (type.kind === "array") fenceSymbolFieldCopy(lowerer, node, type.elem);
    else if (type.kind === "record") {
      const shape = lowerer.shapes.get(type.shapeId);
      if (shape?.tuple) for (const field of shape.fields) fenceSymbolFieldCopy(lowerer, node, field.type);
    }
  } else if (type.kind === "object" && lowerer.classes.get(type.className)?.symbolFields?.size) {
    lowerer.unsupported("SC1031", node, "copying class instances with symbol-keyed fields (the copied symbols have no record form)");
  }
}

export function classSymbolKeyOf(lowerer: Lowerer, key: ts.Expression): ClassSymbolKey | null {
  if (!ts.isIdentifier(key)) return null;
  const type = lowerer.typeOf(key);
  if (!(type.flags & (ts.TypeFlags.UniqueESSymbol | ts.TypeFlags.ESSymbol))) return null;
  const sym = lowerer.resolveValueSymbol(key);
  return sym ? classSymbolKeyOfSymbol(lowerer, sym) : null;
}

/** A literal Symbol()/Symbol.for() initialized once at module scope. The
 * whole-file proof also covers var declarations emitted by bundlers. Keys
 * cannot be used before initialization: a computed class field evaluates
 * its key when the class is defined, even if no instance is constructed. */
export function classSymbolKeyOfSymbol(lowerer: Lowerer, sym: ts.Symbol): ClassSymbolKey | null {
  let cache = keys.get(lowerer);
  if (!cache) keys.set(lowerer, cache = new Map());
  if (cache.has(sym)) return cache.get(sym)!;
  cache.set(sym, null);
  const decls = lowerer.checker.declarationsOf(sym);
  const decl = lowerer.checker.valueDeclarationOf(sym);
  if (decls.length !== 1 || !decl || !ts.isVariableDeclaration(decl) || !ts.isIdentifier(decl.name)) return null;
  const list = decl.parent;
  if (!ts.isVariableDeclarationList(list) || !ts.isVariableStatement(list.parent) || !ts.isSourceFile(list.parent.parent)) return null;
  const init = decl.initializer;
  if (!init || !ts.isCallExpression(init) || init.questionDotToken) return null;
  const callee = init.expression;
  const registered = ts.isPropertyAccessExpression(callee) && !callee.questionDotToken && callee.name.text === "for";
  const root = registered ? callee.expression : callee;
  if (!ts.isIdentifier(root) || !lowerer.isStdlibGlobal(root, "Symbol")) return null;
  const arg = init.arguments.length === 0 ? null : init.arguments.length === 1 ? init.arguments[0]! : undefined;
  if (arg === undefined || (registered && arg === null)) return null;
  if (arg !== null && !ts.isStringLiteralLike(arg)) return null;
  // Ordinary Symbol() is a fresh identity per evaluation, so only the
  // module-scope declaration above can name one fixed layout slot.
  const sf = decl.getSourceFile();
  if (bindingWritten(lowerer, sym, sf)) return null;
  const preceding = list.declarations.slice(0, list.declarations.indexOf(decl));
  if (bindingEarlyUse7(lowerer.program, sf, sf.statements.indexOf(list.parent), decl, preceding) !== null) return null;
  const key: ClassSymbolKey = {
    sym,
    identity: registered ? arg!.text : sym,
    // Symbol slots are not string properties. The reserved prefix keeps
    // them out of the native class's string-keyed dynamic view, including
    // Object.keys/JSON serialization and string-property writeback.
    fieldName: `${FIELD_PREFIX}Symbol(${arg?.text ?? ""})`,
  };
  cache.set(sym, key);
  return key;
}

function bindingWritten(lowerer: Lowerer, sym: ts.Symbol, sf: ts.SourceFile): boolean {
  let written = false;
  const scanTarget = (target: ts.Node): void => {
    ts.walkPreorder(target, (node) => {
      // Assignment to obj[key] changes the property, never the key's
      // binding. The same applies to these leaves in destructuring.
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return "skip";
      if (!ts.isIdentifier(node) || node.text !== sym.name) return;
      const targetSym = ts.isShorthandPropertyAssignment(node.parent)
        ? lowerer.checker.getShorthandAssignmentValueSymbol(node.parent)
        : lowerer.checker.getSymbolAtLocation(node);
      if (targetSym === sym) {
        written = true;
        return "stop";
      }
    });
  };
  ts.walkPreorder(sf, (node) => {
    if (written) return "stop";
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      scanTarget(node.left);
    } else if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) {
      scanTarget(node.operand);
    } else if ((ts.isForOfStatement(node) || ts.isForInStatement(node)) && !ts.isVariableDeclarationList(node.initializer)) {
      scanTarget(node.initializer);
    }
  });
  return written;
}
