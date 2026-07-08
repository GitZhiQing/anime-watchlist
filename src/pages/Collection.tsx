import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLayout } from "@/components/layout/PageLayout";
import { SubjectRow } from "@/components/SubjectRow";
import { BangumiLink } from "@/components/BangumiLink";
import { CollectAction } from "@/components/CollectAction";
import { useSearchSubjects } from "@/lib/queries";
import { useAuthUser } from "@/hooks/useAuthUser";

export function Collection() {
  const { user } = useAuthUser();
  const [keyword, setKeyword] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const { data, isFetching, error } = useSearchSubjects(submitted ?? "", !!submitted);
  const results = data?.data ?? [];

  return (
    <PageLayout title="收藏">
      <div className="space-y-4">
        {!user && (
          <p className="text-sm text-muted-foreground">
            收藏需要先到「配置」页完成认证。
          </p>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(keyword.trim() || null);
          }}
        >
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="输入漫画或动画名称"
            className="flex-1"
          />
          <Button type="submit" disabled={isFetching || !keyword.trim()}>
            {isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "查找"
            )}
          </Button>
        </form>

        {submitted && !isFetching && !error && results.length === 0 && (
          <p className="text-sm text-muted-foreground">未找到结果</p>
        )}
        {error && (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "搜索失败"}
          </p>
        )}

        <div className="space-y-1">
          {results.map((s) => (
            <SubjectRow
              key={s.id}
              subject={s}
              expandedAction={
                <div className="flex items-center gap-2">
                  <CollectAction subjectId={s.id} />
                  <BangumiLink subjectId={s.id} />
                </div>
              }
            />
          ))}
        </div>
      </div>
    </PageLayout>
  );
}
