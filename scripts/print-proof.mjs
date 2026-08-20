import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildProof } from "../src/proof.mjs";

const inputUrl = new URL("../examples/input-events.json", import.meta.url);
const input = JSON.parse(await readFile(fileURLToPath(inputUrl), "utf8"));
process.stdout.write(`${JSON.stringify(buildProof(input), null, 2)}\n`);
