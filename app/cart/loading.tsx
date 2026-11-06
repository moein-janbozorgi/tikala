import { Busy } from "../skeleton";

export default function Loading() {
  return (
    <Busy className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
            <div className="skeleton size-20 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-3 w-1/3" />
              <div className="skeleton h-5 w-1/4" />
            </div>
          </div>
        ))}
      </div>
      <div className="skeleton h-80" />
    </Busy>
  );
}
