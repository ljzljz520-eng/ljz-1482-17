import { workspaceApi } from "@/api/workspace";
import { useAsync } from "@/hooks/useAsync";
import { Card, CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { formatDateTime } from "@/lib/format";
import type { LedgerEntry } from "@/types/domain";

const labels: Record<LedgerEntry["type"], { label: string; tone: "blue" | "green" | "orange" }> = {
  RESERVE: { label: "预留冻结", tone: "orange" },
  SETTLE: { label: "完成结算", tone: "green" },
  RELEASE: { label: "释放", tone: "blue" }
};

export default function BillingPage() {
  const overview = useAsync(() => workspaceApi.overview(), [], { pollMs: 2500 });
  const ledger = useAsync(() => workspaceApi.ledger(), [], { pollMs: 2500 });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="实际配额与账户余额" description="提交时扣减与完成时结算的折中模型：提交即冻结可用余额，完成只按实际消费计入 consumedTotal；取消/失败/失联释放冻结。" />
        <div className="grid gap-4 p-5 md:grid-cols-4">
          <Balance label="可用余额" value={overview.data?.account.availableBalance} />
          <Balance label="冻结预留" value={overview.data?.account.heldAmount} />
          <Balance label="累计实际消费" value={overview.data?.account.consumedTotal} />
          <Balance label="团队实际配额" value={overview.data?.account.actualQuota} />
        </div>
      </Card>

      <Card>
        <CardHeader title="预留 / 实际消费 / 释放流水" description="每条账目包含任务、金额、冻结增量、操作后的余额与冻结额；entryKey 在数据库唯一，防止重复入账。" />
        {ledger.loading || !ledger.data ? <TableSkeleton /> : (
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                  <th className="pb-3">时间</th>
                  <th>类型</th>
                  <th>余额变动</th>
                  <th>冻结变动</th>
                  <th>操作后余额/冻结</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {ledger.data.entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-50">
                    <td className="py-4 pr-4 text-xs text-slate-500">{formatDateTime(entry.createdAt)}</td>
                    <td className="py-4 pr-4"><Badge tone={labels[entry.type].tone}>{labels[entry.type].label}</Badge></td>
                    <td className={`py-4 pr-4 font-black ${entry.amount < 0 ? "text-rose-600" : entry.amount > 0 ? "text-emerald-600" : "text-slate-500"}`}>{entry.amount > 0 ? "+" : ""}{entry.amount}</td>
                    <td className={`py-4 pr-4 font-black ${entry.heldDelta < 0 ? "text-emerald-600" : entry.heldDelta > 0 ? "text-orange-600" : "text-slate-500"}`}>{entry.heldDelta > 0 ? "+" : ""}{entry.heldDelta}</td>
                    <td className="py-4 pr-4 font-bold text-slate-800">{entry.balanceAfter} / {entry.heldAfter}</td>
                    <td className="py-4 pr-4 text-xs leading-5 text-slate-500">{entry.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Balance({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-3xl bg-gradient-to-br from-slate-50 to-white p-5 ring-1 ring-slate-100">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-black text-slate-950">{value ?? "—"}</p>
    </div>
  );
}
