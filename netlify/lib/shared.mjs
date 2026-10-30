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

export const SNAP_HOURS = Math.max(1, Number(process.env.SNAPSHOT_HOURS) || 5);
const norm = (x) => (x.t ? x : { t: Date.parse(x.day + "T12:00:00Z"), subs: x.subs });

export async function saveProfile(p) {
  const s = store(), id = p.handle.toLowerCase(), key = "acc:" + id;
  const acc = (await s.get(key, { type: "json" })) || { id, handle: "@" + id, snaps: [] };
  const now = Date.now();
  const snaps = (acc.snaps || []).map(norm);
  if (snaps.length && now - snaps[snaps.length - 1].t < 30 * 60e3) snaps.pop();
  snaps.push({ t: now, subs: p.subs });
  // keep every snapshot for 3 days, then one per day, so history stays small
  const cut = now - 3 * 864e5, old = new Map(), recent = [];
  for (const x of snaps) {
    if (x.t < cut) old.set(new Date(x.t).toISOString().slice(0, 10), x);
    else recent.push(x);
  }
  acc.title = p.title;
  acc.thumb = p.thumb;
  acc.snaps = [...old.values(), ...recent].slice(-800);
  await s.setJSON(key, acc);
}

// true when this account's last snapshot is old enough for a new one
export const isDue = (a) => {
  const l = (a.snaps || [])[(a.snaps || []).length - 1];
  return !l || Date.now() - norm(l).t >= SNAP_HOURS * 36e5 - 10 * 60e3;
};

export async function allAccounts() {
  const s = store();
  const { blobs } = await s.list({ prefix: "acc:" });
  const all = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return all.filter((a) => a && (DEMO || !a.demo));
}

function change(snaps, hours) {
  if (snaps.length < 2) return null;
  const last = snaps[snaps.length - 1];
  const target = last.t - hours * 36e5 + 30 * 60e3; // 30 min of slack for cron timing
  const base = snaps.filter((x) => x.t <= target);
  return base.length ? last.subs - base[base.length - 1].subs : null;
}

export function summary(a) {
  const s = a.snaps.map(norm), l = s[s.length - 1];
  return {
    id: a.id, title: a.title, handle: a.handle, thumb: a.thumb || "",
    subs: l ? l.subs : null,
    d5: change(s, 5), d1: change(s, 24), d7: change(s, 168), d30: change(s, 720),
  };
}

export async function seedDemo() {
  const s = store();
  if ((await s.list({ prefix: "acc:" })).blobs.length) return;
  for (const n of ["Nova Lane", "Aria Vale", "Kairo Stone", "Luna Ray", "Milo Hart", "Zara Quinn", "Jett Sol", "Ivy Moon"]) {
    const id = n.toLowerCase().replace(/ /g, "_");
    let v = 2e6 + Math.floor(Math.random() * 88e6);
    const drift = Math.floor(Math.random() * 6000) - 800, snaps = [];
    for (let i = 150; i >= 0; i--) {
      v += drift + Math.floor(Math.random() * 4500) - 2000;
      snaps.push({ t: Date.now() - i * 5 * 36e5, subs: v });
    }
    await s.setJSON("acc:" + id, { id, title: n, handle: "@" + id, thumb: "", snaps, demo: true });
  }
    }
