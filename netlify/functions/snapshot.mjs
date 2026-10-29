// Runs once a day (UTC) and hands the slow work to the background function.
export default async () => {
  await fetch(`${process.env.URL}/.netlify/functions/snapshot-background`, {
    method: "POST",
    headers: { "x-admin-key": process.env.ADMIN_KEY || "" },
  });
};

export const config = { schedule: "@daily" };
