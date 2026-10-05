import clsx from 'clsx';

const labels: Record<string, string> = {
  PENDING: '等待工作器', RUNNING: '处理中', SUCCEEDED: '已完成', FAILED: '失败', CANCELLED: '已取消', EXPIRED: '租约超时', ORPHANED: '失联'
};
const classes: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-700', RUNNING: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  SUCCEEDED: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', FAILED: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
  CANCELLED: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100', EXPIRED: 'bg-purple-50 text-purple-700 ring-1 ring-purple-100',
  ORPHANED: 'bg-orange-50 text-orange-700 ring-1 ring-orange-100'
};

export default function StatusBadge({ status }: { status: string }) {
  return <span className={clsx('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', classes[status] ?? classes.PENDING)}>{labels[status] ?? status}</span>;
}
