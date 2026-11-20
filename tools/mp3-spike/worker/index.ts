// Relative import of the unmodified package file (implementation decision):
// wrangler applies its Wasm rule only to specifiers that end in `.wasm`, and the
// package export `./wasm/mp3.wasm` points to a file that does not exist.
import mp3Wasm from "../node_modules/wasm-media-encoders/wasm/mp3.wasm";
import { encodeBreezy } from "../src/enc/breezy";
import { encodeLamejs } from "../src/enc/lamejs";
import { makeWme } from "../src/enc/wme";
import { makeWorker } from "./app";

export default makeWorker({
  "breezy-lamejs": encodeBreezy,
  lamejs: encodeLamejs,
  "wasm-media-encoders": makeWme(() => mp3Wasm),
});
