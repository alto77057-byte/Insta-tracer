import { allAccounts, fetchProfileRetry, saveProfile, isDue, logRun, DEMO } from "../lib/shared.mjs";

export default async (req) => {
  if (!process.env.ADMIN_KEY || req.headers.get("x-admin-key") !== process.env.ADMIN_KEY) {
    return new Response("forbidden", { status: 403 });
  }
  if (DEMO) return new Response("demo mode");
  const started = Date.now();
  const all = await allAccounts(), due = all.filter(isDue);
  console.log("snapshot: " + due.length + " account(s) due");
  let ok = 0;
  const failed = [];
  for (const a of due) {
    try {
      await saveProfile(await fetchProfileRetry(a.id));
      ok++;
    } catch (e) {
      failed.push({ id: a.id, err: String(e.message).slice(0, 120) });
      console.log("snapshot failed", a.id, e.message);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (due.length) await logRun({ kind: "run", accounts: all.length, due: due.length, ok, failed, secs: Math.round((Date.now() - started) / 1000) });
  return new Response("done");
};
