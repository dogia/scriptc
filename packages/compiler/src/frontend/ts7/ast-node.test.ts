import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { SourceFile, Node } from "typescript/unstable/ast";
import { AstFile, AstNode } from "./ast-node.js";
import { AstKind, KIND_NODE_LIST, astChildNames, HEADER_OFFSET_NODES, NODE_LEN } from "./ast-schema.generated.js";
import { ts7Executable } from "./rpc-api.js";
import { Ts7RpcClient } from "./rpc-client.js";
import { spawnTs7Wire } from "./rpc-process.js";
import { isJSDocTypeLiteral, isJSDocPropertyTag } from "./ast-guards.generated.js";

const require = createRequire(import.meta.url);
const sdkRoot = dirname(require.resolve("typescript/package.json"));
type OracleNode = Node & { index: number; id: string; text?: string; rawText?: string };
type OracleFile = SourceFile & { getOrCreateNodeAtIndex(index: number): OracleNode };
const { RemoteSourceFile } = require(join(sdkRoot, "dist/api/node/node.js")) as { RemoteSourceFile: new (bytes: Uint8Array, decoder: InstanceType<typeof TextDecoder>) => OracleFile };
const { Wtf8Decoder } = require(join(sdkRoot, "dist/api/node/wtf8.js")) as { Wtf8Decoder: typeof TextDecoder };

const cases: Record<string, string> = {
  "main.ts": [
    "#!/usr/bin/env node",
    '/// <reference path="./types.d.ts" preserve="true" />',
    'import type { Thing } from "./types.js";',
    'import * as other from "./other.js";',
    'export { other };',
    '/** A class.\n * @template T\n * @see {@link other}\n */',
    'export abstract class Box<T> extends other.Base implements Thing {',
    '  #private = "\\ud800\\uFEFF"; readonly name = "\\uFEFF😀";',
    '  abstract method<U>(...values: U[]): U;',
    '  get value() { return this.#private; }',
    '  set value(v: string) { this.#private = v; }',
    '  static { console.log("initializing"); }',
    '}',
    'type Values = readonly [name: string, count?: number, ...rest: boolean[]];',
    'type Keys<T> = { readonly [K in keyof T as `prefix${K & string}`]?: T[K] };',
    'type Result<T> = T extends Promise<infer U> ? U : never;',
    'function* values() { yield* [1, 2, 3]; return 4; }',
    'const [a, , b = 3, ...rest] = [1, 2, 3, 4];',
    'const object = { [a]: b, ...rest, method() { return this; } };',
    'const optional = object?.method?.()?.[a] ?? "default";',
    'for (const x of values()) { if (x > 1) break; else continue; }',
    'try { throw 1; } catch (e) { console.log(e); } finally { console.log("done"); }',
    'switch (a) { case 1: break; default: console.log(a); }',
    'let n = 1; n++; --n; !n; ~n; +n; -n; void n; typeof n;',
    'const literals = [42, 0xff, 123n, /a+/giu, `plain`, `head${n}middle${a}tail`];',
    `const many = [${Array.from({ length: 80 }, (_, i) => i).join(",")}];`,
  ].join("\r\n"),
  "other.ts": 'export class Base {}\nexport namespace Space { export const v = 1; }\n',
  "view.tsx": 'const view = <main aria-label="a"><p>Hello 😀</p>{value}<Thing {...props} /></main>;\nconst fragment = <><span /> text </>;',
  "types.d.ts": 'export interface Thing { name: string; }\ndeclare module "ambient.name" { export const a: number; }\n',
  "docs.js": '/** @typedef {{ name: string, count?: number }} Item */\n/** @param {Item} item Description\n * @returns {string} result\n * @deprecated use another\n */\nexport function show(item) { return item.name; }',
  "properties.js": '/** @typedef {Object} Options\n * @property {string} name\n * @property {number} count\n */\n/** @type {Options} */ const options = { name: "x", count: 2 };',
  "missing.ts": 'const incomplete = ;\nfunction f( {\n',
  "empty.ts": "",
};
const decoded = new Map<string, { file: AstFile; oracle: OracleFile; bytes: Uint8Array }>();
let directory: string;
beforeAll(() => {
  directory = mkdtempSync(join(process.platform === "win32" ? tmpdir() : "/tmp", "scriptc-ast-oracle-"));
  const config = join(directory, "tsconfig.json");
  for (const [name, source] of Object.entries(cases)) writeFileSync(join(directory, name), source);
  // Exercise the decoder on compiler source as well as language fixtures.
  writeFileSync(join(directory, "model.ts"), readFileSync(new URL("./ast-node.ts", import.meta.url), "utf8"));
  writeFileSync(config, JSON.stringify({ compilerOptions: { types: [], allowJs: true, checkJs: true, jsx: "preserve", target: "esnext" }, files: [...Object.keys(cases), "model.ts"] }));
  const client = new Ts7RpcClient(spawnTs7Wire(ts7Executable(), ["--api", "--cwd", directory]));
  try {
    client.requestText("initialize", "null");
    const snapshot = JSON.parse(client.requestText("updateSnapshot", JSON.stringify({ openProjects: [config] }))) as { snapshot: string; projects: { id: string }[] };
    for (const name of [...Object.keys(cases), "model.ts"]) {
      const bytes = client.requestBytes("getSourceFile", Buffer.from(JSON.stringify({ snapshot: snapshot.snapshot, project: snapshot.projects[0]!.id, file: join(directory, name) })));
      decoded.set(name, { bytes, file: new AstFile(bytes), oracle: new RemoteSourceFile(bytes, new Wtf8Decoder("utf-8", { ignoreBOM: true })) });
    }
  } finally { client.close(); }
});
afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

function ids(nodes: readonly Node[] | readonly AstNode[] | undefined): (number | undefined)[] | undefined {
  return nodes?.map((n) => (n as OracleNode).index);
}

test("JSDoc property refinements describe the pinned native wire", () => {
  const { file, oracle } = decoded.get("properties.js")!;
  let checked = 0;
  for (let index = 1; index < file.wire.nodeCount; index++) {
    if (file.wire.kind(index) !== AstKind.JSDocTypeLiteral) continue;
    const node = file.node(index);
    if (!isJSDocTypeLiteral(node)) throw new Error("invalid JSDoc kind");
    const tag = node.jsdocPropertyTags;
    expect(isJSDocPropertyTag(tag)).toBe(true);
    expect(tag?.kind).toBe(AstKind.JSDocPropertyTag);
    expect(tag?.index).toBe(Reflect.get(oracle.getOrCreateNodeAtIndex(index), "jsdocPropertyTags").index);
    expect(tag).toBe(node.childNode("jsdocPropertyTags"));
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
});

for (const name of [...Object.keys(cases), "model.ts"]) {
  test(`nodes, named children, flags, text and spans match TypeScript: ${name}`, () => {
    const { file, oracle } = decoded.get(name)!;
    for (let index = 1; index < file.wire.nodeCount; index++) {
      if (file.wire.kind(index) === KIND_NODE_LIST) continue;
      const node = file.node(index);
      const expected = oracle.getOrCreateNodeAtIndex(index);
      for (const property of ["kind", "pos", "end", "flags", "text", "rawText", "containsOnlyTriviaWhiteSpaces", "isArrayType", "isBracketed", "isExportEquals", "isNameFirst", "isTypeOf", "isTypeOnly", "multiLine", "keyword", "keywordToken", "operator", "phaseModifier", "token", "templateFlags", "tokenFlags", "modifierFlags"]) {
        expect(Reflect.get(node, property), `${name}:${index}.${property}`).toEqual(Reflect.get(expected, property));
      }
      expect(node.parent?.index, `${name}:${index}.parent`).toBe((expected.parent as OracleNode | undefined)?.index);
      expect(node.id).toBe(expected.id);
      expect(file.resolve(node.id)).toBe(node);
      expect(node.getSourceFile()).toBe(file.root);
      expect(node.getFullStart()).toBe(expected.getFullStart());
      expect(node.getStart()).toBe(expected.getStart());
      expect(node.getStart(undefined, true)).toBe(expected.getStart(undefined, true));
      expect(node.getText()).toBe(expected.getText());
      expect(node.getFullText()).toBe(expected.getFullText());
      expect(node.getWidth()).toBe(expected.getWidth());
      expect(node.getFullWidth()).toBe(expected.getFullWidth());
      expect(node.getLeadingTriviaWidth()).toBe(expected.getLeadingTriviaWidth());
      expect(ids(node.jsDoc)).toEqual(ids(expected.jsDoc));
      for (const property of astChildNames(node.kind).split(",").filter(Boolean)) {
        const actual = Reflect.get(node, property) as AstNode | AstNode[] | undefined;
        const reference = Reflect.get(expected, property) as OracleNode | OracleNode[] | undefined;
        if (Array.isArray(reference)) {
          expect(ids(actual as AstNode[]), `${name}:${index}.${property}`).toEqual(ids(reference));
          expect(Reflect.get(node, property)).toBe(actual);
        } else {
          expect((actual as AstNode | undefined)?.index, `${name}:${index}.${property}`).toBe(reference?.index);
        }
      }
      const actualChildren: number[] = [];
      const expectedChildren: number[] = [];
      node.forEachChild((child) => { actualChildren.push(child.index); return 0; });
      expected.forEachChild((child) => { expectedChildren.push((child as OracleNode).index); return 0; });
      expect(actualChildren).toEqual(expectedChildren);
      const actualLists: number[][] = [];
      const expectedLists: number[][] = [];
      node.forEachChild(() => 0, (list) => { actualLists.push(list.map((n) => n.index)); return 0; });
      expected.forEachChild(() => 0, (list) => { expectedLists.push(list.map((n) => (n as OracleNode).index)); return 0; });
      expect(actualLists).toEqual(expectedLists);
      expect(node.forEachChild((child) => child.index)).toBe(expected.forEachChild((child) => (child as OracleNode).index));
    }
  });
  test(`source metadata and line mapping match TypeScript: ${name}`, () => {
    const { file, oracle } = decoded.get(name)!;
    for (const property of ["fileName", "path", "languageVariant", "scriptKind", "isDeclarationFile", "referencedFiles", "typeReferenceDirectives", "libReferenceDirectives", "ambientModuleNames"]) {
      expect(Reflect.get(file.root, property), property).toEqual(Reflect.get(oracle, property));
    }
    expect(ids(file.root.imports)).toEqual(ids(oracle.imports));
    expect(ids(file.root.moduleAugmentations)).toEqual(ids(oracle.moduleAugmentations));
    const actualIndicator = file.root.externalModuleIndicator;
    const expectedIndicator = oracle.externalModuleIndicator;
    expect(typeof actualIndicator === "object" ? actualIndicator.index : actualIndicator).toBe(typeof expectedIndicator === "object" ? (expectedIndicator as OracleNode).index : expectedIndicator);
    expect(file.root.getLineStarts()).toEqual(oracle.getLineStarts());
    for (let position = 0; position <= oracle.text.length; position++) {
      expect(file.root.getLineAndCharacterOfPosition(position)).toEqual(oracle.getLineAndCharacterOfPosition(position));
    }
    for (let line = 0; line < oracle.getLineStarts().length; line++) {
      expect(file.root.getPositionOfLineAndCharacter(line, 1)).toBe(oracle.getPositionOfLineAndCharacter(line, 1));
    }
  });
}

test("checker handles reject cross-file, wrong-kind and nil identities", () => {
  const { file } = decoded.get("main.ts")!;
  expect(() => file.resolve(`1.${AstKind.Identifier}.${file.root.path}`)).toThrow("kind");
  expect(() => file.resolve(`1.${AstKind.SourceFile}.${file.root.path}.other`)).toThrow("another source file");
  expect(() => file.resolve(`0.${AstKind.SourceFile}.${file.root.path}`)).toThrow("nil");
});

test("a source view requires a source-file root", () => {
  const bytes = decoded.get("main.ts")!.bytes.slice();
  const words = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nodes = words.getUint32(HEADER_OFFSET_NODES, true);
  words.setUint32(nodes + NODE_LEN, AstKind.Identifier, true);
  expect(() => new AstFile(bytes).sourceFile).toThrow("expected a source file root");
  expect(decoded.get("empty.ts")!.file.root.statements).toEqual([]);
});
