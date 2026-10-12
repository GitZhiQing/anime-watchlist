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

/** 默认展示行数，超出折叠为「展开全部」 */
const PREVIEW = 12;

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
      <section className="space-y-1.5">
        <div className="text-xs text-muted-foreground">
          剧集（{episodes?.length ?? "…"}）
        </div>
        {q.isPending || !episodes ? (
          <div className="space-y-1">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="space-y-0.5">
              {(expanded ? episodes : episodes.slice(0, PREVIEW)).map((e) => {
                const watched = e.ep <= watchedEp;
                const unaired = e.airdate
                  ? new Date(e.airdate).getTime() > Date.now()
                  : false;
                const meta = [e.airdate, e.duration]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div
                    key={e.id}
                    className="flex items-baseline gap-2 rounded px-1 py-0.5 text-xs"
                  >
                    <span
                      className={cn(
                        "w-7 shrink-0 text-right tabular-nums",
                        watched
                          ? "font-medium text-primary"
                          : unaired
                            ? "text-muted-foreground/50"
                            : "text-muted-foreground",
                      )}
                    >
                      {e.ep}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate",
                          unaired && "text-muted-foreground/70",
                        )}
                        title={e.name_cn || e.name}
                      >
                        {e.name_cn || e.name || `第 ${e.ep} 话`}
                      </p>
                      {e.desc && (
                        <p className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                          {e.desc}
                        </p>
                      )}
                    </div>
                    {meta && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {meta}
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
