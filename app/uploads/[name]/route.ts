import { readUpload } from "@/lib/uploads";

// Serves product photos uploaded in the admin panel. Names are random UUIDs that never change, so they cache forever.
export async function GET(_req: Request, { params }: RouteContext<"/uploads/[name]">) {
  const file = await readUpload((await params).name);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.bytes, {
    headers: {
      "content-type": file.type,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
