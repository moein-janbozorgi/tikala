/** Wraps a loading.tsx placeholder: marked busy, with a status line screen readers announce. */
export function Busy({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div aria-busy="true" className={className}>
      <span role="status" className="sr-only">
        در حال بارگذاری…
      </span>
      {children}
    </div>
  );
}

/** Product cards as grey blocks, in the shop grid's own columns. */
export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-2 sm:p-2.5">
          <div className="skeleton aspect-4/5 rounded-xl" />
          <div className="skeleton mt-3 h-3 w-1/3" />
          <div className="skeleton mt-2 h-4 w-4/5" />
          <div className="skeleton mt-3 h-5 w-1/2" />
          <div className="skeleton mt-4 h-9 rounded-full" />
        </div>
      ))}
    </div>
  );
}
