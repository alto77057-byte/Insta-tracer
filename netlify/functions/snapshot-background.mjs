import { allAccounts, fetchProfile, saveProfile, isDue, DEMO } from "../lib/shared.mjs";

export default async (req) => {
  if (!process.env.ADMIN_KEY || req.headers.get("x-admin-key") !== process.env.ADMIN_KEY) {
    return new Response("forbidden", { status: 403 });
  }
  if (DEMO) return new Response("demo mode");
  const due = (await allAccounts()).filter(isDue);
  console.log("snapshot: " + due.length + " account(s) due");
  for (const a of due) {
    try {
      await saveProfile(await fetchProfile(a.id));
    } catch (e) {
      console.log("snapshot failed", a.id, e.message);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return new Response("done");
};
