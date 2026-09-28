import { readFileSync, writeFileSync } from "node:fs";
import { deserializeModule } from "../../../packages/compiler/src/ir/serialize.js";
import { emitCModule } from "../../../packages/compiler/src/backend/c/c-emitter.js";

// Exercise the production entry point, including scalarization, metadata,
// ownership analysis, helper discovery and complete translation-unit output.
const module = deserializeModule(readFileSync(process.argv[2]!, "utf8"));
const sources = new Map<string, string>();
if (process.argv.length > 4) {
  const inputs = JSON.parse(readFileSync(process.argv[4]!, "utf8")) as { file: string; text: string }[];
  for (const input of inputs) sources.set(input.file, input.text);
}
writeFileSync(process.argv[3]!, emitCModule(module, undefined, { debugSources: sources }));
