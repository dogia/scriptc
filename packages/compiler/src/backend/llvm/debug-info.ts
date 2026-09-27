import { basename, dirname } from "node:path";
import type { IrFunction, SrcLoc } from "../../ir/ir.js";
import { SourceLocations } from "../source-locations.js";
import { mangleFunction } from "../mangle.js";

/** LLVM metadata strings use UTF-8 byte escapes, including for paths. */
function quoted(text: string): string {
  return '"' + [...Buffer.from(text)].map((byte) =>
    byte >= 0x20 && byte < 0x7f && byte !== 0x22 && byte !== 0x5c
      ? String.fromCharCode(byte)
      : `\\${byte.toString(16).padStart(2, "0").toUpperCase()}`,
  ).join("") + '"';
}

/** Source breakpoints and stack frames; no claim about TypeScript locals. */
export class LlvmDebugInfo {
  private readonly nodes: string[] = [];
  private readonly files = new Map<string, string>();
  private readonly locations = new Map<string, string>();
  private readonly scopes = new Map<string, string>();
  private readonly source: SourceLocations;
  private readonly unit: string;
  private readonly signature: string;
  private readonly version: string;
  private readonly dwarf: string;

  constructor(sourceFile: string, sources: ReadonlyMap<string, string>) {
    this.source = new SourceLocations(sources);
    const file = this.file(sourceFile);
    this.unit = this.add(`distinct !DICompileUnit(language: DW_LANG_C11, file: ${file}, producer: "scriptc", isOptimized: false, runtimeVersion: 0, emissionKind: LineTablesOnly)`);
    this.signature = this.add(`!DISubroutineType(types: ${this.add("!{}")})`);
    this.version = this.add('!{i32 2, !"Debug Info Version", i32 3}');
    this.dwarf = this.add('!{i32 2, !"Dwarf Version", i32 4}');
  }

  private add(node: string): string {
    const id = `!${this.nodes.length}`;
    this.nodes.push(`${id} = ${node}`);
    return id;
  }

  private file(path: string): string {
    let file = this.files.get(path);
    if (file === undefined) {
      file = this.add(`!DIFile(filename: ${quoted(basename(path))}, directory: ${quoted(dirname(path))})`);
      this.files.set(path, file);
    }
    return file;
  }

  function(fn: IrFunction): string | null {
    const pos = this.source.position(fn.loc);
    if (pos === null) return null;
    const file = this.file(pos.file);
    return this.add(`distinct !DISubprogram(name: ${quoted(fn.name)}, linkageName: ${quoted(mangleFunction(fn.name))}, scope: ${file}, file: ${file}, line: ${pos.line}, type: ${this.signature}, scopeLine: ${pos.line}, spFlags: DISPFlagLocalToUnit | DISPFlagDefinition, unit: ${this.unit})`);
  }

  location(loc: SrcLoc, fn: string | null): string | null {
    if (fn === null) return null;
    const pos = this.source.position(loc);
    if (pos === null) return null;
    // Initializers and compiler-generated entry wrappers can span files.
    const scopeKey = `${fn}:${pos.file}`;
    let scope = this.scopes.get(scopeKey);
    if (scope === undefined) {
      scope = this.add(`!DILexicalBlockFile(scope: ${fn}, file: ${this.file(pos.file)}, discriminator: 0)`);
      this.scopes.set(scopeKey, scope);
    }
    const key = `${scope}:${pos.line}:${pos.column}`;
    let id = this.locations.get(key);
    if (id === undefined) {
      id = this.add(`!DILocation(line: ${pos.line}, column: ${Math.min(pos.column, 65535)}, scope: ${scope})`);
      this.locations.set(key, id);
    }
    return id;
  }

  render(): string {
    return [`!llvm.dbg.cu = !{${this.unit}}`, `!llvm.module.flags = !{${this.version}, ${this.dwarf}}`, ...this.nodes].join("\n");
  }
}
