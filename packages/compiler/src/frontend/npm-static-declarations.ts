/** Node entry for declaration projection. Syntax passes are shared with
 * the native compiler; this module only obtains their source ASTs. */
import * as syntax from "./npm-static-declaration-syntax.js";
import { parseSourceFile } from "./ts7/source-parser-node.js";
import type { NpmStaticDeclarationOverloads, NpmStaticDeclarationProperties, NpmStaticOverloadRewrite, NpmStaticRuntimeClassTarget } from "./npm-static-declaration-syntax.js";
export type { NpmStaticOverloadParameter, NpmStaticOverloadSignature, NpmStaticDeclarationOverloads, NpmStaticDeclarationProperties, NpmStaticOverloadRewrite, NpmStaticRuntimeClassTarget } from "./npm-static-declaration-syntax.js";

export function applyNpmStaticNullableClassFields(path: string, source: string): NpmStaticOverloadRewrite | null {
  return syntax.applyNpmStaticNullableClassFields(parseSourceFile(path, source, "js"), source);
}

export function applyNpmStaticFindReturnWidening(path: string, source: string): NpmStaticOverloadRewrite | null {
  return syntax.applyNpmStaticFindReturnWidening(parseSourceFile(path, source, "js"), source);
}

export function parseNpmStaticDeclarationOverloads(path: string, source: string): NpmStaticDeclarationOverloads {
  return syntax.parseNpmStaticDeclarationOverloads(parseSourceFile(path, source, "ts"));
}

export function parseNpmStaticDeclarationProperties(path: string, source: string): NpmStaticDeclarationProperties {
  return syntax.parseNpmStaticDeclarationProperties(parseSourceFile(path, source, "ts"));
}

export function npmStaticDeclarationReexports(path: string, source: string): readonly string[] {
  return syntax.npmStaticDeclarationReexports(parseSourceFile(path, source, "ts"));
}

export function npmStaticRuntimeClassTargets(path: string, source: string, classNames: ReadonlySet<string>): ReadonlyMap<string, NpmStaticRuntimeClassTarget> {
  return syntax.npmStaticRuntimeClassTargets(parseSourceFile(path, source, "js"), source, classNames);
}

export function applyNpmStaticDeclarationOverloads(path: string, source: string, declarations: NpmStaticDeclarationOverloads): NpmStaticOverloadRewrite | null {
  if (declarations.size === 0) return null;
  return syntax.applyNpmStaticDeclarationOverloads(parseSourceFile(path, source, "js"), source, declarations);
}

export function applyNpmStaticDeclarationProperties(path: string, source: string, declarations: NpmStaticDeclarationProperties): NpmStaticOverloadRewrite | null {
  if (declarations.size === 0) return null;
  return syntax.applyNpmStaticDeclarationProperties(parseSourceFile(path, source, "js"), source, declarations);
}
