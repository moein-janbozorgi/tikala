import { Busy } from "../skeleton";

export default function Loading() {
  return (
    <Busy className="mx-auto max-w-3xl space-y-4">
      <div className="skeleton h-8 w-48" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="skeleton h-40" />
      ))}
    </Busy>
  );
}
