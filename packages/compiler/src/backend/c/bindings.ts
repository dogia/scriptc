import type { CEmitter } from "./c-emitter.js";
import type { IrLocal } from "../../ir/ir.js";
import { mangleLocal } from "../mangle.js";
import { boxAccess, cType } from "./types.js";

/** The empty payload slot is the TDZ sentinel for both references and
 * scalar cells. Check before reading, or after evaluating a write's RHS. */
export function checkTdz(emitter: CEmitter, local: IrLocal): void {
  const box = mangleLocal(local.id);
  const errName = emitter.internLiteral("ReferenceError");
  const message = emitter.internLiteral(`Cannot access '${local.name}' before initialization`);
  emitter.line(`if (${box}->slot == 0) { /* temporal dead zone */`);
  emitter.indent++;
  emitter.line(`scr_throw_error_named((ScrStr *)&${errName}, (ScrStr *)&${message});`);
  emitter.emitUnwind();
  emitter.indent--;
  emitter.line("}");
}

/** Read a shared binding. Reference results own a retain; scalar cells
 * are borrowed from their live box and return a copied value. */
export function readBox(emitter: CEmitter, local: IrLocal): string {
  const box = mangleLocal(local.id);
  const acc = boxAccess(local.type);
  if (local.tdz) checkTdz(emitter, local);
  if (acc === "ref") return `(${cType(local.type).trim()})scr_box_get_ref(${box})`;
  return local.tdz
    ? `scr_arr_get_${acc}((ScrArr *)(uintptr_t)${box}->slot, 0)`
    : `scr_box_get_${acc}(${box})`;
}

/** Store an owned payload. A mutable scalar TDZ box keeps the same cell
 * after initialization, so every closure sees subsequent assignments. */
export function writeBox(emitter: CEmitter, local: IrLocal, value: string, initializes = false): void {
  const box = mangleLocal(local.id);
  const acc = boxAccess(local.type);
  if (local.tdz) {
    // Historical IR represents a const's declaration with plain assign.
    // Such bindings have no legal subsequent assignment; keep it readable.
    const first = initializes || !local.mutable;
    if (!first) checkTdz(emitter, local);
    if (acc !== "ref") {
      if (first) {
        const cell = `sc_t${emitter.tempCounter++}`;
        emitter.line(`ScrArr *${cell} = ${emitter.arrNewC(local.type, 1)};`);
        emitter.line(`scr_arr_push_${acc}(${cell}, ${value});`);
        emitter.line(`scr_box_set_ref(${box}, ${cell});`);
      } else {
        emitter.line(`scr_arr_set_${acc}((ScrArr *)(uintptr_t)${box}->slot, 0, ${value});`);
      }
      return;
    }
  }
  emitter.line(`scr_box_set_${acc}(${box}, ${value});`);
}
