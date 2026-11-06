import { requireUser } from "@/lib/auth";

// The sign-in redirect happens here, above loading.tsx, so it is a real redirect and not a page that already started.
export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  await requireUser("/account");
  return children;
}
