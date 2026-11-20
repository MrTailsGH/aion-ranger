// Saves the arcana constructor target sent from the page (workflow input) into arcana.json.
// Input arrives in env ARC_DATA; everything is validated, nothing from it is executed.
import { writeFile } from "node:fs/promises";

const ACT = ["Snipe","Tempest Shot","Deadshot","Gale Arrow","Drill Dart","Burst Arrow","Marking Shot","Snare Shot","Suppressing Arrow","Arrow Scattershot","Explosion Trap","Defiance"];
const PAS = ["Focused Eye","Hunter's Resolve","Hunter's Soul","Concentrated Fire","Rooting Eye","Melee Fire","Vigilant Eye","Unyielding Resolve","Revitalization Contract","Wind Vigor"];
const PARCH = ["Snipe","Snare Shot","Drill Dart","Burst Arrow","Explosion Trap","Tempest Shot"];
const COMP = ["Deadshot","Marking Shot","Suppressing Arrow","Gale Arrow","Arrow Scattershot","Defiance"];
const BELL = ["Vigilant Eye","Wind Vigor","Hunter's Resolve","Rooting Eye","Revitalization Contract"];
const MIRR = ["Concentrated Fire","Focused Eye","Unyielding Resolve","Melee Fire","Hunter's Soul"];
const RULES = { chalice: [...ACT, ...PAS], parchment: PARCH, compass: COMP, bell: BELL, mirror: MIRR };
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
let goal = null;
if (d.goal !== undefined && d.goal !== null) {
  const g = d.goal;
  if (typeof g !== "object" || !Array.isArray(g.skills) || g.skills.length > ACT.length + PAS.length) fail("bad goal");
  const seen = new Set();
  goal = { rings: ["now", "mine"].includes(g.rings) ? g.rings : "plan", skills: g.skills.map(x => {
    if (!Array.isArray(x) || x.length !== 2) fail("bad goal row");
    const [name, lv] = x;
    if (![...ACT, ...PAS].includes(name) || seen.has(name)) fail(`goal: "${String(name).slice(0, 40)}"`);
    if (!Number.isInteger(lv) || lv < 1 || lv > 30) fail(`goal level ${lv}`);
    seen.add(name); return [name, lv];
  }) };
}
let rings = null;
if (Array.isArray(d.rings)) {
  if (d.rings.length !== 2) fail("rings: need 2");
  rings = d.rings.map((r, i) => {
    if (!Array.isArray(r) || r.length !== 4) fail(`ring ${i}: need 4 rows`);
    const seen = new Set();
    return r.map(n => { if (n === null) return null; if (!ACT.includes(n) || seen.has(n)) fail(`ring ${i}: "${String(n).slice(0, 40)}"`); seen.add(n); return n; });
  });
}
const savedAt = Number.isFinite(d.savedAt) && d.savedAt > 0 ? Math.round(d.savedAt) : Date.now();
await writeFile(new URL("../arcana.json", import.meta.url), JSON.stringify({ v: 1, savedAt, target, ...(goal ? { goal } : {}), ...(rings ? { rings } : {}) }) + "\n");
console.log("OK: arcana.json", new Date(savedAt).toISOString());
