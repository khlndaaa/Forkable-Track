// mint-remix.js
// Usage: node mint-remix.js --parentId 3 --remixer 0x.. --metadataURI ipfs://...
import { ethers } from "ethers";
import fs from "node:fs/promises";

const ABI = [
  "function mintRemix(uint256 parentId, address remixer, string metadataURI) external returns (uint256)",
  "event RemixMinted(uint256 indexed tokenId, uint256 indexed parentId, address indexed creator, string metadataURI)"
];

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) out[args[i].replace(/^--/, "")] = args[i + 1];
  return out;
}

async function main() {
  const { parentId, remixer, metadataURI } = parseArgs();
  const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
  const wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, wallet);

  const tx = await contract.mintRemix(BigInt(parentId), remixer, metadataURI);
  const receipt = await tx.wait();
  const event = receipt.logs.map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
    .find((e) => e && e.name === "RemixMinted");
  const tokenId = event ? event.args.tokenId.toString() : "unknown";

  console.log(`Remix minted: tokenId=${tokenId} parentId=${parentId} remixer=${remixer} tx=${receipt.hash}`);
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) await fs.appendFile(outputFile, `tokenId=${tokenId}\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
