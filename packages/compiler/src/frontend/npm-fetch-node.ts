import { NpmFetchAnalyzer, type FetchAnalysisModule } from "./npm-fetch-analysis.js";
import { Ts7Api } from "./ts7/rpc-api.js";

export function embeddedModulesUsingGlobalFetch(modules: readonly FetchAnalysisModule[]): ReadonlySet<string> {
  const analyzer = new NpmFetchAnalyzer((options) => new Ts7Api(options));
  try { return analyzer.analyze(modules); }
  finally { analyzer.close(); }
}
