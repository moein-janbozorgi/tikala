import Link from "next/link";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/validation";
import { getFlash } from "@/lib/flash";
import { register } from "../actions";
import { AlreadySignedIn } from "../already-signed-in";
import { ErrorMessage } from "../error-message";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const user = await getUser();
  if (user) return <AlreadySignedIn name={user.name} />;
  const { error, next } = await searchParams;
  const typed = await getFlash("register");
  const target = safeNext(next);

  return (
    <form action={register} className="card mx-auto mt-6 max-w-sm space-y-4 p-8">
      <div>
        <h1 className="text-2xl font-extrabold">ثبت‌نام</h1>
        <p className="mt-1 text-sm text-muted">برای ثبت سفارش یک حساب بسازید.</p>
      </div>
      <ErrorMessage error={error} />
      <input type="hidden" name="next" value={target} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">نام و نام خانوادگی</span>
        <input
          name="name"
          defaultValue={typed.name}
          autoComplete="name"
          required
          maxLength={50}
          // Same rules as nameProblem() / emailProblem() on the server; the browser shows `title` when they fail.
          pattern="\s*[\p{L}\p{M}‌ ]{2,50}\s*"
          title="۲ تا ۵۰ کاراکتر، فقط حروف و فاصله"
          className="input"
        />
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
          pattern="\s*[^\s@]+@[^\s@]+\.[A-Za-z]{2,}\s*"
          title="ایمیل معتبر، مثال: name@example.com"
          placeholder="name@example.com"
          className="input"
        />
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
          // Same rule as passwordProblem() on the server; the browser shows `title` when it fails.
          pattern="(?=.*\p{L})(?=.*\p{Nd}).{8,64}"
          title="۸ تا ۶۴ کاراکتر، شامل حداقل یک حرف و یک عدد"
          aria-describedby="password-hint"
          className="input"
        />
        <span id="password-hint" className="mt-1.5 block text-xs text-muted">
          ۸ تا ۶۴ کاراکتر، شامل حداقل یک حرف و یک عدد
        </span>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">تکرار رمز عبور</span>
        <input name="confirm" type="password" autoComplete="new-password" dir="ltr" required className="input" />
      </label>
      <button className="btn w-full">ثبت‌نام</button>
      <p className="text-center text-sm text-muted">
        حساب دارید؟{" "}
        <Link href={`/login?next=${encodeURIComponent(target)}`} className="font-medium text-accent hover:underline">
          ورود
        </Link>
      </p>
    </form>
  );
}
