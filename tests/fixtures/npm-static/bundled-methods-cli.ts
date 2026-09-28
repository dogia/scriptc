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
