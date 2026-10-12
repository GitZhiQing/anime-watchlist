// 剧集列表区（详情视图，简介与 p1 扩展之间）：
// 进入视口才请求，与「我的进度」共享 ["episodes", id] 缓存（先编辑过进度则零请求）。
// 布局：区块整体可折叠（默认收起为一行「剧集（N）」）；展开后单列单话单行
//（序号 | 标题 | 首播日期 | 展开箭头），有简介的话点击行内展开
//（desc 实测 140~280+ 字多段文本，不适合塞悬浮提示）；
// 已收藏条目按 ep_status 高亮已看话数、未播出话置灰；空结果/失败静默隐藏。
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useAuthUser } from "@/hooks/useAuthUser";
import { episodesQueryOptions, useUserCollectionSmart } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function SubjectEpisodesSection({ subjectId }: { subjectId: number }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const { user } = useAuthUser();
  const { data: col } = useUserCollectionSmart(user?.username, subjectId);
  const q = useQuery({ ...episodesQueryOptions(subjectId), enabled: inView });
  /** 区块整体折叠（默认收起：仅一行标题，点开显示全部话数） */
  const [sectionOpen, setSectionOpen] = useState(false);
  /** 行内展开简介的话数集合 */
  const [openDesc, setOpenDesc] = useState<ReadonlySet<number>>(new Set());

  const episodes = q.data;
  // 非加载中且无数据（书籍类/空/失败）→ 整块隐藏；pending 期间出骨架占位
  if (!q.isPending && (!episodes || episodes.length === 0)) return null;

  const watchedEp = col?.ep_status ?? 0;

  function toggleDesc(ep: number) {
    setOpenDesc((prev) => {
      const next = new Set(prev);
      if (next.has(ep)) next.delete(ep);
      else next.add(ep);
      return next;
    });
  }

  return (
    <div ref={ref}>
      <section className="space-y-1">
        {/* 区块标题行：点击折叠/展开整个剧集列表（默认收起） */}
        <button
          type="button"
          onClick={() => setSectionOpen((v) => !v)}
          title={sectionOpen ? "收起剧集列表" : "展开剧集列表"}
          className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              !sectionOpen && "-rotate-90",
            )}
          />
          剧集（{episodes?.length ?? "…"}）
        </button>
        {q.isPending || !episodes
          ? sectionOpen && (
              <div className="space-y-1 pt-1">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            )
          : sectionOpen && (
              <div className="space-y-px pt-1">
                {episodes.map((e) => {
                  const watched = e.ep <= watchedEp;
                  const unaired = e.airdate
                    ? new Date(e.airdate).getTime() > Date.now()
                    : false;
                  const title = e.name_cn || e.name || `第 ${e.ep} 话`;
                  const desc = e.desc?.trim();
                  const open = openDesc.has(e.ep);
                  return (
                    <div key={e.id} className="min-w-0">
                      <div
                        role={desc ? "button" : undefined}
                        tabIndex={desc ? 0 : undefined}
                        onClick={desc ? () => toggleDesc(e.ep) : undefined}
                        onKeyDown={
                          desc
                            ? (ev) => {
                                if (ev.key === "Enter" || ev.key === " ") {
                                  ev.preventDefault();
                                  toggleDesc(e.ep);
                                }
                              }
                            : undefined
                        }
                        title={
                          desc
                            ? `${title}${e.duration ? `（${e.duration}）` : ""}\n点击展开/收起单话简介`
                            : title
                        }
                        className={cn(
                          "flex h-6 items-center gap-2 rounded px-1 text-xs transition-colors",
                          desc && "cursor-pointer hover:bg-muted/40",
                        )}
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
                          {title}
                        </span>
                        {e.airdate && (
                          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                            {e.airdate}
                          </span>
                        )}
                        {desc && (
                          <ChevronDown
                            className={cn(
                              "size-3 shrink-0 text-muted-foreground transition-transform",
                              !open && "-rotate-90",
                            )}
                          />
                        )}
                      </div>
                      {desc && open && (
                        <p className="mt-0.5 mb-1 border-l-2 border-border pl-2 pr-1 text-[10px] leading-relaxed whitespace-pre-line text-muted-foreground line-clamp-8">
                          {desc}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
      </section>
    </div>
  );
}
