import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Snapshot, type TimingInfo } from "typescript/unstable/sync";
import type { ConfigResponse, InitializeResponse, UpdateSnapshotResponse } from "typescript/unstable/proto";
import { Ts7RpcClient } from "./rpc-client.js";
import { registerTs7FileSystem, TS7_FILE_SYSTEM_CALLBACKS, type Ts7FileSystem } from "./rpc-filesystem.js";
import { spawnTs7Wire } from "./rpc-process.js";
import { installNativeAst } from "./ast-sdk.js";

// The pinned SDK still owns snapshots and program metadata.
// These hidden helpers have no public package exports. Derive their types
// from Snapshot's constructor rather than duplicating the SDK's contracts.
// This bridge can go away when those object models also compile statically;
// the protocol and filesystem callback modules have no runtime SDK import.
type SdkClient = ConstructorParameters<typeof Snapshot>[1];
type SdkCache = ConstructorParameters<typeof Snapshot>[2];
type CanonicalPath = ConstructorParameters<typeof Snapshot>[3];
type TimingCollector = NonNullable<ReturnType<SdkClient["getTimingCollector"]>>;
type ServerTiming = { enabled: boolean; totals: { requestCount: number; totalProcessingTimeMs: number }; recentRequests: { method: string; processingTimeMs: number; timestamp: number }[] };

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve("typescript/package.json"));
const { SourceFileCache } = require(join(packageRoot, "dist/api/sourceFileCache.js")) as { SourceFileCache: new () => SdkCache };
const { createGetCanonicalFileName, toPath } = require(join(packageRoot, "dist/api/path.js")) as {
  createGetCanonicalFileName: (caseSensitive: boolean) => (path: string) => string;
  toPath: (file: string, cwd: string, canonical: (path: string) => string) => ReturnType<CanonicalPath>;
};
const { TimingCollector, combineTimingInfo, disabledTimingInfo } = require(join(packageRoot, "dist/api/timing.js")) as {
  TimingCollector: new () => TimingCollector;
  combineTimingInfo: (client: TimingInfo, server: ServerTiming) => TimingInfo;
  disabledTimingInfo: () => TimingInfo;
};
const { default: getExePath } = require(join(packageRoot, "lib/getExePath.js")) as { default: () => string };

/** Resolve from the pinned TypeScript package, including its platform
 * package and Windows long-path handling. Never pick an unrelated PATH tsc. */
export function ts7Executable(): string {
  return getExePath();
}

class SnapshotClient {
  private readonly timing: TimingCollector | undefined;

  constructor(readonly rpc: Ts7RpcClient, collectTiming: boolean) {
    this.timing = collectTiming ? new TimingCollector() : undefined;
  }

  apiRequest<T>(method: string, params: unknown): T {
    const result = this.apiRequestBinary(method, params);
    return (result === undefined ? undefined : JSON.parse(Buffer.from(result).toString("utf8"))) as T;
  }

  apiRequestBinary(method: string, params: unknown): Uint8Array | undefined {
    const result = this.requestEncoded(method, JSON.stringify(params));
    return result.length === 0 ? undefined : result;
  }

  requestEncoded(method: string, json: string): Uint8Array {
    const payload = Buffer.from(json, "utf8");
    const start = performance.now();
    const result = this.rpc.requestBytes(method, payload);
    this.timing?.record({ method, roundTripMs: performance.now() - start, bytesSent: payload.length, bytesReceived: result.length });
    return result;
  }

  getTimingCollector(): TimingCollector | undefined {
    return this.timing;
  }

  getTimingInfo(): TimingInfo {
    if (!this.timing) return disabledTimingInfo();
    const local = this.timing.getInfo();
    const server = JSON.parse(this.rpc.requestText("getServerTiming", "")) as ServerTiming;
    return combineTimingInfo(local, server);
  }
}

/** The API operations scriptc uses, backed by its own synchronous client.
 * Keep upstream Snapshot/Project objects for lifecycle and metadata. ASTs
 * and checker registries use concrete native models. No upstream API
 * or Client instance is constructed, and all requests use Ts7RpcClient. */
export class Ts7Api {
  private readonly client: SnapshotClient;
  private readonly cache = new SourceFileCache();
  private readonly snapshots = new Set<Snapshot>();
  private latest: Snapshot | undefined;
  private canonicalPath: CanonicalPath | undefined;
  private closed = false;

  constructor(options: { cwd: string; fs: Ts7FileSystem; collectTiming?: boolean }) {
    const timing = options.collectTiming ?? false;
    const args = ["--api", "--cwd", options.cwd, `--callbacks=${TS7_FILE_SYSTEM_CALLBACKS}`];
    if (timing) args.push("--timing");
    const rpc = new Ts7RpcClient(spawnTs7Wire(ts7Executable(), args));
    registerTs7FileSystem(rpc, options.fs);
    this.client = new SnapshotClient(rpc, timing);
  }

  private initialize(): CanonicalPath {
    if (this.closed) throw new Error("TypeScript API is closed");
    if (this.canonicalPath === undefined) {
      const data = this.client.apiRequest<InitializeResponse>("initialize", null);
      const canonical = createGetCanonicalFileName(data.useCaseSensitiveFileNames);
      this.canonicalPath = (file) => toPath(file, data.currentDirectory, canonical);
    }
    return this.canonicalPath;
  }

  parseConfigFile(file: string): ConfigResponse {
    this.initialize();
    return this.client.apiRequest<ConfigResponse>("parseConfigFile", { file });
  }

  updateSnapshot(params: { openProjects: string[] }): Snapshot {
    const canonical = this.initialize();
    const data = this.client.apiRequest<UpdateSnapshotResponse>("updateSnapshot", params);
    if (this.latest) {
      this.cache.retainForSnapshot(data.snapshot, this.latest.id, data.changes);
      if (this.latest.isDisposed()) this.cache.releaseSnapshot(this.latest.id);
    }
    // The upstream class's private fields make its Client nominal. Only
    // these three public operations are used by Snapshot and its children.
    const snapshot = new Snapshot(data, this.client as unknown as SdkClient, this.cache, canonical, () => {
      releaseSemantic();
      this.snapshots.delete(snapshot);
      if (snapshot !== this.latest) this.cache.releaseSnapshot(snapshot.id);
    });
    const releaseSemantic = installNativeAst(snapshot, this.client as unknown as SdkClient, this.cache, canonical, {
      text: (method, payload) => {
        const bytes = this.client.requestEncoded(method, payload);
        return bytes.length === 0 ? "null" : Buffer.from(bytes).toString("utf8");
      },
      binary: (method, payload) => this.client.requestEncoded(method, payload),
    });
    this.latest = snapshot;
    this.snapshots.add(snapshot);
    return snapshot;
  }

  getTimingInfo(): TimingInfo {
    if (this.closed) throw new Error("TypeScript API is closed");
    return this.client.getTimingInfo();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      for (const snapshot of this.snapshots) snapshot.dispose();
    } finally {
      this.snapshots.clear();
      this.latest = undefined;
      this.cache.clear();
      this.client.rpc.close();
    }
  }
}
