import { Base, Metrics, View } from "bundled-methods";

const view = new View("selected");
const base: Base = view;
console.log(JSON.stringify(new Base().selected()), view.selected(), base.getSelectedText());
console.log(view.label(), view.label("changed") === view, base.selected());
console.log(view.parent === null);
view.parent = new View("parent");
console.log(view.parent.selected());
view.parent = null;
const metrics = new Metrics(12, true);
console.log(metrics.count() + 1, metrics.active());

// The nullable base callback keeps one native slot through the bundled
// intermediate class and a derived arrow that captures its owner.
base.runLifecycle();
const callback = view.onLifecyclePass;
console.log(callback === view.onLifecyclePass);
base.resetLifecycle();
base.runLifecycle();
console.log(view.onLifecyclePass === null);
callback?.();
for (let i = 0; i < 20; i++) {
  const captured = new View(`iteration ${i}`);
  if (i === 19) captured.runLifecycle();
}
