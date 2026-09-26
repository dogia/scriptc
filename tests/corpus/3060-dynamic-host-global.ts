// @dynamic
// An explicitly any-typed globalThis binding reaches the island's actual
// globals, including Node shims even when this program embeds no npm module.
const host: any = globalThis;
console.log(typeof host.process, host === (globalThis as any), host.global === host);
console.log(typeof host.Buffer, host.process === (globalThis as any).process);

const decoder: any = new (globalThis as any).TextDecoder("utf-8");
console.log(`${decoder.decode(new Uint8Array([72, 105]))}`);
host.process.stdout.write("host write\n");
console.log(host.__scriptc_absent__ === undefined);

function localGlobal(): string {
  const local: any = globalThis;
  return typeof local.Array;
}
console.log(localGlobal());
