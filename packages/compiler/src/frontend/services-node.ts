import { FrontendServices } from "./services.js";
import { Ts7Api } from "./ts7/rpc-api.js";

export function createNodeFrontendServices(): FrontendServices {
  return new FrontendServices((options) => new Ts7Api(options));
}

let shared: FrontendServices | undefined;
/** Standalone Node utilities share a lazy parser whose transport closes at
 * process exit. Compilation loads create and dispose their own services. */
export function nodeFrontendServices(): FrontendServices { return shared ??= createNodeFrontendServices(); }
