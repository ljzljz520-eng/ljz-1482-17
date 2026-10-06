import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { workspaceApi } from "@/api/workspace";
import { useAsync } from "@/hooks/useAsync";
import { Card, CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { TableSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { getApiErrorMessage } from "@/api/client";
import { formatDateTime } from "@/lib/format";
import { clearAllLocalData, readDraft, writeDraft } from "@/lib/draftStorage";
import { useAuth } from "@/context/AuthContext";
import type { Project, VisitCursor } from "@/types/domain";

export default function ProjectsPage() {
  const { user } = useAuth();
  const canManageCloud = user?.role === "OWNER" || user?.role === "ADMIN";
  const { data, loading, error, reload } = useAsync(() => workspaceApi.projects(), [], { pollMs: 8000 });
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (loading || !data) {
    return <Card><TableSkeleton /></Card>;
  }

  const selected = data.projects.find((project) => project.id === selectedId) || null;

  const removeProject = async (project: Project) => {
    if (!window.confirm(`删除云端项目「${project.name}」？历史导出和账目仍保留，本机草稿不会因此清理。`)) return;
    try {
      const { message } = await workspaceApi.deleteProject(project.id);
      toast.success(message);
      if (selectedId === project.id) setSelectedId(null);
      reload();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      {error && <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}
      <Card>
        <CardHeader
          title="项目与最近访问游标"
          description="云端游标用于跨设备恢复；本机未保存草稿只存浏览器，不会在打开项目时被云端自动覆盖。"
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { if (window.confirm("仅清空本机草稿和缓存？不会删除云端项目。")) { clearAllLocalData(); toast.success("本机数据已清理"); } }}>清本机数据</Button>
              <Button onClick={() => setCreating(true)}>新建项目</Button>
            </div>
          }
        />
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          {data.projects.length === 0 && <div className="lg:col-span-2"><EmptyState title="暂无项目" description="创建一个项目以验收云端游标和本机草稿保护。" /></div>}
          {data.projects.map((project) => (
            <article key={project.id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{project.name}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{project.summary}</p>
                </div>
                <Badge tone="blue">{project.templateSnapshot}</Badge>
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-slate-700">最近访问</p>
                <p className="mt-1 text-slate-500">{project.lastVisit?.cursor || "尚无云端游标"}</p>
                <p className="mt-1 text-xs text-slate-400">{project.lastVisit ? formatDateTime(project.lastVisit.visitedAt) : "—"}</p>
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={() => setSelectedId(project.id)}>打开编辑器</Button>
                {canManageCloud && <Button variant="danger" onClick={() => removeProject(project)}>删除云端项目</Button>}
              </div>
            </article>
          ))}
        </div>
      </Card>

      {creating && <CreateProjectModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setSelectedId(id); reload(); }} />}
      {selected && <ProjectEditor project={selected} onClose={() => setSelectedId(null)} onSaved={reload} />}
    </div>
  );
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const templatesState = useAsync(() => workspaceApi.templates(), [], { pollMs: undefined });
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const availableTemplates = (templatesState.data?.templates || []).filter((template) => !template.deleted);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { project } = await workspaceApi.createProject({
        name,
        summary,
        templateId: templateId || undefined
      });
      toast.success("云端项目已创建");
      onCreated(project.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="新建云端项目" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <input className="input" placeholder="项目名称" value={name} onChange={(e) => setName(e.target.value)} required />
        <textarea className="input min-h-[96px]" placeholder="项目简介" value={summary} onChange={(e) => setSummary(e.target.value)} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>取消</Button><Button disabled={submitting}>创建</Button></div>
      </form>
    </Modal>
  );
}

function ProjectEditor({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const [cloudCursor, setCloudCursor] = useState<VisitCursor | null>(null);
  const [content, setContent] = useState(project.content);
  const [cursor, setCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localDraft, setLocalDraft] = useState(() => readDraft(project.id));

  useEffect(() => {
    let mounted = true;
    workspaceApi.openProject(project.id).then(({ cloudCursor }) => {
      if (!mounted) return;
      setCloudCursor(cloudCursor);
      const storedDraft = readDraft(project.id);
      setLocalDraft(storedDraft);
      if (storedDraft) {
        setContent(storedDraft.content);
        setCursor(storedDraft.cursor);
      } else if (cloudCursor) {
        setContent(cloudCursor.content);
        setCursor(cloudCursor.cursor);
      } else {
        setContent(project.content);
        setCursor("开始位置");
      }
    }).catch((error) => toast.error(getApiErrorMessage(error))).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
    // 只在打开项目时拉取一次云端游标；轮询返回的云端游标不能自动覆盖当前本机草稿。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    if (!loading && cursor) {
      const draft = { content, cursor, updatedAt: new Date().toISOString() };
      writeDraft(project.id, { content, cursor });
      setLocalDraft(draft);
    }
  }, [project.id, content, cursor, loading]);

  const cloudNewer = Boolean(
    cloudCursor &&
      localDraft &&
      new Date(cloudCursor.visitedAt) > new Date(localDraft.updatedAt) &&
      cloudCursor.content !== localDraft.content
  );

  const restoreCloud = () => {
    if (!cloudCursor) return;
    setContent(cloudCursor.content);
    setCursor(cloudCursor.cursor);
    writeDraft(project.id, { content: cloudCursor.content, cursor: cloudCursor.cursor });
    setLocalDraft({ content: cloudCursor.content, cursor: cloudCursor.cursor, updatedAt: new Date().toISOString() });
    toast.success("已手动恢复其他设备游标");
  };

  const saveCloud = async () => {
    setSaving(true);
    try {
      const { visit } = await workspaceApi.saveCursor(project.id, { cursor, content });
      setCloudCursor(visit);
      await workspaceApi.updateProject(project.id, { content });
      toast.success("本机草稿已显式保存为云端游标和项目内容");
      onSaved();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal wide title={`编辑项目 · ${project.name}`} onClose={onClose}>
      {loading ? <Skeleton className="h-80" /> : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
            <p className="font-bold">来源：{project.templateSnapshot}</p>
            <p className="mt-1">云端最近游标：{cloudCursor ? `${cloudCursor.cursor} · ${formatDateTime(cloudCursor.visitedAt)}` : "无"}</p>
            <p className="mt-1">本机草稿：{localDraft ? formatDateTime(localDraft.updatedAt) : "无，已安全载入云端/项目内容"}</p>
          </div>
          {cloudNewer && (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
              <p className="font-bold">检测到另一台设备更新了云端游标。</p>
              <p className="mt-1">为避免覆盖本机尚未保存的草稿，系统没有自动替换内容。你可以保留本机草稿，或手动恢复云端版本。</p>
              <Button className="mt-3" variant="secondary" onClick={restoreCloud}>恢复云端游标</Button>
            </div>
          )}
          <label className="block">
            <span className="text-sm font-bold text-slate-700">最近访问位置（游标）</span>
            <input className="input mt-2" value={cursor} onChange={(event) => setCursor(event.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">编辑草稿（自动保存到本机，手动保存才上云）</span>
            <textarea className="input mt-2 min-h-[260px] font-mono text-sm" value={content} onChange={(event) => setContent(event.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>关闭</Button>
            <Button disabled={saving} onClick={saveCloud}>{saving ? "保存中..." : "保存到云端"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl ${wide ? "max-w-4xl" : "max-w-lg"}`} onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">{title}</h2>
          <button className="rounded-full px-3 py-1 text-2xl text-slate-400 hover:bg-slate-100" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
