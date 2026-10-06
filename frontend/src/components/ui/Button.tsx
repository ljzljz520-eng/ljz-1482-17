import { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-500 active:scale-[0.98] shadow-lg shadow-blue-600/20",
  secondary: "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 active:scale-[0.98]",
  danger: "bg-rose-600 text-white hover:bg-rose-500 active:scale-[0.98] shadow-lg shadow-rose-600/20",
  ghost: "text-slate-600 hover:bg-slate-100 active:scale-[0.98]"
};

export default function Button({ variant = "primary", className, ...props }: Props) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}
