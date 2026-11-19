// Saves the arcana constructor target sent from the page (workflow input) into arcana.json.
// Input arrives in env ARC_DATA; everything is validated, nothing from it is executed.
import { writeFile } from "node:fs/promises";

const ACT = ["Snipe","Tempest Shot","Deadshot","Gale Arrow","Drill Dart","Burst Arrow","Marking Shot","Snare Shot","Suppressing Arrow","Arrow Scattershot","Explosion Trap","Defiance"];
const PAS = ["Focused Eye","Hunter's Resolve","Hunter's Soul","Concentrated Fire","Rooting Eye","Melee Fire","Vigilant Eye","Unyielding Resolve","Revitalization Contract","Wind Vigor"];
const RULES = { chalice: [...ACT, ...PAS], parchment: ACT, compass: ACT, bell: PAS, mirror: PAS };
const MAX = 9;

const fail = m => { console.error("Rejected: " + m); process.exit(1); };
let d;
try { d = JSON.parse(process.env.ARC_DATA || ""); } catch { fail("not JSON"); }
if (!d || typeof d.target !== "object") fail("no target");

const target = {};
for (const [card, allowed] of Object.entries(RULES)) {
  const rows = d.target[card];
  if (!Array.isArray(rows) || rows.length !== 4) fail(`${card}: need 4 rows`);
  const seen = new Set(); let sum = 0;
  target[card] = rows.map((r, i) => {
    if (r === null) { sum += 1; return null; }
    if (!Array.isArray(r) || r.length !== 2) fail(`${card}[${i}]: bad row`);
    const [name, lv] = r;
    if (!allowed.includes(name)) fail(`${card}[${i}]: "${String(name).slice(0, 40)}" not allowed on this card`);
    if (seen.has(name)) fail(`${card}: ${name} twice`);
    if (!Number.isInteger(lv) || lv < 1 || lv > 6) fail(`${card}[${i}]: level ${lv}`);
    seen.add(name); sum += lv;
    return [name, lv];
  });
  if (sum > MAX) fail(`${card}: ${sum} points > ${MAX}`);
}
const savedAt = Number.isFinite(d.savedAt) && d.savedAt > 0 ? Math.round(d.savedAt) : Date.now();
await writeFile(new URL("../arcana.json", import.meta.url), JSON.stringify({ v: 1, savedAt, target }) + "\n");
console.log("OK: arcana.json", new Date(savedAt).toISOString());
