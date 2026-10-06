import { FormEvent, useState } from "react";
import toast from "react-hot-toast";
import { workspaceApi } from "@/api/workspace";
import { useAsync } from "@/hooks/useAsync";
import { Card, CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { getApiErrorMessage } from "@/api/client";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import type { FollowMode, Template } from "@/types/domain";

export default function TemplatesPage() {
  const { user } = useAuth();
  const canManageTemplates = user?.role === "OWNER" || user?.role === "ADMIN";
  const { data, loading, error, reload } = useAsync(() => workspaceApi.templates(), [], { pollMs: 10000 });
  const [publishingId, setPublishingId] = useState<string | null>(null);

  if (loading || !data) return <Card><TableSkeleton /></Card>;

  const setFavorite = async (template: Template, mode: FollowMode, pinnedVersionId?: string) => {
    try {
      await workspaceApi.favoriteTemplate({ templateId: template.id, mode, pinnedVersionId });
      toast.success(mode === "PINNED" ? "已固定到所选版本，后续发布不会影响该收藏" : "已切换为跟随最新发布");
      reload();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const removeTemplate = async (template: Template) => {
    if (!window.confirm("删除模板不会抹掉既有项目保存的来源快照和版本关系。确认继续？")) return;
    try {
      const { message } = await workspaceApi.deleteTemplate(template.id);
      toast.success(message);
      reload();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      {error && <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}
      <Card>
        <CardHeader
          title="模板收藏与版本策略"
          description="每个用户必须显式选择“固定版本”或“跟随发布”。删除模板仅设置 deletedAt，既有项目继续保留 templateSnapshot。"
        />
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          {data.templates.map((template) => {
            const latest = template.versions[0];
            const effective = template.favorite?.effectiveVersion || latest;
            return (
              <article key={template.id} className={`rounded-3xl border p-5 transition hover:-translate-y-0.5 hover:shadow-card ${template.deleted ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-white"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{template.name}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{template.description}</p>
                  </div>
                  {template.deleted ? <Badge tone="slate">已删除</Badge> : <Badge tone="green">可用</Badge>}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-blue-50 p-3">
                    <p className="text-xs font-bold text-blue-700">最新发布</p>
                    <p className="mt-1 font-black text-slate-900">{latest?.version || "—"}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(latest?.publishedAt)}</p>
                  </div>
                  <div className="rounded-2xl bg-orange-50 p-3">
                    <p className="text-xs font-bold text-orange-700">收藏生效版本</p>
                    <p className="mt-1 font-black text-slate-900">{effective?.version || "未收藏"}</p>
                    <p className="text-xs text-slate-500">{template.favorite?.mode || "—"}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {template.versions.map((version) => (
                    <div key={version.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-bold text-slate-700">{version.version}</span>
                      <span className="text-slate-500">{version.changelog}</span>
                    </div>
                  ))}
                </div>

                {!template.deleted && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setFavorite(template, "PINNED", effective?.id)}>固定当前版本</Button>
                    <Button variant="secondary" onClick={() => setFavorite(template, "FOLLOWING")}>跟随发布</Button>
                    {canManageTemplates && <Button variant="secondary" onClick={() => setPublishingId(template.id)}>发布新版本</Button>}
                    {canManageTemplates && <Button variant="danger" onClick={() => removeTemplate(template)}>删除模板</Button>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </Card>
      {publishingId && <PublishModal templateId={publishingId} onClose={() => setPublishingId(null)} onDone={reload} />}
    </div>
  );
}

function PublishModal({ templateId, onClose, onDone }: { templateId: string; onClose: () => void; onDone: () => void }) {
  const [version, setVersion] = useState(`2.1.${Date.now().toString().slice(-3)}`);
  const [changelog, setChangelog] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await workspaceApi.publishTemplate(templateId, { version, changelog });
      toast.success("版本已发布；固定版本用户仍保持原版本，跟随发布用户使用新版本");
      setSaving(false);
      onDone();
      onClose();
    } catch (error) {
      setSaving(false);
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-black text-slate-900">发布模板新版本</h2>
        <input className="input mt-5" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="语义化版本，如 2.1.0" required />
        <textarea className="input mt-3 min-h-28" value={changelog} onChange={(e) => setChangelog(e.target.value)} placeholder="变更说明" />
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>取消</Button>
          <Button disabled={saving}>发布</Button>
        </div>
      </form>
    </div>
  );
}
