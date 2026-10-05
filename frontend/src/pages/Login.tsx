import { useState } from 'react';
import toast from 'react-hot-toast';
import { Cloud, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '../store/auth';

const accounts = [
  ['admin@demo.local', '管理员 / 标准配额'],
  ['member@demo.local', '普通成员 / 可验证退出团队'],
  ['low@demo.local', '配额和存储不足验收'],
  ['leaving@demo.local', '退出团队验收']
];

export default function Login() {
  const login = useAuth(s => s.login);
  const [email, setEmail] = useState('admin@demo.local');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try { await login(email, password); } finally { setLoading(false); }
  };
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_35%),linear-gradient(135deg,#f8fafc,#eef4ff)] p-6">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_.9fr]">
        <section>
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm">
            <Cloud className="h-4 w-4" /> UserCenter Full-stack Workspace
          </div>
          <h1 className="mt-6 max-w-xl text-4xl font-black tracking-tight text-slate-950 md:text-6xl">
            项目游标、模板收藏与配额账目的统一工作台
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
            所有授权在服务端完成，成员关系、计费预留、实际结算和导出历史均持久化在关系数据库中。
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {['幂等导出', '租约围栏', '租户隔离'].map(item => (
              <div key={item} className="rounded-2xl bg-white/80 p-4 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur">{item}</div>
            ))}
          </div>
        </section>
        <form onSubmit={submit} className="rounded-[2rem] border border-white bg-white/90 p-8 shadow-2xl backdrop-blur">
          <h2 className="text-2xl font-bold text-slate-900">登录工作区</h2>
          <p className="mt-1 text-sm text-slate-500">演示账号密码均为 123456</p>
          <label className="mt-6 block text-sm font-semibold text-slate-700">邮箱</label>
          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 px-4 focus-within:border-blue-500">
            <Mail className="h-4 w-4 text-slate-400" />
            <input value={email} onChange={e => setEmail(e.target.value)} className="h-12 w-full bg-transparent outline-none" />
          </div>
          <label className="mt-4 block text-sm font-semibold text-slate-700">密码</label>
          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 px-4 focus-within:border-blue-500">
            <LockKeyhole className="h-4 w-4 text-slate-400" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="h-12 w-full bg-transparent outline-none" />
          </div>
          <button disabled={loading} className="mt-6 h-12 w-full rounded-2xl bg-blue-600 font-bold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:opacity-60">
            {loading ? '登录中...' : '进入工作台'}
          </button>
          <div className="mt-6 space-y-2">
            {accounts.map(([value, label]) => (
              <button type="button" key={value} onClick={() => { setEmail(value); setPassword('123456'); toast.success('已填入演示账号'); }}
                className="w-full rounded-2xl border border-slate-100 px-4 py-3 text-left text-sm transition hover:border-blue-200 hover:bg-blue-50/50">
                <span className="font-semibold text-slate-800">{value}</span><span className="float-right text-slate-500">{label}</span>
              </button>
            ))}
          </div>
        </form>
      </div>
    </main>
  );
}
