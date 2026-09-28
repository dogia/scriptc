import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The binary AST is an unstable TypeScript protocol. Generate its constants
// from the installed, pinned package; never translate TypeScript 5 numbers.
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(join(root, "packages/compiler/package.json"));
const packageRoot = dirname(require.resolve("typescript/package.json"));
const pinned = JSON.parse(readFileSync(join(root, "packages/compiler/package.json"), "utf8")).dependencies.typescript;
const version = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version;
if (version !== pinned) throw new Error(`Installed TypeScript ${version} differs from pin ${pinned}`);
const protocol = require(join(packageRoot, "dist/api/node/protocol.js"));
const { SyntaxKind } = require(join(packageRoot, "dist/enums/syntaxKind.js"));
const { NodeFlags } = require(join(packageRoot, "dist/enums/nodeFlags.js"));
const { ModifierFlags } = require(join(packageRoot, "dist/enums/modifierFlags.js"));

const lines = [
  `// Generated from typescript@${version} by scripts/generate-ts7-ast-schema.mjs.`,
  "// TypeScript is Copyright Microsoft Corporation, licensed under Apache-2.0.",
  "// Regenerate when changing the TypeScript pin; do not edit by hand.",
  "",
];
for (const [key, value] of Object.entries(protocol)) {
  if (typeof value === "number") lines.push(`export const ${key} = ${value};`);
}
for (const [name, values] of [["AstKind", SyntaxKind], ["AstNodeFlags", NodeFlags], ["AstModifierFlags", ModifierFlags]]) {
  lines.push("", `export const ${name} = {`);
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "number") lines.push(`  ${key}: ${value},`);
  }
  lines.push("} as const;");
}
lines.push("", "/** Child properties in the exact order encoded by tsgo. */", "export function astChildNames(kind: number): string {", "  switch (kind) {");
for (const [kind, names] of Object.entries(protocol.childProperties)) {
  lines.push(`    case ${kind}: return ${JSON.stringify(names.join(","))}; // ${SyntaxKind[kind]}`);
}
lines.push('    default: return "";', "  }", "}", "");
const output = lines.join("\n");
const target = join(root, "packages/compiler/src/frontend/ts7/ast-schema.generated.ts");
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== output) throw new Error("TypeScript AST schema is stale; run node scripts/generate-ts7-ast-schema.mjs");
} else {
  writeFileSync(target, output);
}

// Child names alone cannot distinguish arrays from nodes (attributes and
// children can be either). Read that distinction from the pinned client's
// declarations, and require every wire property to have a declared getter.
const declarations = readFileSync(join(packageRoot, "dist/api/node/node.generated.d.ts"), "utf8");
const names = [...new Set(Object.values(protocol.childProperties).flat())].sort();
const getters = names.map((name) => {
  const match = declarations.match(new RegExp(`get ${name}\\(\\): ([^;]+);`));
  if (!match) throw new Error(`Missing AST child declaration: ${name}`);
  const type = match[1].replaceAll("RemoteNodeList", "AstNode[]").replaceAll("RemoteNode", "AstNode");
  const method = type.includes("AstNode |") && type.includes("AstNode[]") ? "child" : type.includes("AstNode[]") ? "childList" : "childNode";
  return `  get ${name}(): ${type} { return this.${method}(${JSON.stringify(name)}); }`;
});
const nodeTarget = join(root, "packages/compiler/src/frontend/ts7/ast-node.ts");
const before = readFileSync(nodeTarget, "utf8");
if (!before.includes("// BEGIN GENERATED CHILD GETTERS") || !before.includes("// END GENERATED CHILD GETTERS")) throw new Error("Missing AST child getter generation markers");
const after = before.replace(/  \/\/ BEGIN GENERATED CHILD GETTERS[\s\S]*?  \/\/ END GENERATED CHILD GETTERS/, [
  "  // BEGIN GENERATED CHILD GETTERS",
  `  // Generated from typescript@${version}; run scripts/generate-ts7-ast-schema.mjs.`,
  ...getters,
  "  // END GENERATED CHILD GETTERS",
].join("\n"));
if (process.argv.includes("--check")) {
  if (before !== after) throw new Error("TypeScript AST child getters are stale; run node scripts/generate-ts7-ast-schema.mjs");
} else {
  writeFileSync(nodeTarget, after);
}
