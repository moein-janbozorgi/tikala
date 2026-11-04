import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getFlash } from "@/lib/flash";
import { resendWait } from "@/lib/otp";
import { normalizePhone, safeNext } from "@/lib/validation";
import { login, register, requestCode, verifyCode } from "../actions";
import { ErrorMessage } from "../error-message";
import { CloseIcon } from "../icons";
import { ACCOUNT_NAME_PATTERN, ACCOUNT_NAME_RULE, EMAIL_PATTERN } from "@/lib/rules";
import { FieldError, ValidatedForm } from "../validated-form";
import { CloseOnEscape } from "./close-on-escape";
import { ResendButton } from "./resend-button";

// The modal's own params; everything else in the URL belongs to the page under it.
const KEYS = ["auth", "next", "purpose", "mobile", "auth_error"];
type Props = { params: Promise<{ path?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Login, sign-up and the SMS-code step, as a modal over any page: `?auth=login|register|verify` on the current URL.
 * A slot of the root layout, so it reads the URL on the server and works without JavaScript.
 */
export default async function AuthModal({ params, searchParams }: Props) {
  const sp = await searchParams;
  const view = sp.auth;
  const purpose = sp.purpose === "link" ? "link" : "login";
  if (view !== "login" && view !== "register" && view !== "verify") return null;
  // purpose=link is a signed-in user adding a phone from the account page, so only the login flow is for guests.
  if (purpose === "login" && (await getUser())) return null;

  const path = "/" + ((await params).path ?? []).map(encodeURIComponent).join("/");
  const rest = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !KEYS.includes(e[0]) && typeof e[1] === "string"));
  const from = rest.size ? `${path}?${rest}` : path;
  const next = safeNext(sp.next ?? from);
  const to = (auth: string) => `${path}?${new URLSearchParams([...rest, ["auth", auth], ["next", next]])}`;
  const hidden = (
    <>
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="next" value={next} />
    </>
  );

  return (
    // Plain overlay rather than <dialog>, so the form shows on first paint and still works without JavaScript.
    <div className="fixed inset-0 z-50 flex overflow-y-auto overscroll-contain bg-black/50 p-4 backdrop-blur-sm">
      {/* Clicking the backdrop closes the modal, like the other dialogs. */}
      <Link href={from} aria-hidden tabIndex={-1} scroll={false} className="fixed inset-0" />
      <CloseOnEscape href={from} />
      <div role="dialog" aria-modal aria-labelledby="auth-title" className="card relative m-auto w-full max-w-sm space-y-6 p-8">
        <Link href={from} aria-label="بستن" scroll={false} className="icon-btn absolute inset-e-3 top-3">
          <CloseIcon />
        </Link>
        {view === "login" ? (
          <>
            <div>
              <h1 id="auth-title" className="text-2xl font-extrabold">ورود / ثبت‌نام</h1>
              <p className="mt-1 text-sm text-muted">با شماره موبایل وارد شوید؛ اگر حساب ندارید، ساخته می‌شود.</p>
            </div>
            <ErrorMessage error={sp.auth_error} />

            <ValidatedForm action={requestCode} className="space-y-4">
              {hidden}
              <input type="hidden" name="purpose" value="login" />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">شماره موبایل</span>
                <input name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="09121234567" required data-check="phone" className="input text-right" />
                <FieldError name="phone" label="شماره موبایل" />
              </label>
              <button className="btn w-full">دریافت کد ورود</button>
            </ValidatedForm>

            <details className="group border-t border-line pt-5">
              <summary className="cursor-pointer text-sm font-medium text-muted hover:text-ink">ورود با ایمیل و رمز عبور</summary>
              <ValidatedForm action={login} className="mt-4 space-y-4">
                {hidden}
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">ایمیل</span>
                  <input name="email" type="email" autoComplete="email" dir="ltr" required maxLength={254} className="input" />
                  <FieldError name="email" label="ایمیل" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">رمز عبور</span>
                  <input name="password" type="password" autoComplete="current-password" dir="ltr" required maxLength={64} className="input" />
                  <FieldError name="password" label="رمز عبور" />
                </label>
                <button className="btn-ghost w-full">ورود با ایمیل</button>
                <p className="text-sm text-muted">
                  رمز عبور را فراموش کرده‌اید؟ با شماره موبایلی که به حسابتان اضافه کرده‌اید وارد شوید و از صفحه حساب کاربری رمز جدید بسازید.
                </p>
                <p className="text-sm text-muted">
                  حساب ایمیلی ندارید؟{" "}
                  <Link href={to("register")} scroll={false} className="font-medium text-accent hover:underline">
                    ثبت‌نام با ایمیل
                  </Link>
                </p>
              </ValidatedForm>
            </details>
          </>
        ) : view === "register" ? (
          <Register hidden={hidden} error={sp.auth_error} loginHref={to("login")} />
        ) : (
          <Verify hidden={hidden} error={sp.auth_error} phone={normalizePhone(typeof sp.mobile === "string" ? sp.mobile : "") ?? ""} purpose={purpose} loginHref={to("login")} />
        )}
      </div>
    </div>
  );
}

type ViewProps = { hidden: React.ReactNode; error?: string | string[]; loginHref: string };

async function Register({ hidden, error, loginHref }: ViewProps) {
  const typed = await getFlash("register");
  return (
    <ValidatedForm action={register} className="space-y-4">
      <div>
        <h1 id="auth-title" className="text-2xl font-extrabold">ثبت‌نام</h1>
        <p className="mt-1 text-sm text-muted">برای ثبت سفارش یک حساب بسازید.</p>
      </div>
      <ErrorMessage error={error} />
      {hidden}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">نام و نام خانوادگی</span>
        <input
          name="name"
          defaultValue={typed.name}
          autoComplete="name"
          required
          maxLength={30}
          // Same rules as accountNameProblem() / emailProblem() on the server; `title` is the message shown when they fail.
          pattern={ACCOUNT_NAME_PATTERN}
          title={ACCOUNT_NAME_RULE}
          className="input"
        />
        <FieldError name="name" label="نام و نام خانوادگی" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">ایمیل</span>
        <input
          name="email"
          defaultValue={typed.email}
          type="email"
          autoComplete="email"
          dir="ltr"
          required
          maxLength={254}
          pattern={String.raw`\s*(?:${EMAIL_PATTERN})\s*`}
          title="ایمیل معتبر، مثال: name@example.com"
          placeholder="name@example.com"
          className="input"
        />
        <FieldError name="email" label="ایمیل" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">رمز عبور</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          required
          minLength={8}
          maxLength={64}
          // Same rule as passwordProblem() on the server; `title` is the message shown when it fails.
          pattern="(?=.*\p{L})(?=.*\p{Nd}).{8,64}"
          title="۸ تا ۶۴ کاراکتر، شامل حداقل یک حرف و یک عدد"
          aria-describedby="password-hint"
          className="input"
        />
        <span id="password-hint" className="mt-1.5 block text-xs text-muted">
          ۸ تا ۶۴ کاراکتر، شامل حداقل یک حرف و یک عدد
        </span>
        <FieldError name="password" label="رمز عبور" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">تکرار رمز عبور</span>
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          required
          data-match="password"
          data-match-message="رمز عبور و تکرار آن یکسان نیستند."
          className="input"
        />
        <FieldError name="confirm" label="تکرار رمز عبور" />
      </label>
      <button className="btn w-full">ثبت‌نام</button>
      <p className="text-center text-sm text-muted">
        حساب دارید؟{" "}
        <Link href={loginHref} scroll={false} className="font-medium text-accent hover:underline">
          ورود
        </Link>
      </p>
    </ValidatedForm>
  );
}

function Verify({ hidden, error, phone, purpose, loginHref }: ViewProps & { phone: string; purpose: "login" | "link" }) {
  const wait = phone ? resendWait(phone) : 0;
  const fields = (
    <>
      {hidden}
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="purpose" value={purpose} />
    </>
  );
  return (
    <>
      <div>
        <h1 id="auth-title" className="text-2xl font-extrabold">کد تأیید</h1>
        <p className="mt-1 text-sm text-muted">
          کد ۶ رقمی ارسال‌شده به <span dir="ltr">{phone}</span> را وارد کنید.
        </p>
      </div>
      <ErrorMessage error={error} />
      <ValidatedForm action={verifyCode} className="space-y-4">
        {fields}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">کد تأیید</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            required
            pattern="[0-9۰-۹]{6}"
            title="کد تأیید باید ۶ رقم باشد."
            className="input text-center text-xl tracking-[0.5em]"
          />
          <FieldError name="code" label="کد تأیید" />
        </label>
        {/* Shown to everyone (not only new numbers), so the modal reveals nothing about which numbers have accounts. */}
        {purpose === "login" ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">نام و نام خانوادگی (فقط برای حساب جدید)</span>
            <input name="name" autoComplete="name" maxLength={30} pattern={ACCOUNT_NAME_PATTERN} title={ACCOUNT_NAME_RULE} className="input" />
            <FieldError name="name" label="نام و نام خانوادگی" />
            <span className="mt-1.5 block text-xs text-muted">
              اگر قبلاً با ایمیل ثبت‌نام کرده‌اید، ابتدا با ایمیل وارد شوید و شماره را در حساب کاربری اضافه کنید تا دو حساب جدا ساخته نشود.
            </span>
          </label>
        ) : null}
        <button className="btn w-full">تأیید و ورود</button>
      </ValidatedForm>
      <div className="flex justify-between border-t border-line pt-5 text-sm">
        <form action={requestCode}>
          {fields}
          {/* key: a new code (or any re-render) restarts the countdown from the server's value. */}
          <ResendButton key={wait} wait={wait} />
        </form>
        <Link href={purpose === "link" ? "/account" : loginHref} scroll={false} className="text-muted hover:text-ink">
          تغییر شماره
        </Link>
      </div>
    </>
  );
}
