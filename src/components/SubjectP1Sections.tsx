import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import {
  usePrefetchSubject,
  useSubjectCharacters,
  useSubjectRelations,
  useSubjectRecs,
} from "@/lib/queries";
import { SubjectDetailDialog } from "@/components/SubjectDetailDialog";
import { FadeImg } from "@/components/FadeImg";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

/** p1 卡片网格：auto-fill 同时适配详情弹窗的宽滚动区与展开行的窄容器 */
const CARD_GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-x-2 gap-y-3";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-muted-foreground">{children}</div>
  );
}

/** 区块加载中的骨架占位（保留空间：未滚到不请求，滚到后内容出现不跳版） */
function SectionSkeleton({ variant }: { variant: "avatars" | "cards" }) {
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
    <div className={CARD_GRID}>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="aspect-[5/7] w-full rounded-md" />
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
  skeleton: "avatars" | "cards";
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

/** p1 卡片点击 → 应用内详情弹窗（不外跳浏览器）。悬停 300ms 预取详情，与网格卡片一致。 */
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
        const img = ch.images?.medium || ch.images?.large || ch.images?.small;
        return (
          <div
            key={ch.id}
            className="flex w-20 shrink-0 flex-col items-center gap-1 text-center"
            title={cv ? `${ch.name}\nCV：${cv.name}` : ch.name}
          >
            {img ? (
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="cursor-zoom-in"
                    title="查看大图"
                  >
                    <img
                      src={img}
                      alt={ch.name}
                      loading="lazy"
                      decoding="async"
                      // 3:4 竖版固定框：竖长图裁顶部（保留脸部），横宽图垂直放满、水平居中
                      className="aspect-[3/4] w-16 rounded-md object-cover object-top transition-opacity hover:opacity-80"
                    />
                  </button>
                </DialogTrigger>
                <DialogContent showCloseButton={false} variant="image">
                  <DialogTitle className="sr-only">{ch.name}</DialogTitle>
                  <img
                    src={ch.images?.large || img}
                    alt={ch.name}
                    className="max-h-[85vh] max-w-[90vw] rounded object-contain"
                  />
                </DialogContent>
              </Dialog>
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

/**
 * p1 条目海报卡片（关联条目/相关推荐共用）：视觉对齐 SubjectGridCard
 * （海报 + 底部标题浮层 + 右上角标），点击/悬停行为由区块共享的 nav 承接。
 */
function P1SubjectCard({
  nav,
  r,
  badge,
}: {
  nav: P1SubjectNav;
  r: {
    id?: number;
    type?: number;
    name?: string;
    nameCN?: string;
    images?: SubjectImages;
    score?: number;
  };
  /** 封面右上角文字角标（关联条目的关系文本），评分角标由 score 自动渲染 */
  badge?: string;
}) {
  const title = r.nameCN || r.name || "";
  // medium 起步：grid/small 是小缩略图，放大到卡片尺寸会糊
  const img =
    r.images?.medium ||
    r.images?.large ||
    r.images?.common ||
    r.images?.small ||
    r.images?.grid;
  return (
    <button
      type="button"
      onClick={() => nav.open(p1NavSubject(r))}
      onMouseEnter={() => r.id && nav.schedulePrefetch(r.id)}
      onMouseLeave={nav.cancelPrefetch}
      className="group cursor-pointer text-left"
      title={`查看详情：${title}`}
    >
      <div className="relative aspect-[5/7] w-full overflow-hidden rounded-md border border-border bg-muted/30 transition-colors group-hover:border-primary/40">
        {img ? (
          <FadeImg
            src={img}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
            暂无封面
          </span>
        )}
        {(badge || (!!r.score && r.score > 0)) && (
          <div className="absolute top-1 right-1 flex max-w-[calc(100%-0.5rem)] items-start justify-end gap-1">
            {badge && (
              <span
                className="min-w-0 truncate rounded bg-black/60 px-1 py-0.5 text-[10px] leading-none text-white"
                title={badge}
              >
                {badge}
              </span>
            )}
            {!!r.score && r.score > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[10px] leading-none text-amber-400">
                <Star className="size-2.5 fill-current" />
                {r.score.toFixed(1)}
              </span>
            )}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 pt-4 pb-1">
          <p className="line-clamp-1 text-[11px] leading-tight text-white">
            {title}
          </p>
        </div>
      </div>
    </button>
  );
}

/** 关联条目：海报卡片网格（relation 显示为封面右上角标），点击打开应用内详情弹窗 */
function RelationsSection({
  data,
  nav,
}: {
  data: P1Relation[];
  nav: P1SubjectNav;
}) {
  const list = data.slice(0, MAX_RELATIONS);
  return (
    <div className={CARD_GRID}>
      {list.map((r) => (
        <P1SubjectCard key={r.id} nav={nav} r={r} badge={r.relation} />
      ))}
    </div>
  );
}

/** 相关推荐：海报卡片网格（评分显示为海报右上角标），点击打开应用内详情弹窗 */
function RecsSection({
  data,
  nav,
}: {
  data: P1RecItem[];
  nav: P1SubjectNav;
}) {
  const list = data.slice(0, MAX_RECS);
  return (
    <div className={CARD_GRID}>
      {list.map((r, i) => (
        <P1SubjectCard key={i} nav={nav} r={r} />
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
        <SectionBody title="关联条目" skeleton="cards" hasData={hasData}>
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
        <SectionBody title="相关推荐" skeleton="cards" hasData={hasData}>
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
