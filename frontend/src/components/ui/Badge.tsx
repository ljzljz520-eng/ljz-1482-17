import clsx from "clsx";

const tones: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200"
};

export default function Badge({ children, tone = "blue" }: { children: React.ReactNode; tone?: keyof typeof tones }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1", tones[tone])}>
      {children}
    </span>
  );
}
