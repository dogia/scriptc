import { readSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { Ts7RpcClient } from "../../../packages/compiler/src/frontend/ts7/rpc-client.js";
import { registerTs7FileSystem } from "../../../packages/compiler/src/frontend/ts7/rpc-filesystem.js";
import { Ts7Wire } from "../../../packages/compiler/src/frontend/ts7/rpc-wire.js";
import { AstFile, AstNode } from "../../../packages/compiler/src/frontend/ts7/ast-node.js";
import { AstKind, KIND_NODE_LIST, astChildNames } from "../../../packages/compiler/src/frontend/ts7/ast-schema.generated.js";
import { decodeAstString } from "../../../packages/compiler/src/frontend/ts7/ast-bytes.js";

// The harness connects these inherited descriptors straight to native tsgo.
// No JavaScript helper reads, interprets, or relays protocol messages.
const client = new Ts7RpcClient(new Ts7Wire({
  read: (buffer, offset, length) => readSync(3, buffer, offset, length, null),
  write: (buffer, offset, length) => writeSync(4, buffer, offset, length, null),
  close: () => {},
}));

interface Initialization {
  currentDirectory: string;
  useCaseSensitiveFileNames: boolean;
}
interface Config {
  fileNames: string[];
}
interface Snapshot {
  snapshot: number;
  projects: { id: string; configFileName: string; rootFiles: string[] }[];
}
interface TypeInfo {
  id: number;
  flags: number;
}
interface SymbolInfo {
  id: number;
  name: string;
  declarations?: string[];
}
interface Diagnostic {
  code: number;
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// The current native runtime documents replacing lone UTF-16 surrogates.
// Compiler input must never silently pass through that normalization. Keep
// this boundary explicit until native strings can retain every code unit.
function checkSurrogateBoundary(): string {
  const bytes = new Uint8Array([0xed, 0xa0, 0x80, 0xef, 0xbb, 0xbf]);
  try {
    const value = decodeAstString(bytes, 0, bytes.length);
    check(value.length === 2 && value.charCodeAt(0) === 0xd800 && value.charCodeAt(1) === 0xfeff, "lossless surrogate decode");
    return "preserved";
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "TypeScript AST: runtime cannot preserve lone UTF-16 surrogates") throw error;
    return "refused";
  }
}

function checkAst(ast: AstFile, source: string): void {
  check(ast.root.text === source, "decoded source text");
  check(ast.root.getSourceFile() === ast.root, "source identity");
  check(ast.root.statements === ast.root.statements, "stable child list");
  for (let index = 1; index < ast.wire.nodeCount; index++) {
    if (ast.wire.kind(index) === KIND_NODE_LIST) { ast.list(index); continue; }
    const node = ast.node(index);
    check(ast.resolve(node.id) === node, "handle identity");
    check(node.getFullText() === source.substring(node.pos, node.end), "full text span");
    check(node.getText() === source.substring(node.getStart(), node.end), "token text span");
    check(node.getFullWidth() === node.end - node.pos, "full width");
    check(node.getWidth() === node.end - node.getStart(), "token width");
    check(node.getLeadingTriviaWidth() === node.getStart() - node.pos, "trivia width");
    check(node.getFullStart() === node.pos && node.getEnd() === node.end, "span endpoints");
    for (const name of astChildNames(node.kind).split(",")) {
      const child = node.child(name!);
      if (Array.isArray(child)) {
        for (const item of child) check(item.parent === node, "list child parent");
      } else if (child !== undefined) check(child.parent === node, "named child parent");
    }
    const seen: AstNode[] = [];
    node.forEachChild((child) => { seen.push(child); });
    check(node.forEachChild((child) => child.index) === seen[0]?.index, "visitor early return");
    let listElements = 0;
    node.forEachChild(() => {}, (list) => { listElements += list.length; });
    check(listElements <= seen.length, "array visitor");
    for (const doc of node.jsDoc ?? []) check(doc.kind === AstKind.JSDoc, "JSDoc children");
  }
  const lines = ast.root.getLineStarts();
  for (let position = 0; position <= source.length; position++) {
    const location = ast.root.getLineAndCharacterOfPosition(position);
    check(ast.root.getPositionOfLineAndCharacter(location.line, location.character) === position, "UTF16 line round trip");
    check(lines[location.line]! <= position, "line start");
  }
  check(ast.root.referencedFiles.length === 0 && ast.root.typeReferenceDirectives.length === 0 && ast.root.libReferenceDirectives.length === 0, "file references");
  check(ast.root.imports.length === 0 && ast.root.moduleAugmentations.length === 0 && ast.root.ambientModuleNames.length === 0, "structured arrays");
  check(ast.root.externalModuleIndicator !== undefined, "external module");
  check(ast.root.fileName.length > 0 && ast.root.languageVariant === 0 && !ast.root.isDeclarationFile, "source metadata");
}

// Exercise malformed inputs in the native executable too. The callbacks
// deliberately fragment transfers so framing cannot rely on whole reads.
function checkFailures(): void {
  for (const frame of [
    [0x92], [0x93, 7], [0x93, 4, 0xa0], [0x93, 4, 0xc4, 0, 0xc4],
    [0x93, 4, 0xc4, 0, 0xc6, 0xff, 0xff, 0xff, 0xff],
  ]) {
    const bytes = frame!;
    let offset = 0;
    let closes = 0;
    const wire = new Ts7Wire({
      read: (buffer, start, _length) => {
        if (offset === bytes.length) return 0;
        buffer[start] = bytes[offset++]!;
        return 1;
      },
      write: (_buffer, _start, length) => length,
      close: () => { closes++; },
    });
    let failed = false;
    try { wire.read(); } catch { failed = true; }
    check(failed, "malformed frame refused");
    failed = false;
    try { wire.read(); } catch { failed = true; }
    check(failed, "malformed channel stays closed");
    wire.close();
    check(closes === 1, "malformed channel closes once");
  }
  // A successful callback reply may be empty; a throwing callback instead
  // sends kind 3, closes, and leaves the unread outer response untouched.
  for (const throws of [false, true]) {
    const bytes = new Uint8Array([0x93, 6, 0xc4, 1, 120, 0xc4, 0, 0x93, 4, 0xc4, 1, 113, 0xc4, 0]);
    const output: number[] = [];
    let offset = 0;
    let closes = 0;
    const local = new Ts7RpcClient(new Ts7Wire({
      read: (buffer, start, _length) => {
        if (offset === bytes.length) return 0;
        buffer[start] = bytes[offset++]!;
        return 1;
      },
      write: (buffer, start, _length) => { output.push(buffer[start]!); return 1; },
      close: () => { closes++; },
    }));
    local.registerCallback("x", (_payload) => {
      if (throws) throw new Error("callback failed");
      // Reject a nested request before it can put bytes on this stream.
      let nestedFailed = false;
      try { local.requestText("nested", ""); } catch { nestedFailed = true; }
      check(nestedFailed, "native callback reentry refused");
      return "";
    });
    let failed = false;
    try { local.requestText("q", ""); } catch { failed = true; }
    check(failed === throws, "callback failure propagation");
    check(output[8] === (throws ? 3 : 2), "callback reply kind");
    local.close();
    check(closes === 1, "callback channel closes once");
  }
}

checkFailures();

const directory = process.argv[2]!;
const report = process.argv[3]!;
function protocolPath(path: string): string {
  return process.platform === "win32" ? path.split("\\").join("/") : path;
}
const configPath = protocolPath(join(directory, "virtual.tsconfig.json"));
const file = protocolPath(join(directory, "virtual.ts"));
const empty = protocolPath(join(directory, "empty.ts"));
const hidden = protocolPath(join(directory, "hidden.ts"));
const disk = protocolPath(join(directory, "disk.ts"));
let content = 'export const answer = 42;\nexport const greeting = "\\uFEFFhéllo 🌍";\n';
content += '/** Box documentation. */\nexport class Box { readonly value = 2; method(n: number) { return n + this.value; } }\n';
content += 'export const many = [';
for (let index = 0; index < 40; index++) content += `${index},`;
content += '];\nexport const template = `head\\n${answer}tail`;\n';
let reads = 0;
registerTs7FileSystem(client, {
  readFile: (path) => {
    reads++;
    if (path === configPath) return JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, target: "esnext", types: [] as string[] },
      files: [file, empty, hidden, disk],
    });
    if (path === file) return content;
    if (path === empty) return "";
    if (path === hidden) return null;
    return undefined;
  },
  fileExists: (path) => path === file || path === empty || path === configPath ? true : path === hidden ? false : undefined,
  directoryExists: (_path) => undefined,
  realpath: (_path) => undefined,
  getAccessibleEntries: (_path) => undefined,
});

try {
  const initialization = JSON.parse(client.requestText("initialize", "null")) as Initialization;
  check(protocolPath(initialization.currentDirectory) === protocolPath(directory), "server working directory");
  const config = JSON.parse(client.requestText("parseConfigFile", JSON.stringify({ file: configPath }))) as Config;
  check(config.fileNames.includes(file), "virtual config roots");

  // Exercise all binary length encodings, including reads larger than the
  // channel buffer and NUL/non-UTF8 data that must not pass through strings.
  for (const length of [0, 1, 255, 256, 65535, 65536, 140000]) {
    const bytes = new Uint8Array(length!);
    for (let i = 0; i < length; i++) bytes[i] = (i * 31) % 256;
    const echoed = client.requestBytes("echo", bytes);
    check(echoed.length === bytes.length, "echo byte length");
    for (let i = 0; i < length; i++) check(echoed[i] === bytes[i], "echo byte contents");
  }
  check(client.requestText("echo", "\uFEFFhéllo\0🌍") === "\uFEFFhéllo\0🌍", "UTF8 echo");

  const snapshot = JSON.parse(client.requestText("updateSnapshot", JSON.stringify({ openProjects: [configPath] }))) as Snapshot;
  const project = snapshot.projects[0]!;
  check(project.configFileName === configPath, "project identity");
  const request = { snapshot: snapshot.snapshot, project: project.id, file };
  const names = JSON.parse(client.requestText("getSourceFileNames", JSON.stringify(request))) as string[];
  check(names.includes(file) && names.includes(empty) && names.includes(disk), "virtual, empty, and disk files");
  check(!names.includes(hidden), "hidden file remains absent");
  const ast = client.requestBytes("getSourceFile", Buffer.from(JSON.stringify(request)));
  check(ast.length > content.length, "binary AST response");
  const tree = new AstFile(ast);
  checkAst(tree, content);
  const statements = tree.root.statements!;
  check(statements[1]!.declarationList!.declarations![0]!.initializer!.text === "\uFEFFhéllo 🌍", "string BOM retained");
  const box = statements[2]!;
  check(box.getStart(undefined, true) < box.getStart() && box.members!.length === 2, "class JSDoc and members");
  check(box.members![0]!.modifierFlags !== 0, "readonly modifier flag");
  check(statements[3]!.declarationList!.declarations![0]!.initializer!.elements!.length === 40, "long native node list");
  const template = statements[4]!.declarationList!.declarations![0]!.initializer!;
  check(template.head!.text === "head\n" && template.head!.rawText === "head\\n", "cooked and raw template text");
  const semantic = JSON.parse(client.requestText("getSemanticDiagnostics", JSON.stringify(request))) as Diagnostic[];
  check(semantic.length === 0, "valid program diagnostics");
  const type = JSON.parse(client.requestText("getTypeAtPosition", JSON.stringify({ ...request, position: content.indexOf("answer") }))) as TypeInfo;
  const symbol = JSON.parse(client.requestText("getSymbolAtPosition", JSON.stringify({ ...request, position: content.indexOf("answer") }))) as SymbolInfo;
  check(symbol.name === "answer", "checker symbol");
  const typeText = JSON.parse(client.requestText("typeToString", JSON.stringify({ snapshot: snapshot.snapshot, project: project.id, type: type.id }))) as string;
  check(typeText === "42", "checker literal type");
  const declaration = tree.root.statements![0]!.declarationList!.declarations![0]!;
  const identifier = declaration.name!;
  const nodeType = JSON.parse(client.requestText("getTypeAtLocation", JSON.stringify({ snapshot: snapshot.snapshot, project: project.id, location: identifier.id }))) as TypeInfo;
  const nodeSymbol = JSON.parse(client.requestText("getSymbolAtLocation", JSON.stringify({ snapshot: snapshot.snapshot, project: project.id, location: identifier.id }))) as SymbolInfo;
  check(nodeType.id === type.id && nodeSymbol.id === symbol.id, "native AST checker query");
  check(tree.resolve(nodeSymbol.declarations![0]!) === declaration, "checker declaration identity");

  // A server-side refusal completes its request. It must not poison the
  // channel: the frontend's checker panic fence relies on this recovery.
  let refused = false;
  try { client.requestText("scriptcUnknownMethod", "null"); }
  catch { refused = true; }
  check(refused, "server error surfaces");
  check(client.requestText("echo", "after error") === "after error", "server error recovery");

  content = 'export const answer: number = "incorrect";\n';
  const updated = JSON.parse(client.requestText("updateSnapshot", JSON.stringify({ fileChanges: { changed: [file] } }))) as Snapshot;
  const updatedProject = updated.projects[0]!;
  const diagnostics = JSON.parse(client.requestText("getSemanticDiagnostics", JSON.stringify({ snapshot: updated.snapshot, project: updatedProject.id, file }))) as Diagnostic[];
  check(diagnostics.some((diagnostic) => diagnostic.code === 2322), "updated snapshot diagnostics");
  // The original immutable snapshot must remain available after the update.
  const oldDiagnostics = JSON.parse(client.requestText("getSemanticDiagnostics", JSON.stringify(request))) as Diagnostic[];
  check(oldDiagnostics.length === 0, "old snapshot retained");
  client.requestText("release", JSON.stringify({ snapshot: snapshot.snapshot }));
  client.requestText("release", JSON.stringify({ snapshot: updated.snapshot }));
  const timing = client.timing();
  check(timing.requests > 20 && timing.callbacks > 0 && reads > 0, "requests and filesystem callbacks executed");
  writeFileSync(report, JSON.stringify({
    typeText, symbol: symbol.name, diagnostics: diagnostics.map((diagnostic) => diagnostic.code),
    surrogateBoundary: checkSurrogateBoundary(),
    echo: true, binaryAst: true, astIdentity: true, virtualFiles: true, retainedSnapshot: true, serverErrorRecovery: true, protocolFailures: true,
  }));
} finally {
  client.close();
}
