const { EventEmitter } = require("node:events");
const brand = Symbol.for("@opentui/core/Renderable");

class BaseRenderable extends EventEmitter {
  [brand] = true;
  static renderableNumber = 1;
  _id;
  num;
  _dirty = false;
  parent = null;
  _visible = true;
  constructor(options) {
    super();
    this.num = BaseRenderable.renderableNumber++;
    this._id = options.id ?? `renderable-${this.num}`;
  }
  get id() { return this._id; }
  set id(value) { this._id = value; }
  get isDirty() { return this._dirty; }
  markClean() { this._dirty = false; }
  markDirty() { this._dirty = true; }
  get visible() { return this._visible; }
  set visible(value) { this._visible = value; }
}

const first = new BaseRenderable({ id: "first" });
const second = new BaseRenderable({});
console.log(first.id, first.num, first[brand], first.visible, first.isDirty);
console.log(second.id, second.num);
first.id = "renamed";
first.visible = false;
first.markDirty();
console.log(first.id, first.visible, first.isDirty);
first.markClean();
console.log(first.isDirty);

// Allocation must make early reads safe; a bare declaration then resets
// the slot at its own position, after earlier initializer side effects.
class Ordered {
  // @ts-expect-error Deliberately read before the declaration runs.
  before = this.later;
  write = this.seed();
  later;
  // @ts-expect-error A bare JS field is initialized to undefined.
  after = this.later;
  #private;
  seed() { this.later = "temporary"; return "temporary"; }
  readPrivate() { return this.#private; }
  setPrivate(value) { this.#private = value; }
}
const ordered = new Ordered();
console.log(ordered.before, ordered.write, ordered.after, typeof ordered.later);
console.log(ordered.readPrivate());
ordered.setPrivate("secret");
console.log(ordered.readPrivate());
ordered.later = ["live"];
console.log(ordered.later[0]);
ordered.later = undefined;
console.log(ordered.later === undefined);

// A base constructor can call an override before derived initializers.
class EarlyBase {
  value;
  constructor(seed) {
    console.log("early", this.read(undefined));
    this.value = seed;
  }
  read(value) { return value; }
}
class EarlyDerived extends EarlyBase {
  // @ts-expect-error Observe the base constructor's write before the reset.
  sawBase = this.value;
  // @ts-expect-error Intentionally reset the inherited slot to undefined.
  value;
  later;
  read(value) { return this.later; }
}
const early = new EarlyDerived("base");
console.log(early.sawBase, early.value, early.later);

// String-keyed views and inspection include uninitialized public fields.
const { inspect } = require("node:util");
class Empty { value; }
const empty = new Empty();
function stringView(value) {
  console.log(Object.keys(value).join(","), JSON.stringify(value));
}
console.log(inspect(empty));
stringView(empty);

// Reference-valued assignments remain live and release on replacement.
for (let i = 0; i < 50; i++) {
  const item = new Empty();
  item.value = { name: `item-${i}` };
  if (i === 49) console.log(item.value.name);
  item.value = ["replacement"];
  item.value = undefined;
}

// Prefix/postfix updates share the declaring class's numeric static slot.
console.log(BaseRenderable.renderableNumber++, ++BaseRenderable.renderableNumber);
console.log(BaseRenderable.renderableNumber--, --BaseRenderable.renderableNumber);
BaseRenderable.renderableNumber++;
--BaseRenderable.renderableNumber;
console.log(BaseRenderable.renderableNumber);
