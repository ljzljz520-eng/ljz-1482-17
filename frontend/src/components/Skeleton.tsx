export const CardSkeleton = () => (
  <div className="animate-pulse rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
    <div className="h-4 w-1/3 rounded bg-slate-200" />
    <div className="mt-4 h-8 w-2/3 rounded bg-slate-100" />
    <div className="mt-4 h-3 w-full rounded bg-slate-100" />
  </div>
);
export const ListSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
    ))}
  </div>
);
