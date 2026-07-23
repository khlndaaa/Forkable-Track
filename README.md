# Forkable Track (bot seed + community remix, hybrid)

Every day the bot generates a raw club track and mints it as a seed NFT on Base.
Anyone can fork the repo and submit a remix as a Pull Request. The community votes
with 👍 reactions on PRs; the winning remix is minted as a child NFT, linked to its
parent. Royalties on secondary sales are split along the whole fork chain — remix
a remix, and the original seed's creator still gets paid.

## Flow

1. **Daily (seed job)**: bot generates track + stems → uploads to IPFS →
   `mintSeed()` on Base → commits files → opens a "Seed #N — fork it" Issue.
2. Anyone forks, adds their remix under `remixes/seed-<N>/<handle>/`, opens a PR
   with `wallet: 0xYourAddress` somewhere in the PR description.
3. Community 👍-reacts on PRs they like.
4. **Next day (close-voting job)**: tallies reactions, uploads the winning remix
   to IPFS, calls `mintRemix(parentId, remixerWallet, uri)`, closes the Issue.
5. On any secondary sale, marketplaces route the royalty to the contract, which
   calls `distributeRoyalty(tokenId)` — splitting it between the direct parent's
   creator and the current token's creator (default 30/70, configurable).

## Repo layout

```
contracts/ForkableTrack.sol         — ERC721 + ERC2981, tracks lineage, splits royalties
.github/workflows/track-cycle.yml   — daily seed + daily close-voting jobs
scripts/                            — generation, IPFS upload, minting, vote tally
tracks/                             — bot-generated seed tracks
remixes/                            — community remix submissions, per seed
```

## Deploying to Base

```bash
forge install OpenZeppelin/openzeppelin-contracts
forge create contracts/ForkableTrack.sol:ForkableTrack \
  --rpc-url $BASE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args <ORACLE_ADDRESS>
```

Test on Base Sepolia (`https://sepolia.base.org`, chain ID 84532) before mainnet
(`https://mainnet.base.org`, chain ID 8453).

## Required GitHub secrets

| Secret | Purpose |
|---|---|
| `MUSIC_API_KEY` | AI music generation API |
| `WEB3_STORAGE_TOKEN` | IPFS pinning |
| `BASE_RPC_URL` | Base RPC endpoint |
| `ORACLE_PRIVATE_KEY` | Wallet allowed to mint (must be set as contract's `oracle`) |
| `FORKABLETRACK_CONTRACT_ADDRESS` | Deployed contract address |
| `LABEL_TREASURY_ADDRESS` | Wallet that receives seed-track mints/royalties |

## Design notes / why this should be more viral than the other options

- **Low barrier to participate**: forking and dropping a remix file takes minutes —
  no need to be one of two pre-selected "players" like in a battle format.
- **Constant fresh content**: the bot guarantees a new seed every day regardless of
  community activity, so there's always something to react to or fork.
- **Built-in distribution**: every remix PR is itself a public, shareable artifact;
  remixers have an incentive to post their fork elsewhere to drive votes.
- **Royalty chain rewards early/original creators** even as tracks get remixed
  further down the line, which incentivizes seeding good "forkable" source material
  rather than one-off finished tracks.

## Listen page (embedded audio player)

Every seed gets a static page at `docs/seed-<id>/index.html` with an `<audio>`
player for the seed track and one per open remix PR (sorted by current vote
count). It's rebuilt automatically:
- when the seed is minted (seed job),
- whenever a remix PR is opened/updated (`pull_request` trigger, path-filtered
  to `remixes/**`),
- once more when voting closes, to mark the winning PR.

**Setup required:** enable GitHub Pages on the repo (Settings → Pages → Source:
`main` branch, `/docs` folder). The Issue links to
`https://<owner>.github.io/<repo>/seed-<id>/` instead of a raw IPFS URI, so
voters can listen without downloading anything.

Remix audio is read straight from the PR branch (`raw.githubusercontent.com/.../remixes/seed-<id>/<handle>/mix.wav`)
during the voting window, so there's no IPFS pinning cost until a remix actually wins.

## Not yet wired up (next steps)

- Anti-sybil protection on voting (currently raw 👍 count — could weight by
  wallet holding the community token, or require a minimum GitHub account age).
- Swap `MUSIC_API_URL` in `generate-seed.js` for your actual provider.
