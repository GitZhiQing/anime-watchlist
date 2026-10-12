// 角色 / 声优（人物）详情弹窗：p1 私有端点 /p1/characters/{id}、/p1/persons/{id}。
// 固定宽高（max-w-lg × 70vh）：头部（头像 + 名字 + 职业）固定，主体（声优 + 简介）超出滚动——
// 角色与声优弹窗尺寸一致，不随内容长短变化。角色弹窗内的 CV 列表来自当前条目数据，
// 点击 CV 名可再开一层声优弹窗（递归复用本组件，尺寸同固定）。
import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ZoomableImage } from "@/components/ZoomableImage";
import { useCharacterDetail, usePersonDetail } from "@/lib/queries";
import { coverUrl } from "@/lib/cover";
import { cn } from "@/lib/utils";
import type { P1Character, P1PersonDetail, SubjectImages } from "@/types/bgm";

/** 弹窗目标：kind 区分角色/声优；id/name/images 为入口已知值（加载前占位），
 *  p1 数据可能缺失——id 为 null 时两个详情查询均禁用（弹窗内显示加载占位外的空态） */
export interface PersonDialogTarget {
  kind: "character" | "person";
  id: number | null;
  name?: string;
  images?: SubjectImages | null;
  /** 角色弹窗：该角色在当前条目的 CV 列表（点击 CV 名打开声优弹窗） */
  casts?: P1Character["cast"];
}

/** 人物职业英文 → 中文（2026-10-12 实测 career 为英文词，如 seiyu/artist） */
const CAREER_ZH: Record<string, string> = {
  seiyu: "声优",
  artist: "艺人",
  producer: "制作人",
  mangaka: "漫画家",
  writer: "作者",
  novelist: "小说家",
  illustrator: "插画家",
  actor: "演员",
  composer: "作曲",
  lyricist: "作词",
};

export function PersonDetailDialog({
  target,
  onOpenChange,
}: {
  target: PersonDialogTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  // 两个 hook 均常调（rules of hooks），以 id 是否为 null 控制启用
  const charQ = useCharacterDetail(
    target?.kind === "character" ? target.id : null,
  );
  const personQ = usePersonDetail(target?.kind === "person" ? target.id : null);
  const q = target?.kind === "character" ? charQ : personQ;

  // 嵌套声优弹窗（角色 → CV → 声优）；切换目标时复位
  const [sub, setSub] = useState<PersonDialogTarget | null>(null);
  useEffect(() => {
    setSub(null);
  }, [target?.id, target?.kind]);

  const detail: P1PersonDetail | undefined = q.data;
  const original = detail?.name || target?.name || "";
  const name = detail?.nameCN || original;
  const imgs = detail?.images ?? target?.images;
  // large 档：64px 容器在高 DPI 下 medium 偏糊；lain 头像统一走 cover:// 协议
  const img = coverUrl(imgs ?? undefined, 400);
  const imgZoom = coverUrl(imgs ?? undefined, 800) ?? img;
  const summary = detail?.summary?.trim();

  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o) {
          setSub(null);
          onOpenChange(false);
        }
      }}
    >
      {/* 固定宽高：头部恒定可见，主体超高时内部滚动 */}
      <DialogContent className="flex h-[70vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{name || "详情"}</DialogTitle>
        {q.isPending ? (
          <div className="flex gap-3 p-4 text-left">
            <Skeleton className="aspect-[3/4] w-16 shrink-0 rounded-md" />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ) : q.isError ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-destructive">
            <span>详情加载失败</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => void q.refetch()}
            >
              <RotateCw className="size-3" /> 重试
            </Button>
          </div>
        ) : (
          <>
            {/* 固定头部：头像（点击放大查看）+ 名字 + 职业 */}
            <div className="flex shrink-0 gap-3 border-b border-border px-4 pt-4 pb-3 text-left">
              <div className="w-16 shrink-0">
                {img ? (
                  <ZoomableImage
                    src={img}
                    zoomSrc={imgZoom}
                    alt={name || "人物"}
                    title={`查看大图${name ? `：${name}` : ""}`}
                    className="aspect-[3/4] w-full rounded-md bg-muted/50 object-cover object-top hover:opacity-80"
                  />
                ) : (
                  <div className="aspect-[3/4] w-full rounded-md bg-muted/60" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1 py-0.5 pr-6">
                <p className="text-base leading-tight font-semibold">{name}</p>
                {original && original !== name && (
                  <p className="text-xs text-muted-foreground">{original}</p>
                )}
                {!!detail?.career?.length && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {detail.career.slice(0, 4).map((c) => (
                      <span
                        key={c}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {CAREER_ZH[c] ?? c}
                      </span>
                    ))}
                    {detail.career.length > 4 && (
                      <span className="px-0.5 py-0.5 text-[10px] text-muted-foreground">
                        +{detail.career.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* 滚动主体：角色弹窗的声优列表紧贴头部（简介可长，放其后） */}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-left">
              {target?.kind === "character" && !!target.casts?.length && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">声优</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {target.casts.map((cv, i) => (
                      <button
                        key={cv.id ?? i}
                        type="button"
                        className="cursor-pointer text-xs text-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
                        onClick={() =>
                          cv.id &&
                          setSub({
                            kind: "person",
                            id: cv.id,
                            name: cv.name,
                            images: cv.images,
                          })
                        }
                      >
                        {cv.name ?? "未知"}
                        {cv.lang ? `（${cv.lang}）` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p
                className={cn(
                  "text-xs leading-relaxed whitespace-pre-line",
                  !summary && "text-muted-foreground",
                )}
              >
                {summary || "暂无简介"}
              </p>
            </div>
          </>
        )}
        {/* 嵌套声优弹窗（角色 → CV） */}
        <PersonDetailDialog
          target={sub}
          onOpenChange={(o) => !o && setSub(null)}
        />
      </DialogContent>
    </Dialog>
  );
}
