import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Ts7Api as ConnectedTs7Api } from "./api.js";
import { Ts7RpcClient } from "./rpc-client.js";
import { TS7_FILE_SYSTEM_CALLBACKS, type Ts7FileSystem } from "./rpc-filesystem.js";
import { spawnTs7Wire } from "./rpc-process.js";

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve("typescript/package.json"));
const { default: getExePath } = require(join(packageRoot, "lib/getExePath.js")) as { default: () => string };

/** Platform-package discovery and process creation remain at the host
 * boundary. The session itself uses no SDK implementation or Node process. */
export function ts7Executable(): string { return getExePath(); }

export class Ts7Api extends ConnectedTs7Api {
  constructor(options: { cwd: string; fs: Ts7FileSystem; collectTiming?: boolean }) {
    const timing = options.collectTiming ?? false;
    const args = ["--api", "--cwd", options.cwd, `--callbacks=${TS7_FILE_SYSTEM_CALLBACKS}`];
    if (timing) args.push("--timing");
    const rpc = new Ts7RpcClient(spawnTs7Wire(ts7Executable(), args));
    super(rpc, options.fs, timing);
  }
}
