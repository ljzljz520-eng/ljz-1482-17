export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/70 ${className}`} />;
}

export function TableSkeleton() {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}
