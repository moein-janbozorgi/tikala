import Link from "next/link";
import { safeNext } from "@/lib/auth";
import { login } from "../actions";
import { ErrorMessage } from "../error-message";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  const target = safeNext(next);

  return (
    <form action={login} className="card mx-auto mt-6 max-w-sm space-y-4 p-8">
      <div>
        <h1 className="text-2xl font-extrabold">ورود</h1>
        <p className="mt-1 text-sm text-muted">خوش برگشتی!</p>
      </div>
      <ErrorMessage error={error} />
      <input type="hidden" name="next" value={target} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">ایمیل</span>
        <input name="email" type="email" autoComplete="email" dir="ltr" required className="input" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">رمز عبور</span>
        <input name="password" type="password" autoComplete="current-password" dir="ltr" required className="input" />
      </label>
      <button className="btn w-full">ورود</button>
      <p className="text-center text-sm text-muted">
        حساب ندارید؟{" "}
        <Link href={`/register?next=${encodeURIComponent(target)}`} className="font-medium text-accent hover:underline">
          ثبت‌نام
        </Link>
      </p>
    </form>
  );
}
