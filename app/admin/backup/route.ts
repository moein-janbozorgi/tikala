import { requireAdmin } from "@/lib/auth";
import { backupNow } from "@/lib/backup";

/** Downloads a fresh copy of the whole database (orders, customers, products). Admin only. */
export async function GET() {
  await requireAdmin();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(backupNow()), {
    headers: {
      "content-type": "application/vnd.sqlite3",
      "content-disposition": `attachment; filename="tikla-backup-${date}.db"`,
      "cache-control": "no-store",
    },
  });
}
