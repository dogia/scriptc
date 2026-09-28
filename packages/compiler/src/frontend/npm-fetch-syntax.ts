/** Read global-fetch capabilities from a bound, no-library module graph.
 * Symbol identity keeps parameters, imports and same-named locals distinct
 * from global reads and from aliases captured in another scope. */
import * as ts from "./ts7/syntax.js";
import { SemanticChecker } from "./ts7/semantic-checker.js";
import { SemanticSymbol } from "./ts7/semantic-model.js";
export function sourceFilesUsingGlobalFetch(files: readonly ts.SourceFile[], checker: SemanticChecker): Set<string> {
  const found = new Set<string>();
  const unwrapParentheses = (node: ts.Expression): ts.Expression => {
    let current = node;
    while (ts.isParenthesizedExpression(current)) current = current.expression;
    return current;
  };

  const unboundGlobalObject = (candidate: ts.Expression): boolean => {
    const node = unwrapParentheses(candidate);
    if (
      !ts.isIdentifier(node) ||
      (node.text !== "globalThis" && node.text !== "global")
    ) {
      return false;
    }
    const symbol = checker.getSymbolAtLocation(node);
    // TypeScript synthesizes a declaration-less globalThis symbol even in a
    // no-lib program. A source shadow (parameter/local/import) always carries
    // at least one declaration; the Node `global` alias remains unresolved.
    return (
      symbol === undefined ||
      symbol.declarations === undefined ||
      symbol.declarations.length === 0
    );
  };

  const globalObjectExpression = (
    candidate: ts.Expression,
    aliases: ReadonlySet<SemanticSymbol>,
  ): boolean => {
    const node = unwrapParentheses(candidate);
    if (unboundGlobalObject(node)) return true;
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol === undefined) return false;
      if (aliases.has(symbol)) return true;
      return (
        (symbol.flags & ts.SymbolFlags.Alias) !== 0 &&
        aliases.has(checker.getAliasedSymbol(symbol))
      );
    }
    if (ts.isConditionalExpression(node)) {
      return (
        globalObjectExpression(node.whenTrue, aliases) ||
        globalObjectExpression(node.whenFalse, aliases)
      );
    }
    if (ts.isBinaryExpression(node)) {
      switch (node.operatorToken.kind) {
        case ts.SyntaxKind.BarBarToken:
        case ts.SyntaxKind.QuestionQuestionToken:
        case ts.SyntaxKind.AmpersandAmpersandToken:
          // A platform selector can yield either operand. Treat either
          // global-object arm as capability provenance; over-linking a
          // dead arm is safer than silently omitting fetch at runtime.
          return (
            globalObjectExpression(node.left, aliases) ||
            globalObjectExpression(node.right, aliases)
          );
        case ts.SyntaxKind.CommaToken:
          return globalObjectExpression(node.right, aliases);
      }
    }
    return false;
  };

  const staticPropertyName = (name: ts.PropertyName | ts.BindingName): string | null => {
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
    if (
      ts.isComputedPropertyName(name) &&
      ts.isStringLiteralLike(name.expression)
    ) {
      return name.expression.text;
    }
    return null;
  };

  /** `const { fetch } = globalThis` binds a local identifier, so the
   * checker quite correctly resolves every later `fetch` read to that local.
   * The capability read happens at the binding pattern itself. The same is
   * true for aliases, computed literal keys, and defaulted parameters. */
  const bindingReadsGlobalFetch = (
    node: ts.BindingElement,
    aliases: ReadonlySet<SemanticSymbol>,
  ): boolean => {
    const pattern = node.parent;
    if (!ts.isObjectBindingPattern(pattern)) return false;
    const key = node.propertyName ?? (ts.isIdentifier(node.name) ? node.name : null);
    if (key === null || staticPropertyName(key) !== "fetch") return false;

    const owner = pattern.parent;
    if (
      (ts.isVariableDeclaration(owner) || ts.isParameter(owner) || ts.isBindingElement(owner)) &&
      owner.name === pattern &&
      owner.initializer !== undefined
    ) {
      return globalObjectExpression(owner.initializer, aliases);
    }
    return false;
  };

  /** Assignment destructuring is represented as an object-literal-shaped
   * assignment target rather than an ObjectBindingPattern. */
  const assignmentReadsGlobalFetch = (
    node: ts.BinaryExpression,
    aliases: ReadonlySet<SemanticSymbol>,
  ): boolean => {
    if (
      node.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
      !globalObjectExpression(node.right, aliases)
    ) {
      return false;
    }
    const target = unwrapParentheses(node.left);
    if (!ts.isObjectLiteralExpression(target)) return false;
    return target.properties.some((property) => {
      if (ts.isShorthandPropertyAssignment(property)) return property.name.text === "fetch";
      return ts.isPropertyAssignment(property) && staticPropertyName(property.name) === "fetch";
    });
  };

  const bareIdentifierRead = (node: ts.Identifier): boolean => {
    const parent = node.parent;
    // Binding-element names and aliases are declarations/property keys; the
    // global-object destructuring case is handled explicitly above.
    if (ts.isBindingElement(parent) && (parent.name === node || parent.propertyName === node)) return false;
    if (
      (ts.isLabeledStatement(parent) ||
        ts.isBreakStatement(parent) ||
        ts.isContinueStatement(parent)) &&
      parent.label === node
    ) {
      return false;
    }
    if (ts.isQualifiedName(parent) && parent.right === node) return false;
    // Imported/exported names are module member names or declarations,
    // never reads of Node's global binding. This matters when the custom
    // no-lib program cannot resolve the referenced package and therefore
    // has no checker symbol for an ImportSpecifier.propertyName.
    if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;

    // Named declarations and object/class property names are not reads.
    // A shorthand property is the exception: `{ fetch }` evaluates the
    // identifier and therefore needs the global when it is unbound.
    if (parent?.name === node && !ts.isShorthandPropertyAssignment(parent)) return false;
    return true;
  };

  const bareIdentifierIsUnbound = (node: ts.Identifier): boolean => {
    const parent = node.parent;
    // The binder gives `{ fetch }` a symbol for the PROPERTY it creates;
    // the value-side symbol is the one that answers whether the shorthand
    // reads a local binding or Node's global.
    if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) {
      return checker.getShorthandAssignmentValueSymbol(parent) === undefined;
    }
    return checker.getSymbolAtLocation(node) === undefined;
  };

  for (const sourceFile of files) {
    // Package bootstraps commonly snapshot or select the global object before
    // reading capabilities (`const root = globalThis || global; root.fetch`).
    // Resolve alias chains by symbol, so a same-named parameter/local in
    // another scope cannot inherit the classification. Mutable declarations
    // are conservative: a global initializer means some executable path can
    // retain that value. Iterate to a fixed point so declaration order does
    // not matter.
    const globalObjectAliases = new Set<SemanticSymbol>();
    let addedAlias = true;
    while (addedAlias) {
      addedAlias = false;
      const collectAliases = (node: ts.Node): void => {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.initializer !== undefined &&
          globalObjectExpression(node.initializer, globalObjectAliases)
        ) {
          const symbol = checker.getSymbolAtLocation(node.name);
          if (symbol !== undefined && !globalObjectAliases.has(symbol)) {
            globalObjectAliases.add(symbol);
            addedAlias = true;
          }
        }
      };
      ts.walkPreorder(sourceFile, collectAliases);
    }

    let usesFetch = false;
    const visit = (node: ts.Node): void => {
      if (usesFetch) return;
      if (
        (ts.isBindingElement(node) && bindingReadsGlobalFetch(node, globalObjectAliases)) ||
        (ts.isBinaryExpression(node) && assignmentReadsGlobalFetch(node, globalObjectAliases))
      ) {
        usesFetch = true;
        return;
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === "fetch" &&
        globalObjectExpression(node.expression, globalObjectAliases)
      ) {
        usesFetch = true;
        return;
      }
      if (
        ts.isElementAccessExpression(node) &&
        ts.isStringLiteralLike(node.argumentExpression) &&
        node.argumentExpression.text === "fetch" &&
        globalObjectExpression(node.expression, globalObjectAliases)
      ) {
        usesFetch = true;
        return;
      }
      if (ts.isIdentifier(node) && node.text === "fetch") {
        // Every real bare read has no symbol in this no-lib program unless
        // source syntax binds it. Syntactic names without symbols (labels,
        // destructuring keys) are filtered separately.
        if (bareIdentifierRead(node) && bareIdentifierIsUnbound(node)) {
          usesFetch = true;
          return;
        }
      }
    };
    ts.walkPreorder(sourceFile, visit);
    if (usesFetch) found.add(sourceFile.fileName);
  }
  return found;
}
