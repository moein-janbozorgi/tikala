import { notFound } from "next/navigation";
import { getProduct } from "./get-product";

// The 404 is decided here, above loading.tsx: inside it the page would already be streaming with status 200.
export default async function ProductLayout({ children, params }: LayoutProps<"/product/[id]">) {
  if (!getProduct((await params).id)) notFound();
  return children;
}
