import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Snapshot, TimingInfo } from "typescript/unstable/sync";
import type { ConfigResponse } from "typescript/unstable/proto";
import { AstNode } from "./ast-node.js";
import { Ts7RpcClient } from "./rpc-client.js";
import { registerTs7FileSystem, TS7_FILE_SYSTEM_CALLBACKS, type Ts7FileSystem } from "./rpc-filesystem.js";
import { spawnTs7Wire } from "./rpc-process.js";
import { Ts7Session, type Ts7Update } from "./session.js";

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve("typescript/package.json"));
const { default: getExePath } = require(join(packageRoot, "lib/getExePath.js")) as { default: () => string };

/** Platform-package discovery and process creation remain at the host
 * boundary. The session itself uses no SDK implementation or Node process. */
export function ts7Executable(): string { return getExePath(); }

function listMetadata(nodes: AstNode[], pos: number, end: number): void {
  // Legacy frontend NodeArray interfaces attach properties to JS arrays.
  // Native clients consume AstNode arrays directly and omit this adapter.
  Object.assign(nodes, { pos, end, transformFlags: 0 });
}

export class Ts7Api {
  private readonly session: Ts7Session;

  constructor(options: { cwd: string; fs: Ts7FileSystem; collectTiming?: boolean }) {
    const timing = options.collectTiming ?? false;
    const args = ["--api", "--cwd", options.cwd, `--callbacks=${TS7_FILE_SYSTEM_CALLBACKS}`];
    if (timing) args.push("--timing");
    const rpc = new Ts7RpcClient(spawnTs7Wire(ts7Executable(), args));
    registerTs7FileSystem(rpc, options.fs);
    this.session = new Ts7Session(rpc, timing, listMetadata);
  }

  parseConfigFile(file: string): ConfigResponse { return this.session.parseConfigFile(file); }
  updateSnapshot(params: Ts7Update): Snapshot {
    // Existing frontend discriminated interfaces remain a type-only bridge;
    // every object behind them now belongs to the statically compiled client.
    return this.session.updateSnapshot(params) as unknown as Snapshot;
  }
  getTimingInfo(): TimingInfo { return this.session.getTimingInfo(); }
  close(): void { this.session.close(); }
}
