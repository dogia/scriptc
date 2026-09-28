/* The frontend's ts.* surface uses scriptc's concrete native AST, semantic
 * objects and session lifecycle over the pinned TypeScript 7 protocol. It
 * Lowering modules use a namespace import to retain both values and types:
 *
 *     import * as ts from "./ts7/adapter.js";   // path per file
 *
 * This preserves familiar `ts.name` spellings for guards, enums, helpers,
 * createProgram, Expression, Node, Symbol, and the other frontend types.
 *
 * TWO-WORLD DISCIPLINE. typescript@7.0.2 is the REAL "typescript"
 * dependency; typescript@5.9.3 stays installed under the "typescript5"
 * alias for string-bounded parser/transpile islands only. TypeScript 7.0.2
 * ships no client-side parser or transpileModule equivalent, so the npm,
 * provenance, semantic-source, CJS-lexer, and comptime helpers retain that
 * implementation detail. scripts/test-ts7.mjs owns the exact import
 * allowlist. Nothing may hand a 5.9.3 node, type, symbol, or enum value to
 * this world or back; every island accepts source strings and returns
 * world-neutral facts or rewritten strings:
 *   - Mixing OBJECTS is a compile-time error: every node interface carries
 *     `kind: SyntaxKind` and the two packages declare DISTINCT enums, which
 *     TypeScript treats nominally — a 5.9.3 SourceFile is not assignable
 *     where the adapter takes one, and vice versa (world-check.ts pins this
 *     with @ts-expect-error assertions that pnpm build enforces).
 *   - Mixing ENUM VALUES cannot be fenced by the type system alone (both
 *     erase to number), which is why every enum here is generated from 7's pinned
 *     declarations, checked against its runtime objects, and no new source may import
 *     "typescript5" outside the enforced island allowlist.
 *
 * Census coverage not present here, by design (the survey's MISSING list):
 *   - ts.createSourceFile / ts.preProcessFile — no client-side parser in 7;
 *     the npm.ts edge scan keeps 5.9.3 (island).
 *   - ts.transpileModule — lower-comptime keeps 5.9.3 (island).
 *   - ts.resolveModuleName / ts.resolveTypeReferenceDirective — replaced by
 *     resolve.ts, the one resolver shared by the TypeScript 7 program graph
 *     and lowering.
 *   - ts.readConfigFile / ts.parseJsonConfigFileContent — replaced by
 *     Ts7Host.parseConfigFile (tsgo's own config parser, extends resolved
 *     server-side).
 *   - checker.getAwaitedType — shimmed on CheckerFacade (see checker.ts).
 * (`ts.Types` in the census tsv is a comment-text artifact, not an API.) */

export * from "./enums.js";
export * from "./ast.js";
export * from "./checker.js";
export * from "./program-adapter.js";

/* 5.9.3-name aliases for the program/checker surface. */
export type { CheckerFacade as TypeChecker } from "./checker.js";
export type { Ts7Program as Program } from "./program-adapter.js";

export * from "./semantic-types.js";

/* No default export, deliberately: ESM cannot hang the TYPE side of the
 * census (ts.Expression, ts.Node, ...) off a default binding, so a default
 * would invite the one import form that silently loses the types. The port
 * swap is the namespace import above — same one-line change per file. */
