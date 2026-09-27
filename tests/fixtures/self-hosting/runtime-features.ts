import { readFileSync } from "node:fs";
import { deserializeModule } from "../../../packages/compiler/src/ir/serialize.js";
import {
  moduleUsesRegex, moduleUsesCopying, moduleUsesLegacyTextDecoder,
  moduleUsesFileHandle, moduleUsesFetch, moduleUsesProcessEvents,
  moduleUsesEmitter, moduleUsesStream, moduleUsesZlib, moduleUsesDc,
  moduleUsesAssert, moduleUsesDynInvoke, moduleUsesDynAsync,
  moduleUsesInspect, moduleUsesChildProcess, moduleUsesNet,
  moduleUsesSymbol, moduleUsesBigInt, moduleUsesSearchParams, moduleUsesQs,
  moduleUsesParseArgs, moduleUsesFsWatch, moduleUsesNodeTest,
  moduleUsesDgram, moduleUsesHttpServer, moduleUsesHttp2, moduleUsesTls, moduleUsesTlsCa,
} from "../../../packages/compiler/src/ir/ir.js";

const mod = deserializeModule(readFileSync(process.argv[2]!, "utf8"));
console.log(JSON.stringify({
  regex: moduleUsesRegex(mod), copying: moduleUsesCopying(mod),
  legacyTextDecoder: moduleUsesLegacyTextDecoder(mod), fileHandle: moduleUsesFileHandle(mod),
  fetch: moduleUsesFetch(mod), processEvents: moduleUsesProcessEvents(mod),
  emitter: moduleUsesEmitter(mod), stream: moduleUsesStream(mod),
  zlib: moduleUsesZlib(mod), dc: moduleUsesDc(mod), assert: moduleUsesAssert(mod),
  dynInvoke: moduleUsesDynInvoke(mod), dynAsync: moduleUsesDynAsync(mod),
  inspect: moduleUsesInspect(mod), childProcess: moduleUsesChildProcess(mod), net: moduleUsesNet(mod),
  symbol: moduleUsesSymbol(mod), bigint: moduleUsesBigInt(mod), searchParams: moduleUsesSearchParams(mod),
  qs: moduleUsesQs(mod), parseArgs: moduleUsesParseArgs(mod), fsWatch: moduleUsesFsWatch(mod),
  nodeTest: moduleUsesNodeTest(mod), dgram: moduleUsesDgram(mod), http: moduleUsesHttpServer(mod),
  http2: moduleUsesHttp2(mod), tls: moduleUsesTls(mod), tlsCa: moduleUsesTlsCa(mod),
}));
