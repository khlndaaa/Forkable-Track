// tally-votes.js
// Finds the currently open "voting-open" Issue, lists PRs whose branch/path targets
// remixes/seed-<parentId>/, sums 👍 reactions on each PR, and picks the winner.
// Expects the remixer's wallet address to be declared in the PR body as:
//   wallet: 0xAbC123...
//
// Writes GITHUB_OUTPUT: winnerPath, parentId, remixerWallet, issueNumber

import fs from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const issues = await gh(`/repos/${owner}/${repo}/issues?labels=voting-open&state=open`);
  if (issues.length === 0) {
    console.log("No open voting round found.");
    return;
  }
  const issue = issues[0];
  const parentIdMatch = issue.title.match(/Seed #(\d+)/);
  if (!parentIdMatch) throw new Error(`Could not parse parentId from issue title: ${issue.title}`);
  const parentId = parentIdMatch[1];

  const prs = await gh(`/repos/${owner}/${repo}/pulls?state=open`);
  const remixPRs = prs.filter((pr) => pr.body?.includes(`remixes/seed-${parentId}/`) || pr.title.includes(`seed-${parentId}`));

  if (remixPRs.length === 0) {
    console.log(`No remix PRs found for seed #${parentId}.`);
    return;
  }

  let best = null;
  let bestScore = -1;

  for (const pr of remixPRs) {
    const reactions = await gh(`/repos/${owner}/${repo}/issues/${pr.number}/reactions`);
    const score = reactions.filter((r) => r.content === "+1").length;
    console.log(`PR #${pr.number} (${pr.user.login}): ${score} upvotes`);
    if (score > bestScore) {
      bestScore = score;
      best = pr;
    }
  }

  if (!best || bestScore === 0) {
    console.log("No remix received any votes — skipping mint this round.");
    return;
  }

  const walletMatch = best.body?.match(/wallet:\s*(0x[a-fA-F0-9]{40})/);
  if (!walletMatch) {
    console.warn(`Winning PR #${best.number} has no declared wallet — cannot mint.`);
    return;
  }

  const winnerPath = `remixes/seed-${parentId}/${best.user.login}`;

  console.log(`Winner: PR #${best.number} by ${best.user.login} (${bestScore} votes) — wallet ${walletMatch[1]}`);

  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    await fs.appendFile(outputFile, `winnerPath=${winnerPath}\n`);
    await fs.appendFile(outputFile, `parentId=${parentId}\n`);
    await fs.appendFile(outputFile, `remixerWallet=${walletMatch[1]}\n`);
    await fs.appendFile(outputFile, `issueNumber=${issue.number}\n`);
    await fs.appendFile(outputFile, `winnerPRNumber=${best.number}\n`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
