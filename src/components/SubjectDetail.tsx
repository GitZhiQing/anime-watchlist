import { Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubjectDetail } from "@/lib/queries";
import { SubjectFields, SubjectTags, SubjectSummary } from "@/components/SubjectFields";

interface SubjectDetailProps {
  subjectId: number;
}

/** 懒加载完整条目详情并展示。展开时由 SubjectRow 渲染。 */
export function SubjectDetail({ subjectId }: SubjectDetailProps) {
  const { data: detail, isLoading, error, refetch } = useSubjectDetail(subjectId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> 加载数据中...
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 text-xs text-destructive">
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

  return (
    <div className="space-y-3 py-2 text-foreground">
      <SubjectFields subject={detail} className="space-y-1.5" />
      <SubjectTags tags={detail.tags} />
      <SubjectSummary summary={detail.summary} />
    </div>
  );
}
