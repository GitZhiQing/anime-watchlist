import { openUrl } from "@tauri-apps/plugin-opener";
import { Star } from "lucide-react";
import {
  useSubjectCharacters,
  useSubjectRelations,
  useSubjectRecs,
} from "@/lib/queries";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { Skeleton } from "@/components/ui/skeleton";
import type { P1Character, P1RecItem, P1Relation } from "@/types/bgm";

/**
 * 详情底部的 p1 扩展信息：角色/CV、关联条目、相关推荐。
 * 私有接口、无官方文档：三区块各自观察视口，滚动可见才发请求（骨架占位避免布局跳变），
 * 失败/空数据整块消失（静默降级），不影响主详情展示；
 * 缓存 1 小时、保留 2 小时——重开同一详情弹窗不再重拉。
 */

const MAX_CHARACTERS = 16;
const MAX_RELATIONS = 12;
const MAX_RECS = 8;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-muted-foreground">{children}</div>
  );
}

/** 区块加载中的骨架占位（保留空间：未滚到不请求，滚到后内容出现不跳版） */
function SectionSkeleton({ variant }: { variant: "avatars" | "rows" }) {
  if (variant === "avatars") {
    return (
      <div className="flex gap-2 overflow-hidden pb-1">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex w-20 shrink-0 flex-col items-center gap-1"
          >
            <Skeleton className="size-16 rounded-md" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full rounded-md" />
      ))}
    </div>
  );
}

/** 区块内容壳：有数据渲染内容，加载中渲染骨架 */
function SectionBody({
  title,
  skeleton,
  hasData,
  children,
}: {
  title: string;
  skeleton: "avatars" | "rows";
  hasData: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <SectionTitle>{title}</SectionTitle>
      {hasData ? children : <SectionSkeleton variant={skeleton} />}
    </section>
  );
}

/** 角色/CV：横向滚动头像卡 */
function CharactersSection({ data }: { data: P1Character[] }) {
  const list = data.slice(0, MAX_CHARACTERS);
  return (
    <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
      {list.map((ch) => {
        const cv = ch.cast?.[0];
        return (
          <div
            key={ch.id}
            className="flex w-20 shrink-0 flex-col items-center gap-1 text-center"
            title={cv ? `${ch.name}\nCV：${cv.name}` : ch.name}
          >
            {ch.images?.medium || ch.images?.large || ch.images?.small ? (
              <img
                src={ch.images?.medium || ch.images?.large || ch.images?.small}
                alt={ch.name}
                loading="lazy"
                className="size-16 rounded-md object-cover"
              />
            ) : (
              <div className="size-16 rounded-md bg-muted/60" />
            )}
            <span className="line-clamp-2 text-xs leading-tight">
              {ch.name}
            </span>
            {cv?.name && (
              <span className="line-clamp-1 text-[10px] leading-tight text-muted-foreground">
                CV {cv.name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 关联条目：关系标签 + 封面 + 名称，点击在浏览器打开 */
function RelationsSection({ data }: { data: P1Relation[] }) {
  const list = data.slice(0, MAX_RELATIONS);
  return (
    <div className="space-y-1.5">
      {list.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() =>
            void openUrl(`https://bangumi.tv/subject/${r.id}`)
          }
          className="flex w-full items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-muted/40"
          title={`在 Bangumi 打开：${r.nameCN || r.name}`}
        >
          {r.images?.grid || r.images?.medium || r.images?.small ? (
            <img
              src={r.images?.grid || r.images?.medium || r.images?.small}
              alt=""
              loading="lazy"
              className="aspect-[5/7] w-7 shrink-0 rounded bg-muted/50 object-cover"
            />
          ) : (
            <div className="aspect-[5/7] w-7 shrink-0 rounded bg-muted/50" />
          )}
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] leading-none text-muted-foreground">
            {r.relation}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs">
            {r.nameCN || r.name}
          </span>
        </button>
      ))}
    </div>
  );
}

/** 相关推荐：紧凑行（封面 + 名称 + 评分） */
function RecsSection({ data }: { data: P1RecItem[] }) {
  const list = data.slice(0, MAX_RECS);
  return (
    <div className="space-y-1.5">
      {list.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          {r.images?.grid || r.images?.medium || r.images?.small ? (
            <img
              src={r.images?.grid || r.images?.medium || r.images?.small}
              alt=""
              loading="lazy"
              className="aspect-[5/7] w-7 shrink-0 rounded bg-muted/50 object-cover"
            />
          ) : (
            <div className="aspect-[5/7] w-7 shrink-0 rounded bg-muted/50" />
          )}
          <span className="min-w-0 flex-1 truncate text-xs">
            {r.nameCN || r.name}
          </span>
          {!!r.score && r.score > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
              <Star className="size-3 fill-current text-amber-500" />
              {r.score.toFixed(1)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** 角色/CV 区块：滚动可见才请求，失败/空数据整块消失 */
function CharactersLazy({ subjectId }: { subjectId: number }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const q = useSubjectCharacters(subjectId, inView);
  const hasData = q.isSuccess && (q.data?.length ?? 0) > 0;
  const hidden = q.isError || (q.isSuccess && !hasData);
  return (
    <div ref={ref}>
      {hidden ? null : (
        <SectionBody title="角色 / CV" skeleton="avatars" hasData={hasData}>
          {q.data ? <CharactersSection data={q.data} /> : null}
        </SectionBody>
      )}
    </div>
  );
}

/** 关联条目区块：滚动可见才请求，失败/空数据整块消失 */
function RelationsLazy({ subjectId }: { subjectId: number }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const q = useSubjectRelations(subjectId, inView);
  const hasData = q.isSuccess && (q.data?.length ?? 0) > 0;
  const hidden = q.isError || (q.isSuccess && !hasData);
  return (
    <div ref={ref}>
      {hidden ? null : (
        <SectionBody title="关联条目" skeleton="rows" hasData={hasData}>
          {q.data ? <RelationsSection data={q.data} /> : null}
        </SectionBody>
      )}
    </div>
  );
}

/** 相关推荐区块：滚动可见才请求，失败/空数据整块消失 */
function RecsLazy({ subjectId }: { subjectId: number }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const q = useSubjectRecs(subjectId, inView);
  const hasData = q.isSuccess && (q.data?.length ?? 0) > 0;
  const hidden = q.isError || (q.isSuccess && !hasData);
  return (
    <div ref={ref}>
      {hidden ? null : (
        <SectionBody title="相关推荐" skeleton="rows" hasData={hasData}>
          {q.data ? <RecsSection data={q.data} /> : null}
        </SectionBody>
      )}
    </div>
  );
}

export function SubjectP1Sections({ subjectId }: { subjectId: number }) {
  // 三个区块独立观察视口、独立请求、独立降级：任一失败不影响其他区块与主详情
  return (
    <div className="space-y-3">
      <CharactersLazy subjectId={subjectId} />
      <RelationsLazy subjectId={subjectId} />
      <RecsLazy subjectId={subjectId} />
    </div>
  );
}
