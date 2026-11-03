import { cookies } from "next/headers";

// What the user typed, kept for 2 minutes after the server rejects a form so the page can fill it back in.
// Never holds passwords. Base64url keeps Persian text compact enough for the 4 KB cookie limit.
const COOKIE = "flash";

export async function setFlash(form: string, values: Record<string, string>) {
  (await cookies()).set(COOKIE, Buffer.from(JSON.stringify({ form, values })).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 120,
    path: "/",
  });
}

/** Values saved for this form, or {} when there are none (or they belong to another form). */
export async function getFlash(form: string): Promise<Record<string, string>> {
  try {
    const saved = JSON.parse(Buffer.from((await cookies()).get(COOKIE)?.value ?? "", "base64url").toString());
    return saved.form === form && saved.values && typeof saved.values === "object" ? saved.values : {};
  } catch {
    return {};
  }
}

export async function clearFlash() {
  (await cookies()).delete(COOKIE);
}
