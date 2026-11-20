import mp3Wasm from "../../node_modules/wasm-media-encoders/wasm/mp3.wasm";
import { makeWme } from "../../src/enc/wme";
import { makeWorker } from "../app";

export default makeWorker({ "wasm-media-encoders": makeWme(() => mp3Wasm) });
