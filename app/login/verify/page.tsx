import Link from "next/link";
import { getUser } from "@/lib/auth";
import { normalizePhone, safeNext } from "@/lib/validation";
import { requestCode, verifyCode } from "../../actions";
import { AlreadySignedIn } from "../../already-signed-in";
import { ErrorMessage } from "../../error-message";

export default async function VerifyPage({ searchParams }: PageProps<"/login/verify">) {
  const params = await searchParams;
  const phone = normalizePhone(typeof params.phone === "string" ? params.phone : "") ?? "";
  const next = safeNext(params.next);
  const purpose = params.purpose === "link" ? "link" : "login";
  // purpose=link is a signed-in user adding a phone from the account page, so only the login flow is blocked.
  const user = purpose === "login" ? await getUser() : undefined;
  if (user) return <AlreadySignedIn name={user.name} />;
  const error = typeof params.error === "string" ? params.error : undefined;
  const hidden = (
    <>
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="purpose" value={purpose} />
    </>
  );

  return (
    <div className="card mx-auto mt-6 max-w-sm space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-extrabold">کد تأیید</h1>
        <p className="mt-1 text-sm text-muted">
          کد ۶ رقمی ارسال‌شده به <span dir="ltr">{phone}</span> را وارد کنید.
        </p>
      </div>
      <ErrorMessage error={error} />
      <form action={verifyCode} className="space-y-4">
        {hidden}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">کد تأیید</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            required
            pattern="[0-9۰-۹]{6}"
            title="کد ۶ رقمی"
            className="input text-center text-xl tracking-[0.5em]"
          />
        </label>
        {/* Shown to everyone (not only new numbers), so the page reveals nothing about which numbers have accounts. */}
        {purpose === "login" ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">نام و نام خانوادگی (فقط برای حساب جدید)</span>
            <input name="name" autoComplete="name" maxLength={50} className="input" />
            <span className="mt-1.5 block text-xs text-muted">
              اگر قبلاً با ایمیل ثبت‌نام کرده‌اید، ابتدا با ایمیل وارد شوید و شماره را در حساب کاربری اضافه کنید تا دو حساب جدا ساخته نشود.
            </span>
          </label>
        ) : null}
        <button className="btn w-full">تأیید و ورود</button>
      </form>
      <div className="flex justify-between border-t border-line pt-5 text-sm">
        <form action={requestCode}>
          {hidden}
          <button className="text-accent hover:underline">ارسال دوباره کد</button>
        </form>
        <Link href={purpose === "link" ? "/account" : `/login?next=${encodeURIComponent(next)}`} className="text-muted hover:text-ink">
          تغییر شماره
        </Link>
      </div>
    </div>
  );
}
