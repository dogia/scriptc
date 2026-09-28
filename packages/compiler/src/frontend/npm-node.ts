/** Standalone Node helpers. Compiler clients pass their owned services to
 * the core graph builder so its parsing work follows the load lifecycle. */
import { NpmGraphBuilder as CoreGraphBuilder, type NpmGraphHost } from "./npm.js";
import { nodeFrontendServices } from "./services-node.js";
import { moduleSpecifiersOfFile, type ModuleSpecifiers } from "./module-syntax.js";
export * from "./npm.js";
export { embeddedModulesUsingGlobalFetch } from "./npm-fetch-node.js";

export class NpmGraphBuilder extends CoreGraphBuilder {
  constructor(host?: NpmGraphHost) { super(nodeFrontendServices(), host); }
}

export function moduleSpecifiersOf(source: string, fileName: string): ModuleSpecifiers {
  return moduleSpecifiersOfFile(nodeFrontendServices().parse(fileName, source, "js"));
}
