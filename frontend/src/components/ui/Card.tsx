import { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export function Card({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={clsx(
        "rounded-3xl border border-white/80 bg-white/85 shadow-card backdrop-blur",
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
