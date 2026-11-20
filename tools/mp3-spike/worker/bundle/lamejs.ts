import { encodeLamejs } from "../../src/enc/lamejs";
import { makeWorker } from "../app";

export default makeWorker({ lamejs: encodeLamejs });
