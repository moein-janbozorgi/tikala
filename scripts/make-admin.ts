// Usage: npm run make-admin -- you@example.com  (register on the site first)
import { db } from "../lib/db.ts";

const email = process.argv[2]?.toLowerCase();
const result = db.prepare("UPDATE users SET is_admin = 1 WHERE email = ?").run(email ?? "");
console.log(result.changes ? `${email} is now an admin.` : `No user with email "${email}". Register on the site first.`);
process.exitCode = result.changes ? 0 : 1;
