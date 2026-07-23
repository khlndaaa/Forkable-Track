// generate-seed.js
// Generates a full seed track + separated stems via an AI music API.
// Writes to ./tracks/latest/ (full_mix.wav, stems/*.wav, meta.json).

import fs from "node:fs/promises";
import path from "node:path";
import fetch from "node-fetch";

const MUSIC_API_URL = process.env.MUSIC_API_URL || "https://api.example-music-ai.com/v1/generate";
const MUSIC_API_KEY = process.env.MUSIC_API_KEY;

// Rotate style daily so the catalogue stays varied — pick by day-of-year.
const STYLES = [
  { name: "dark techno", bpm: 128, key: "F minor" },
  { name: "deep house", bpm: 122, key: "G minor" },
  { name: "trance", bpm: 138, key: "A minor" },
  { name: "breakbeat", bpm: 132, key: "D minor" }
];

function pickStyle() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return STYLES[dayOfYear % STYLES.length];
}

async function callMusicApi(prompt, extra = {}) {
  if (!MUSIC_API_KEY) throw new Error("MUSIC_API_KEY not set");
  const res = await fetch(MUSIC_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${MUSIC_API_KEY}` },
    body: JSON.stringify({ prompt, format: "wav", ...extra })
  });
  if (!res.ok) throw new Error(`Music API error: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const style = pickStyle();
  const outDir = "tracks/latest";
  const stemsDir = path.join(outDir, "stems");
  await fs.mkdir(stemsDir, { recursive: true });

  console.log(`Generating seed track: ${style.name}, ${style.bpm} BPM, ${style.key}`);

  const fullMixPrompt = `${style.name} club track, ${style.bpm} BPM, ${style.key}, full arrangement, 2 minutes, loopable`;
  const fullMix = await callMusicApi(fullMixPrompt, { duration_seconds: 120 });
  await fs.writeFile(path.join(outDir, "full_mix.wav"), fullMix);

  const stemPrompts = {
    drums: `${style.name} drum loop, ${style.bpm} BPM`,
    bass: `${style.name} bassline, ${style.bpm} BPM, ${style.key}`,
    lead: `${style.name} lead synth, ${style.bpm} BPM, ${style.key}`,
    fx: `${style.name} atmosphere/fx layer, ${style.bpm} BPM`
  };

  const stems = [];
  for (const [name, prompt] of Object.entries(stemPrompts)) {
    console.log(`  stem: ${name}`);
    const buf = await callMusicApi(prompt, { duration_seconds: 32 });
    const file = `${name}.wav`;
    await fs.writeFile(path.join(stemsDir, file), buf);
    stems.push({ name, file });
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    style: style.name,
    bpm: style.bpm,
    key: style.key,
    fullMix: "full_mix.wav",
    stems
  };
  await fs.writeFile(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2));

  console.log("Seed track generated:", meta);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
