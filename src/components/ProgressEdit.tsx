import { useEffect, useState } from "react";
import { Loader2, Minus, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ButtonGroup } from "@/components/ui/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  usePatchCollection,
  episodesQueryOptions,
  patchCachedCollections,
} from "@/lib/queries";
import { setEpisodeWatched, type Episode } from "@/lib/bgm";
import { useAuthUser } from "@/hooks/useAuthUser";
import { SubjectType } from "@/types/bgm";
import { cn } from "@/lib/utils";

/**
 * 「我的」折叠区内的评分与进度编辑，拆为两个独立组件：
 * - RateStars：我的评分（1~10 星，点击已评分值清除）
 * - ProgressRows：我的进度（话数逐集标记/步进 + 书籍卷数），含剧集懒加载与乐观更新
 */

interface RateStarsProps {
  subjectId: number;
  /** 当前评分（0 = 未评） */
  rate: number;
}

/** 我的评分：1~10 星。点击已评分值可清除；乐观更新缓存，失败回滚。 */
export function RateStars({ subjectId, rate }: RateStarsProps) {
  const { user } = useAuthUser();
  const username = user?.username;
  const mut = usePatchCollection();
  // 乐观覆盖值：null 表示跟随 props
  const [optRate, setOptRate] = useState<number | null>(null);
  const shownRate = optRate ?? rate;

  useEffect(() => {
    if (optRate !== null && rate === optRate) setOptRate(null);
  }, [rate, optRate]);

  function setRate(value: number) {
    const next = shownRate === value ? 0 : value; // 再点同一颗星清除评分
    setOptRate(next); // 先改 UI，结果以 toast 通知
    mut.mutate(
      { subjectId, username, rate: next },
      {
        onSuccess: () =>
          next > 0
            ? toast.success(`评分已保存：${next} 分`)
            : toast.success("已清除评分"),
        onError: (e) => {
          setOptRate(null); // 回滚
          toast.error("评分失败", {
            description: e instanceof Error ? e.message : String(e),
          });
        },
      },
    );
  }

  const pending = mut.isPending && mut.variables?.subjectId === subjectId;

  return (
    <div className="flex items-center" title="点击评分（1~10），再点同一颗星清除">
      {pending && <Loader2 className="mr-1 size-3 animate-spin" />}
      {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
        <button
          key={v}
          type="button"
          disabled={pending}
          onClick={() => setRate(v)}
          className="p-0.5 disabled:opacity-50"
          aria-label={`${v} 分`}
        >
          <Star
            className={cn(
              "size-4 transition-colors",
              v <= shownRate
                ? "fill-current text-amber-500"
                : "text-muted-foreground/50 hover:text-amber-400",
            )}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * 首个未放送的话数（之后的集数一律视为未更新，不再逐集判断——
 * 放送是按序进行的，中间不会跳回）。剧集信息缺失时返回 max+1（全部视为已出）。
 */
function firstUnairedEp(episodes: Map<number, Episode> | undefined, max: number): number {
  if (!episodes) return max + 1;
  for (let n = 1; n <= max; n++) {
    const e = episodes.get(n);
    if (!e?.airdate) continue; // 日期缺失视为已出，继续往后找
    const d = new Date(e.airdate);
    if (!isNaN(d.getTime()) && d.getTime() > Date.now()) return n;
  }
  return max + 1;
}

/** 进度：可点击话数按钮（1..totalEps）。已看外边框、已播出未看普通文本、未播出浅色字 */
function EpisodePicker({
  max,
  current,
  busy,
  onPick,
  episodes,
}: {
  max: number;
  current: number;
  busy: boolean;
  onPick: (n: number) => void;
  /** ep 序号 -> 剧集信息（悬浮提示 + 判断是否已放送），未加载时无提示 */
  episodes?: Map<number, Episode>;
}) {
  function tip(n: number) {
    const e = episodes?.get(n);
    if (!e) return null;
    return (
      <div className="space-y-0.5">
        <p className="font-medium">
          ep.{n} {e.name}
        </p>
        {e.name_cn && (
          <p className="text-muted-foreground">中文标题：{e.name_cn}</p>
        )}
        {e.airdate && (
          <p className="text-muted-foreground">首播：{e.airdate}</p>
        )}
        {e.duration && (
          <p className="text-muted-foreground">时长：{e.duration}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex max-w-[310px] flex-wrap items-center gap-0.5">
      {(() => {
        const firstUnaired = firstUnairedEp(episodes, max);
        return Array.from({ length: max }, (_, i) => i + 1).map((n) => {
          const watched = n <= current;
          const aired = n < firstUnaired;
        return (
          <Tooltip key={n}>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(n === current ? n - 1 : n)}
                className={cn(
                  "flex h-6 min-w-6 items-center justify-center rounded border px-1 text-xs tabular-nums transition-colors disabled:opacity-50",
                  watched
                    ? "border-primary font-medium text-primary" // 已看：外边框
                    : aired
                      ? "border-transparent text-foreground hover:bg-muted" // 已播出未看：普通文本
                      : "border-transparent text-muted-foreground/50 hover:bg-muted", // 未播出：浅色字
                )}
              >
                {n}
              </button>
            </TooltipTrigger>
            {tip(n) && <TooltipContent side="top">{tip(n)}</TooltipContent>}
          </Tooltip>
        );
        });
      })()}
    </div>
  );
}

/** 通用 −/输入/+ 步进器：书籍的话数与卷数共用同一形态 */
function NumberStepper({
  value,
  busy,
  max,
  onCommit,
  ariaLabel,
  decTitle,
  incTitle,
}: {
  value: number;
  busy: boolean;
  /** 上限（未知则不限制） */
  max?: number;
  onCommit: (value: number) => void;
  ariaLabel: string;
  decTitle: string;
  incTitle: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <ButtonGroup>
      <Button
        variant="outline"
        size="icon-sm"
        className="size-6 p-0"
        disabled={busy}
        onClick={() => onCommit(value - 1)}
        title={decTitle}
      >
        <Minus className="size-3" />
      </Button>
      <Input
        type="number"
        min={0}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && !isNaN(n)) onCommit(n);
          else setText(String(value)); // 非法输入回显当前值
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        disabled={busy}
        aria-label={ariaLabel}
        className="h-6 w-10 px-1 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <Button
        variant="outline"
        size="icon-sm"
        className="size-6 p-0"
        disabled={busy}
        onClick={() => onCommit(value + 1)}
        title={incTitle}
      >
        <Plus className="size-3" />
      </Button>
    </ButtonGroup>
  );
}

interface ProgressRowsProps {
  subjectId: number;
  /** 条目类型：书籍走 PATCH ep_status，其余走剧集标记接口 */
  subjectType: number;
  /** 当前看到的话数 */
  epStatus: number;
  /** 总话数（未知则 0） */
  totalEps: number;
  /** 当前卷数进度（书籍类） */
  volStatus?: number;
  /** 总卷数（书籍类，为 0 时不显示卷） */
  volumes?: number;
}

/** 我的进度：话数（逐集标记/步进）+ 书籍卷数。乐观更新缓存，失败回滚。 */
export function ProgressRows({
  subjectId,
  subjectType,
  epStatus,
  totalEps,
  volStatus = 0,
  volumes = 0,
}: ProgressRowsProps) {
  const qc = useQueryClient();
  const { user } = useAuthUser();
  const username = user?.username;
  const mut = usePatchCollection();
  const [epBusy, setEpBusy] = useState(false);

  // 剧集信息（悬浮提示用）：动画类且已知总话数时懒加载，与进度标记共用缓存
  const { data: episodes } = useQuery({
    ...episodesQueryOptions(subjectId),
    enabled: subjectType !== SubjectType.Book && totalEps > 0,
  });
  const episodeByEp = episodes ? new Map(episodes.map((e) => [e.ep, e])) : undefined;

  // 乐观覆盖值：null 表示跟随 props
  const [optEp, setOptEp] = useState<number | null>(null);
  const [optVol, setOptVol] = useState<number | null>(null);
  const shownEp = optEp ?? epStatus;
  const shownVol = optVol ?? volStatus;

  useEffect(() => {
    if (optEp !== null && epStatus === optEp) setOptEp(null);
  }, [epStatus, optEp]);
  useEffect(() => {
    if (optVol !== null && volStatus === optVol) setOptVol(null);
  }, [volStatus, optVol]);

  // 各行独立的 busy：进度行只看进度请求，卷行只看卷请求
  const epPending =
    epBusy ||
    (mut.isPending &&
      mut.variables?.subjectId === subjectId &&
      mut.variables?.ep_status !== undefined);
  const volPending =
    mut.isPending &&
    mut.variables?.subjectId === subjectId &&
    mut.variables?.vol_status !== undefined;

  function clamp(value: number) {
    return Math.max(0, totalEps > 0 ? Math.min(value, totalEps) : value);
  }

  function failToast(action: string, e: unknown) {
    toast.error(action, {
      description: e instanceof Error ? e.message : String(e),
    });
  }

  /** 书籍：PATCH ep_status 一步到位（mutation 内已乐观直写缓存） */
  function commitEpBook(target: number) {
    mut.mutate(
      { subjectId, username, ep_status: target },
      {
        onSuccess: () => toast.success(`进度已更新：看到第 ${target} 话`),
        onError: (e) => {
          setOptEp(null); // 回滚
          failToast("更新进度失败", e);
        },
      },
    );
  }

  /**
   * 非书籍：按话数范围逐集标记/取消标记。范围由当前值与目标值推导，天然去重。
   * 完成后乐观直写收藏缓存的 ep_status，列表只置 stale 不全量重拉。
   */
  async function commitEpByEpisodes(target: number) {
    setEpBusy(true);
    try {
      const eps =
        episodes ??
        (await qc.fetchQuery(episodesQueryOptions(subjectId)));
      if (!eps) throw new Error("剧集列表加载失败");
      const idByEp = new Map(eps.map((e) => [e.ep, e.id]));
      const [from, to, watched] =
        target > shownEp
          ? [shownEp + 1, target, true]
          : [target + 1, shownEp, false];
      for (let n = from; n <= to; n++) {
        const id = idByEp.get(n);
        if (id === undefined) continue; // 剧集列表缺失该话（SP 等）则跳过
        await setEpisodeWatched(subjectId, id, watched);
      }
      if (username) {
        patchCachedCollections(qc, username, subjectId, { ep_status: target });
        qc.invalidateQueries({
          queryKey: ["collection", username, subjectId],
          refetchType: "none",
        });
        qc.invalidateQueries({
          queryKey: ["collections", username],
          refetchType: "none",
        });
      }
      toast.success(`进度已更新：看到第 ${target} 话`);
    } catch (e) {
      setOptEp(null); // 回滚
      failToast("更新进度失败", e);
    } finally {
      setEpBusy(false);
    }
  }

  function commitEp(value: number) {
    const target = clamp(value);
    if (target === shownEp) return;
    setOptEp(target); // 先改 UI，结果以 toast 通知
    if (subjectType === SubjectType.Book) commitEpBook(target);
    else void commitEpByEpisodes(target);
  }

  /** 书籍卷进度：PATCH vol_status（mutation 内已乐观直写缓存） */
  function commitVol(value: number) {
    const target = Math.max(0, volumes > 0 ? Math.min(value, volumes) : value);
    if (target === shownVol || isNaN(target)) return;
    setOptVol(target);
    mut.mutate(
      { subjectId, username, vol_status: target },
      {
        onSuccess: () => toast.success(`卷进度已更新：${target} 卷`),
        onError: (e) => {
          setOptVol(null); // 回滚
          failToast("更新卷进度失败", e);
        },
      },
    );
  }

  const isBook = subjectType === SubjectType.Book;

  /** 话数组：非书籍且总话数已知 → 逐集按钮；否则（含书籍）→ 与卷数同款步进器 */
  const epGroup = (
    <div className="flex flex-wrap items-center gap-2">
      {epPending && <Loader2 className="size-3 animate-spin" />}
      {!isBook && totalEps > 0 ? (
        <EpisodePicker
          max={totalEps}
          current={shownEp}
          busy={epPending}
          onPick={commitEp}
          episodes={episodeByEp}
        />
      ) : (
        <NumberStepper
          value={shownEp}
          busy={epPending}
          max={totalEps > 0 ? totalEps : undefined}
          onCommit={commitEp}
          ariaLabel="看到第几话"
          decTitle="减 1 话"
          incTitle="加 1 话"
        />
      )}
      <span className="shrink-0">/ {totalEps > 0 ? totalEps : "?"} 话</span>
    </div>
  );

  /** 卷组：仅书籍且有卷数 */
  const volGroup =
    isBook && volumes > 0 ? (
      <div className="flex flex-wrap items-center gap-2">
        {volPending && <Loader2 className="size-3 animate-spin" />}
        <NumberStepper
          value={shownVol}
          busy={volPending}
          max={volumes > 0 ? volumes : undefined}
          onCommit={commitVol}
          ariaLabel="已读卷数"
          decTitle="减 1 卷"
          incTitle="加 1 卷"
        />
        <span>/ {volumes} 卷</span>
      </div>
    ) : null;

  // 书籍：话数与卷数同一行；其余类型：话数独占一行
  return volGroup ? (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {epGroup}
      {volGroup}
    </div>
  ) : (
    epGroup
  );
}
