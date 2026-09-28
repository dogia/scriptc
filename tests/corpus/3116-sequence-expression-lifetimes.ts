// Hidden locals in lazy expressions must be released by the executed branch.
// Reusing a lexical scope across loop iterations must not revisit old temps.
interface Box { text: string; values: number[] }
function box(text: string, n: number): Box { return { text, values: [n] }; }
const boxes: Box[] = [box("a", 1), box("b", 2), box("c", 3)];
const numbers = [1, 2, 3];
let total = 0;
for (let i = 0; i < 100; i++) {
  const result = i % 2 === 0
    ? (numbers[0] += 1)
    : (numbers[1] += 2);
  total += result;
  const selected = i % 2 === 0 ? boxes[0] : boxes[1];
  if (selected !== undefined) selected.values.push(result);
}
console.log("compound", total, numbers.join(","), boxes[0]!.values.length, boxes[1]!.values.length);

// Chained destructuring expressions have independent source temporaries.
let first = "";
let second = "";
function strings(n: number): string[] { return [`a${n}`, `b${n}`]; }
for (let i = 0; i < 20; i++) {
  const value = i % 2 === 0 ? ([first] = strings(i)) : ([second] = strings(i));
  if (i > 17) console.log("destructure", value.join(","), first, second);
}

// Locals created by one lazy arm are not initialized in the other arm.
let label = "start";
for (let i = 0; i < 20; i++) {
  const value = i % 3 === 0 ? ({ text: label } = box(`x${i}`, i)) : box(`y${i}`, i);
  if (i > 16) console.log("record", value.text, label);
}

// A returned closure retains its capture after the sequence scope closes.
function callback(n: number): () => string {
  const text = `callback:${n}`;
  return () => text;
}
let fn = callback(-1);
const callbacks = [callback(0)];
for (let i = 0; i < 16; i++) {
  const result = i % 2 === 0 ? ([fn] = [callback(i)]) : ([fn] = [callback(i + 100)]);
  callbacks.push(result[0]!);
}
console.log("closure", fn(), callbacks[1]!(), callbacks[16]!());

// Abrupt completion releases the current sequence's initialized locals.
let effects = 0;
function failure(): number { effects++; throw new Error("rhs"); }
for (let i = 0; i < 12; i++) {
  try {
    const result = i % 2 === 0 ? (numbers[0] += failure()) : (numbers[1] += 1);
    if (i === 11) console.log("success", result);
  } catch (error) {
    if (error instanceof Error && i === 10) console.log("caught", error.message);
  }
}
console.log("effects", effects);

// Numeric array values remain valid index expressions; missing indices miss.
const indices = [0, 1, 8];
const words = ["zero", "one"];
console.log(indices.map((index) => words[index] ?? "missing").join(","));
for (const index of indices) console.log(words[index!] ?? "missing");
console.log(words[indices[99]] ?? "missing");
