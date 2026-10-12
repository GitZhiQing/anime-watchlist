// 剧集列表区（详情视图，简介与 p1 扩展之间）：
// 进入视口才请求，与「我的进度」共享 ["episodes", id] 缓存（先编辑过进度则零请求）；
// 已收藏条目按 ep_status 高亮已看话数、未播出话置灰；空结果/失败静默隐藏（对齐 p1 区块）。
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useAuthUser } from "@/hooks/useAuthUser";
import { episodesQueryOptions, useUserCollectionSmart } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** 默认展示行数，超出折叠为「展开全部」（单行紧凑排版） */
const PREVIEW = 8;

export function SubjectEpisodesSection({ subjectId }: { subjectId: number }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const { user } = useAuthUser();
  const { data: col } = useUserCollectionSmart(user?.username, subjectId);
  const q = useQuery({ ...episodesQueryOptions(subjectId), enabled: inView });
  const [expanded, setExpanded] = useState(false);

  const episodes = q.data;
  // 非加载中且无数据（书籍类/空/失败）→ 整块隐藏；pending 期间出骨架占位
  if (!q.isPending && (!episodes || episodes.length === 0)) return null;

  const watchedEp = col?.ep_status ?? 0;

  return (
    <div ref={ref}>
      <section className="space-y-1">
        <div className="text-xs text-muted-foreground">
          剧集（{episodes?.length ?? "…"}）
        </div>
        {q.isPending || !episodes ? (
          <div className="space-y-1">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* 单行紧凑：序号 | 标题（截断）| 首播日期；时长/单话简介收进悬浮提示 */}
            <div className="space-y-px">
              {(expanded ? episodes : episodes.slice(0, PREVIEW)).map((e) => {
                const watched = e.ep <= watchedEp;
                const unaired = e.airdate
                  ? new Date(e.airdate).getTime() > Date.now()
                  : false;
                const tip = [
                  e.name_cn || e.name || `第 ${e.ep} 话`,
                  e.airdate ? `首播：${e.airdate}` : null,
                  e.duration ? `时长：${e.duration}` : null,
                  e.desc || null,
                ]
                  .filter(Boolean)
                  .join("\n");
                return (
                  <div
                    key={e.id}
                    title={tip}
                    className="flex h-6 items-center gap-2 rounded px-1 text-xs transition-colors hover:bg-muted/40"
                  >
                    <span
                      className={cn(
                        "w-6 shrink-0 text-center tabular-nums",
                        watched
                          ? "font-medium text-primary"
                          : unaired
                            ? "text-muted-foreground/50"
                            : "text-muted-foreground",
                      )}
                    >
                      {e.ep}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        unaired && "text-muted-foreground/70",
                      )}
                    >
                      {e.name_cn || e.name || `第 ${e.ep} 话`}
                    </span>
                    {e.airdate && (
                      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                        {e.airdate}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {episodes.length > PREVIEW && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    !expanded && "-rotate-90",
                  )}
                />
                {expanded ? "收起" : `展开全部 ${episodes.length} 话`}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
