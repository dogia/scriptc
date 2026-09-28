import { readSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { Ts7RpcClient } from "../../../packages/compiler/src/frontend/ts7/rpc-client.js";
import { registerTs7FileSystem } from "../../../packages/compiler/src/frontend/ts7/rpc-filesystem.js";
import { Ts7Wire } from "../../../packages/compiler/src/frontend/ts7/rpc-wire.js";

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
let content = 'export const answer = 42;\nexport const greeting = "héllo 🌍";\n';
let reads = 0;
registerTs7FileSystem(client, {
  readFile: (path) => {
    reads++;
    if (path === configPath) return JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, types: [] as string[] },
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
  const semantic = JSON.parse(client.requestText("getSemanticDiagnostics", JSON.stringify(request))) as Diagnostic[];
  check(semantic.length === 0, "valid program diagnostics");
  const type = JSON.parse(client.requestText("getTypeAtPosition", JSON.stringify({ ...request, position: content.indexOf("answer") }))) as TypeInfo;
  const symbol = JSON.parse(client.requestText("getSymbolAtPosition", JSON.stringify({ ...request, position: content.indexOf("answer") }))) as SymbolInfo;
  check(symbol.name === "answer", "checker symbol");
  const typeText = JSON.parse(client.requestText("typeToString", JSON.stringify({ snapshot: snapshot.snapshot, project: project.id, type: type.id }))) as string;
  check(typeText === "42", "checker literal type");

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
    echo: true, binaryAst: true, virtualFiles: true, retainedSnapshot: true, serverErrorRecovery: true, protocolFailures: true,
  }));
} finally {
  client.close();
}
