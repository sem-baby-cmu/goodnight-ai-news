// A Worker imports a `.wasm` file as a compiled `WebAssembly.Module`.
declare module "*.wasm" {
  const mod: WebAssembly.Module;
  export default mod;
}

// `lamejs` 1.2.1 ships no types. Only the part the adapter uses.
declare module "lamejs" {
  export class Mp3Encoder {
    constructor(channels: number, sampleRate: number, kbps: number);
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    flush(): Int8Array;
  }
  const lamejs: { Mp3Encoder: typeof Mp3Encoder };
  export default lamejs;
}
