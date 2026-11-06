import { Busy } from "../../skeleton";

export default function Loading() {
  return (
    <Busy className="grid gap-6 md:grid-cols-2 md:gap-10">
      <div className="skeleton aspect-4/5 w-full" />
      <div className="space-y-4">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-8 w-3/4" />
        <div className="skeleton h-7 w-40" />
        <div className="skeleton h-24 w-full" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton h-9 w-20 rounded-full" />
          ))}
        </div>
        <div className="skeleton h-11 w-full rounded-full" />
      </div>
    </Busy>
  );
}
