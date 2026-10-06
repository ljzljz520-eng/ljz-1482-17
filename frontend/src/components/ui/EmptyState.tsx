export default function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">
      <p className="font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-2 text-sm text-slate-500">{description}</p>}
    </div>
  );
}
