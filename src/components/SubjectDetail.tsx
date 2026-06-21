import { Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubjectDetail } from "@/lib/queries";

interface SubjectDetailProps {
  subjectId: number;
}

/** 键值对行 */
function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{value}</span>
    </div>
  );
}

/** 懒加载完整条目详情并展示。展开时由 SubjectRow 渲染。 */
export function SubjectDetail({ subjectId }: SubjectDetailProps) {
  const { data: detail, isLoading, error, refetch } = useSubjectDetail(subjectId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> 加载详情…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-destructive">
        <span>{error ? "详情加载失败" : "无详情"}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => refetch()}
        >
          <RotateCw className="size-3" /> 重试
        </Button>
      </div>
    );
  }

  const score = detail.rating?.score;
  const allTags = detail.tags ?? [];

  return (
    <div className="space-y-3 py-2 text-foreground">
      <div className="space-y-1.5">
        <Field label="原名" value={detail.name} />
        <Field label="中文名" value={detail.name_cn} />
        <Field
          label="评分"
          value={
            score ? (
              <span>
                ★ {score.toFixed(1)}
                {detail.rating?.total
                  ? `（${detail.rating.total} 人评分）`
                  : ""}
              </span>
            ) : undefined
          }
        />
        <Field
          label="话数"
          value={
            detail.total_episodes
              ? `${detail.total_episodes} 话`
              : undefined
          }
        />
        <Field label="放送开始" value={detail.date} />
        <Field label="平台" value={detail.platform} />
      </div>

      {detail.summary && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">简介</div>
          <p className="whitespace-pre-line text-xs leading-relaxed">
            {detail.summary}
          </p>
        </div>
      )}

      {allTags.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            标签（全部 {allTags.length}）
          </div>
          <div className="flex flex-wrap gap-1">
            {allTags.map((t) => (
              <span
                key={t.name}
                className="rounded bg-muted px-1.5 py-0.5 text-xs"
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
