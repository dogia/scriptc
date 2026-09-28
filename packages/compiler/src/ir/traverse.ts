import type { IrExpr, IrStmt } from "./ir.js";

/** Typed structural traversal of executable IR. Types, source locations,
 * captures, labels and other metadata are deliberately not child nodes.
 * Child order follows the IR schema; this visits all branches, including
 * dormant callbacks and lazy operands, rather than simulating execution.
 * Predicates can stop traversal without allocating a dynamic snapshot. */
export interface IrVisitor {
  expr: (expr: IrExpr) => boolean;
  stmt: (stmt: IrStmt) => boolean;
}

export interface IrTransform {
  expr: (expr: IrExpr) => IrExpr;
  stmt: (stmt: IrStmt) => IrStmt;
}

/** Visit immediate children, stopping on the first false result. */
export function everyExprChild(node: IrExpr, expr: (expr: IrExpr) => boolean, stmt: (stmt: IrStmt) => boolean): boolean {
  switch (node.kind) {
    case "numLit":
      return true;
    case "strLit":
      return true;
    case "moduleNsRef":
      return true;
    case "boolLit":
      return true;
    case "unitLit":
      return true;
    case "varRef":
      return true;
    case "bin":
      return expr(node.left) && expr(node.right);
    case "unary":
      return expr(node.operand);
    case "incDec":
      return true;
    case "fieldIncDec":
      return expr(node.obj);
    case "assignExpr":
      return expr(node.value);
    case "toBool":
      return expr(node.operand);
    case "logical":
      return expr(node.left) && expr(node.right);
    case "strConcat":
      return expr(node.left) && expr(node.right);
    case "strEq":
      return expr(node.left) && expr(node.right);
    case "strCmp":
      return expr(node.left) && expr(node.right);
    case "toString":
      return expr(node.operand);
    case "ternary":
      return expr(node.cond) && expr(node.then) && expr(node.else_);
    case "nullish":
      return expr(node.left) && expr(node.right);
    case "orDefault":
      return expr(node.left) && expr(node.right);
    case "optChain":
      return expr(node.receiver) && expr(node.body);
    case "chainRecv":
      return true;
    case "strIntrinsic":
      return expr(node.receiver) && node.args.every((child) => expr(child));
    case "regexLit":
      return true;
    case "templateStrings":
      return true;
    case "regexIntrinsic":
      return expr(node.receiver) && node.args.every((child) => expr(child));
    case "arrayLit":
      return node.elems.every((child) => expr(child));
    case "arrayNewLen":
      return expr(node.length);
    case "arrayGet":
      return expr(node.arr) && expr(node.index);
    case "arrayHas":
      return expr(node.arr) && expr(node.index);
    case "arrayState":
      return expr(node.arr) && expr(node.index);
    case "arrIntrinsic":
      return expr(node.receiver) && node.args.every((child) => expr(child));
    case "bytesNew":
      return (node.source === null || expr(node.source));
    case "bytesIntrinsic":
      return expr(node.receiver) && node.args.every((child) => expr(child));
    case "mapNew":
      return (node.seed === undefined || node.seed.every((child) => (expr(child.key) && expr(child.value))));
    case "mapIntrinsic":
      return expr(node.receiver) && node.args.every((child) => expr(child));
    case "setNew":
      return (node.seed === undefined || expr(node.seed));
    case "setIntrinsic":
      return expr(node.receiver) && node.args.every((child) => expr(child));
    case "call":
      return node.args.every((child) => expr(child));
    case "ffiCall":
      return node.args.every((child) => expr(child));
    case "closure":
      return true;
    case "callValue":
      return expr(node.callee) && (node.receiver === undefined || expr(node.receiver)) && node.args.every((child) => expr(child));
    case "selfRef":
      return true;
    case "yieldExpr":
      return (node.value === null || expr(node.value));
    case "genResume":
      return expr(node.gen) && (node.arg === null || expr(node.arg));
    case "awaitExpr":
      return expr(node.value);
    case "awaitUnionExpr":
      return expr(node.value);
    case "newPromise":
      return expr(node.executor);
    case "promiseWithResolvers":
      return true;
    case "new":
      return node.args.every((child) => expr(child));
    case "classRef":
      return true;
    case "newValue":
      return expr(node.callee) && node.args.every((child) => expr(child));
    case "instanceOfValue":
      return expr(node.value) && expr(node.classValue);
    case "upcast":
      return expr(node.value);
    case "promiseVoidWiden":
      return expr(node.value);
    case "downcast":
      return expr(node.value);
    case "instanceOf":
      return expr(node.value);
    case "virtualCall":
      return node.args.every((child) => expr(child));
    case "fieldGet":
      return expr(node.obj);
    case "recordLit":
      return node.fields.every((child) => (expr(child.value)));
    case "recordClone":
      return expr(node.source) && node.overrides.every((child) => (expr(child.value)));
    case "recordGet":
      return expr(node.obj);
    case "recordKeyGet":
      return expr(node.obj) && expr(node.key);
    case "dynFrom":
      return expr(node.value);
    case "dynFromJsval":
      return expr(node.value);
    case "dynCall":
      return expr(node.callee) && (node.receiver === undefined || expr(node.receiver)) && node.args.every((child) => expr(child));
    case "dynInvoke":
      return expr(node.recv) && node.args.every((child) => expr(child));
    case "dynArrLit":
      return node.elems.every((child) => expr(child));
    case "dynObjLit":
      return (node.fields === undefined || node.fields.every((child) => (expr(child.key) && expr(child.value))));
    case "dynTest":
      return expr(node.value);
    case "dynKeyGet":
      return expr(node.key) && expr(node.value);
    case "dynHasKey":
      return expr(node.value);
    case "dynScalarEq":
      return expr(node.left) && expr(node.right);
    case "seqExpr":
      return node.stmts.every((child) => stmt(child)) && expr(node.result);
    case "dynDestrCheck":
      return expr(node.value);
    case "dynIterN":
      return expr(node.value);
    case "recordOvfKeys":
      return expr(node.obj);
    case "recordOvfHas":
      return expr(node.obj) && expr(node.key);
    case "unionWrap":
      return expr(node.value);
    case "unionFuncEq":
      return expr(node.union) && expr(node.func);
    case "caughtTest":
      return expr(node.value);
    case "caughtNarrow":
      return expr(node.value);
    case "caughtCheck":
      return expr(node.value);
    case "caughtToDyn":
      return expr(node.value);
    case "unionNarrow":
      return expr(node.value);
    case "unionDisc":
      return expr(node.value);
    case "unionKeyGet":
      return expr(node.key) && expr(node.value);
    case "unionIsTag":
      return expr(node.value);
    case "unionEq":
      return expr(node.left) && expr(node.right);
    case "intrinsic":
      return node.args.every((child) => expr(child));
    case "libCall":
      return node.args.every((child) => expr(child));
    case "jsonStringify":
      return expr(node.value);
    case "dynCheck":
      return expr(node.value);
    case "jsMarshal":
      return expr(node.value);
    case "jsOp":
      return node.args.every((child) => expr(child));
    case "jsExit":
      return expr(node.value);
    case "jsBridgePromise":
      return expr(node.value);
  }
  node satisfies never;
  throw new Error("unhandled IR node");
}

/** Visit immediate children, stopping on the first false result. */
export function everyStmtChild(node: IrStmt, expr: (expr: IrExpr) => boolean, stmt: (stmt: IrStmt) => boolean): boolean {
  switch (node.kind) {
    case "varDecl":
      return (node.init === null || expr(node.init));
    case "assign":
      return expr(node.value);
    case "exprStmt":
      return expr(node.expr);
    case "if":
      return expr(node.cond) && node.then.every((child) => stmt(child)) && (node.else_ === null || node.else_.every((child) => stmt(child)));
    case "while":
      return expr(node.cond) && node.body.every((child) => stmt(child));
    case "doWhile":
      return node.body.every((child) => stmt(child)) && expr(node.cond);
    case "switch":
      return expr(node.disc) && node.cases.every((child) => ((child.test === null || expr(child.test)) && child.body.every((child) => stmt(child))));
    case "for":
      return (node.init === null || stmt(node.init)) && (node.cond === null || expr(node.cond)) && (node.update === null || stmt(node.update)) && node.body.every((child) => stmt(child));
    case "arraySet":
      return expr(node.arr) && expr(node.index) && expr(node.value);
    case "arraySetLength":
      return expr(node.arr) && expr(node.length);
    case "arraySetUndefined":
      return expr(node.arr) && expr(node.index);
    case "arrayDelete":
      return expr(node.arr) && expr(node.index);
    case "bytesSet":
      return expr(node.arr) && expr(node.index) && expr(node.value);
    case "forOf":
      return expr(node.iterable) && node.body.every((child) => stmt(child));
    case "return":
      return (node.value === null || expr(node.value));
    case "fieldSet":
      return expr(node.obj) && expr(node.value);
    case "recordSet":
      return expr(node.obj) && expr(node.value);
    case "recordKeySet":
      return expr(node.obj) && expr(node.key) && expr(node.value);
    case "recordKeyDelete":
      return expr(node.obj) && expr(node.key);
    case "break":
      return true;
    case "continue":
      return true;
    case "block":
      return node.body.every((child) => stmt(child));
    case "throw":
      return expr(node.value);
    case "runtimeFence":
      return true;
    case "rethrow":
      return true;
    case "tryCatch":
      return node.tryBody.every((child) => stmt(child)) && (node.catchBody === null || node.catchBody.every((child) => stmt(child))) && (node.finallyBody === null || node.finallyBody.every((child) => stmt(child)));
  }
  node satisfies never;
  throw new Error("unhandled IR node");
}

/** Copy a node with transformed immediate children; preserve all metadata. */
export function mapExprChildren(node: IrExpr, expr: (expr: IrExpr) => IrExpr, stmt: (stmt: IrStmt) => IrStmt): IrExpr {
  switch (node.kind) {
    case "numLit":
      return node;
    case "strLit":
      return node;
    case "moduleNsRef":
      return node;
    case "boolLit":
      return node;
    case "unitLit":
      return node;
    case "varRef":
      return node;
    case "bin":
      return { ...node, left: expr(node.left), right: expr(node.right) };
    case "unary":
      return { ...node, operand: expr(node.operand) };
    case "incDec":
      return node;
    case "fieldIncDec":
      return { ...node, obj: expr(node.obj) };
    case "assignExpr":
      return { ...node, value: expr(node.value) };
    case "toBool":
      return { ...node, operand: expr(node.operand) };
    case "logical":
      return { ...node, left: expr(node.left), right: expr(node.right) };
    case "strConcat":
      return { ...node, left: expr(node.left), right: expr(node.right) };
    case "strEq":
      return { ...node, left: expr(node.left), right: expr(node.right) };
    case "strCmp":
      return { ...node, left: expr(node.left), right: expr(node.right) };
    case "toString":
      return { ...node, operand: expr(node.operand) };
    case "ternary":
      return { ...node, cond: expr(node.cond), then: expr(node.then), else_: expr(node.else_) };
    case "nullish":
      return { ...node, left: expr(node.left), right: expr(node.right) };
    case "orDefault":
      return { ...node, left: expr(node.left), right: expr(node.right) };
    case "optChain":
      return { ...node, receiver: expr(node.receiver), body: expr(node.body) };
    case "chainRecv":
      return node;
    case "strIntrinsic":
      return { ...node, receiver: expr(node.receiver), args: node.args.map((child) => expr(child)) };
    case "regexLit":
      return node;
    case "templateStrings":
      return node;
    case "regexIntrinsic":
      return { ...node, receiver: expr(node.receiver), args: node.args.map((child) => expr(child)) };
    case "arrayLit":
      return { ...node, elems: node.elems.map((child) => expr(child)) };
    case "arrayNewLen":
      return { ...node, length: expr(node.length) };
    case "arrayGet":
      return { ...node, arr: expr(node.arr), index: expr(node.index) };
    case "arrayHas":
      return { ...node, arr: expr(node.arr), index: expr(node.index) };
    case "arrayState":
      return { ...node, arr: expr(node.arr), index: expr(node.index) };
    case "arrIntrinsic":
      return { ...node, receiver: expr(node.receiver), args: node.args.map((child) => expr(child)) };
    case "bytesNew":
      return { ...node, source: node.source === null ? null : expr(node.source) };
    case "bytesIntrinsic":
      return { ...node, receiver: expr(node.receiver), args: node.args.map((child) => expr(child)) };
    case "mapNew":
      return node.seed === undefined ? node : { ...node, seed: node.seed.map((child) => ({ ...child, key: expr(child.key), value: expr(child.value) })) };
    case "mapIntrinsic":
      return { ...node, receiver: expr(node.receiver), args: node.args.map((child) => expr(child)) };
    case "setNew":
      return node.seed === undefined ? node : { ...node, seed: expr(node.seed) };
    case "setIntrinsic":
      return { ...node, receiver: expr(node.receiver), args: node.args.map((child) => expr(child)) };
    case "call":
      return { ...node, args: node.args.map((child) => expr(child)) };
    case "ffiCall":
      return { ...node, args: node.args.map((child) => expr(child)) };
    case "closure":
      return node;
    case "callValue":
      return { ...node, callee: expr(node.callee), ...(node.receiver === undefined ? {} : { receiver: expr(node.receiver) }), args: node.args.map((child) => expr(child)) };
    case "selfRef":
      return node;
    case "yieldExpr":
      return { ...node, value: node.value === null ? null : expr(node.value) };
    case "genResume":
      return { ...node, gen: expr(node.gen), arg: node.arg === null ? null : expr(node.arg) };
    case "awaitExpr":
      return { ...node, value: expr(node.value) };
    case "awaitUnionExpr":
      return { ...node, value: expr(node.value) };
    case "newPromise":
      return { ...node, executor: expr(node.executor) };
    case "promiseWithResolvers":
      return node;
    case "new":
      return { ...node, args: node.args.map((child) => expr(child)) };
    case "classRef":
      return node;
    case "newValue":
      return { ...node, callee: expr(node.callee), args: node.args.map((child) => expr(child)) };
    case "instanceOfValue":
      return { ...node, value: expr(node.value), classValue: expr(node.classValue) };
    case "upcast":
      return { ...node, value: expr(node.value) };
    case "promiseVoidWiden":
      return { ...node, value: expr(node.value) };
    case "downcast":
      return { ...node, value: expr(node.value) };
    case "instanceOf":
      return { ...node, value: expr(node.value) };
    case "virtualCall":
      return { ...node, args: node.args.map((child) => expr(child)) };
    case "fieldGet":
      return { ...node, obj: expr(node.obj) };
    case "recordLit":
      return { ...node, fields: node.fields.map((child) => ({ ...child!, value: expr(child.value) })) };
    case "recordClone":
      return { ...node, source: expr(node.source), overrides: node.overrides.map((child) => ({ ...child!, value: expr(child.value) })) };
    case "recordGet":
      return { ...node, obj: expr(node.obj) };
    case "recordKeyGet":
      return { ...node, obj: expr(node.obj), key: expr(node.key) };
    case "dynFrom":
      return { ...node, value: expr(node.value) };
    case "dynFromJsval":
      return { ...node, value: expr(node.value) };
    case "dynCall":
      return { ...node, callee: expr(node.callee), ...(node.receiver === undefined ? {} : { receiver: expr(node.receiver) }), args: node.args.map((child) => expr(child)) };
    case "dynInvoke":
      return { ...node, recv: expr(node.recv), args: node.args.map((child) => expr(child)) };
    case "dynArrLit":
      return { ...node, elems: node.elems.map((child) => expr(child)) };
    case "dynObjLit":
      return node.fields === undefined ? node : { ...node, fields: node.fields.map((child) => ({ ...child, key: expr(child.key), value: expr(child.value) })) };
    case "dynTest":
      return { ...node, value: expr(node.value) };
    case "dynKeyGet":
      return { ...node, key: expr(node.key), value: expr(node.value) };
    case "dynHasKey":
      return { ...node, value: expr(node.value) };
    case "dynScalarEq":
      return { ...node, left: expr(node.left), right: expr(node.right) };
    case "seqExpr":
      return { ...node, stmts: node.stmts.map((child) => stmt(child)), result: expr(node.result) };
    case "dynDestrCheck":
      return { ...node, value: expr(node.value) };
    case "dynIterN":
      return { ...node, value: expr(node.value) };
    case "recordOvfKeys":
      return { ...node, obj: expr(node.obj) };
    case "recordOvfHas":
      return { ...node, obj: expr(node.obj), key: expr(node.key) };
    case "unionWrap":
      return { ...node, value: expr(node.value) };
    case "unionFuncEq":
      return { ...node, union: expr(node.union), func: expr(node.func) };
    case "caughtTest":
      return { ...node, value: expr(node.value) };
    case "caughtNarrow":
      return { ...node, value: expr(node.value) };
    case "caughtCheck":
      return { ...node, value: expr(node.value) };
    case "caughtToDyn":
      return { ...node, value: expr(node.value) };
    case "unionNarrow":
      return { ...node, value: expr(node.value) };
    case "unionDisc":
      return { ...node, value: expr(node.value) };
    case "unionKeyGet":
      return { ...node, key: expr(node.key), value: expr(node.value) };
    case "unionIsTag":
      return { ...node, value: expr(node.value) };
    case "unionEq":
      return { ...node, left: expr(node.left), right: expr(node.right) };
    case "intrinsic":
      return { ...node, args: node.args.map((child) => expr(child)) };
    case "libCall":
      return { ...node, args: node.args.map((child) => expr(child)) };
    case "jsonStringify":
      return { ...node, value: expr(node.value) };
    case "dynCheck":
      return { ...node, value: expr(node.value) };
    case "jsMarshal":
      return { ...node, value: expr(node.value) };
    case "jsOp":
      return { ...node, args: node.args.map((child) => expr(child)) };
    case "jsExit":
      return { ...node, value: expr(node.value) };
    case "jsBridgePromise":
      return { ...node, value: expr(node.value) };
  }
  node satisfies never;
  throw new Error("unhandled IR node");
}

/** Copy a node with transformed immediate children; preserve all metadata. */
export function mapStmtChildren(node: IrStmt, expr: (expr: IrExpr) => IrExpr, stmt: (stmt: IrStmt) => IrStmt): IrStmt {
  switch (node.kind) {
    case "varDecl":
      return { ...node, init: node.init === null ? null : expr(node.init) };
    case "assign":
      return { ...node, value: expr(node.value) };
    case "exprStmt":
      return { ...node, expr: expr(node.expr) };
    case "if":
      return { ...node, cond: expr(node.cond), then: node.then.map((child) => stmt(child)), else_: node.else_ === null ? null : node.else_.map((child) => stmt(child)) };
    case "while":
      return { ...node, cond: expr(node.cond), body: node.body.map((child) => stmt(child)) };
    case "doWhile":
      return { ...node, body: node.body.map((child) => stmt(child)), cond: expr(node.cond) };
    case "switch":
      return { ...node, disc: expr(node.disc), cases: node.cases.map((child) => ({ ...child, test: child.test === null ? null : expr(child.test), body: child.body.map((child) => stmt(child)) })) };
    case "for":
      return { ...node, init: node.init === null ? null : stmt(node.init), cond: node.cond === null ? null : expr(node.cond), update: node.update === null ? null : stmt(node.update), body: node.body.map((child) => stmt(child)) };
    case "arraySet":
      return { ...node, arr: expr(node.arr), index: expr(node.index), value: expr(node.value) };
    case "arraySetLength":
      return { ...node, arr: expr(node.arr), length: expr(node.length) };
    case "arraySetUndefined":
      return { ...node, arr: expr(node.arr), index: expr(node.index) };
    case "arrayDelete":
      return { ...node, arr: expr(node.arr), index: expr(node.index) };
    case "bytesSet":
      return { ...node, arr: expr(node.arr), index: expr(node.index), value: expr(node.value) };
    case "forOf":
      return { ...node, iterable: expr(node.iterable), body: node.body.map((child) => stmt(child)) };
    case "return":
      return { ...node, value: node.value === null ? null : expr(node.value) };
    case "fieldSet":
      return { ...node, obj: expr(node.obj), value: expr(node.value) };
    case "recordSet":
      return { ...node, obj: expr(node.obj), value: expr(node.value) };
    case "recordKeySet":
      return { ...node, obj: expr(node.obj), key: expr(node.key), value: expr(node.value) };
    case "recordKeyDelete":
      return { ...node, obj: expr(node.obj), key: expr(node.key) };
    case "break":
      return node;
    case "continue":
      return node;
    case "block":
      return { ...node, body: node.body.map((child) => stmt(child)) };
    case "throw":
      return { ...node, value: expr(node.value) };
    case "runtimeFence":
      return node;
    case "rethrow":
      return node;
    case "tryCatch":
      return { ...node, tryBody: node.tryBody.map((child) => stmt(child)), catchBody: node.catchBody === null ? null : node.catchBody.map((child) => stmt(child)), finallyBody: node.finallyBody === null ? null : node.finallyBody.map((child) => stmt(child)) };
  }
  node satisfies never;
  throw new Error("unhandled IR node");
}

/** Preorder traversal. A false predicate stops the complete walk. */
export function everyExpr(node: IrExpr, visitor: IrVisitor): boolean {
  return visitor.expr(node) && everyExprChild(node,
    (child) => everyExpr(child, visitor), (child) => everyStmt(child, visitor));
}

export function everyStmt(node: IrStmt, visitor: IrVisitor): boolean {
  return visitor.stmt(node) && everyStmtChild(node,
    (child) => everyExpr(child, visitor), (child) => everyStmt(child, visitor));
}

export function everyStmtList(body: IrStmt[], visitor: IrVisitor): boolean {
  return body.every((node) => everyStmt(node, visitor));
}

/** Preorder rewrite: traverse the replacement's children, never mutate
 * the input tree, and leave type/loc/label metadata to the caller. */
export function transformExpr(node: IrExpr, transform: IrTransform): IrExpr {
  return mapExprChildren(transform.expr(node),
    (child) => transformExpr(child, transform), (child) => transformStmt(child, transform));
}

export function transformStmt(node: IrStmt, transform: IrTransform): IrStmt {
  return mapStmtChildren(transform.stmt(node),
    (child) => transformExpr(child, transform), (child) => transformStmt(child, transform));
}

export function transformStmtList(body: IrStmt[], transform: IrTransform): IrStmt[] {
  return body.map((node) => transformStmt(node, transform));
}
