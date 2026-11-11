// Runs every 30 minutes and hands the work to the background function; only accounts that are due get a new snapshot.
import { logRun } from "../lib/shared.mjs";

export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  if (!base) { await logRun({ kind: "tick", status: "no site URL available" }); return; }
  let status = "failed";
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(`${base}/.netlify/functions/snapshot-background`, {
        method: "POST",
        headers: { "x-admin-key": process.env.ADMIN_KEY || "" },
      });
      status = String(r.status);
      if (r.status < 500) break;
    } catch (e) {
      status = "error: " + e.message;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log("snapshot trigger", status);
  await logRun({ kind: "tick", status });
};

export const config = { schedule: "*/30 * * * *" };
