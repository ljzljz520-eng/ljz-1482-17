import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getApiErrorMessage } from "@/api/client";

const demoAccounts = [
  ["admin@workspace.test", "团队所有者"],
  ["member@workspace.test", "普通成员"],
  ["editor@workspace.test", "可验收退出团队"],
  ["other@workspace.test", "另一租户"]
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("admin@workspace.test");
  const [password, setPassword] = useState("123456");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login({ email, password });
      toast.success("登录成功，已加载服务端授权的工作区");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "登录失败"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-orange-50 px-4 py-10">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-center rounded-[2rem] bg-slate-950 p-8 text-white shadow-2xl md:p-12">
          <span className="mb-5 inline-flex w-fit rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100">
            UserCenter · 全栈团队工作区
          </span>
          <h1 className="text-3xl font-bold leading-tight md:text-5xl">
            项目游标、模板收藏、真实配额和导出账单一处管理
          </h1>
          <p className="mt-5 leading-8 text-slate-300">
            所有数据由后端按租户授权返回。重复点击、失败重试、取消竞争和工作器失联均通过数据库事务与预留账目保证不重复扣额度。
          </p>
          <div className="mt-8 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
            {["关系型持久化", "服务端下载鉴权", "跨设备游标恢复", "本机草稿保护"].map((item) => (
              <div key={item} className="rounded-2xl bg-white/8 px-4 py-3 ring-1 ring-white/10">
                ✓ {item}
              </div>
            ))}
          </div>
        </section>

        <Card className="p-6 md:p-8">
          <h2 className="text-2xl font-bold text-slate-900">登录工作区</h2>
          <p className="mt-2 text-sm text-slate-500">演示账号统一密码：123456</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">邮箱</span>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">密码</span>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                required
              />
            </label>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "登录中..." : "进入工作区"}
            </Button>
          </form>
          <div className="mt-6 grid gap-2">
            {demoAccounts.map(([account, label]) => (
              <button
                key={account}
                type="button"
                onClick={() => setEmail(account)}
                className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm transition hover:bg-blue-50"
              >
                <span className="font-medium text-slate-700">{account}</span>
                <span className="text-slate-400">{label}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
