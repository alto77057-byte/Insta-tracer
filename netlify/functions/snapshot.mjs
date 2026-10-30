// Runs every hour; only accounts that are due get a new snapshot and hands the slow work to the background function.
export default async () => {
  await fetch(`${process.env.URL}/.netlify/functions/snapshot-background`, {
    method: "POST",
    headers: { "x-admin-key": process.env.ADMIN_KEY || "" },
  });
};

export const config = { schedule: "@hourly" };
