// upload-ipfs.js
import fs from "node:fs/promises";
import path from "node:path";
import { Web3Storage, getFilesFromPath } from "web3.storage";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) out[args[i].replace(/^--/, "")] = args[i + 1];
  return out;
}

async function main() {
  const { path: dirPath } = parseArgs();
  const client = new Web3Storage({ token: process.env.WEB3_STORAGE_TOKEN });
  const files = await getFilesFromPath(dirPath);
  const cid = await client.put(files, { name: path.basename(dirPath) });
  const uri = `ipfs://${cid}`;
  console.log(`Uploaded ${dirPath} -> ${uri}`);
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) await fs.appendFile(outputFile, `uri=${uri}\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
