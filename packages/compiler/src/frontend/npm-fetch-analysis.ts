import { resolve } from "node:path";
import { Ts7Api } from "./ts7/api.js";
import type { Ts7SourceApiFactory } from "./ts7/source-parser.js";
import { Ts7Paths, tsgoPath } from "./ts7/session-path.js";
import { sourceFilesUsingGlobalFetch } from "./npm-fetch-syntax.js";

export interface FetchAnalysisModule {
  key: string;
  source: string;
  format: "esm" | "cjs" | "json";
}

/** A closed semantic project over the source strings already owned by an
 * embedded module graph. Every call binds a fresh graph: no AST, symbol or
 * filesystem overlay survives disposal, including after a failed query. */
export class NpmFetchAnalyzer {
  private closed = false;

  constructor(private readonly createApi: Ts7SourceApiFactory, private readonly cwd = process.cwd()) {}

  analyze(modules: readonly FetchAnalysisModule[]): ReadonlySet<string> {
    if (this.closed) throw new Error("npm fetch analyzer is closed");
    const paths = new Ts7Paths(tsgoPath(resolve(this.cwd)), process.platform !== "win32");
    const files = new Map<string, string>();
    const keys = new Map<string, string>();
    for (const mod of modules) {
      if (mod.format === "json") continue;
      // Embedded modules may have virtual loader keys without a JS suffix.
      // Their source is JavaScript regardless of the loader's key spelling.
      const path = paths.canonical(/\.[cm]?js$/.test(mod.key) ? mod.key : mod.key + ".js");
      const existing = keys.get(path);
      if (existing !== undefined && existing !== mod.key) throw new Error(`npm module keys share a TypeScript path: ${existing}, ${mod.key}`);
      files.set(path, mod.source);
      keys.set(path, mod.key);
    }
    if (files.size === 0) return new Set<string>();
    const roots = [...files.keys()];
    let config = paths.canonical("__scriptc-fetch.tsconfig.json");
    while (files.has(config)) config += ".json";
    files.set(config, JSON.stringify({
      compilerOptions: {
        allowJs: true, checkJs: false, noLib: true, types: [], noEmit: true,
        target: "esnext", module: "esnext", moduleDetection: "force",
      },
      files: roots, include: [],
    }));
    let api: Ts7Api | undefined;
    try {
      api = this.createApi({
        cwd: resolve(this.cwd),
        fs: {
          readFile: (path) => files.get(paths.canonical(path)) ?? null,
          fileExists: (path) => files.has(paths.canonical(path)),
          directoryExists: (path) => {
            const dir = paths.canonical(path);
            const prefix = dir.endsWith("/") ? dir : dir + "/";
            for (const file of files.keys()) if (file.startsWith(prefix)) return true;
            return false;
          },
          realpath: (path) => path,
          getAccessibleEntries: () => ({ files: [], directories: [] }),
        },
      });
      const snapshot = api.updateSnapshot({ openProjects: [config] });
      try {
        const project = snapshot.getProject(config);
        if (project === undefined) throw new Error("could not bind embedded npm module graph");
        const sources = roots.map((path) => {
          const file = project.program.getSourceFile(path);
          if (file === undefined) throw new Error(`could not bind npm module ${keys.get(path)}`);
          return file;
        });
        const found = new Set<string>();
        for (const file of sourceFilesUsingGlobalFetch(sources, project.checker)) {
          const key = keys.get(paths.canonical(file));
          if (key !== undefined) found.add(key);
        }
        return found;
      } finally { snapshot.dispose(); }
    } finally {
      try { api?.close(); }
      finally { files.clear(); }
    }
  }

  close(): void { this.closed = true; }
}
