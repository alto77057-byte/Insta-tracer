import { createHash, timingSafeEqual } from "node:crypto";
import { DEMO, store, fetchProfile, saveProfile, allAccounts, summary, seedDemo } from "../lib/shared.mjs";

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
      if (route === "meta") return json({ demo: DEMO });
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
          
