import { encodeBreezy } from "../../src/enc/breezy";
import { makeWorker } from "../app";

export default makeWorker({ "breezy-lamejs": encodeBreezy });
