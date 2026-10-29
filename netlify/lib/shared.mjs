import { getStore } from "@netlify/blobs";

export const DEMO = !process.env.SCRAPECREATORS_KEY;
const API = "https://api.scrapecreators.com/v1/instagram/profile";
export const store = () => getStore({ name: "followpulse", consistency: "strong" });
export const today = () => new Date().toISOString().slice(0, 10);
const dayAgo = (i) => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);

// Finds a value anywhere in the JSON, so small response-shape changes don't break us.
function find(o, keys, kind) {
  if (Array.isArray(o)) {
    for (const v of o) { const r = find(v, keys, kind); if (r != null) return r; }
  } else if (o && typeof o === "object") {
    for (const k of keys) {
      let v = o[k];
      if (v && typeof v === "object" && "count" in v) v = v.count;
      if (kind === "n" && typeof v === "number") return Math.round(v);
      if (kind === "s" && typeof v === "string" && v) return v;
    }
    for (const v of Object.values(o)) { const r = find(v, keys, kind); if (r != null) return r; }
  }
  return null;
}

// ---- data provider (swap this function to change source later) ----
export async function fetchProfile(handle) {
  const res = await fetch(`${API}?handle=${encodeURIComponent(handle)}`, {
    headers: { "x-api-key": process.env.SCRAPECREATORS_KEY },
  });
  if (!res.ok) throw new Error(`Provider error ${res.status} (check key, credits or username)`);
  const j = await res.json();
  const subs = find(j, ["edge_followed_by", "follower_count", "followers_count", "followers"], "n");
  if (subs == null) throw new Error(`Could not read follower count for @${handle}`);
  return {
    handle,
    title: find(j, ["full_name"], "s") || handle,
    thumb: find(j, ["profile_pic_url_hd", "profile_pic_url"], "s") || "",
    subs,
  };
}

export async function saveProfile(p) {
  const s = store(), id = p.handle.toLowerCase(), key = "acc:" + id;
  const acc = (await s.get(key, { type: "json" })) || { id, handle: "@" + id, snaps: [] };
  acc.title = p.title;
  acc.thumb = p.thumb;
  acc.snaps = acc.snaps.filter((x) => x.day !== today()).concat({ day: today(), subs: p.subs }).slice(-400);
  await s.setJSON(key, acc);
}

export async function allAccounts() {
  const s = store();
  const { blobs } = await s.list({ prefix: "acc:" });
  const all = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return all.filter((a) => a && (DEMO || !a.demo));
}

function change(snaps, n) {
  if (snaps.length < 2) return null;
  const last = snaps[snaps.length - 1];
  const t = new Date(new Date(last.day).getTime() - n * 864e5).toISOString().slice(0, 10);
  const base = snaps.filter((x) => x.day <= t);
  return base.length ? last.subs - base[base.length - 1].subs : null;
}

export function summary(a) {
  const l = a.snaps[a.snaps.length - 1];
  return {
    id: a.id, title: a.title, handle: a.handle, thumb: a.thumb || "",
    subs: l ? l.subs : null, d1: change(a.snaps, 1), d7: change(a.snaps, 7), d30: change(a.snaps, 30),
  };
}

export async function seedDemo() {
  const s = store();
  if ((await s.list({ prefix: "acc:" })).blobs.length) return;
  for (const n of ["Nova Lane", "Aria Vale", "Kairo Stone", "Luna Ray", "Milo Hart", "Zara Quinn", "Jett Sol", "Ivy Moon"]) {
    const id = n.toLowerCase().replace(/ /g, "_");
    let v = 2e6 + Math.floor(Math.random() * 88e6);
    const drift = Math.floor(Math.random() * 30000) - 4000, snaps = [];
    for (let i = 30; i >= 0; i--) {
      v += drift + Math.floor(Math.random() * 21000) - 9000;
      snaps.push({ day: dayAgo(i), subs: v });
    }
    await s.setJSON("acc:" + id, { id, title: n, handle: "@" + id, thumb: "", snaps, demo: true });
  }
                             }
    
