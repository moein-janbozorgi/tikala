import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { FREE_SHIPPING_FROM, shippingCost, toman } from "@/lib/format";
import { CONTACT, FEATURES, SOCIAL } from "../footer";

export const metadata: Metadata = {
  title: "درباره ما",
  description: "بوتیک آنلاین تیکلا؛ لباس، کفش و عینک مد روز با انتخاب سایز و رنگ، پرداخت آنلاین یا هنگام تحویل و ارسال به سراسر ایران.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  const categories = (db.prepare("SELECT DISTINCT category FROM products WHERE active = 1 AND category != '' ORDER BY category").all() as { category: string }[]).map(
    (c) => c.category,
  );

  return (
    <article className="mx-auto max-w-3xl space-y-6 leading-8">
      <header className="rounded-3xl bg-brand px-6 py-10 text-brand-ink sm:px-10">
        <p className="mb-3 inline-block rounded-full bg-brand-ink px-3 py-1 text-xs font-bold text-brand">درباره ما</p>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">بوتیک تیکلا</h1>
        <p className="mt-4 text-brand-ink/80">
          تیکلا یک بوتیک آنلاین لباس است برای کسانی که می‌خواهند ساده، راحت و مد روز لباس بپوشند. هر محصول را با عکس، توضیحات، سایز و رنگ موجود
          می‌بینید و بدون رفتن به بازار، سفارشتان را درِ خانه تحویل می‌گیرید.
        </p>
      </header>

      <section className="card">
        <h2 className="text-lg font-bold">چه چیزهایی پیدا می‌کنید؟</h2>
        <p className="mt-2 text-muted">
          لباس‌های روزمره و مجلسی برای فصل‌های مختلف، به همراه کفش و عینک. هر دسته راهنمای سایز خودش را دارد تا سایز مناسب را راحت‌تر انتخاب
          کنید.
        </p>
        {categories.length ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {categories.map((c) => (
              <li key={c}>
                <Link href={`/?${new URLSearchParams({ category: c })}`} className="chip">
                  {c}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="card">
        <h2 className="text-lg font-bold">خرید از تیکلا</h2>
        <ul className="mt-3 list-disc space-y-2 ps-5 text-muted">
          <li>سایز و رنگ را در صفحه هر محصول انتخاب می‌کنید و فقط کالاهای موجود قابل سفارش هستند.</li>
          <li>پرداخت به‌صورت آنلاین از درگاه امن بانکی یا نقدی هنگام تحویل سفارش انجام می‌شود.</li>
          <li>
            سفارش‌ها به سراسر ایران ارسال می‌شوند. هزینه ارسال {toman(shippingCost(0))} است و برای خریدهای بالای {toman(FREE_SHIPPING_FROM)} رایگان
            است.
          </li>
          <li>وضعیت سفارش را در حساب کاربری می‌بینید و هنگام ارسال، کد رهگیری مرسوله برایتان پیامک می‌شود.</li>
          <li>تا وقتی سفارش بررسی نشده، می‌توانید خودتان آن را از حساب کاربری لغو کنید.</li>
        </ul>
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.label} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 text-sm [&>svg]:size-6 [&>svg]:shrink-0">
              {f.icon}
              {f.label}
            </li>
          ))}
        </ul>
      </section>

      {CONTACT.length || SOCIAL.length ? (
        <section className="card">
          <h2 className="text-lg font-bold">تماس با ما</h2>
          <p className="mt-2 text-muted">برای سؤال درباره محصولات، سایز یا سفارش‌تان با ما در تماس باشید.</p>
          <ul className="mt-3 space-y-2">
            {CONTACT.map((c) => (
              <li key={c.label}>
                <span className="text-muted">{c.label}: </span>
                {c.href ? (
                  <a href={c.href} dir="ltr" className="text-accent underline underline-offset-4">
                    {c.value}
                  </a>
                ) : (
                  c.value
                )}
              </li>
            ))}
            {SOCIAL.map((s) => (
              <li key={s.label}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-accent hover:underline [&>svg]:size-5">
                  {s.icon}
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-center">
        <Link href="/" className="btn">
          مشاهده محصولات
        </Link>
      </p>
    </article>
  );
}
