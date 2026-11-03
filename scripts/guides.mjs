// Checks the three Ranger guides for edits. Saves a plain-text copy of each in guides/,
// writes guides/status.json for the page and appends what changed to guides/CHANGES.md.
// Prints CHANGED=<names> for the workflow when something changed.
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";

const GUIDES = [
  { id: "allyria", name: "Allyria — Ranger Guide", file: "allyria.txt",
    url: "https://docs.google.com/document/d/1evrt_6e6WSHRT1vMem2i3O7ZlfANJbqyZoSn66IFrBo/export?format=txt",
    link: "https://docs.google.com/document/d/1evrt_6e6WSHRT1vMem2i3O7ZlfANJbqyZoSn66IFrBo/edit" },
  { id: "johnpal", name: "Johnpal — Gearing Path/Guides", file: "johnpal.txt",
    url: "https://docs.google.com/document/d/1aHnkPMLdt-n4yClxq2dvuStCciKQ-jYimFOmRBaohKE/export?format=txt",
    link: "https://docs.google.com/document/d/1aHnkPMLdt-n4yClxq2dvuStCciKQ-jYimFOmRBaohKE/edit" },
  { id: "johnpal-stats", name: "Johnpal — Ranger Stat Priorities", file: "johnpal-stats.csv",
    url: "https://docs.google.com/spreadsheets/d/1KrSNUdm1zDVKpYTbJ1bkWMFKg0Q2gdD5BA8z7dIie6U/gviz/tq?tqx=out:csv&gid=0",
    link: "https://docs.google.com/spreadsheets/d/1KrSNUdm1zDVKpYTbJ1bkWMFKg0Q2gdD5BA8z7dIie6U/edit?gid=0" }
];
const dir = new URL("../guides/", import.meta.url);
await mkdir(dir, { recursive: true });

const norm = t => t.replace(/^﻿/, "").replace(/\r/g, "").split("\n")
  .map(l => l.replace(/[ \t ]+$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";

function diff(oldT, newT) {           // multiset line diff: good enough to see what was edited
  const count = a => a.reduce((m, l) => (m.set(l, (m.get(l) || 0) + 1), m), new Map());
  const o = oldT.split("\n").filter(l => l.trim()), n = newT.split("\n").filter(l => l.trim());
  const co = count(o), cn = count(n), added = [], removed = [];
  for (const l of n) { if ((co.get(l) || 0) > 0) co.set(l, co.get(l) - 1); else added.push(l); }
  for (const l of o) { if ((cn.get(l) || 0) > 0) cn.set(l, cn.get(l) - 1); else removed.push(l); }
  return { added, removed };
}

let status = {};
try { status = JSON.parse(await readFile(new URL("status.json", dir), "utf8")); } catch {}
const now = new Date().toISOString();
const changed = [];
let log = "";

for (const g of GUIDES) {
  const st = status[g.id] || { name: g.name, link: g.link };
  st.name = g.name; st.link = g.link; st.checkedAt = now;
  try {
    const r = await fetch(g.url, { redirect: "follow" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const text = norm(await r.text());
    if (text.length < 500) throw new Error("слишком короткий ответ — возможно, доступ к документу закрыт");
    let old = null;
    try { old = await readFile(new URL(g.file, dir), "utf8"); } catch {}
    const m = text.match(/Last updated\s*[:\-]?\s*([0-9./-]+)/i);
    if (m) st.authorDate = m[1];
    st.error = null;
    if (old === null) { st.firstSeen = now; }
    else if (old !== text) {
      const d = diff(old, text);
      if (d.added.length || d.removed.length) {
        st.changedAt = now; st.lastAdded = d.added.length; st.lastRemoved = d.removed.length;
        st.lastSample = d.added.slice(0, 8);
        changed.push(g.id);
        const cut = (a) => a.slice(0, 40).map(l => "    " + l.slice(0, 300)).join("\n") + (a.length > 40 ? `\n    … и ещё ${a.length - 40}` : "");
        log += `\n## ${now.slice(0, 10)} — ${g.name}\n\nДобавлено строк: ${d.added.length}, удалено: ${d.removed.length}. [Открыть гайд](${g.link})\n\n`
          + (d.added.length ? "**Добавлено:**\n\n" + cut(d.added) + "\n\n" : "")
          + (d.removed.length ? "**Удалено:**\n\n" + cut(d.removed) + "\n\n" : "");
      }
    }
    await writeFile(new URL(g.file, dir), text);
  } catch (e) {
    st.error = String(e.message || e);
  }
  status[g.id] = st;
}

await writeFile(new URL("status.json", dir), JSON.stringify(status, null, 1));
if (log) {
  let head = "";
  try { await readFile(new URL("CHANGES.md", dir), "utf8"); } catch { head = "# Изменения в гайдах\n"; }
  await appendFile(new URL("CHANGES.md", dir), head + log);
  await writeFile(new URL("last-change.md", dir), "Обновились гайды стрелка:\n" + log);
}
console.log(changed.length ? "CHANGED=" + changed.join(",") : "CHANGED=");
for (const g of GUIDES) console.log(g.id, status[g.id].error ? "ERROR " + status[g.id].error : "ok");
