export function ErrorMessage({ error }: { error?: string | string[] }) {
  if (typeof error !== "string") return null;
  return (
    <p role="alert" className="alert tone-danger mb-4">
      {error}
    </p>
  );
}
