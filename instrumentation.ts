// Runs once when the server starts: a database backup now, then a check every hour (a new one is made once per day).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { dailyBackup } = await import("./lib/backup");
  const run = () => {
    try {
      dailyBackup();
    } catch (e) {
      console.error("Daily backup failed", e);
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000).unref();
}
