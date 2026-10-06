import { useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { clearAllLocalData } from "@/lib/draftStorage";
import { workspaceApi } from "@/api/workspace";
import { getApiErrorMessage } from "@/api/client";

const checks = [
  ["用户退出团队", "成员若有未结任务，服务端拒绝退出；无未结任务后成员关系置为 LEFT。"],
  ["配额不足", "发起大于可用余额或团队剩余实际配额的导出，服务端不创建任务、不写冻结。"],
  ["取消后任务仍完成", "CANCEL_RACE 场景验证：取消和完成竞争时，最终成功只结算一次；正常取消则释放冻结。"],
  ["浏览器缓存清理", "清本机数据会删除 token、本机草稿与游标缓存，不删除任何云端项目。"],
  ["存储空间不足", "STORAGE_FULL 场景在结果落盘前检查空间，失败并释放冻结。"],
  ["工作器失联", "WORKER_LOST 场景停止心跳，后端超时巡检标记失败并释放。"],
  ["服务端租户隔离", "使用 other@workspace.test 登录只能看到远岸数据实验室，无法猜测 ID 下载北极星文件。"]
];

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  const clearLocal = () => {
    if (!window.confirm("清理浏览器缓存和本机数据？云端项目、账目、模板和历史不会被删除。")) return;
    clearAllLocalData();
    toast.success("本机数据已清理，请重新登录");
    logout();
    navigate("/login");
  };

  const leave = async () => {
    if (!window.confirm("退出团队将由服务端终止成员关系，确定继续？")) return;
    setLeaving(true);
    try {
      const { message } = await workspaceApi.leaveTeam();
      toast.success(message);
      logout();
      navigate("/login");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader title="账号与数据操作" description="本机数据和云端项目是两个独立操作，界面和接口均不互相级联。" />
        <div className="space-y-4 p-5">
          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-sm text-slate-500">当前用户</p>
            <p className="mt-1 text-xl font-black text-slate-900">{user?.name}</p>
            <p className="text-sm text-slate-500">{user?.email} · {user?.role}</p>
          </div>
          <Button className="w-full" variant="secondary" onClick={clearLocal}>清理本机浏览器数据</Button>
          <Button className="w-full" variant="danger" disabled={leaving} onClick={leave}>{leaving ? "处理中..." : "退出当前团队"}</Button>
          <p className="rounded-2xl bg-blue-50 p-4 text-xs leading-6 text-blue-800">
            删除云端项目入口位于“项目与游标”页，使用软删除保留历史导出、账目与模板来源；清理本机数据不会调用删除云端接口。
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="验收清单与预期行为" description="每个场景都可以通过界面按钮触发，不需要直接操作数据库。" />
        <div className="space-y-3 p-5">
          {checks.map(([title, desc], index) => (
            <div key={title} className="flex gap-4 rounded-2xl border border-slate-100 bg-white p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-black text-white">{index + 1}</span>
              <div>
                <p className="font-bold text-slate-900">{title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
