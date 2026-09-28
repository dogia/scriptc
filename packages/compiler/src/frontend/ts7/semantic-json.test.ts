import { expect, test } from "vitest";
import { checkSemanticJsonStrings, parseSemanticJson } from "./semantic-json.js";

test("semantic JSON preserves ordinary strings, escaped slashes, quotes, pairs and nulls", () => {
  const values = ["", "\uFEFFhéllo 🌍", "\\ud800", 'quoted "\\ud800"', "\ud800\udc00", "\udbff\udfff", "\\", null];
  for (const value of values) {
    const json = JSON.stringify({ value });
    expect(parseSemanticJson(json)).toEqual({ value });
    expect(() => checkSemanticJsonStrings(json, false)).not.toThrow();
  }
  for (const json of ['"\\ud800\\udc00"', '"\\uDBFF\\uDFFF"', '{"\\uD800\\uDC00":"ok"}']) {
    expect(() => checkSemanticJsonStrings(json, false)).not.toThrow();
    expect(parseSemanticJson(json)).toEqual(JSON.parse(json));
  }
});

test("all lone code units remain exact on Node and are refused at the native boundary", () => {
  for (let unit = 0xd800; unit <= 0xdfff; unit++) {
    const text = String.fromCharCode(unit);
    for (const value of [text, { [text]: "key", value: text }, [text, "after"]]) {
      const json = JSON.stringify(value);
      expect(parseSemanticJson(json)).toEqual(value);
      expect(() => checkSemanticJsonStrings(json, false)).toThrow("cannot preserve lone UTF-16 surrogates");
    }
  }
});

test("backslash parity and separated surrogate escapes cannot bypass the boundary", () => {
  for (let count = 1; count <= 8; count++) {
    const json = '"' + "\\".repeat(count) + 'ud800"';
    if (count % 2 === 0) expect(() => checkSemanticJsonStrings(json, false)).not.toThrow();
    else expect(() => checkSemanticJsonStrings(json, false)).toThrow("cannot preserve");
  }
  for (const json of ['"\\ud800x\\udc00"', '["\\ud800","\\udc00"]', '"\\ud800\\ud800"', '"\\udc00\\ud800"']) {
    expect(() => checkSemanticJsonStrings(json, false)).toThrow("cannot preserve");
  }
});

test("malformed JSON remains a parse error rather than an accepted response", () => {
  for (const json of ['"\\uZZZZ"', '"\\uD8"', '"unclosed', '{"value":}', 'undefined']) {
    expect(() => parseSemanticJson(json)).toThrow(SyntaxError);
  }
});
