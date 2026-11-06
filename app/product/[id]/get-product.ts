import { cache } from "react";
import { db, type Product } from "@/lib/db";

// cache(): the layout, generateMetadata and the page all need it for the same request; one query answers them.
export const getProduct = cache((id: string) => db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(Number(id)) as Product | undefined);
