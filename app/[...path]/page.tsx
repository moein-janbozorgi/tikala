import { notFound, redirect } from "next/navigation";

/** Any address no other route matches is sent to /404, which shows the not-found page with a real 404 status. */
export default async function Missing({ params }: PageProps<"/[...path]">) {
  const { path } = await params;
  if (path.join("/") === "404") notFound();
  redirect("/404");
}
