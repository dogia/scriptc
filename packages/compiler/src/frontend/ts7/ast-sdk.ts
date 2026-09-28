/** Transitional SDK boundary. The AST itself is the same concrete model
 * used by the native client. The SDK still owns Type/Symbol/Signature
 * registries, diagnostics, and snapshots; node-bearing queries below send
 * our handles directly, without manufacturing SDK RemoteNode objects. */
import { Checker, NodeHandle, Program } from "typescript/unstable/sync";
import type { DocumentIdentifier, DocumentPosition, Project, ReferencedSymbolEntry, Signature, SignatureUsage, Symbol as TsSymbol, Type } from "typescript/unstable/sync";
import { resolveFileName } from "typescript/unstable/proto";
import type { SignatureResponse, SymbolResponse, TypeResponse } from "typescript/unstable/proto";
import type { Node, Path, SourceFile, TypeNode } from "typescript/unstable/ast";
import type { NodeBuilderFlags, SymbolFlags, SyntaxKind } from "./enums.js";
import { AstFile, AstNode } from "./ast-node.js";

type SdkClient = ConstructorParameters<typeof Checker>[2];
type Registry = ConstructorParameters<typeof Checker>[3];
type Cache = ConstructorParameters<typeof Program>[3];
type CanonicalPath = (fileName: string) => Path;

export function astNodeId(node: Node): string {
  if (!(node instanceof AstNode)) throw new Error("TypeScript query requires a scriptc AST node");
  return node.id;
}

function decode(bytes: Uint8Array, timing?: ReturnType<SdkClient["getTimingCollector"]>): AstFile {
  return new AstFile(bytes, (nodes, pos, end) => {
    // The SDK's NodeArray interface adds properties to an ordinary array.
    // Keep this JavaScript surface adaptation outside the native AST model.
    Object.assign(nodes, { pos, end, transformFlags: 0 });
  }, timing === undefined ? undefined : () => { timing.recordMaterialization(); });
}

class NativeAstProgram extends Program {
  constructor(
    private readonly astSnapshot: number,
    private readonly astProject: Project,
    private readonly astClient: SdkClient,
    private readonly astCache: Cache,
    private readonly astPath: CanonicalPath,
  ) { super(astSnapshot, astProject, astClient, astCache, astPath); }

  override getSourceFile(file: DocumentIdentifier): SourceFile | undefined {
    const path = this.astPath(resolveFileName(file));
    const retained = this.astCache.getRetained(path, this.astSnapshot, this.astProject.id);
    if (retained !== undefined) return retained;
    const bytes = this.astClient.apiRequestBinary("getSourceFile", { snapshot: this.astSnapshot, project: this.astProject.id, file });
    if (bytes === undefined) return undefined;
    const ast = decode(bytes, this.astClient.getTimingCollector());
    this.astClient.getTimingCollector()?.recordSourceFileFetched(Math.max(0, ast.wire.nodeCount - 2));
    // The frontend keeps the upstream discriminated interfaces until its
    // type layer moves to nominal native refinements. This is the one
    // structural boundary; all references point at the same AstNode objects.
    return this.astCache.set(path, ast.root as unknown as SourceFile, ast.wire.parseOptionsKey, ast.wire.contentHash, this.astSnapshot, this.astProject.id);
  }
}

class NativeAstChecker extends Checker {
  constructor(
    private readonly astSnapshot: number,
    private readonly astProject: Project,
    private readonly astClient: SdkClient,
    private readonly astRegistry: Registry,
  ) { super(astSnapshot, astProject, astClient, astRegistry); }

  private request<T>(method: string, params: object): T {
    return this.astClient.apiRequest<T>(method, { snapshot: this.astSnapshot, project: this.astProject.id, ...params });
  }
  private nodeType(method: string, node: Node): Type | undefined {
    const data = this.request<TypeResponse | null>(method, { location: astNodeId(node) });
    return data === null ? undefined : this.astRegistry.getOrCreateType(data);
  }
  private nodeSymbol(method: string, node: Node): TsSymbol | undefined {
    const data = this.request<SymbolResponse | null>(method, { location: astNodeId(node) });
    return data === null ? undefined : this.astRegistry.getOrCreateSymbol(data);
  }
  private nodeSignature(method: string, node: Node): Signature | undefined {
    const data = this.request<SignatureResponse | null>(method, { location: astNodeId(node) });
    return data === null ? undefined : this.astRegistry.getOrCreateSignature(data);
  }

  override getSymbolAtLocation(node: Node): TsSymbol | undefined;
  override getSymbolAtLocation(nodes: readonly Node[]): (TsSymbol | undefined)[];
  override getSymbolAtLocation(input: Node | readonly Node[]): TsSymbol | undefined | (TsSymbol | undefined)[] {
    if (!Array.isArray(input)) return this.nodeSymbol("getSymbolAtLocation", input as Node);
    const data = this.request<(SymbolResponse | null)[]>("getSymbolsAtLocations", { locations: input.map(astNodeId) });
    return data.map((value) => value === null ? undefined : this.astRegistry.getOrCreateSymbol(value));
  }
  override getTypeAtLocation(node: Node): Type | undefined;
  override getTypeAtLocation(nodes: readonly Node[]): (Type | undefined)[];
  override getTypeAtLocation(input: Node | readonly Node[]): Type | undefined | (Type | undefined)[] {
    if (!Array.isArray(input)) return this.nodeType("getTypeAtLocation", input as Node);
    const data = this.request<(TypeResponse | null)[]>("getTypeAtLocations", { locations: input.map(astNodeId) });
    return data.map((value) => value === null ? undefined : this.astRegistry.getOrCreateType(value));
  }
  override getResolvedSignature(node: Node): Signature | undefined { return this.nodeSignature("getResolvedSignature", node); }
  override getSignatureFromDeclaration(node: Node): Signature | undefined { return this.nodeSignature("getSignatureFromDeclaration", node); }
  override getContextualType(node: Node): Type | undefined { return this.nodeType("getContextualType", node); }
  override getTypeFromTypeNode(node: Node): Type | undefined { return this.nodeType("getTypeFromTypeNode", node); }
  override getShorthandAssignmentValueSymbol(node: Node): TsSymbol | undefined { return this.nodeSymbol("getShorthandAssignmentValueSymbol", node); }
  override getExportSpecifierLocalTargetSymbol(node: Node): TsSymbol | undefined { return this.nodeSymbol("getExportSpecifierLocalTargetSymbol", node); }
  override getConstantValue(node: Node): string | number | undefined {
    return this.request<string | number | null>("getConstantValue", { location: astNodeId(node) }) ?? undefined;
  }
  override isContextSensitive(node: Node): boolean {
    return this.request<boolean>("isContextSensitive", { location: astNodeId(node) });
  }
  override getTypeOfSymbolAtLocation(symbol: TsSymbol, location: Node): Type {
    const data = this.request<TypeResponse | null>("getTypeOfSymbolAtLocation", { symbol: symbol.id, location: astNodeId(location) });
    if (data === null) throw new Error(`getTypeOfSymbolAtLocation returned no type for symbol ${symbol.id}`);
    return this.astRegistry.getOrCreateType(data);
  }
  override typeToString(type: Type, enclosingDeclaration?: Node, flags?: number): string {
    return this.request<string>("typeToString", { type: type.id, location: enclosingDeclaration === undefined ? undefined : astNodeId(enclosingDeclaration), flags });
  }
  override resolveName(name: string, meaning: SymbolFlags, location?: Node | DocumentPosition, excludeGlobals?: boolean): TsSymbol | undefined {
    const node = location !== undefined && "kind" in location ? location : undefined;
    const position = location !== undefined && "document" in location ? location : undefined;
    const data = this.request<SymbolResponse | null>("resolveName", { name, meaning, location: node === undefined ? undefined : astNodeId(node), file: position?.document, position: position?.position, excludeGlobals });
    return data === null ? undefined : this.astRegistry.getOrCreateSymbol(data);
  }
  override getReferencedSymbolsForNode(node: Node, position: number): ReferencedSymbolEntry[] {
    const data = this.request<{ definition: string; symbol?: SymbolResponse; references?: string[] }[] | null>("getReferencedSymbolsForNode", { node: astNodeId(node), position });
    return (data ?? []).map((entry) => ({
      definition: new NodeHandle(entry.definition, this.astProject),
      symbol: entry.symbol === undefined ? undefined : this.astRegistry.getOrCreateSymbol(entry.symbol),
      references: (entry.references ?? []).map((handle) => new NodeHandle(handle, this.astProject)),
    }));
  }
  override getSignatureUsage(signatureDecl: Node): SignatureUsage[] {
    const data = this.request<{ name: string; call?: string }[] | null>("getSignatureUsages", { signatureDecl: astNodeId(signatureDecl) });
    return (data ?? []).map((entry) => ({ name: new NodeHandle(entry.name, this.astProject), call: entry.call === undefined ? undefined : new NodeHandle(entry.call, this.astProject) }));
  }
  override typeToTypeNode(type: Type, enclosingDeclaration?: Node, flags?: number): TypeNode | undefined {
    const bytes = this.astClient.apiRequestBinary("typeToTypeNode", { snapshot: this.astSnapshot, project: this.astProject.id, type: type.id, location: enclosingDeclaration === undefined ? undefined : astNodeId(enclosingDeclaration), flags });
    return bytes === undefined ? undefined : decode(bytes).root as unknown as TypeNode;
  }
  override signatureToSignatureDeclaration(signature: Signature, kind: SyntaxKind, enclosingDeclaration?: Node, flags?: NodeBuilderFlags): Node | undefined {
    const bytes = this.astClient.apiRequestBinary("signatureToSignatureDeclaration", { snapshot: this.astSnapshot, project: this.astProject.id, signature: signature.id, kind, location: enclosingDeclaration === undefined ? undefined : astNodeId(enclosingDeclaration), flags });
    return bytes === undefined ? undefined : decode(bytes).root as unknown as Node;
  }
}

/** Wire the AST boundary before publishing a new snapshot. The registry's
 * canonical Project object remains the same, so declaration handles resolve
 * through this program and return the exact nodes used by frontend walks. */
export function installNativeAst(snapshot: number, project: Project, client: SdkClient, cache: Cache, canonical: CanonicalPath): void {
  const registry = (project.checker as unknown as { objectRegistry: Registry }).objectRegistry;
  const target = project as unknown as { program: Program; checker: Checker };
  target.program = new NativeAstProgram(snapshot, project, client, cache, canonical);
  target.checker = new NativeAstChecker(snapshot, project, client, registry);
}
