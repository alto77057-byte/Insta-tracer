// Runs every 30 minutes and hands the work to the background function; only accounts that are due get a new snapshot.
export default async () => {
  await fetch(`${process.env.URL}/.netlify/functions/snapshot-background`, {
    method: "POST",
    headers: { "x-admin-key": process.env.ADMIN_KEY || "" },
  });
};

export const config = { schedule: "*/30 * * * *" };
