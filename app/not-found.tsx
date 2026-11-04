import Link from "next/link";
import { BagQuestionArt } from "./icons";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <BagQuestionArt className="mx-auto size-36" />
      <p className="mt-4 font-display text-6xl text-accent">۴۰۴</p>
      <h1 className="mt-4 text-xl font-bold">صفحه پیدا نشد</h1>
      <p className="mt-2 text-muted">ممکن است این صفحه یا محصول حذف شده یا آدرس اشتباه وارد شده باشد.</p>
      <Link href="/" className="btn mt-6">
        بازگشت به فروشگاه
      </Link>
    </div>
  );
}
