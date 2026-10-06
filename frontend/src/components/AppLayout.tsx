import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import clsx from "clsx";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import { workspaceApi } from "@/api/workspace";
import { clearAllLocalData } from "@/lib/draftStorage";
import { getApiErrorMessage } from "@/api/client";
import Button from "@/components/ui/Button";

const navItems = [
  { path: "/", label: "工作台" },
  { path: "/projects", label: "项目与游标" },
  { path: "/templates", label: "模板收藏" },
  { path: "/exports", label: "导出历史" },
  { path: "/billing", label: "配额账目" },
  { path: "/settings", label: "设置与验收" }
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const leaveTeam = async () => {
    if (!window.confirm("确认退出当前团队？有未结任务时服务端会拒绝。")) return;
    try {
      const { message } = await workspaceApi.leaveTeam();
      toast.success(message);
      logout();
      navigate("/login");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const clearLocal = () => {
    if (!window.confirm("仅清理本机浏览器数据（草稿、游标缓存、登录令牌），不会删除云端项目。")) return;
    clearAllLocalData();
    toast.success("本机数据已清理");
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-500 font-bold text-white shadow-lg shadow-blue-600/25">
              UC
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">UserCenter Workspace</p>
              <h1 className="text-lg font-bold text-slate-900">{user?.tenant.name}</h1>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-1 lg:pb-0">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  clsx(
                    "whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition",
                    isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-600 hover:bg-slate-100"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden text-right xl:block">
              <p className="text-sm font-bold text-slate-800">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.role}</p>
            </div>
            <Button variant="secondary" onClick={leaveTeam}>退出团队</Button>
            <Button variant="ghost" onClick={clearLocal}>清本机</Button>
            <Button variant="secondary" onClick={() => { logout(); navigate("/login"); }}>
              登出
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-10 text-center text-xs text-slate-400">
        清本机数据与删除云端项目是两个独立操作；导出链接由后端根据租户和任务归属再次授权。
      </footer>
    </div>
  );
}
