import { createProgram } from "../frontend/ts7/program-adapter.js";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";
import * as ts from "../frontend/ts7/adapter.js";
import { BOOL, F64, VOID, type IrExpr, type IrStmt } from "./ir.js";
import { everyExpr, everyExprChild, everyStmtChild, everyStmtList, mapExprChildren, mapStmtChildren, transformStmtList } from "./traverse.js";

const loc = { file: "traverse.ts", start: 0, end: 1 };
const num = (value: number): IrExpr => ({ kind: "numLit", value, type: F64, loc });
const statement = (value: number): IrStmt => ({ kind: "exprStmt", expr: num(value), loc });

// Derive child slots from the declared IR, independently of the traversal
// tables. Exhaustive switches catch new variants; this also catches a new
// child field added to an existing variant. These structural samples need
// not be executable: a child's identity and position are the contract here.
const path = fileURLToPath(new URL("./ir.ts", import.meta.url));
const program = createProgram([path], { noLib: true, noResolve: true, types: [] });
const source = program.getSourceFile(path)!;
afterAll(() => program.dispose());
function childType(type: ts.TypeNode): boolean {
  if (ts.isTypeReferenceNode(type)) return ["IrExpr", "IrStmt"].includes(type.typeName.getText());
  if (ts.isArrayTypeNode(type)) return childType(type.elementType);
  if (ts.isUnionTypeNode(type)) return type.types.some(childType);
  if (ts.isTypeLiteralNode(type)) return type.members.some((member) => ts.isPropertySignature(member) && member.type && childType(member.type));
  return false;
}

for (const name of ["IrExpr", "IrStmt"]) {
  const alias = source.statements.find((node): node is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(node) && node.name.text === name)!;
  if (!ts.isUnionTypeNode(alias.type)) throw new Error("IR must be a discriminated union");
  for (const variant of alias.type.types) {
    if (!ts.isTypeLiteralNode(variant)) throw new Error("IR variants must be records");
    const members = variant.members.filter(ts.isPropertySignature);
    const tag = members.find((member) => member.name.getText() === "kind")!.type!;
    const kind = JSON.parse(tag.getText()) as string;
    test(`${name}.${kind}: every declared child is visited and rewritten, metadata is preserved`, () => {
      for (const presence of [true, false]) {
        const expected: (IrExpr | IrStmt)[] = [];
        function value(type: ts.TypeNode): unknown {
          if (ts.isTypeReferenceNode(type)) {
            const node = type.typeName.getText() === "IrExpr" ? num(expected.length) : statement(expected.length);
            expected.push(node);
            return node;
          }
          if (ts.isUnionTypeNode(type)) return presence ? value(type.types.find(childType)!) : null;
          if (ts.isArrayTypeNode(type)) return [value(type.elementType), value(type.elementType)];
          if (ts.isTypeLiteralNode(type)) {
            const result: Record<string, unknown> = { metadata: "keep wrapper fields", drop: true, overflow: true };
            for (const member of type.members) {
              if (ts.isPropertySignature(member) && member.type && childType(member.type)) result[member.name.getText()] = value(member.type);
            }
            return result;
          }
          throw new Error("unexpected child slot");
        }
        const input: Record<string, unknown> = { kind, type: F64, loc, metadata: { kind: "throw", value: num(999) } };
        for (const member of members) {
          if (member.type && childType(member.type) && (presence || !member.postfixToken)) input[member.name.getText()] = value(member.type);
        }
        const before = structuredClone(input);
        const seen: (IrExpr | IrStmt)[] = [];
        const visit = (node: IrExpr | IrStmt): boolean => { seen.push(node); return true; };
        const each = (node: unknown, e: (e: IrExpr) => boolean, s: (s: IrStmt) => boolean): boolean => name === "IrExpr"
          ? everyExprChild(node as IrExpr, e, s) : everyStmtChild(node as IrStmt, e, s);
        expect(each(input, visit, visit)).toBe(true);
        expect(seen).toEqual(expected);
        expected.forEach((child, i) => expect(seen[i]).toBe(child));
        // Every possible stopping position must suppress later children.
        for (let stop = 0; stop < expected.length; stop++) {
          let count = 0;
          const stopAt = (): boolean => count++ !== stop;
          expect(each(input, stopAt, stopAt)).toBe(false);
          expect(count).toBe(stop + 1);
        }
        const replacements: (IrExpr | IrStmt)[] = [];
        const expr = (): IrExpr => { const out = num(100 + replacements.length); replacements.push(out); return out; };
        const stmt = (): IrStmt => { const out = statement(100 + replacements.length); replacements.push(out); return out; };
        const output = name === "IrExpr" ? mapExprChildren(input as IrExpr, expr, stmt) : mapStmtChildren(input as IrStmt, expr, stmt);
        seen.length = 0;
        each(output, visit, visit);
        expect(seen).toEqual(replacements);
        replacements.forEach((child, i) => expect(seen[i]).toBe(child));
        expect(input).toEqual(before);
        expect(output.loc).toBe(loc);
        expect((output as unknown as Record<string, unknown>)["metadata"]).toBe(input["metadata"]);
        for (const member of members) {
          const key = member.name.getText();
          if (member.postfixToken && !presence) expect(Object.hasOwn(output, key)).toBe(false);
        }
      }
    });
  }
}

test("recursive preorder reaches statements inside expressions and stops the complete walk", () => {
  const body: IrStmt[] = [{ kind: "if", cond: { kind: "boolLit", value: true, type: BOOL, loc }, then: [
    { kind: "exprStmt", expr: { kind: "seqExpr", stmts: [statement(1)], result: num(2), type: F64, loc }, loc },
  ], else_: [statement(3)], loc }, statement(4)];
  const seen: string[] = [];
  expect(everyStmtList(body, {
    expr: (e) => { seen.push(e.kind); return e.kind !== "numLit"; },
    stmt: (s) => { seen.push(s.kind); return true; },
  })).toBe(false);
  expect(seen).toEqual(["if", "boolLit", "exprStmt", "seqExpr", "exprStmt", "numLit"]);
  expect(everyExpr(num(0), { expr: () => false, stmt: () => { throw new Error("unexpected child"); } })).toBe(false);
});

test("preorder transformations traverse replacement children exactly once", () => {
  const body = [statement(1)];
  const seen: string[] = [];
  const result = transformStmtList(body, {
    stmt: (s) => {
      seen.push(s.kind);
      return s.kind === "exprStmt" ? { kind: "return", value: s.expr, loc: s.loc } : s;
    },
    expr: (e) => {
      seen.push(e.kind);
      return e.kind === "numLit" ? { kind: "intrinsic", name: "console.log", args: [], type: VOID, loc: e.loc } : e;
    },
  });
  expect(seen).toEqual(["exprStmt", "numLit"]);
  expect(result).toEqual([{ kind: "return", value: { kind: "intrinsic", name: "console.log", args: [], type: VOID, loc }, loc }]);
  expect(body).toEqual([statement(1)]);
});
