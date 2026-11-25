/** Lightweight skeleton primitives — no external deps. */

export const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded bg-gray-200 ${className}`} />
);

/** Card-shaped skeleton for grid/list pages. */
export const SkeletonCard = () => (
  <div className="bg-white rounded-lg border border-gray-200 p-4">
    <Skeleton className="h-4 w-1/3 mb-3" />
    <Skeleton className="h-3 w-2/3 mb-2" />
    <Skeleton className="h-3 w-1/2" />
  </div>
);

/** Table-row skeletons. */
export const SkeletonTable = ({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-3">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className="h-8 flex-1" />
        ))}
      </div>
    ))}
  </div>
);

/** Media grid skeleton (matches AdminMediaLibrary card grid). */
export const SkeletonGrid = ({ count = 12 }: { count?: number }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <Skeleton className="aspect-video w-full rounded-none" />
        <div className="p-2 space-y-1.5">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

/** Stat card skeleton for dashboard. */
export const SkeletonStats = ({ count = 4 }: { count?: number }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
        <Skeleton className="h-3 w-1/2 mb-2" />
        <Skeleton className="h-7 w-1/3" />
      </div>
    ))}
  </div>
);
