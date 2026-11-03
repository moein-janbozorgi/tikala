import { readErrorParam } from "@/lib/validation";

/** Shows a ?error= message, but only one the server itself signed (see errorParam). */
export function ErrorMessage({ error }: { error?: string | string[] }) {
  const message = readErrorParam(error);
  if (!message) return null;
  return (
    <p role="alert" className="alert tone-danger mb-4">
      {message}
    </p>
  );
}
