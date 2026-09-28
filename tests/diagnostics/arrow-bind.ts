// Typed preset and rest signatures still exceed the callable adapter.
const preset = ((value: number) => value).bind(null, 1);
const rest = ((...values: number[]) => values.length).bind(null);
export {};
