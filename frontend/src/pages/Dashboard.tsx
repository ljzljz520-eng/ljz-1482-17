import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Archive, Bookmark, CloudOff, Database, Download, FileUp, FolderKanban, HardDrive, History,
  Layers, MonitorSmartphone, Play, RefreshCw, Save, ShieldCheck, Trash2, Wallet, XCircle
} from 'lucide-react';
import { fetchTenant, leaveTenant } from '../api/auth';
import { createProject, deleteProject, getCursors, listProjects, putCursor } from '../api/projects';
import { addFavorite, deleteTemplate, listFavorites, listTemplates, publishTemplate, removeFavorite, updateFavorite } from '../api/templates';
import {
  cancelTask, completeTask, createTask, downloadArtifact, failTask, leaseTask, listLedger,
  listTasks, retryTask, runReaper
} from '../api/exports';
import type { ExportTask, Favorite, LedgerEntry, Project, ProjectCursor, Template, Tenant } from '../types';
import { CardSkeleton, ListSkeleton } from '../components/Skeleton';
import StatusBadge from '../components/StatusBadge';
import { formatBytes, formatDate } from '../utils/format';
import { clearLocalWorkspace, clearExportIntent, cursorKey, getDeviceId, readDraft, readExportIntent, writeDraft, writeExportIntent } from '../utils/local';
import { useAuth } from '../store/auth';
import { tokenStorageKey } from '../api/client';
import { simulateWorkerLostApi } from '../api/exports';

const deviceId = getDeviceId();
const newIdempotencyKey = () => `${deviceId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const Section = ({ icon, title, desc, children, action }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm shadow-slate-200/50 md:p-6">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">{icon}</div>
        <div><h2 className="text-lg font-bold text-slate-950">{title}</h2><p className="mt-0.5 text-sm text-slate-500">{desc}</p></div>
      </div>{action}
    </div>
    <div className="mt-5">{children}</div>
  </section>
);

export default function Dashboard() {
  const { user, tenantName, logoutLocal } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [tasks, setTasks] = useState<ExportTask[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState('');
  const [quality, setQuality] = useState<'DRAFT'|'STANDARD'|'PREMIUM'>('STANDARD');
  const [failureMode, setFailureMode] = useState<'NONE'|'FAIL_ONCE'|'WORKER_LOST'>('NONE');
  const [draft, setDraft] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [favoriteForProject, setFavoriteForProject] = useState('');
  const [busy, setBusy] = useState('');
  const [remoteCursors, setRemoteCursors] = useState<ProjectCursor[]>([]);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [t, p, tm, f, task, logs] = await Promise.all([
        fetchTenant(), listProjects(), listTemplates(), listFavorites(), listTasks(), listLedger()
      ]);
      setTenant(t); setProjects(p); setTemplates(tm); setFavorites(f); setTasks(task); setLedger(logs);
      const openProjectIds = new Set(task.filter(item => ['PENDING', 'RUNNING'].includes(item.status)).map(item => item.projectId));
      const latestByProject = new Map<string, ExportTask>();
      task.forEach(item => { if (!latestByProject.has(item.projectId)) latestByProject.set(item.projectId, item); });
      p.forEach(project => {
        const latest = latestByProject.get(project.id);
        if (latest && !openProjectIds.has(project.id) && ['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(latest.status)) {
          clearExportIntent(project.id);
        }
      });
      setSelectedProject(current => p.some(project => project.id === current) ? current : (p[0]?.id ?? ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(true); const timer = setInterval(() => void refresh(true), 10000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => {
    if (!selectedProject) return;
    setDraft(readDraft(selectedProject));
    setRemoteCursors([]);
  }, []);

  const currentProject = projects.find(p => p.id === selectedProject);

  const run = async (label: string, action: () => Promise<unknown>, reload = true) => {
    setBusy(label);
    try { const result = await action(); if (typeof result === 'object' && result && 'message' in result) toast.success(String(result.message)); return result; }
    finally { setBusy(''); if (reload) await refresh(true); }
  };

  const createExport = async () => {
    if (!selectedProject) return;
    const idempotencyKey = readExportIntent(selectedProject) ?? newIdempotencyKey();
    writeExportIntent(selectedProject, idempotencyKey);
    const first = await run('export', () => createTask({ projectId: selectedProject, quality, failureMode, idempotencyKey }));
    if (first && typeof first === 'object' && 'replayed' in first) {
      toast('重复点击被 Idempotency-Key 合并，没有重复预留', { icon: '🛡️' });
    } else if (typeof first === 'object' && first && 'status' in first && ['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(String((first as { status: string }).status))) {
      clearExportIntent(selectedProject);
    }
  };

  const openProject = async (id: string) => {
    setSelectedProject(id);
    try {
      const remote = await getCursors(id);
      setRemoteCursors(remote);
      const latestOther = remote.find(item => item.deviceId !== deviceId);
      const local = readDraft(id);
      if (latestOther && !local) {
        setDraft(latestOther.data);
        writeDraft(id, latestOther.data);
        toast('已从其他设备恢复最近访问游标');
      } else if (latestOther && local) {
        localStorage.setItem(cursorKey(id), latestOther.data);
        toast('发现其他设备游标，已保留本机未保存草稿');
      }
    } catch { /* non-blocking cursor recovery */ }
  };

  const saveCursor = async () => {
    if (!selectedProject) return;
    await putCursor(selectedProject, deviceId, draft || '空内容游标');
    localStorage.removeItem(cursorKey(selectedProject));
    toast.success('访问游标已保存到云端，可跨设备恢复');
    await refresh(true);
  };

  const clearLocal = () => {
    if (!window.confirm('将清除本机草稿、游标缓存和登录态，但不会删除任何云端项目。继续？')) return;
    clearLocalWorkspace();
    toast.success('本机数据已清理');
    setTimeout(() => window.location.assign('/'), 500);
  };

  const removeCloudProject = async () => {
    if (!selectedProject) return;
    if (!window.confirm('这是独立的云端删除操作，不会清理本机数据。确定删除项目及其云上游标？')) return;
    await run('delete-project', () => deleteProject(selectedProject));
    setSelectedProject(projects.find(p => p.id !== selectedProject)?.id ?? '');
  };

  const leave = async () => {
    if (!window.confirm('退出团队后服务端成员关系立即失效，本机登录态也会清除。继续？')) return;
    const result = await leaveTenant();
    toast.success(result.message);
    localStorage.removeItem(tokenStorageKey);
    setTimeout(() => { logoutLocal(); window.location.assign('/'); }, 800);
  };

  const ledgerKind = useMemo(() => ({
    CREDIT: '充值', RESERVE: '预留', CONSUME: '实际消费', RELEASE: '释放', COMPENSATE: '补偿'
  }), []);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20"><Layers className="h-5 w-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">UserCenter</p><h1 className="text-xl font-black text-slate-950">{tenantName || '全栈工作区'}</h1></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600"><MonitorSmartphone className="mr-1 inline h-4 w-4" />{deviceId}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700"><ShieldCheck className="mr-1 inline h-4 w-4" />{user?.name} · {user?.role}</span>
            <button onClick={clearLocal} className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700">清本机数据</button>
            <button onClick={leave} className="rounded-full bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-700">退出团队</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-8">
        {loading && !tenant ? <div className="grid gap-4 md:grid-cols-4"><CardSkeleton/><CardSkeleton/><CardSkeleton/><CardSkeleton/></div> : null}
        {tenant && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { icon: <Wallet/>, label: '真实余额', value: `${tenant.balance} units`, desc: '成功完成才实际扣减' },
              { icon: <Archive/>, label: '未结预留', value: `${tenant.reservedUnits} units`, desc: `${tenant.openTaskCount} 个未结任务` },
              { icon: <Database/>, label: '可用额度', value: `${tenant.availableUnits} units`, desc: '余额减去全部预留' },
              { icon: <HardDrive/>, label: '存储空间', value: `${formatBytes(tenant.storageUsed)} / ${formatBytes(tenant.storageQuota)}`, desc: `成员 ${tenant.memberCount} 人` }
            ].map(card => (
              <div key={card.label} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                <div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-500">{card.label}</p><span className="text-blue-600">{card.icon}</span></div>
                <p className="mt-3 text-2xl font-black text-slate-950">{card.value}</p><p className="mt-1 text-sm text-slate-500">{card.desc}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <Section icon={<FolderKanban className="h-5 w-5"/>} title="项目游标与编辑草稿" desc="游标跨设备同步；本机未保存草稿由 localStorage 独立保护，不会被另一台设备覆盖。">
            <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
              <div className="space-y-3">
                {loading ? <ListSkeleton rows={3}/> : projects.map(project => (
                  <button key={project.id} onClick={() => void openProject(project.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedProject === project.id ? 'border-blue-400 bg-blue-50/70 shadow-sm' : 'border-slate-200 hover:border-blue-200 hover:bg-slate-50'}`}>
                    <div className="flex items-center justify-between gap-3"><p className="font-bold text-slate-900">{project.name}</p><StatusBadge status={project.tasks[0]?.status ?? 'READY'} /></div>
                    <p className="mt-2 text-xs text-slate-500">来源：{project.sourceTemplate ? `${project.sourceTemplate.name} ${project.sourceTemplate.isDeleted ? '（模板已删除，快照保留）' : ''}` : '空白项目'}</p>
                    <p className="mt-1 text-xs text-slate-400">最近游标：{formatDate(project.cursors[0]?.updatedAt)} · {project.cursors[0]?.deviceId ?? '暂无'}</p>
                  </button>
                ))}
                <div className="rounded-2xl border border-dashed border-slate-300 p-3">
                  <input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="新项目名称" className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-500" />
                  <select value={favoriteForProject} onChange={e => setFavoriteForProject(e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3">
                    <option value="">空白创建</option>
                    {favorites.map(item => <option key={item.id} value={item.id}>{item.template.name} · {item.mode === 'PINNED' ? `固定 v${item.version?.version ?? item.template.versions[0]?.version}` : '跟随最新'}</option>)}
                  </select>
                  <button disabled={!newProjectName || busy === 'new'} onClick={() => run('new', () => createProject({ name: newProjectName, templateFavoriteId: favoriteForProject || undefined }).then(p => { setNewProjectName(''); setSelectedProject(p.id); }))} className="mt-2 h-10 w-full rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-700">从模板收藏创建（复制独立快照）</button>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-slate-900">{currentProject?.name ?? '请选择项目'}</h3>
                  <div className="flex gap-2">
                    <button onClick={() => void saveCursor()} disabled={!selectedProject || busy === 'cursor'} className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"><Save className="h-3.5 w-3.5"/>保存云游标</button>
                    <button onClick={() => void removeCloudProject()} disabled={!selectedProject} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"><CloudOff className="h-3.5 w-3.5"/>删云端项目</button>
                  </div>
                </div>
                <textarea value={draft} onChange={e => { setDraft(e.target.value); if (selectedProject) writeDraft(selectedProject, e.target.value); }} placeholder="在此输入本机编辑草稿；其他设备打开同一项目不会覆盖它。" className="mt-3 h-56 w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm outline-none focus:border-blue-500" />
                {selectedProject && <p className="mt-2 text-xs text-slate-500">本机草稿实时写入 localStorage；点击“保存云游标”后才同步访问位置。</p>}
                {remoteCursors.some(cursor => cursor.deviceId !== deviceId) && (
                  <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                    <p className="font-bold">跨设备游标已找到</p>
                    {remoteCursors.filter(cursor => cursor.deviceId !== deviceId).map(cursor => (
                      <div key={cursor.id} className="mt-2 flex items-center justify-between gap-3">
                        <span>{cursor.deviceId} · {formatDate(cursor.updatedAt)}</span>
                        <button onClick={() => { if (!draft || window.confirm('载入云游标会替换当前编辑框，是否继续？')) { setDraft(cursor.data); writeDraft(selectedProject, cursor.data); } }} className="rounded-full bg-white px-2 py-1 font-bold text-blue-700">显式载入</button>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            </div>
          </Section>

          <Section icon={<Bookmark className="h-5 w-5"/>} title="模板收藏与版本策略" desc="固定版本和跟随发布必须显式选择；删除模板不会抹掉既有项目的来源快照。">
            <div className="space-y-3">
              {loading ? <ListSkeleton rows={3}/> : templates.map(template => {
                const favorite = favorites.find(item => item.templateId === template.id);
                return (
                  <article key={template.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-bold text-slate-900">{template.name}</p><p className="mt-1 text-sm text-slate-500">{template.description}</p><p className="mt-2 text-xs font-semibold text-slate-400">当前发布 v{template.currentVersion} · {template.versions[0]?.changeNote}</p></div>
                      {favorite ? <button onClick={() => run('unfav', () => removeFavorite(favorite.id))} className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-700">已收藏</button> : <button onClick={() => run('fav', () => addFavorite(template.id, 'PINNED'))} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold hover:border-blue-300">收藏并固定当前版</button>}
                    </div>
                    {favorite && <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {(['PINNED','FOLLOW_LATEST'] as const).map(mode => <button key={mode} onClick={() => run('mode', () => updateFavorite(favorite.id, mode))} className={`rounded-full px-3 py-1.5 font-bold ${favorite.mode === mode ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{mode === 'PINNED' ? '固定版本' : '跟随最新发布'}</button>)}
                    </div>}
                    {user?.role !== 'MEMBER' && <div className="mt-3 flex gap-3"><button onClick={() => run('publish-template', () => publishTemplate(template.id))} className="text-xs font-bold text-blue-600 hover:text-blue-800">发布新版本</button><button onClick={() => run('delete-template', () => deleteTemplate(template.id))} className="text-xs font-bold text-rose-600 hover:text-rose-800">删除模板（保留项目来源快照）</button></div>}
                  </article>
                );
              })}
            </div>
          </Section>
        </div>

        <Section icon={<FileUp className="h-5 w-5"/>} title="导出任务、取消竞争与工作器失联" desc="提交时建立预留，完成时按实际消费结算；多次点击、失败重试和取消竞争由数据库原子账目保护。" action={<button onClick={() => run('reaper', runReaper)} className="rounded-full border border-purple-200 px-3 py-2 text-xs font-bold text-purple-700 hover:bg-purple-50"><RefreshCw className="mr-1 inline h-3.5 w-3.5"/>立即运行失联清理器</button>}>
          <div className="grid gap-4 lg:grid-cols-[.8fr_2fr]">
            <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
              <label className="text-sm font-bold text-slate-700">导出规格</label>
              <select value={quality} onChange={e => setQuality(e.target.value as typeof quality)} className="h-11 w-full rounded-xl border border-slate-200 px-3">
                <option value="DRAFT">草稿 · 预留 4 units</option><option value="STANDARD">标准 · 预留 10 units</option><option value="PREMIUM">高级 · 预留 18 units</option>
              </select>
              <select value={failureMode} onChange={e => setFailureMode(e.target.value as typeof failureMode)} className="h-11 w-full rounded-xl border border-slate-200 px-3">
                <option value="NONE">正常完成</option><option value="FAIL_ONCE">模拟失败后重试</option><option value="WORKER_LOST">模拟工作器失联</option>
              </select>
              <button onClick={() => void createExport()} disabled={!selectedProject || busy === 'export'} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700 disabled:opacity-50"><FileUp className="h-4 w-4"/>连续点击也只预留一次</button>
              <p className="text-xs leading-5 text-slate-500">低配额团队选择“标准”或“高级”可验收 402；小存储团队可验收 507。“失败”需领取后点上报失败；“失联”需领取后点模拟失联。</p>
            </div>
            <div className="space-y-3">
              {loading ? <ListSkeleton rows={4}/> : tasks.slice(0, 7).map(task => (
                <article key={task.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><p className="font-bold text-slate-900">{task.project?.name ?? '项目任务'}</p><p className="text-xs text-slate-400">{formatDate(task.createdAt)} · fence v{task.leaseToken}</p></div>
                    <StatusBadge status={task.status}/>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-4">
                    <span>预留：{task.reservedUnits || 0}</span><span>预估：{task.estimatedUnits}</span><span>实际：{task.actualUnits ?? '—'}</span><span>文件：{formatBytes(task.artifactSize)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {task.status === 'PENDING' && <button onClick={() => run('lease', () => leaseTask(task.id))} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"><Play className="mr-1 inline h-3 w-3"/>工作器领取</button>}
                    {task.status === 'RUNNING' && <>
                      <button onClick={() => run('complete', async () => completeTask(task.id, task.leaseToken, `真实导出内容 ${new Date().toISOString()}`))} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Download className="mr-1 inline h-3 w-3"/>完成并结算</button>
                      <button onClick={() => run('fail', () => failTask(task.id, task.leaseToken))} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">上报失败</button>
                    </>}
                    {['PENDING','RUNNING'].includes(task.status) && <button onClick={() => run('cancel', () => cancelTask(task.id))} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-700"><XCircle className="mr-1 inline h-3 w-3"/>取消</button>}
                    {['FAILED','CANCELLED','EXPIRED'].includes(task.status) && <button onClick={() => run('retry', () => retryTask(task.id))} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white"><RefreshCw className="mr-1 inline h-3 w-3"/>安全重试</button>}
                    {task.status === 'RUNNING' && <button onClick={() => run('sim-lost', () => simulateWorkerLostApi(task.id))} className="rounded-lg border border-purple-300 px-3 py-2 text-xs font-bold text-purple-700">模拟失联</button>}
                    {task.artifacts.map(file => <button key={file.id} type="button" onClick={() => run(`download-${file.id}`, () => downloadArtifact(file.id, file.fileName), false)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"><Download className="mr-1 inline h-3 w-3"/>服务端鉴权下载</button>)}
                  </div>
                  {task.cancelRequestedAt && task.status === 'SUCCEEDED' && <p className="mt-2 text-xs font-semibold text-amber-700">取消请求到达时工作器已越过不可取消点，任务仍完成。</p>}
                </article>
              ))}
            </div>
          </div>
        </Section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section icon={<History className="h-5 w-5"/>} title="账目与导出历史" desc="所有查询都带 tenantId 服务端过滤；下载链接也由后端重新鉴权，而不是前端隐藏。">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-400"><tr><th className="py-2">时间</th><th>类型</th><th>预留</th><th>现金</th><th>余额</th><th>说明</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.map(entry => <tr key={entry.id}>
                    <td className="py-3 text-xs text-slate-500">{formatDate(entry.createdAt)}</td>
                    <td><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{ledgerKind[entry.kind]}</span></td>
                    <td className={entry.reservationDelta > 0 ? 'text-blue-700' : entry.reservationDelta < 0 ? 'text-emerald-700' : 'text-slate-500'}>{entry.reservationDelta || '—'}</td>
                    <td className={entry.amount < 0 ? 'text-rose-700' : entry.amount > 0 ? 'text-emerald-700' : 'text-slate-500'}>{entry.amount || '—'}</td>
                    <td className="font-bold">{entry.balanceAfter}</td><td className="max-w-[260px] text-xs text-slate-500">{entry.note}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </Section>
          <Section icon={<Trash2 className="h-5 w-5"/>} title="验收清单与边界" desc="将容易混淆的数据生命周期放在显式操作中。">
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ['退出团队', '成员关系变 LEFT，JWT 后续请求被服务端拒绝'],
                ['配额不足', '预留事务回滚，不产生 RESERVE/CONSUME'],
                ['取消后完成', '不可取消点完成则结算，否则取消并释放'],
                ['清理浏览器缓存', '本机草稿与登录态消失，云端项目仍存在'],
                ['存储空间不足', '存储与计费双重预留，返回 507'],
                ['删云端项目', '只影响云端，不清本机 localStorage'],
                ['模板删除', '项目 sourceSnapshot 继续保存来源'],
                ['别人的导出链接', '后端 tenantId 校验，未授权返回 404']
              ].map(([title, desc]) => <div key={title} className="rounded-2xl border border-slate-200 p-4"><p className="font-bold text-slate-900">{title}</p><p className="mt-1 text-sm leading-6 text-slate-500">{desc}</p></div>)}
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}
