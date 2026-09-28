import { expect, test } from "vitest";
import { F64, VOID, type IrModule } from "./ir.js";
import { IR_VERSION, deserializeModule, serializeModule } from "./serialize.js";

function numbers(values: number[]): IrModule {
  const loc = { file: "numbers.ts", start: 0, end: 0 };
  return {
    irVersion: IR_VERSION, sourceFile: loc.file, entry: "main",
    functions: [{
      name: "main", params: [], locals: [], returnType: VOID, loc,
      body: values.map((value) => ({ kind: "exprStmt", expr: { kind: "numLit", value, type: F64, loc }, loc })),
    }],
  };
}

test("IR numbers survive multiple serialized generations without losing their value", () => {
  const values = [NaN, Infinity, -Infinity, -0, 0, Number.MIN_VALUE, Number.MAX_VALUE, -Number.MIN_VALUE, 0.1 + 0.2];
  let mod = numbers(values);
  const first = serializeModule(mod);
  expect(first).toContain('"$nonfinite": "nan"');
  expect(first).toContain('"$nonfinite": "-0"');
  for (let generation = 0; generation < 3; generation++) {
    mod = deserializeModule(serializeModule(mod));
    const actual = mod.functions[0]!.body.map((stmt) => {
      if (stmt.kind !== "exprStmt" || stmt.expr.kind !== "numLit") throw new Error("lost numeric literal");
      return stmt.expr.value;
    });
    expect(actual.every((value, index) => Object.is(value, values[index]))).toBe(true);
    expect(serializeModule(mod)).toBe(first);
  }
});

test.each(["", "NaN", "infinity", "future-format"])("unknown number sentinel %j is refused", (tag) => {
  const json = serializeModule(numbers([NaN])).replace('"nan"', JSON.stringify(tag));
  expect(() => deserializeModule(json)).toThrow("Invalid IR number sentinel");
});

test("ordinary strings resembling number sentinels remain strings", () => {
  const mod = numbers([0]);
  mod.sourceFile = '{"$nonfinite":"nan"}';
  expect(deserializeModule(serializeModule(mod)).sourceFile).toBe(mod.sourceFile);
});

test("the new number format rejects documents bearing an older version", () => {
  const json = serializeModule(numbers([NaN])).replace(`"irVersion": ${IR_VERSION}`, `"irVersion": ${IR_VERSION - 1}`);
  expect(() => deserializeModule(json)).toThrow("IR version mismatch");
});
