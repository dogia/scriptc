// Generated from typescript@7.0.2 by scripts/generate-ts7-ast-schema.mjs.
// TypeScript is Copyright Microsoft Corporation, licensed under Apache-2.0.
// Regenerate when changing the TypeScript pin; do not edit by hand.

export const HEADER_OFFSET_EXTENDED_DATA = 32;
export const HEADER_OFFSET_HASH_HI0 = 12;
export const HEADER_OFFSET_HASH_HI1 = 16;
export const HEADER_OFFSET_HASH_LO0 = 4;
export const HEADER_OFFSET_HASH_LO1 = 8;
export const HEADER_OFFSET_METADATA = 0;
export const HEADER_OFFSET_NODES = 40;
export const HEADER_OFFSET_PARSE_OPTIONS = 20;
export const HEADER_OFFSET_STRING_TABLE = 28;
export const HEADER_OFFSET_STRING_TABLE_OFFSETS = 24;
export const HEADER_OFFSET_STRUCTURED_DATA = 36;
export const HEADER_SIZE = 44;
export const KIND_NODE_LIST = 4294967295;
export const NODE_DATA_TYPE_CHILDREN = 0;
export const NODE_DATA_TYPE_EXTENDED = 2147483648;
export const NODE_DATA_TYPE_STRING = 1073741824;
export const NODE_EXTENDED_DATA_MASK = 16777215;
export const NODE_LEN = 28;
export const NODE_OFFSET_DATA = 20;
export const NODE_OFFSET_END = 8;
export const NODE_OFFSET_FLAGS = 24;
export const NODE_OFFSET_KIND = 0;
export const NODE_OFFSET_NEXT = 12;
export const NODE_OFFSET_PARENT = 16;
export const NODE_OFFSET_POS = 4;
export const NODE_STRING_INDEX_MASK = 16777215;
export const PROTOCOL_VERSION = 5;

export const AstKind = {
  Unknown: 0,
  EndOfFile: 1,
  SingleLineCommentTrivia: 2,
  MultiLineCommentTrivia: 3,
  NewLineTrivia: 4,
  WhitespaceTrivia: 5,
  ConflictMarkerTrivia: 6,
  NonTextFileMarkerTrivia: 7,
  NumericLiteral: 8,
  BigIntLiteral: 9,
  StringLiteral: 10,
  JsxText: 11,
  JsxTextAllWhiteSpaces: 12,
  RegularExpressionLiteral: 13,
  NoSubstitutionTemplateLiteral: 14,
  TemplateHead: 15,
  TemplateMiddle: 16,
  TemplateTail: 17,
  OpenBraceToken: 18,
  CloseBraceToken: 19,
  OpenParenToken: 20,
  CloseParenToken: 21,
  OpenBracketToken: 22,
  CloseBracketToken: 23,
  DotToken: 24,
  DotDotDotToken: 25,
  SemicolonToken: 26,
  CommaToken: 27,
  QuestionDotToken: 28,
  LessThanToken: 29,
  LessThanSlashToken: 30,
  GreaterThanToken: 31,
  LessThanEqualsToken: 32,
  GreaterThanEqualsToken: 33,
  EqualsEqualsToken: 34,
  ExclamationEqualsToken: 35,
  EqualsEqualsEqualsToken: 36,
  ExclamationEqualsEqualsToken: 37,
  EqualsGreaterThanToken: 38,
  PlusToken: 39,
  MinusToken: 40,
  AsteriskToken: 41,
  AsteriskAsteriskToken: 42,
  SlashToken: 43,
  PercentToken: 44,
  PlusPlusToken: 45,
  MinusMinusToken: 46,
  LessThanLessThanToken: 47,
  GreaterThanGreaterThanToken: 48,
  GreaterThanGreaterThanGreaterThanToken: 49,
  AmpersandToken: 50,
  BarToken: 51,
  CaretToken: 52,
  ExclamationToken: 53,
  TildeToken: 54,
  AmpersandAmpersandToken: 55,
  BarBarToken: 56,
  QuestionToken: 57,
  ColonToken: 58,
  AtToken: 59,
  QuestionQuestionToken: 60,
  BacktickToken: 61,
  HashToken: 62,
  EqualsToken: 63,
  PlusEqualsToken: 64,
  MinusEqualsToken: 65,
  AsteriskEqualsToken: 66,
  AsteriskAsteriskEqualsToken: 67,
  SlashEqualsToken: 68,
  PercentEqualsToken: 69,
  LessThanLessThanEqualsToken: 70,
  GreaterThanGreaterThanEqualsToken: 71,
  GreaterThanGreaterThanGreaterThanEqualsToken: 72,
  AmpersandEqualsToken: 73,
  BarEqualsToken: 74,
  BarBarEqualsToken: 75,
  AmpersandAmpersandEqualsToken: 76,
  QuestionQuestionEqualsToken: 77,
  CaretEqualsToken: 78,
  Identifier: 79,
  PrivateIdentifier: 80,
  JSDocCommentTextToken: 81,
  BreakKeyword: 82,
  CaseKeyword: 83,
  CatchKeyword: 84,
  ClassKeyword: 85,
  ConstKeyword: 86,
  ContinueKeyword: 87,
  DebuggerKeyword: 88,
  DefaultKeyword: 89,
  DeleteKeyword: 90,
  DoKeyword: 91,
  ElseKeyword: 92,
  EnumKeyword: 93,
  ExportKeyword: 94,
  ExtendsKeyword: 95,
  FalseKeyword: 96,
  FinallyKeyword: 97,
  ForKeyword: 98,
  FunctionKeyword: 99,
  IfKeyword: 100,
  ImportKeyword: 101,
  InKeyword: 102,
  InstanceOfKeyword: 103,
  NewKeyword: 104,
  NullKeyword: 105,
  ReturnKeyword: 106,
  SuperKeyword: 107,
  SwitchKeyword: 108,
  ThisKeyword: 109,
  ThrowKeyword: 110,
  TrueKeyword: 111,
  TryKeyword: 112,
  TypeOfKeyword: 113,
  VarKeyword: 114,
  VoidKeyword: 115,
  WhileKeyword: 116,
  WithKeyword: 117,
  ImplementsKeyword: 118,
  InterfaceKeyword: 119,
  LetKeyword: 120,
  PackageKeyword: 121,
  PrivateKeyword: 122,
  ProtectedKeyword: 123,
  PublicKeyword: 124,
  StaticKeyword: 125,
  YieldKeyword: 126,
  AbstractKeyword: 127,
  AccessorKeyword: 128,
  AsKeyword: 129,
  AssertsKeyword: 130,
  AssertKeyword: 131,
  AnyKeyword: 132,
  AsyncKeyword: 133,
  AwaitKeyword: 134,
  BooleanKeyword: 135,
  ConstructorKeyword: 136,
  DeclareKeyword: 137,
  GetKeyword: 138,
  ImmediateKeyword: 139,
  InferKeyword: 140,
  IntrinsicKeyword: 141,
  IsKeyword: 142,
  KeyOfKeyword: 143,
  ModuleKeyword: 144,
  NamespaceKeyword: 145,
  NeverKeyword: 146,
  OutKeyword: 147,
  ReadonlyKeyword: 148,
  RequireKeyword: 149,
  NumberKeyword: 150,
  ObjectKeyword: 151,
  SatisfiesKeyword: 152,
  SetKeyword: 153,
  StringKeyword: 154,
  SymbolKeyword: 155,
  TypeKeyword: 156,
  UndefinedKeyword: 157,
  UniqueKeyword: 158,
  UnknownKeyword: 159,
  UsingKeyword: 160,
  FromKeyword: 161,
  GlobalKeyword: 162,
  BigIntKeyword: 163,
  OverrideKeyword: 164,
  OfKeyword: 165,
  DeferKeyword: 166,
  QualifiedName: 167,
  ComputedPropertyName: 168,
  TypeParameter: 169,
  Parameter: 170,
  Decorator: 171,
  PropertySignature: 172,
  PropertyDeclaration: 173,
  MethodSignature: 174,
  MethodDeclaration: 175,
  ClassStaticBlockDeclaration: 176,
  Constructor: 177,
  GetAccessor: 178,
  SetAccessor: 179,
  CallSignature: 180,
  ConstructSignature: 181,
  IndexSignature: 182,
  TypePredicate: 183,
  TypeReference: 184,
  FunctionType: 185,
  ConstructorType: 186,
  TypeQuery: 187,
  TypeLiteral: 188,
  ArrayType: 189,
  TupleType: 190,
  OptionalType: 191,
  RestType: 192,
  UnionType: 193,
  IntersectionType: 194,
  ConditionalType: 195,
  InferType: 196,
  ParenthesizedType: 197,
  ThisType: 198,
  TypeOperator: 199,
  IndexedAccessType: 200,
  MappedType: 201,
  LiteralType: 202,
  NamedTupleMember: 203,
  TemplateLiteralType: 204,
  TemplateLiteralTypeSpan: 205,
  ImportType: 206,
  ObjectBindingPattern: 207,
  ArrayBindingPattern: 208,
  BindingElement: 209,
  ArrayLiteralExpression: 210,
  ObjectLiteralExpression: 211,
  PropertyAccessExpression: 212,
  ElementAccessExpression: 213,
  CallExpression: 214,
  NewExpression: 215,
  TaggedTemplateExpression: 216,
  TypeAssertionExpression: 217,
  ParenthesizedExpression: 218,
  FunctionExpression: 219,
  ArrowFunction: 220,
  DeleteExpression: 221,
  TypeOfExpression: 222,
  VoidExpression: 223,
  AwaitExpression: 224,
  PrefixUnaryExpression: 225,
  PostfixUnaryExpression: 226,
  BinaryExpression: 227,
  ConditionalExpression: 228,
  TemplateExpression: 229,
  YieldExpression: 230,
  SpreadElement: 231,
  ClassExpression: 232,
  OmittedExpression: 233,
  ExpressionWithTypeArguments: 234,
  AsExpression: 235,
  NonNullExpression: 236,
  MetaProperty: 237,
  SyntheticExpression: 238,
  SatisfiesExpression: 239,
  TemplateSpan: 240,
  SemicolonClassElement: 241,
  Block: 242,
  EmptyStatement: 243,
  VariableStatement: 244,
  ExpressionStatement: 245,
  IfStatement: 246,
  DoStatement: 247,
  WhileStatement: 248,
  ForStatement: 249,
  ForInStatement: 250,
  ForOfStatement: 251,
  ContinueStatement: 252,
  BreakStatement: 253,
  ReturnStatement: 254,
  WithStatement: 255,
  SwitchStatement: 256,
  LabeledStatement: 257,
  ThrowStatement: 258,
  TryStatement: 259,
  DebuggerStatement: 260,
  VariableDeclaration: 261,
  VariableDeclarationList: 262,
  FunctionDeclaration: 263,
  ClassDeclaration: 264,
  InterfaceDeclaration: 265,
  TypeAliasDeclaration: 266,
  EnumDeclaration: 267,
  ModuleDeclaration: 268,
  ModuleBlock: 269,
  CaseBlock: 270,
  NamespaceExportDeclaration: 271,
  ImportEqualsDeclaration: 272,
  ImportDeclaration: 273,
  ImportClause: 274,
  NamespaceImport: 275,
  NamedImports: 276,
  ImportSpecifier: 277,
  ExportAssignment: 278,
  ExportDeclaration: 279,
  NamedExports: 280,
  NamespaceExport: 281,
  ExportSpecifier: 282,
  MissingDeclaration: 283,
  ExternalModuleReference: 284,
  JsxElement: 285,
  JsxSelfClosingElement: 286,
  JsxOpeningElement: 287,
  JsxClosingElement: 288,
  JsxFragment: 289,
  JsxOpeningFragment: 290,
  JsxClosingFragment: 291,
  JsxAttribute: 292,
  JsxAttributes: 293,
  JsxSpreadAttribute: 294,
  JsxExpression: 295,
  JsxNamespacedName: 296,
  CaseClause: 297,
  DefaultClause: 298,
  HeritageClause: 299,
  CatchClause: 300,
  ImportAttributes: 301,
  ImportAttribute: 302,
  PropertyAssignment: 303,
  ShorthandPropertyAssignment: 304,
  SpreadAssignment: 305,
  EnumMember: 306,
  SourceFile: 307,
  JSDocTypeExpression: 308,
  JSDocNameReference: 309,
  JSDocAllType: 310,
  JSDocNullableType: 311,
  JSDocNonNullableType: 312,
  JSDocOptionalType: 313,
  JSDocVariadicType: 314,
  JSDoc: 315,
  JSDocText: 316,
  JSDocTypeLiteral: 317,
  JSDocSignature: 318,
  JSDocLink: 319,
  JSDocLinkCode: 320,
  JSDocLinkPlain: 321,
  JSDocUnknownTag: 322,
  JSDocAugmentsTag: 323,
  JSDocImplementsTag: 324,
  JSDocDeprecatedTag: 325,
  JSDocPublicTag: 326,
  JSDocPrivateTag: 327,
  JSDocProtectedTag: 328,
  JSDocReadonlyTag: 329,
  JSDocOverrideTag: 330,
  JSDocCallbackTag: 331,
  JSDocOverloadTag: 332,
  JSDocParameterTag: 333,
  JSDocReturnTag: 334,
  JSDocThisTag: 335,
  JSDocTypeTag: 336,
  JSDocTemplateTag: 337,
  JSDocTypedefTag: 338,
  JSDocSeeTag: 339,
  JSDocPropertyTag: 340,
  JSDocThrowsTag: 341,
  JSDocSatisfiesTag: 342,
  JSDocImportTag: 343,
  SyntaxList: 344,
  JSTypeAliasDeclaration: 345,
  JSImportDeclaration: 346,
  NotEmittedStatement: 347,
  PartiallyEmittedExpression: 348,
  SyntheticReferenceExpression: 349,
  NotEmittedTypeElement: 350,
  Count: 351,
  FirstAssignment: 63,
  LastAssignment: 78,
  FirstCompoundAssignment: 64,
  LastCompoundAssignment: 78,
  FirstReservedWord: 82,
  LastReservedWord: 117,
  FirstKeyword: 82,
  LastKeyword: 166,
  FirstFutureReservedWord: 118,
  LastFutureReservedWord: 126,
  FirstTypeNode: 183,
  LastTypeNode: 206,
  FirstPunctuation: 18,
  LastPunctuation: 78,
  FirstToken: 0,
  LastToken: 166,
  FirstLiteralToken: 8,
  LastLiteralToken: 14,
  FirstTemplateToken: 14,
  LastTemplateToken: 17,
  FirstBinaryOperator: 29,
  LastBinaryOperator: 78,
  FirstStatement: 244,
  LastStatement: 260,
  FirstNode: 167,
  FirstJSDocNode: 308,
  LastJSDocNode: 343,
  FirstJSDocTagNode: 322,
  LastJSDocTagNode: 343,
  FirstContextualKeyword: 127,
  LastContextualKeyword: 166,
  LastUnaryOperator: 54,
  FirstTriviaToken: 2,
  LastTriviaToken: 6,
} as const;

export const AstNodeFlags = {
  None: 0,
  Let: 1,
  Const: 2,
  Using: 4,
  Reparsed: 8,
  Synthesized: 16,
  OptionalChain: 32,
  ExportContext: 64,
  ContainsThis: 128,
  HasImplicitReturn: 256,
  HasExplicitReturn: 512,
  DisallowInContext: 1024,
  YieldContext: 2048,
  DecoratorContext: 4096,
  AwaitContext: 8192,
  DisallowConditionalTypesContext: 16384,
  ThisNodeHasError: 32768,
  JavaScriptFile: 65536,
  ThisNodeOrAnySubNodesHasError: 131072,
  HasAsyncFunctions: 262144,
  PossiblyContainsDynamicImport: 524288,
  PossiblyContainsImportMeta: 1048576,
  HasJSDoc: 2097152,
  JSDoc: 4194304,
  Ambient: 8388608,
  InWithStatement: 16777216,
  JsonFile: 33554432,
  PossiblyContainsDeprecatedTag: 67108864,
  Unreachable: 134217728,
  ReparserTransformedLiteral: 268435456,
  BlockScoped: 7,
  Constant: 6,
  AwaitUsing: 6,
  ReachabilityCheckFlags: 768,
  ReachabilityAndEmitFlags: 262912,
  ContextFlags: 25263104,
  TypeExcludesFlags: 10240,
  PermanentlySetIncrementalFlags: 1572864,
  IdentifierHasExtendedUnicodeEscape: 128,
  IdentifierIsInJSDocNamespace: 262144,
  NestedNamespace: 32,
} as const;

export const AstModifierFlags = {
  None: 0,
  Public: 1,
  Private: 2,
  Protected: 4,
  Readonly: 8,
  Override: 16,
  Export: 32,
  Abstract: 64,
  Ambient: 128,
  Static: 256,
  Accessor: 512,
  Async: 1024,
  Default: 2048,
  Const: 4096,
  In: 8192,
  Out: 16384,
  Decorator: 32768,
  Deprecated: 65536,
  JSDocPublic: 8388608,
  JSDocPrivate: 16777216,
  JSDocProtected: 33554432,
  JSDocReadonly: 67108864,
  JSDocOverride: 134217728,
  HasComputedJSDocModifiers: 268435456,
  HasComputedFlags: 536870912,
  SyntacticOrJSDocModifiers: 31,
  SyntacticOnlyModifiers: 65504,
  SyntacticModifiers: 65535,
  JSDocCacheOnlyModifiers: 260046848,
  JSDocOnlyModifiers: 65536,
  NonCacheOnlyModifiers: 131071,
  AccessibilityModifier: 7,
  ParameterPropertyModifier: 31,
  NonPublicAccessibilityModifier: 6,
  TypeScriptModifier: 28895,
  ExportDefault: 2080,
  All: 131071,
  Modifier: 98303,
  JavaScript: 3872,
} as const;

/** Child properties in the exact order encoded by tsgo. */
export function astChildNames(kind: number): string {
  switch (kind) {
    case 167: return "left,right"; // FirstNode
    case 168: return "expression"; // ComputedPropertyName
    case 169: return "modifiers,name,constraint,expression,defaultType"; // TypeParameter
    case 170: return "modifiers,dotDotDotToken,name,questionToken,type,initializer"; // Parameter
    case 171: return "expression"; // Decorator
    case 172: return "modifiers,name,postfixToken,type,initializer"; // PropertySignature
    case 173: return "modifiers,name,postfixToken,type,initializer"; // PropertyDeclaration
    case 174: return "modifiers,name,postfixToken,typeParameters,parameters,type"; // MethodSignature
    case 175: return "modifiers,asteriskToken,name,postfixToken,typeParameters,parameters,type,body"; // MethodDeclaration
    case 176: return "modifiers,body"; // ClassStaticBlockDeclaration
    case 177: return "modifiers,typeParameters,parameters,type,body"; // Constructor
    case 178: return "modifiers,name,typeParameters,parameters,type,body"; // GetAccessor
    case 179: return "modifiers,name,typeParameters,parameters,type,body"; // SetAccessor
    case 180: return "typeParameters,parameters,type"; // CallSignature
    case 181: return "typeParameters,parameters,type"; // ConstructSignature
    case 182: return "modifiers,parameters,type"; // IndexSignature
    case 183: return "assertsModifier,parameterName,type"; // FirstTypeNode
    case 184: return "typeName,typeArguments"; // TypeReference
    case 185: return "typeParameters,parameters,type"; // FunctionType
    case 186: return "modifiers,typeParameters,parameters,type"; // ConstructorType
    case 187: return "exprName,typeArguments"; // TypeQuery
    case 188: return "members"; // TypeLiteral
    case 189: return "elementType"; // ArrayType
    case 190: return "elements"; // TupleType
    case 191: return "type"; // OptionalType
    case 192: return "type"; // RestType
    case 193: return "types"; // UnionType
    case 194: return "types"; // IntersectionType
    case 195: return "checkType,extendsType,trueType,falseType"; // ConditionalType
    case 196: return "typeParameter"; // InferType
    case 197: return "type"; // ParenthesizedType
    case 199: return "type"; // TypeOperator
    case 200: return "objectType,indexType"; // IndexedAccessType
    case 201: return "readonlyToken,typeParameter,nameType,questionToken,type,members"; // MappedType
    case 202: return "literal"; // LiteralType
    case 203: return "dotDotDotToken,name,questionToken,type"; // NamedTupleMember
    case 204: return "head,templateSpans"; // TemplateLiteralType
    case 205: return "type,literal"; // TemplateLiteralTypeSpan
    case 206: return "argument,attributes,qualifier,typeArguments"; // LastTypeNode
    case 207: return "elements"; // ObjectBindingPattern
    case 208: return "elements"; // ArrayBindingPattern
    case 209: return "dotDotDotToken,propertyName,name,initializer"; // BindingElement
    case 210: return "elements"; // ArrayLiteralExpression
    case 211: return "properties"; // ObjectLiteralExpression
    case 212: return "expression,questionDotToken,name"; // PropertyAccessExpression
    case 213: return "expression,questionDotToken,argumentExpression"; // ElementAccessExpression
    case 214: return "expression,questionDotToken,typeArguments,arguments"; // CallExpression
    case 215: return "expression,typeArguments,arguments"; // NewExpression
    case 216: return "tag,questionDotToken,typeArguments,template"; // TaggedTemplateExpression
    case 217: return "type,expression"; // TypeAssertionExpression
    case 218: return "expression"; // ParenthesizedExpression
    case 219: return "modifiers,asteriskToken,name,typeParameters,parameters,type,body"; // FunctionExpression
    case 220: return "modifiers,typeParameters,parameters,type,equalsGreaterThanToken,body"; // ArrowFunction
    case 221: return "expression"; // DeleteExpression
    case 222: return "expression"; // TypeOfExpression
    case 223: return "expression"; // VoidExpression
    case 224: return "expression"; // AwaitExpression
    case 225: return "operand"; // PrefixUnaryExpression
    case 226: return "operand"; // PostfixUnaryExpression
    case 227: return "modifiers,left,type,operatorToken,right"; // BinaryExpression
    case 228: return "condition,questionToken,whenTrue,colonToken,whenFalse"; // ConditionalExpression
    case 229: return "head,templateSpans"; // TemplateExpression
    case 230: return "asteriskToken,expression"; // YieldExpression
    case 231: return "expression"; // SpreadElement
    case 232: return "modifiers,name,typeParameters,heritageClauses,members"; // ClassExpression
    case 234: return "expression,typeArguments"; // ExpressionWithTypeArguments
    case 235: return "expression,type"; // AsExpression
    case 236: return "expression"; // NonNullExpression
    case 237: return "name"; // MetaProperty
    case 238: return "tupleNameSource"; // SyntheticExpression
    case 239: return "expression,type"; // SatisfiesExpression
    case 240: return "expression,literal"; // TemplateSpan
    case 242: return "statements"; // Block
    case 244: return "modifiers,declarationList"; // FirstStatement
    case 245: return "expression"; // ExpressionStatement
    case 246: return "expression,thenStatement,elseStatement"; // IfStatement
    case 247: return "statement,expression"; // DoStatement
    case 248: return "expression,statement"; // WhileStatement
    case 249: return "initializer,condition,incrementor,statement"; // ForStatement
    case 250: return "awaitModifier,initializer,expression,statement"; // ForInStatement
    case 251: return "awaitModifier,initializer,expression,statement"; // ForOfStatement
    case 252: return "label"; // ContinueStatement
    case 253: return "label"; // BreakStatement
    case 254: return "expression"; // ReturnStatement
    case 255: return "expression,statement"; // WithStatement
    case 256: return "expression,caseBlock"; // SwitchStatement
    case 257: return "label,statement"; // LabeledStatement
    case 258: return "expression"; // ThrowStatement
    case 259: return "tryBlock,catchClause,finallyBlock"; // TryStatement
    case 261: return "name,exclamationToken,type,initializer"; // VariableDeclaration
    case 262: return "declarations"; // VariableDeclarationList
    case 263: return "modifiers,asteriskToken,name,typeParameters,parameters,type,body"; // FunctionDeclaration
    case 264: return "modifiers,name,typeParameters,heritageClauses,members"; // ClassDeclaration
    case 265: return "modifiers,name,typeParameters,heritageClauses,members"; // InterfaceDeclaration
    case 266: return "modifiers,name,typeParameters,type"; // TypeAliasDeclaration
    case 267: return "modifiers,name,members"; // EnumDeclaration
    case 268: return "modifiers,name,body"; // ModuleDeclaration
    case 269: return "statements"; // ModuleBlock
    case 270: return "clauses"; // CaseBlock
    case 271: return "modifiers,name"; // NamespaceExportDeclaration
    case 272: return "modifiers,name,moduleReference"; // ImportEqualsDeclaration
    case 273: return "modifiers,importClause,moduleSpecifier,attributes"; // ImportDeclaration
    case 274: return "name,namedBindings"; // ImportClause
    case 275: return "name"; // NamespaceImport
    case 276: return "elements"; // NamedImports
    case 277: return "propertyName,name"; // ImportSpecifier
    case 278: return "modifiers,type,expression"; // ExportAssignment
    case 279: return "modifiers,exportClause,moduleSpecifier,attributes"; // ExportDeclaration
    case 280: return "elements"; // NamedExports
    case 281: return "name"; // NamespaceExport
    case 282: return "propertyName,name"; // ExportSpecifier
    case 283: return "modifiers"; // MissingDeclaration
    case 284: return "expression"; // ExternalModuleReference
    case 285: return "openingElement,children,closingElement"; // JsxElement
    case 286: return "tagName,typeArguments,attributes"; // JsxSelfClosingElement
    case 287: return "tagName,typeArguments,attributes"; // JsxOpeningElement
    case 288: return "tagName"; // JsxClosingElement
    case 289: return "openingFragment,children,closingFragment"; // JsxFragment
    case 292: return "name,initializer"; // JsxAttribute
    case 293: return "properties"; // JsxAttributes
    case 294: return "expression"; // JsxSpreadAttribute
    case 295: return "dotDotDotToken,expression"; // JsxExpression
    case 296: return "namespace,name"; // JsxNamespacedName
    case 297: return "expression,statements"; // CaseClause
    case 298: return "expression,statements"; // DefaultClause
    case 299: return "types"; // HeritageClause
    case 300: return "variableDeclaration,block"; // CatchClause
    case 301: return "attributes"; // ImportAttributes
    case 302: return "name,value"; // ImportAttribute
    case 303: return "modifiers,name,postfixToken,type,initializer"; // PropertyAssignment
    case 304: return "modifiers,name,postfixToken,type,equalsToken,objectAssignmentInitializer"; // ShorthandPropertyAssignment
    case 305: return "expression"; // SpreadAssignment
    case 306: return "name,initializer"; // EnumMember
    case 307: return "statements,endOfFileToken"; // SourceFile
    case 308: return "type"; // FirstJSDocNode
    case 309: return "name"; // JSDocNameReference
    case 311: return "type"; // JSDocNullableType
    case 312: return "type"; // JSDocNonNullableType
    case 313: return "type"; // JSDocOptionalType
    case 314: return "type"; // JSDocVariadicType
    case 315: return "comment,tags"; // JSDoc
    case 317: return "jsdocPropertyTags"; // JSDocTypeLiteral
    case 318: return "typeParameters,parameters,type"; // JSDocSignature
    case 319: return "name"; // JSDocLink
    case 320: return "name"; // JSDocLinkCode
    case 321: return "name"; // JSDocLinkPlain
    case 322: return "tagName,comment"; // FirstJSDocTagNode
    case 323: return "tagName,className,comment"; // JSDocAugmentsTag
    case 324: return "tagName,className,comment"; // JSDocImplementsTag
    case 325: return "tagName,comment"; // JSDocDeprecatedTag
    case 326: return "tagName,comment"; // JSDocPublicTag
    case 327: return "tagName,comment"; // JSDocPrivateTag
    case 328: return "tagName,comment"; // JSDocProtectedTag
    case 329: return "tagName,comment"; // JSDocReadonlyTag
    case 330: return "tagName,comment"; // JSDocOverrideTag
    case 331: return "tagName,typeExpression,name,comment"; // JSDocCallbackTag
    case 332: return "tagName,typeExpression,comment"; // JSDocOverloadTag
    case 333: return "tagName,name,typeExpression,comment"; // JSDocParameterTag
    case 334: return "tagName,typeExpression,comment"; // JSDocReturnTag
    case 335: return "tagName,typeExpression,comment"; // JSDocThisTag
    case 336: return "tagName,typeExpression,comment"; // JSDocTypeTag
    case 337: return "tagName,constraint,typeParameters,comment"; // JSDocTemplateTag
    case 338: return "tagName,typeExpression,name,comment"; // JSDocTypedefTag
    case 339: return "tagName,nameExpression,comment"; // JSDocSeeTag
    case 340: return "tagName,name,typeExpression,comment"; // JSDocPropertyTag
    case 341: return "tagName,typeExpression,comment"; // JSDocThrowsTag
    case 342: return "tagName,typeExpression,comment"; // JSDocSatisfiesTag
    case 343: return "tagName,importClause,moduleSpecifier,attributes,comment"; // LastJSDocTagNode
    case 344: return "children"; // SyntaxList
    case 345: return "modifiers,name,typeParameters,type"; // JSTypeAliasDeclaration
    case 346: return "modifiers,importClause,moduleSpecifier,attributes"; // JSImportDeclaration
    case 348: return "expression"; // PartiallyEmittedExpression
    case 349: return "expression,thisArg"; // SyntheticReferenceExpression
    default: return "";
  }
}
