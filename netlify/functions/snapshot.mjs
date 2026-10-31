// Runs every 30 minutes and hands the work to the background function; only accounts that are due get a new snapshot.
export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  if (!base) { console.log("snapshot: no site URL available"); return; }
  try {
    const r = await fetch(`${base}/.netlify/functions/snapshot-background`, {
      method: "POST",
      headers: { "x-admin-key": process.env.ADMIN_KEY || "" },
    });
    console.log("snapshot trigger status", r.status);
  } catch (e) {
    console.log("snapshot trigger failed", e.message);
  }
};

export const config = { schedule: "*/30 * * * *" };
