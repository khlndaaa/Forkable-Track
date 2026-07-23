// announce-winner.js
// Usage: node announce-winner.js --issueNumber 12
import fs from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) out[args[i].replace(/^--/, "")] = args[i + 1];
  return out;
}

async function main() {
  const { issueNumber, pageUrl } = parseArgs();

  const body = [
    "🏆 Voting closed — winning remix has been minted as an NFT on Base, linked to this seed.",
    "Royalties from secondary sales now flow back through the fork chain.",
    pageUrl ? `Listen: ${pageUrl}` : null
  ].filter(Boolean).join("\n");

  await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify({ body })
  });

  await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify({ state: "closed", labels: ["seed", "voting-closed"] })
  });

  console.log(`Issue #${issueNumber} closed with winner announcement.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
