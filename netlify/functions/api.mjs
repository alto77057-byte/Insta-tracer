import { createHash, timingSafeEqual } from "node:crypto";
import { DEMO, SNAP_HOURS, store, fetchProfile, saveProfile, allAccounts, summary, seedDemo } from "../lib/shared.mjs";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const hash = (s) => createHash("sha256").update(String(s)).digest();
const isAdmin = (req) =>
  !!process.env.ADMIN_KEY && timingSafeEqual(hash(req.headers.get("x-admin-key") || ""), hash(process.env.ADMIN_KEY));

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  try {
    if (req.method === "GET") {
      if (route === "meta") return json({ demo: DEMO, hours: SNAP_HOURS });
      if (route === "accounts") {
        if (DEMO) await seedDemo();
        return json((await allAccounts()).map(summary));
      }
      if (route === "history") {
        const id = (url.searchParams.get("id") || "").toLowerCase();
        if (!/^[a-z0-9._]{1,30}$/.test(id)) return json([]);
        const a = await store().get("acc:" + id, { type: "json" });
        return json(a ? a.snaps : []);
      }
      if (route === "stats") {
        if (!isAdmin(req)) return json({ error: "Wrong admin key" }, 403);
        return json((await store().get("stats", { type: "json" })) || { totals: {}, days: {}, unique: 0 });
      }
      if (route === "waitlist") {
        if (!isAdmin(req)) return json({ error: "Wrong admin key" }, 403);
        return json((await store().get("waitlist", { type: "json" })) || []);
      }
    }
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (route === "add") {
        if (!process.env.ADMIN_KEY) return json({ error: "ADMIN_KEY is not set in Netlify" }, 500);
        if (!isAdmin(req)) return json({ error: "Wrong admin key" }, 403);
        if (DEMO) return json({ error: "Demo mode: set SCRAPECREATORS_KEY to add real accounts" }, 400);
        const q = String(body.q || "").trim().split("?")[0].replace(/\/+$/, "").split("/").pop().replace(/^@/, "");
        if (!/^[A-Za-z0-9._]{1,30}$/.test(q)) throw new Error("Enter a valid Instagram username");
        await saveProfile(await fetchProfile(q));
        return json({ ok: true });
      }
      if (route === "remove") {
        if (!process.env.ADMIN_KEY) return json({ error: "ADMIN_KEY is not set in Netlify" }, 500);
        if (!isAdmin(req)) return json({ error: "Wrong admin key" }, 403);
        const id = String(body.id || "").toLowerCase();
        if (!/^[a-z0-9._]{1,30}$/.test(id)) throw new Error("Invalid account");
        await store().delete("acc:" + id);
        return json({ ok: true });
      }
      if (route === "event") {
        const e = String(body.e || "");
        if (!["install_tap", "installed", "app_open"].includes(e)) throw new Error("bad event");
        const cid = String(body.cid || ""), s = store();
        const day = new Date(Date.now() + 19800000).toISOString().slice(0, 10); // Indian date
        const st = (await s.get("stats", { type: "json" })) || { totals: {}, days: {}, unique: 0 };
        st.totals[e] = (st.totals[e] || 0) + 1;
        const d = (st.days[day] = st.days[day] || {});
        d[e] = (d[e] || 0) + 1;
        if (e === "app_open" && /^[a-z0-9]{12,40}$/.test(cid)) {
          const k = "appid:" + cid, seen = await s.get(k, { type: "json" });
          if (!seen && (st.unique || 0) < 100000) { st.unique = (st.unique || 0) + 1; await s.setJSON(k, { first: day, last: day }); }
          else if (seen && seen.last !== day) { seen.last = day; await s.setJSON(k, seen); }
        }
        const keys = Object.keys(st.days).sort();
        while (keys.length > 60) delete st.days[keys.shift()];
        await s.setJSON("stats", st);
        return json({ ok: true });
      }
      if (route === "waitlist") {
        const email = String(body.email || "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) throw new Error("Enter a valid email");
        const s = store(), list = (await s.get("waitlist", { type: "json" })) || [];
        if (!list.includes(email) && list.length < 5000) await s.setJSON("waitlist", list.concat(email));
        return json({ ok: true });
      }
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
};

export const config = { path: "/api/*" };
