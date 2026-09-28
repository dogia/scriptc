const values = [{ name: "first", id: 1 }].slice();
// The array callback ABI includes undefined; spreading that arm cannot
// initialize the required fields inferred by TypeScript.
const copies = values.map((value) => ({ ...value, label: "copy" }));
console.log(copies.length);
