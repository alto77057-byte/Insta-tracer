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
    following: find(j, ["edge_follow", "following_count"], "n"),
    posts: find(j, ["media_count"], "n"), // only the explicit total: other counts can be just the latest batch
    ...postStats(j, subs),
  };
}

// Finds the list of recent posts anywhere in the response and averages their likes and comments.
function collectPosts(o, best = []) {
  if (Array.isArray(o)) {
    const items = o
      .map((e) => (e && typeof e === "object" ? e.node || e : null))
      .filter(Boolean)
      .map((n) => ({
        n,
        l: find(n, ["like_count", "edge_liked_by", "edge_media_preview_like", "likes"], "n"),
        c: find(n, ["comment_count", "edge_media_to_comment", "comments_count", "comments"], "n"),
      }))
      .filter((x) => x.l != null && x.c != null);
    if (items.length > best.length) best = items;
    for (const v of o) best = collectPosts(v, best);
  } else if (o && typeof o === "object") {
    for (const v of Object.values(o)) best = collectPosts(v, best);
  }
  return best;
}
function shapePost({ n, l, c }) {
  const str = (keys) => find(n, keys, "s");
  const code = str(["shortcode", "code"]);
  let t = find(n, ["taken_at_timestamp", "taken_at", "timestamp"], "n");
  if (t) t = t < 1e12 ? t * 1000 : t;
  const cap = typeof n.caption === "string" ? n.caption : n.edge_media_to_caption || n.caption ? find(n.edge_media_to_caption || n.caption, ["text"], "s") : null;
  const img = str(["thumbnail_src", "display_url", "thumbnail_url"]) || (n.image_versions2 ? find(n.image_versions2, ["url"], "s") : null);
  const video = n.is_video === true || n.media_type === 2 || /Video/.test(n.__typename || "");
  const multi = n.media_type === 8 || /Sidecar/.test(n.__typename || "");
  return {
    code: code || null, url: code ? "https://www.instagram.com/" + (video ? "reel/" : "p/") + code + "/" : null,
    t: t || null, l, c, v: find(n, ["video_view_count", "play_count", "view_count", "video_play_count"], "n"),
    img: img || null, cap: cap ? String(cap).slice(0, 140) : null, type: video ? "video" : multi ? "carousel" : "image",
  };
}
function postStats(j, subs) {
  const posts = collectPosts(j).filter((x) => x.l >= 0 && x.c >= 0).slice(0, 24); // hidden likes show as -1
  if (!posts.length) return {};
  const recent = posts.slice(0, 12).map(shapePost).filter((p) => p.code || p.l >= 0);
  const avgLikes = Math.round(posts.reduce((a, x) => a + x.l, 0) / posts.length);
  const avgComments = Math.round(posts.reduce((a, x) => a + x.c, 0) / posts.length);
  return { avgLikes, avgComments, eng: subs > 0 ? ((avgLikes + avgComments) / subs) * 100 : null, recent };
}

export const SNAP_HOURS = Math.max(0.5, Number(process.env.SNAPSHOT_HOURS) || 5);
const norm = (x) => (x.t ? x : { t: Date.parse(x.day + "T12:00:00Z"), subs: x.subs });

export async function saveProfile(p) {
  const s = store(), id = p.handle.toLowerCase(), key = "acc:" + id;
  const acc = (await s.get(key, { type: "json" })) || { id, handle: "@" + id, snaps: [] };
  const now = Date.now();
  const snaps = (acc.snaps || []).map(norm);
  if (snaps.length && now - snaps[snaps.length - 1].t < 10 * 60e3) snaps.pop();
  snaps.push({ t: now, subs: p.subs });
  // keep every snapshot for 3 days, then one per day (Indian date), so history stays small
  const cut = now - 3 * 864e5, old = new Map(), recent = [];
  for (const x of snaps) {
    if (x.t < cut) old.set(new Date(x.t + 19800000).toISOString().slice(0, 10), x);
    else recent.push(x);
  }
  acc.title = p.title;
  acc.thumb = p.thumb;
  const info = { following: p.following, posts: p.posts, avgLikes: p.avgLikes, avgComments: p.avgComments, eng: p.eng, recent: p.recent && p.recent.length ? p.recent : null };
  acc.info = { ...(acc.info || {}) };
  for (const k of Object.keys(info)) if (info[k] != null) acc.info[k] = info[k]; // keep the old value if this check didn't return it
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
  const want = hours * 36e5, tol = want >= 18 * 36e5 ? 90 * 60e3 : Math.min(Math.max(want * 0.2, 8 * 60e3), 45 * 60e3);
  // use the snapshot closest to the requested age; if none is close enough, show nothing
  let best = null;
  for (const x of snaps.slice(0, -1)) {
    const d = Math.abs(last.t - x.t - want);
    if (!best || d < best.d) best = { d, x };
  }
  return best && best.d <= tol ? last.subs - best.x.subs : null;
}

export function summary(a) {
  const s = a.snaps.map(norm), l = s[s.length - 1];
  return {
    id: a.id, title: a.title, handle: a.handle, thumb: a.thumb || "",
    subs: l ? l.subs : null, t: l ? l.t : null,
    following: (a.info || {}).following ?? null, posts: (a.info || {}).posts ?? null, avgLikes: (a.info || {}).avgLikes ?? null, avgComments: (a.info || {}).avgComments ?? null, eng: (a.info || {}).eng ?? null,
    m30: change(s, 0.5), h1: change(s, 1), d2: change(s, 2), h3: change(s, 3), d5: change(s, 5), d1: change(s, 24), d7: change(s, 168), d30: change(s, 720),
  };
}

export async function seedDemo() {
  const s = store();
  if ((await s.list({ prefix: "acc:" })).blobs.length) return;
  for (const n of ["Nova Lane", "Aria Vale", "Kairo Stone", "Luna Ray", "Milo Hart", "Zara Quinn", "Jett Sol", "Ivy Moon"]) {
    const id = n.toLowerCase().replace(/ /g, "_");
    let v = 2e6 + Math.floor(Math.random() * 88e6);
    const drift = Math.floor(Math.random() * 2400) - 320, snaps = [];
    for (let i = 365; i >= 0; i--) {
      v += drift + Math.floor(Math.random() * 1800) - 800;
      snaps.push({ t: Date.now() - i * 2 * 36e5, subs: v });
    }
    await s.setJSON("acc:" + id, { id, title: n, handle: "@" + id, thumb: "", snaps, demo: true });
  }
}
  
