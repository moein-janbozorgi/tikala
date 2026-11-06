import { Busy, GridSkeleton } from "../skeleton";

// Shown while the shop listing loads after a click. In its own route group, so it wraps only the home page: a loading
// boundary above a page makes it stream, and a page that answers 404 or redirects must not have streamed already.
export default function Loading() {
  return (
    <Busy>
      <div className="mb-6 flex gap-4 overflow-hidden p-1 pb-2 sm:gap-6">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex w-20 shrink-0 flex-col items-center gap-2 sm:w-24">
            <div className="skeleton size-14 rounded-full sm:size-16" />
            <div className="skeleton h-3 w-12" />
          </div>
        ))}
      </div>
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-7 w-20 rounded-full" />
        ))}
      </div>
      <GridSkeleton />
    </Busy>
  );
}