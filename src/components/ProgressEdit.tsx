import { useEffect, useState } from "react";
import { Loader2, Minus, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ButtonGroup } from "@/components/ui/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePatchCollection, episodesQueryOptions } from "@/lib/queries";
import { setEpisodeWatched, type Episode } from "@/lib/bgm";
import { SubjectType } from "@/types/bgm";
import { cn } from "@/lib/utils";

interface ProgressEditProps {
  subjectId: number;
  /** 条目类型：书籍走 PATCH ep_status，其余走剧集标记接口 */
  subjectType: number;
  /** 当前看到的话数 */
  epStatus: number;
  /** 当前评分（0 = 未评） */
  rate: number;
  /** 总话数（未知则 0） */
  totalEps: number;
}

/**
 * 收藏进度与评分编辑（追番页展开后）。
 * - 进度：± 步进 + 直接输入，失焦/回车提交；上限为总话数（未知则不设上限）
 *   书籍：PATCH ep_status；动画等：标记/取消标记对应剧集（Bangumi 限制）
 * - 评分：1~10 星，点击已评分值可清除
 */
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

/** 进度：可点击话数按钮（1..totalEps）。已看实心、已播出未看描边、未播出弱化 */
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
    <div className="flex flex-wrap items-center gap-0.5">
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
                    ? "border-primary bg-primary font-medium text-primary-foreground"
                    : aired
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground/60 hover:border-border hover:bg-muted",
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

/** 进度：总话数未知时的兜底，± 步进 + 直接输入 */
function EpisodeStepper({
  epText,
  busy,
  onStep,
  onTextChange,
  onCommit,
}: {
  epText: string;
  busy: boolean;
  onStep: (delta: number) => void;
  onTextChange: (v: string) => void;
  onCommit: (value: string) => void;
}) {
  return (
    <ButtonGroup>
      <Button
        variant="outline"
        size="icon-sm"
        className="size-6 p-0"
        disabled={busy}
        onClick={() => onStep(-1)}
        title="减 1 话"
      >
        <Minus className="size-3" />
      </Button>
      <Input
        type="number"
        min={0}
        value={epText}
        onChange={(e) => onTextChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        disabled={busy}
        aria-label="看到第几话"
        className="h-6 w-10 px-1 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <Button
        variant="outline"
        size="icon-sm"
        className="size-6 p-0"
        disabled={busy}
        onClick={() => onStep(1)}
        title="加 1 话"
      >
        <Plus className="size-3" />
      </Button>
    </ButtonGroup>
  );
}

export function ProgressEdit({
  subjectId,
  subjectType,
  epStatus,
  rate,
  totalEps,
}: ProgressEditProps) {
  const qc = useQueryClient();
  const mut = usePatchCollection();
  const [epBusy, setEpBusy] = useState(false);

  // 剧集信息（悬浮提示用）：动画类且已知总话数时展开即懒加载，与进度标记共用缓存
  const { data: episodes } = useQuery({
    ...episodesQueryOptions(subjectId),
    enabled: subjectType !== SubjectType.Book && totalEps > 0,
  });
  const episodeByEp = episodes ? new Map(episodes.map((e) => [e.ep, e])) : undefined;
  // 乐观更新覆盖值：提交前先改 UI，服务端结果回来（缓存失效后 props 追上）或
  // 失败回滚时清除。null 表示跟随 props。
  const [optEp, setOptEp] = useState<number | null>(null);
  const [optRate, setOptRate] = useState<number | null>(null);

  const shownEp = optEp ?? epStatus;
  const shownRate = optRate ?? rate;

  // props 追上乐观值后解除覆盖（也顺带在失败回滚后同步输入框）
  useEffect(() => {
    if (optEp !== null && epStatus === optEp) setOptEp(null);
  }, [epStatus, optEp]);
  useEffect(() => {
    if (optRate !== null && rate === optRate) setOptRate(null);
  }, [rate, optRate]);

  const [epText, setEpText] = useState(String(shownEp));
  useEffect(() => {
    setEpText(String(shownEp));
  }, [shownEp]);

  // 各行独立的 busy：进度行只看进度请求，评分行只看评分请求
  const epPending =
    epBusy ||
    (mut.isPending &&
      mut.variables?.subjectId === subjectId &&
      mut.variables?.ep_status !== undefined);
  const ratePending =
    mut.isPending &&
    mut.variables?.subjectId === subjectId &&
    mut.variables?.rate !== undefined;

  function clamp(value: number) {
    return Math.max(0, totalEps > 0 ? Math.min(value, totalEps) : value);
  }

  function failToast(action: string, e: unknown) {
    toast.error(action, {
      description: e instanceof Error ? e.message : String(e),
    });
  }

  /** 书籍：PATCH ep_status 一步到位 */
  function commitEpBook(target: number) {
    mut.mutate(
      { subjectId, ep_status: target },
      {
        onSuccess: () => toast.success(`进度已更新：看到第 ${target} 话`),
        onError: (e) => {
          setOptEp(null); // 回滚
          failToast("更新进度失败", e);
        },
      },
    );
  }

  /** 非书籍：按话数范围逐集标记/取消标记，再失效收藏缓存 */
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
      await qc.invalidateQueries({ queryKey: ["collections"] });
      await qc.invalidateQueries({ queryKey: ["collection"] });
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
    if (target === shownEp) {
      setEpText(String(target));
      return;
    }
    setOptEp(target); // 先改 UI，结果以 toast 通知
    setEpText(String(target));
    if (subjectType === SubjectType.Book) commitEpBook(target);
    else void commitEpByEpisodes(target);
  }

  function stepEp(delta: number) {
    commitEp((Number(epText) || 0) + delta);
  }

  function setRate(value: number) {
    const next = shownRate === value ? 0 : value; // 再点同一颗星清除评分
    setOptRate(next); // 先改 UI，结果以 toast 通知
    mut.mutate(
      { subjectId, rate: next },
      {
        onSuccess: () =>
          next > 0
            ? toast.success(`评分已保存：${next} 分`)
            : toast.success("已清除评分"),
        onError: (e) => {
          setOptRate(null); // 回滚
          failToast("评分失败", e);
        },
      },
    );
  }

  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0">进度</span>
        {epPending && <Loader2 className="size-3 animate-spin" />}
        {totalEps > 0 ? (
          <EpisodePicker
            max={totalEps}
            current={shownEp}
            busy={epPending}
            onPick={commitEp}
            episodes={episodeByEp}
          />
        ) : (
          <EpisodeStepper
            epText={epText}
            busy={epPending}
            onStep={stepEp}
            onTextChange={setEpText}
            onCommit={(v) => {
              const n = Number(v);
              if (v !== "" && !isNaN(n)) commitEp(n);
              else setEpText(String(shownEp));
            }}
          />
        )}
        <span>/ {totalEps > 0 ? totalEps : "?"} 话</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0">评分</span>
        {ratePending && <Loader2 className="size-3 animate-spin" />}
        <div
          className="flex items-center"
          title="点击评分（1~10），再点同一颗星清除"
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              type="button"
              disabled={epPending || ratePending}
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
      </div>
    </div>
  );
}
