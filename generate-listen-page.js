// generate-listen-page.js
// Builds a static HTML page at docs/seed-<id>/index.html with an <audio> player
// for the seed track and one for each open remix PR targeting it. Meant to be
// re-run whenever a new remix PR opens (via a separate "on PR" workflow trigger)
// and once more when voting closes to mark the winner.
//
// Requires GitHub Pages enabled on the repo, serving from /docs on the default branch.
//
// Usage:
//   node generate-listen-page.js --seedId 3 --seedURI ipfs://... --seedMeta '{"style":"dark techno","bpm":128}'
//   (remix PRs are fetched live from the GitHub API, no need to pass them in)

import fs from "node:fs/promises";
import path from "node:path";

const IPFS_GATEWAY = "https://w3s.link/ipfs/"; // web3.storage's public gateway; swap for your own if self-hosting

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) out[args[i].replace(/^--/, "")] = args[i + 1];
  return out;
}

function ipfsToHttp(uri) {
  if (!uri) return "";
  return uri.startsWith("ipfs://") ? IPFS_GATEWAY + uri.slice("ipfs://".length) : uri;
}

async function fetchOpenRemixPRs(owner, repo, seedId, token) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
  });
  const prs = await res.json();
  return prs.filter((pr) => pr.body?.includes(`remixes/seed-${seedId}/`) || pr.title.includes(`seed-${seedId}`));
}

async function fetchReactionCount(owner, repo, prNumber, token) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/reactions`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
  });
  const reactions = await res.json();
  return reactions.filter((r) => r.content === "+1").length;
}

function renderPage({ seedId, seedMeta, seedAudioUrl, remixes, winnerPRNumber }) {
  const remixCards = remixes
    .map((r) => {
      const isWinner = winnerPRNumber && r.number === winnerPRNumber;
      return `
        <div class="card${isWinner ? " winner" : ""}">
          <h3>${isWinner ? "🏆 " : ""}${r.author} <span class="votes">${r.votes} 👍</span></h3>
          <audio controls preload="none" src="${r.audioUrl}"></audio>
          <a href="${r.prUrl}" target="_blank" rel="noopener">View PR #${r.number}</a>
        </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Seed #${seedId} — Listen &amp; Vote</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; background: #0b0b0f; color: #eee; }
  h1 { font-size: 1.4rem; }
  .meta { color: #999; margin-bottom: 24px; }
  .card { border: 1px solid #333; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
  .card.winner { border-color: #f5c518; background: #1a1808; }
  audio { width: 100%; margin: 8px 0; }
  a { color: #6cb6ff; }
  .votes { color: #f5c518; font-weight: normal; font-size: 0.9rem; }
</style>
</head>
<body>
  <h1>Seed #${seedId}</h1>
  <p class="meta">${seedMeta.style ?? ""} · ${seedMeta.bpm ?? "?"} BPM · ${seedMeta.key ?? ""}</p>
  <div class="card">
    <h3>🎛 Original seed</h3>
    <audio controls preload="none" src="${seedAudioUrl}"></audio>
  </div>
  <h2>Remixes</h2>
  ${remixCards || "<p>No remixes submitted yet — be the first to fork and remix.</p>"}
</body>
</html>`;
}

async function main() {
  let { seedId, seedURI, seedMeta: seedMetaRaw, winnerPRNumber } = parseArgs();
  const token = process.env.GITHUB_TOKEN;
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

  // Fall back to reading the persisted meta.json for this seed if URI/meta weren't passed
  // (e.g. when this script is invoked from the pull_request or close-voting jobs).
  if (!seedURI || !seedMetaRaw) {
    try {
      const raw = await fs.readFile(path.join("tracks", `seed-${seedId}`, "meta.json"), "utf8");
      const parsed = JSON.parse(raw);
      seedURI = seedURI || parsed.ipfsUri;
      seedMetaRaw = seedMetaRaw || raw;
    } catch {
      // no persisted meta yet — proceed with whatever was passed in
    }
  }

  const seedMeta = seedMetaRaw ? JSON.parse(seedMetaRaw) : {};
  const seedAudioUrl = ipfsToHttp(seedURI);

  const prs = await fetchOpenRemixPRs(owner, repo, seedId, token);
  const remixes = [];
  for (const pr of prs) {
    const votes = await fetchReactionCount(owner, repo, pr.number, token);
    // Remix audio is expected to live at a predictable IPFS path pinned by finalize
    // step, or fall back to a raw GitHub URL for the wav during the voting window.
    const audioUrl = pr.audioUrl || `https://raw.githubusercontent.com/${owner}/${repo}/${pr.head?.ref}/remixes/seed-${seedId}/${pr.user.login}/mix.wav`;
    remixes.push({ number: pr.number, author: pr.user.login, prUrl: pr.html_url, votes, audioUrl });
  }
  remixes.sort((a, b) => b.votes - a.votes);

  const html = renderPage({ seedId, seedMeta, seedAudioUrl, remixes, winnerPRNumber: winnerPRNumber ? Number(winnerPRNumber) : null });

  const outDir = path.join("docs", `seed-${seedId}`);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "index.html"), html);

  console.log(`Listen page written to ${outDir}/index.html`);

  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    // GitHub Pages URL pattern: https://<owner>.github.io/<repo>/seed-<id>/
    await fs.appendFile(outputFile, `pageUrl=https://${owner}.github.io/${repo}/seed-${seedId}/\n`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
