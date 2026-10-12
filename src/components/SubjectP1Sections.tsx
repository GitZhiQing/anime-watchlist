import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  usePrefetchSubject,
  useSubjectCharacters,
  useSubjectRelations,
  useSubjectRecs,
} from "@/lib/queries";
import { coverUrl } from "@/lib/cover";
import { SubjectDetailDialog } from "@/components/SubjectDetailDialog";
import {
  PersonDetailDialog,
  type PersonDialogTarget,
} from "@/components/PersonDetailDialog";
import { FadeImg } from "@/components/FadeImg";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  P1Character,
  P1RecItem,
  P1Relation,
  SlimSubject,
  SubjectImages,
} from "@/types/bgm";
import { SubjectType, SUBJECT_LABELS, SUBJECT_BADGE_STYLES } from "@/types/bgm";

/**
 * 详情底部的 p1 扩展信息：角色/CV、关联条目、相关推荐。
 * 私有接口、无官方文档：三区块各自观察视口，滚动可见才发请求（骨架占位避免布局跳变），
 * 仅「从未拿到数据」时失败/空结果才整块消失（静默降级）；
 * 已加载过的区块后台重拉失败保留旧内容，不因 error 态抹掉；
 * 缓存 1 小时、保留 2 小时——重开同一详情弹窗不再重拉。
 */

const MAX_RELATIONS = 12;
const MAX_RECS = 8;
/** 角色默认展示数，超出折叠为「查看全部」（客户端展开，无翻页请求） */
const CHARACTERS_PREVIEW = 12;
/** 角色身份徽标（p1 type 数值语义未实测确认，宽松映射） */
const ROLE_LABELS: Record<number, string> = { 1: "主角", 2: "配角", 3: "客串" };

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

/** 角色/CV：横向滚动头像卡。点角色图/名开角色弹窗，点 CV 名开声优弹窗；全部 CV 展示（>2 位折叠为「等N位」） */
function CharactersSection({
  data,
  onOpenCharacter,
  onOpenPerson,
}: {
  data: P1Character[];
  onOpenCharacter: (t: PersonDialogTarget) => void;
  onOpenPerson: (t: PersonDialogTarget) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const list = expanded ? data : data.slice(0, CHARACTERS_PREVIEW);
  return (
    <div className="space-y-1.5">
      <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
        {list.map((ch) => {
          const img = coverUrl(ch.images, 200);
          const role = ch.type !== undefined ? ROLE_LABELS[ch.type] : undefined;
          const cvs = ch.cast ?? [];
          const subtitle = [role, ch.characterName].filter(Boolean).join(" · ");
          const open = () =>
            onOpenCharacter({
              kind: "character",
              id: ch.id,
              name: ch.name,
              images: ch.images,
              casts: ch.cast,
            });
          return (
            <div
              key={ch.id}
              className="flex w-20 shrink-0 flex-col items-center gap-0.5 text-center"
              title={
                cvs.length > 0
                  ? `${ch.name}\nCV：${cvs.map((c) => c.name).join(" / ")}`
                  : ch.name
              }
            >
              <button
                type="button"
                onClick={open}
                className="cursor-pointer"
                title={`查看角色：${ch.name}`}
              >
                {img ? (
                  <img
                    src={img}
                    alt={ch.name}
                    loading="lazy"
                    decoding="async"
                    // 3:4 竖版固定框：竖长图裁顶部（保留脸部），横宽图垂直放满、水平居中
                    className="aspect-[3/4] w-16 rounded-md object-cover object-top transition-opacity hover:opacity-80"
                  />
                ) : (
                  <div className="aspect-[3/4] w-16 rounded-md bg-muted/60" />
                )}
              </button>
              <button
                type="button"
                onClick={open}
                className="line-clamp-2 w-full cursor-pointer text-xs leading-tight underline-offset-2 hover:underline"
                title={`查看角色：${ch.name}`}
              >
                {ch.name}
              </button>
              {subtitle && (
                <span className="line-clamp-1 w-full text-[10px] leading-tight text-muted-foreground/80">
                  {subtitle}
                </span>
              )}
              {cvs.length > 0 && (
                <span className="line-clamp-1 w-full text-[10px] leading-tight">
                  {cvs.slice(0, 2).map((cv, i) => (
                    <button
                      key={`${cv.id}-${i}`}
                      type="button"
                      className="cursor-pointer text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      title={`查看声优：${cv.name}${
                        cvs.length > 2 ? `（共 ${cvs.length} 位）` : ""
                      }`}
                      onClick={() =>
                        cv.id &&
                        onOpenPerson({
                          kind: "person",
                          id: cv.id,
                          name: cv.name,
                          images: cv.images,
                        })
                      }
                    >
                      {i > 0 && " / "}CV {cv.name}
                    </button>
                  ))}
                  {cvs.length > 2 && (
                    <span className="text-muted-foreground">
                      {" "}
                      等 {cvs.length} 位
                    </span>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {data.length > CHARACTERS_PREVIEW && (
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
          {expanded ? "收起" : `查看全部 ${data.length} 位`}
        </button>
      )}
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
  /** 封面右上角文字角标（关联条目的关系文本）；条目类型徽标紧随其后 */
  badge?: string;
}) {
  const title = r.nameCN || r.name || "";
  // p1 的 medium 仅 200 档，卡片 ≥96px 宽在高 DPI 下偏糊，统一取 400 档
  const img = coverUrl(r.images, 400);
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
        {/* 右上：关系角标 + 条目类型徽标（原评分角标位置） */}
        {(badge || (r.type !== undefined && SUBJECT_LABELS[r.type as SubjectType])) && (
          <div className="absolute top-1 right-1 flex max-w-[calc(100%-0.5rem)] items-start justify-end gap-1">
            {badge && (
              <span
                className="min-w-0 truncate rounded bg-black/60 px-1 py-0.5 text-[10px] leading-none text-white"
                title={badge}
              >
                {badge}
              </span>
            )}
            {r.type !== undefined && SUBJECT_LABELS[r.type as SubjectType] && (
              <span
                className={cn(
                  "shrink-0 rounded px-1 py-0.5 text-[10px] leading-none",
                  SUBJECT_BADGE_STYLES[r.type as SubjectType],
                )}
              >
                {SUBJECT_LABELS[r.type as SubjectType]}
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

/** 角色/CV 区块：滚动可见才请求，无数据静默降级、重拉失败保留旧内容；点卡片开角色/声优弹窗 */
function CharactersLazy({ subjectId }: { subjectId: number }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const q = useSubjectCharacters(subjectId, inView);
  const items = q.data?.items;
  const { hasData, hidden } = p1SectionState(items, q.isPending);
  const [characterTarget, setCharacterTarget] =
    useState<PersonDialogTarget | null>(null);
  const [personTarget, setPersonTarget] = useState<PersonDialogTarget | null>(
    null,
  );
  return (
    <div ref={ref}>
      {hidden ? null : (
        <SectionBody title="角色 / CV" skeleton="avatars" hasData={hasData}>
          {items ? (
            <CharactersSection
              data={items}
              onOpenCharacter={setCharacterTarget}
              onOpenPerson={setPersonTarget}
            />
          ) : null}
        </SectionBody>
      )}
      <PersonDetailDialog
        target={characterTarget}
        onOpenChange={(o) => !o && setCharacterTarget(null)}
      />
      <PersonDetailDialog
        target={personTarget}
        onOpenChange={(o) => !o && setPersonTarget(null)}
      />
    </div>
  );
}

/** 关联条目区块：滚动可见才请求，无数据静默降级、重拉失败保留旧内容 */
function RelationsLazy({ subjectId }: { subjectId: number }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const q = useSubjectRelations(subjectId, inView);
  const items = q.data?.items;
  const nav = useP1SubjectDialog();
  const { hasData, hidden } = p1SectionState(items, q.isPending);
  return (
    <div ref={ref}>
      {hidden ? null : (
        <SectionBody title="关联条目" skeleton="cards" hasData={hasData}>
          {items ? <RelationsSection data={items} nav={nav} /> : null}
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
  const items = q.data?.items;
  const nav = useP1SubjectDialog();
  const { hasData, hidden } = p1SectionState(items, q.isPending);
  return (
    <div ref={ref}>
      {hidden ? null : (
        <SectionBody title="相关推荐" skeleton="cards" hasData={hasData}>
          {items ? <RecsSection data={items} nav={nav} /> : null}
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
