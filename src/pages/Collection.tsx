import { useState } from "react";
import { Flame, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLayout } from "@/components/layout/PageLayout";
import { SubjectRow } from "@/components/SubjectRow";
import { BangumiLink } from "@/components/BangumiLink";
import { CollectAction } from "@/components/CollectAction";
import { useSearchSubjects, useTrendingFeed } from "@/lib/queries";
import { useAuthUser } from "@/hooks/useAuthUser";

/** 收藏页空态：热度榜。优先 p1 新增热度，接口失败自动兜底本周追番热度。 */
function TrendingList() {
  const { data, isLoading, isFallback } = useTrendingFeed();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" />
        加载热门条目中...
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无热门条目</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Flame className="size-4 text-orange-500" />
          {isFallback ? "本周追番热度" : "热门条目"}
        </h2>
        {isFallback && (
          <span className="text-xs text-muted-foreground">
            热度接口暂不可用，已按追番人数展示
          </span>
        )}
      </div>
      <div className="space-y-1">
        {data.map((it) => (
          <SubjectRow
            key={it.subject.id}
            subject={it.subject}
            extraInfo={
              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                <Flame className="size-3 text-orange-500/80" />
                {isFallback ? "追番中" : "热度"} {it.heat}
              </span>
            }
            expandedAction={
              <div className="flex items-center gap-2">
                <CollectAction subjectId={it.subject.id} />
                <BangumiLink subjectId={it.subject.id} />
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}

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

        {submitted ? (
          <>
            {!isFetching && !error && results.length === 0 && (
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
          </>
        ) : (
          <TrendingList />
        )}
      </div>
    </PageLayout>
  );
}
