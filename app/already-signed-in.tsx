"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { logout } from "./actions";
import { UserIcon } from "./icons";

/** Shown instead of the login/register forms to a visitor who is already signed in. Closing it goes home. */
export function AlreadySignedIn({ name }: { name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="signed-in-title"
      onClose={() => router.push("/")}
      // The dialog has no padding, so a click whose target is the dialog itself landed on the backdrop.
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-surface-2 [&>svg]:size-6">
          <UserIcon />
        </span>
        <h2 id="signed-in-title" className="text-lg font-bold">
          شما وارد حساب کاربری شده‌اید
        </h2>
        <p className="text-sm leading-7 text-muted">
          {name} عزیز، برای ورود یا ساخت حساب دیگر ابتدا از حساب فعلی خارج شوید.
        </p>
        <div className="mt-2 flex w-full gap-2">
          <Link href="/account" className="btn flex-1">
            حساب کاربری
          </Link>
          <form action={logout} className="flex-1">
            <button className="btn-ghost w-full">خروج از حساب</button>
          </form>
        </div>
      </div>
    </dialog>
  );
}
