// Preset arguments, rest arrows, non-inline arrows and ordinary functions
// retain their explicit Function.prototype.bind refusal.
const preset = ((value: number) => value).bind(null, 1);
const rest = ((...values: number[]) => values.length).bind(null);
const arrow = (value: number) => value + 1;
const alias = arrow.bind(null);
const ordinary = (function (value: number) { return value + 2; }).bind(null);
