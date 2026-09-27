import { readFileSync } from "node:fs";
import type { IrModule } from "../../../packages/compiler/src/ir/ir.js";
import { validateModule } from "../../../packages/compiler/src/ir/validate.js";

// Probe validation independently of the serializer's reviver boundary.
const mod = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as IrModule;
console.log(JSON.stringify(validateModule(mod)));
