import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Ts7ConfigData as ConfigResponse } from "./session-schema.generated.js";
import type { Ts7TimingInfo as TimingInfo } from "./session-timing.js";
import { Ts7RpcClient } from "./rpc-client.js";
import { registerTs7FileSystem, TS7_FILE_SYSTEM_CALLBACKS, type Ts7FileSystem } from "./rpc-filesystem.js";
import { spawnTs7Wire } from "./rpc-process.js";
import { Ts7Session, type Ts7SessionSnapshot as Snapshot, type Ts7Update } from "./session.js";

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve("typescript/package.json"));
const { default: getExePath } = require(join(packageRoot, "lib/getExePath.js")) as { default: () => string };

/** Platform-package discovery and process creation remain at the host
 * boundary. The session itself uses no SDK implementation or Node process. */
export function ts7Executable(): string { return getExePath(); }

export class Ts7Api {
  private readonly session: Ts7Session;

  constructor(options: { cwd: string; fs: Ts7FileSystem; collectTiming?: boolean }) {
    const timing = options.collectTiming ?? false;
    const args = ["--api", "--cwd", options.cwd, `--callbacks=${TS7_FILE_SYSTEM_CALLBACKS}`];
    if (timing) args.push("--timing");
    const rpc = new Ts7RpcClient(spawnTs7Wire(ts7Executable(), args));
    registerTs7FileSystem(rpc, options.fs);
    this.session = new Ts7Session(rpc, timing);
  }

  parseConfigFile(file: string): ConfigResponse { return this.session.parseConfigFile(file); }
  updateSnapshot(params: Ts7Update): Snapshot {
    return this.session.updateSnapshot(params);
  }
  getTimingInfo(): TimingInfo { return this.session.getTimingInfo(); }
  close(): void { this.session.close(); }
}
