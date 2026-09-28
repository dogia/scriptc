import { Ts7SourceParser, type Ts7SourceKind } from "./ts7/source-parser.js";
import { Ts7Host, type Ts7ApiFactory, type Ts7HostOptions } from "./ts7/program-host.js";
import { NpmFetchAnalyzer, type FetchAnalysisModule } from "./npm-fetch-analysis.js";
import { rewriteBundlerCjsWithParser } from "./npm-static-rewrite-host.js";
import { isBundlerCjsCandidate } from "./npm-static-rewrite-syntax.js";
import * as syntax from "./npm-static-declaration-syntax.js";
import type { SourceFile } from "./ts7/ast-types.js";

/** Own the syntax and semantic services for a compiler client. The supplied
 * connection factory is the only process boundary; parsing, projection and
 * filesystem resolution use the same implementation in native and Node
 * clients. Program hosts belong to the caller that creates them. */
export class FrontendServices {
  private parser: Ts7SourceParser | undefined;
  private readonly fetchAnalyzer: NpmFetchAnalyzer;
  private closed = false;

  constructor(private readonly createApi: Ts7ApiFactory, private readonly cwd = process.cwd()) {
    this.fetchAnalyzer = new NpmFetchAnalyzer((options) => createApi({ ...options, collectTiming: false }), cwd);
  }

  private ensureOpen(): void { if (this.closed) throw new Error("frontend services are closed"); }
  private sourceParser(): Ts7SourceParser {
    this.ensureOpen();
    return this.parser ??= new Ts7SourceParser((options) => this.createApi({ ...options, collectTiming: false }), this.cwd);
  }
  parse(path: string, source: string, kind: Ts7SourceKind): SourceFile { return this.sourceParser().parse(path, source, kind); }
  createProgramHost(options?: Ts7HostOptions): Ts7Host {
    this.ensureOpen();
    return new Ts7Host(this.createApi, { ...options, cwd: options?.cwd ?? this.cwd });
  }
  globalFetchModules(modules: readonly FetchAnalysisModule[]): ReadonlySet<string> {
    this.ensureOpen();
    return this.fetchAnalyzer.analyze(modules);
  }
  rewriteCjs(source: string, path: string): string | { degrade: string } | null {
    this.ensureOpen();
    if (!isBundlerCjsCandidate(source)) return null;
    return rewriteBundlerCjsWithParser(this.sourceParser(), source, path);
  }
  nullableClassFields(path: string, source: string): syntax.NpmStaticOverloadRewrite | null {
    return syntax.applyNpmStaticNullableClassFields(this.parse(path, source, "js"), source);
  }
  findReturnWidening(path: string, source: string): syntax.NpmStaticOverloadRewrite | null {
    return syntax.applyNpmStaticFindReturnWidening(this.parse(path, source, "js"), source);
  }
  declarationProperties(path: string, source: string, declarations: syntax.NpmStaticDeclarationProperties): syntax.NpmStaticOverloadRewrite | null {
    this.ensureOpen();
    if (declarations.size === 0) return null;
    return syntax.applyNpmStaticDeclarationProperties(this.parse(path, source, "js"), source, declarations);
  }
  declarationOverloads(path: string, source: string, declarations: syntax.NpmStaticDeclarationOverloads): syntax.NpmStaticOverloadRewrite | null {
    this.ensureOpen();
    if (declarations.size === 0) return null;
    return syntax.applyNpmStaticDeclarationOverloads(this.parse(path, source, "js"), source, declarations);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    const parser = this.parser;
    this.parser = undefined;
    try { this.fetchAnalyzer.close(); }
    finally { parser?.close(); }
  }
}
