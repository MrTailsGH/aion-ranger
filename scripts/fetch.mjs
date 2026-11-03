// Pulls one character from the official AION 2 armory and writes data.json + history.json.
// Run: node scripts/fetch.mjs   (settings in config.json)
import { readFile, writeFile } from "node:fs/promises";

const cfg = JSON.parse(await readFile(new URL("../config.json", import.meta.url), "utf8"));
const API = "https://aion2.plaync.com";
const SEARCH = "https://api-search.plaync.com/aion2global/search/v2/character";
const UA = { "User-Agent": "aion-ranger-page (personal character page)", "Accept": "application/json" };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(1500 * i);
    }
  }
}
const clean = s => String(s || "").replace(/<[^>]+>/g, "").toLowerCase();
const pick = (o, ks) => o ? Object.fromEntries(ks.filter(k => o[k] !== undefined).map(k => [k, o[k]])) : undefined;

// 1. find the character
const s = await get(`${SEARCH}?keyword=${encodeURIComponent(cfg.name)}&region=${cfg.region}&localeInfo=en-US&page=1&size=40`);
const hit = (s.list || [])
  .filter(c => clean(c.name) === cfg.name.toLowerCase() && (!cfg.server || clean(c.serverName) === cfg.server.toLowerCase()))
  .sort((a, b) => b.level - a.level)[0];
if (!hit) throw new Error(`Character "${cfg.name}" not found on ${cfg.server || "any server"} (${cfg.region})`);
const cid = decodeURIComponent(hit.characterId), sid = hit.serverId;
const base = `region=${cfg.region}&lang=en-US&characterId=${encodeURIComponent(cid)}&serverId=${sid}`;

// 2. profile, equipment, every item
const info = await get(`${API}/api/character/info?${base}`);
const eq = await get(`${API}/api/character/equipment?${base}`);
const items = {};
for (const e of eq.equipment?.equipmentList || []) {
  const d = await get(`${API}/api/character/equipment/item?id=${e.id}&enchantLevel=${e.enchantLevel}&slotPos=${e.slotPos}&${base}`);
  const it = pick(d, ["id","name","grade","level","enchantLevel","maxEnchantLevel","categoryName","subStatCount","subSkillCountMax","magicStoneSlotCount","soulBindRate","subStats","subSkills"]);
  if (d.mainStats) it.mainStats = d.mainStats.map(m => ({ id: m.id, name: m.name, value: m.value, extra: m.extra }));
  if (d.magicStoneStat) it.magicStoneStat = d.magicStoneStat.map(m => ({ id: m.id, name: m.name, value: m.value, grade: m.grade }));
  (it.subSkills || []).forEach(x => delete x.icon);
  if (d.set) it.set = { name: d.set.name, equippedCount: d.set.equippedCount };
  items[e.slotPos] = it;
  await sleep(300);
}

const snap = {
  v: 1,
  info: {
    profile: pick(info.profile, ["characterId","characterName","characterLevel","className","combatPower","raceName","regionName","serverId","serverName","titleName"]),
    stats: (info.stat?.statList || []).map(x => ({ type: x.type, name: x.name, value: x.value })),
    titles: { owned: info.title?.ownedCount, total: info.title?.totalCount,
      list: (info.title?.titleList || []).map(t => ({ cat: t.equipCategory, name: t.name, owned: t.ownedCount, total: t.totalCount })) },
    daevanion: (info.daevanion?.boardList || []).map(b => pick(b, ["id","name","open","openNodeCount","totalNodeCount"])),
    petwing: { pet: pick(eq.petwing?.pet, ["name","level"]), wing: pick(eq.petwing?.wing, ["name","grade","enchantLevel"]) }
  },
  equipment: (eq.equipment?.equipmentList || []).map(e => pick(e, ["id","name","grade","enchantLevel","exceedLevel","slotPos","slotPosName"])),
  skills: (eq.skill?.skillList || []).map(x => pick(x, ["id","name","category","equip","acquired","skillLevel"])),
  items
};
const now = Date.now();
const doc = { query: { region: cfg.region, server: info.profile?.serverName, name: info.profile?.characterName, characterId: cid, serverId: sid }, fetchedAt: now, snap };
await writeFile(new URL("../data.json", import.meta.url), JSON.stringify(doc));

// 3. history: one point per change of Combat Power or Item Level
const histUrl = new URL("../history.json", import.meta.url);
let hist = [];
try { hist = JSON.parse(await readFile(histUrl, "utf8")); } catch {}
const cp = info.profile?.combatPower || 0;
const ilvl = (info.stat?.statList || []).find(x => x.type === "ItemLevel")?.value || 0;
const last = hist[hist.length - 1];
if (!last || last.cp !== cp || last.ilvl !== ilvl) hist.push({ t: now, cp, ilvl });
await writeFile(histUrl, JSON.stringify(hist));
console.log(`OK: ${doc.query.name} @ ${doc.query.server} — CP ${cp}, item level ${ilvl}, ${Object.keys(items).length} items`);
