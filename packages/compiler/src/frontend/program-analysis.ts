import type { ExportDeclaration, SourceFile, VariableDeclaration } from "./ts7/ast-types.js";

/** Facts owned by one program snapshot. Strong collections are bounded by
 * the program lifecycle, so neither GC finalizers nor native weak handles
 * are needed, and newer snapshots cannot inherit stale package decisions. */
export class ProgramAnalysis {
  readonly createRequireReasons = new Map<VariableDeclaration, string | null>();
  readonly nodeEsmFiles = new Map<SourceFile, boolean>();
  readonly prunedNpmReexports = new Set<ExportDeclaration>();

  clear(): void {
    this.createRequireReasons.clear();
    this.nodeEsmFiles.clear();
    this.prunedNpmReexports.clear();
  }
}
