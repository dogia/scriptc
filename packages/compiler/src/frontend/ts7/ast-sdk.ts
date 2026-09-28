/** Transitional SDK boundary. The AST itself is the same concrete model
 * used by the native client. The SDK still owns program metadata and
 * snapshots. ASTs, checker queries, and semantic identities are owned here;
 * the casts retain the frontend's existing type-only interface surface. */
import { Program } from "typescript/unstable/sync";
import type { Checker, DocumentIdentifier, Project, Snapshot } from "typescript/unstable/sync";
import { resolveFileName } from "typescript/unstable/proto";
import type { Path, SourceFile } from "typescript/unstable/ast";
import { AstFile, AstNode } from "./ast-node.js";
import { SemanticChecker } from "./semantic-checker.js";
import { SemanticSnapshot, type SemanticTransport } from "./semantic-model.js";

type SdkClient = ConstructorParameters<typeof Checker>[2];
type Cache = ConstructorParameters<typeof Program>[3];
type CanonicalPath = (fileName: string) => Path;

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

/** Install every project before publishing a snapshot: shared symbols may
 * name another project's canonical context on their very first response. */
export function installNativeAst(snapshot: Snapshot, client: SdkClient, cache: Cache, canonical: CanonicalPath, transport: SemanticTransport): () => void {
  const semantic = new SemanticSnapshot(snapshot.id, transport);
  const projects = snapshot.getProjects();
  for (const project of projects) {
    const target = project as unknown as { program: Program; checker: Checker };
    target.program = new NativeAstProgram(snapshot.id, project, client, cache, canonical);
    semantic.addProject(project.id, (path) => {
      const file = project.program.getSourceFile(path);
      if (file === undefined) return undefined;
      if (!(file instanceof AstNode)) throw new Error("TypeScript semantic query requires a scriptc AST");
      return file;
    });
  }
  for (const project of projects) {
    // The frontend's structural Type/Node interfaces are a type-only bridge.
    // No native object is copied, adapted, or inserted in an SDK registry.
    const target = project as unknown as { checker: Checker };
    target.checker = new SemanticChecker(semantic.getProject(project.id)) as unknown as Checker;
  }
  return () => { semantic.dispose(); };
}
