import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import {
  usePrefetchSubject,
  useSubjectCharacters,
  useSubjectRelations,
  useSubjectRecs,
} from "@/lib/queries";
import { SubjectDetailDialog } from "@/components/SubjectDetailDialog";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  P1Character,
  P1RecItem,
  P1Relation,
  SlimSubject,
  SubjectImages,
} from "@/types/bgm";

/**
 * 详情底部的 p1 扩展信息：角色/CV、关联条目、相关推荐。
 * 私有接口、无官方文档：三区块各自观察视口，滚动可见才发请求（骨架占位避免布局跳变），
 * 仅「从未拿到数据」时失败/空结果才整块消失（静默降级）；
 * 已加载过的区块后台重拉失败保留旧内容，不因 error 态抹掉；
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
            <Skeleton className="aspect-[3/4] w-16 rounded-md" />
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

/**
 * 区块可见性：拿到过数据就一直展示——TanStack Query 后台重拉失败时 status 翻 error
 * 但 data 仍保留旧内容，不能因 isError 抹掉已展示的区块；
 * 仅「从未拿到数据」（非 pending）的失败/空结果整块隐藏，pending 期间由 SectionBody 出骨架。
 */
function p1SectionState(
  data: readonly unknown[] | undefined,
  isPending: boolean,
) {
  const hasData = (data?.length ?? 0) > 0;
  return { hasData, hidden: !isPending && !hasData };
}

/** p1 行点击 → 应用内详情弹窗（不外跳浏览器）。悬停 300ms 预取详情，与网格卡片一致。 */
function useP1SubjectDialog() {
  const [subject, setSubject] = useState<SlimSubject | null>(null);
  const prefetchSubject = usePrefetchSubject();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    open: (s: SlimSubject | undefined) => setSubject(s ?? null),
    schedulePrefetch(id: number) {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => prefetchSubject(id), 300);
    },
    cancelPrefetch() {
      window.clearTimeout(timer.current);
    },
    element: subject ? (
      <SubjectDetailDialog
        subjectId={subject.id}
        title={subject.name_cn || subject.name}
        subject={subject}
        open
        onOpenChange={(o) => !o && setSubject(null)}
      />
    ) : null,
  };
}

type P1SubjectNav = ReturnType<typeof useP1SubjectDialog>;

/** p1 行条目 → 最小 SlimSubject（弹窗标题/收藏乐观插入用；详情本体由弹窗内自行拉取） */
function p1NavSubject(r: {
  id?: number;
  type?: number;
  name?: string;
  nameCN?: string;
  images?: SubjectImages;
  score?: number;
}): SlimSubject | undefined {
  if (!r.id || !r.name) return undefined;
  return {
    id: r.id,
    type: r.type ?? 0,
    name: r.name,
    name_cn: r.nameCN || r.name,
    short_summary: "",
    images: r.images ?? {},
    tags: [],
    ...(r.score && r.score > 0 ? { score: r.score } : null),
  };
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
                // 3:4 竖版固定框：竖长图裁顶部（保留脸部），横宽图垂直放满、水平居中
                className="aspect-[3/4] w-16 rounded-md object-cover object-top"
              />
            ) : (
              <div className="aspect-[3/4] w-16 rounded-md bg-muted/60" />
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

/** 关联条目：关系标签 + 封面 + 名称，点击打开应用内详情弹窗 */
function RelationsSection({
  data,
  nav,
}: {
  data: P1Relation[];
  nav: P1SubjectNav;
}) {
  const list = data.slice(0, MAX_RELATIONS);
  return (
    <div className="space-y-1.5">
      {list.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => nav.open(p1NavSubject(r))}
          onMouseEnter={() => nav.schedulePrefetch(r.id)}
          onMouseLeave={nav.cancelPrefetch}
          className="flex w-full items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-muted/40"
          title={`查看详情：${r.nameCN || r.name}`}
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

/** 相关推荐：紧凑行（封面 + 名称 + 评分），点击打开应用内详情弹窗 */
function RecsSection({
  data,
  nav,
}: {
  data: P1RecItem[];
  nav: P1SubjectNav;
}) {
  const list = data.slice(0, MAX_RECS);
  return (
    <div className="space-y-1.5">
      {list.map((r, i) => (
        <button
          key={i}
          type="button"
          onClick={() => nav.open(p1NavSubject(r))}
          onMouseEnter={() => r.id && nav.schedulePrefetch(r.id)}
          onMouseLeave={nav.cancelPrefetch}
          className="flex w-full items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-muted/40"
          title={`查看详情：${r.nameCN || r.name}`}
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
          <span className="min-w-0 flex-1 truncate text-xs">
            {r.nameCN || r.name}
          </span>
          {!!r.score && r.score > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
              <Star className="size-3 fill-current text-amber-500" />
              {r.score.toFixed(1)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** 角色/CV 区块：滚动可见才请求，无数据静默降级、重拉失败保留旧内容 */
function CharactersLazy({ subjectId }: { subjectId: number }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const q = useSubjectCharacters(subjectId, inView);
  const { hasData, hidden } = p1SectionState(q.data, q.isPending);
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

/** 关联条目区块：滚动可见才请求，无数据静默降级、重拉失败保留旧内容 */
function RelationsLazy({ subjectId }: { subjectId: number }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const q = useSubjectRelations(subjectId, inView);
  const nav = useP1SubjectDialog();
  const { hasData, hidden } = p1SectionState(q.data, q.isPending);
  return (
    <div ref={ref}>
      {hidden ? null : (
        <SectionBody title="关联条目" skeleton="rows" hasData={hasData}>
          {q.data ? <RelationsSection data={q.data} nav={nav} /> : null}
        </SectionBody>
      )}
      {nav.element}
    </div>
  );
}

/** 相关推荐区块：滚动可见才请求，无数据静默降级、重拉失败保留旧内容 */
function RecsLazy({ subjectId }: { subjectId: number }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const q = useSubjectRecs(subjectId, inView);
  const nav = useP1SubjectDialog();
  const { hasData, hidden } = p1SectionState(q.data, q.isPending);
  return (
    <div ref={ref}>
      {hidden ? null : (
        <SectionBody title="相关推荐" skeleton="rows" hasData={hasData}>
          {q.data ? <RecsSection data={q.data} nav={nav} /> : null}
        </SectionBody>
      )}
      {nav.element}
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
