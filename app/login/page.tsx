import Link from "next/link";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/validation";
import { login, requestCode } from "../actions";
import { AlreadySignedIn } from "../already-signed-in";
import { ErrorMessage } from "../error-message";
import { FieldError, ValidatedForm } from "../validated-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getUser();
  if (user) return <AlreadySignedIn name={user.name} />;
  const { error, next } = await searchParams;
  const target = safeNext(next);

  return (
    <div className="card mx-auto mt-6 max-w-sm space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-extrabold">ورود / ثبت‌نام</h1>
        <p className="mt-1 text-sm text-muted">با شماره موبایل وارد شوید؛ اگر حساب ندارید، ساخته می‌شود.</p>
      </div>
      <ErrorMessage error={error} />

      <ValidatedForm action={requestCode} className="space-y-4">
        <input type="hidden" name="next" value={target} />
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
          <input type="hidden" name="next" value={target} />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">ایمیل</span>
            <input name="email" type="email" autoComplete="email" dir="ltr" required className="input" />
            <FieldError name="email" label="ایمیل" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">رمز عبور</span>
            <input name="password" type="password" autoComplete="current-password" dir="ltr" required className="input" />
            <FieldError name="password" label="رمز عبور" />
          </label>
          <button className="btn-ghost w-full">ورود با ایمیل</button>
          <p className="text-sm text-muted">
            رمز عبور را فراموش کرده‌اید؟ با شماره موبایلی که به حسابتان اضافه کرده‌اید وارد شوید و از صفحه حساب کاربری رمز جدید بسازید.
          </p>
          <p className="text-sm text-muted">
            حساب ایمیلی ندارید؟{" "}
            <Link href={`/register?next=${encodeURIComponent(target)}`} className="font-medium text-accent hover:underline">
              ثبت‌نام با ایمیل
            </Link>
          </p>
        </ValidatedForm>
      </details>
    </div>
  );
}
