// 角色 / 声优（人物）详情弹窗：p1 私有端点 /p1/characters/{id}、/p1/persons/{id}。
// 端点形状未实测（仅上游 p1.yaml 登记），加载前先用入口处已知的名/图占位，
// 拿到详情后宽松展示（缺失字段降级）；角色弹窗内的 CV 列表来自当前条目数据，
// 点击 CV 名可再开一层声优弹窗（递归复用本组件）。
import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeImg } from "@/components/FadeImg";
import { useCharacterDetail, usePersonDetail } from "@/lib/queries";
import { coverUrl } from "@/lib/cover";
import { cn } from "@/lib/utils";
import type { P1Character, P1PersonDetail, SubjectImages } from "@/types/bgm";

/** 弹窗目标：kind 区分角色/声优；name/images 为入口已知值（加载前占位） */
export interface PersonDialogTarget {
  kind: "character" | "person";
  id: number;
  name: string;
  images?: SubjectImages | null;
  /** 角色弹窗：该角色在当前条目的 CV 列表（点击 CV 名打开声优弹窗） */
  casts?: P1Character["cast"];
}

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
  const img = coverUrl((detail?.images ?? target?.images) ?? undefined, 400);
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
      <DialogContent className="max-w-lg">
        <DialogTitle className="sr-only">{name || "详情"}</DialogTitle>
        {q.isPending ? (
          <div className="flex gap-3">
            <Skeleton className="aspect-[3/4] w-20 shrink-0 rounded-md" />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        ) : q.isError ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-destructive">
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
          <div className="flex gap-3 text-left">
            <div className="w-20 shrink-0">
              {img ? (
                <FadeImg
                  src={img}
                  alt={name}
                  className="aspect-[3/4] w-full rounded-md bg-muted/50 object-cover object-top"
                />
              ) : (
                <div className="aspect-[3/4] w-full rounded-md bg-muted/60" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-base leading-tight font-semibold">{name}</p>
              {original && original !== name && (
                <p className="text-xs text-muted-foreground">{original}</p>
              )}
              {!!detail?.career?.length && (
                <div className="flex flex-wrap gap-1">
                  {detail.career.slice(0, 4).map((c) => (
                    <span
                      key={c}
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {c}
                    </span>
                  ))}
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
              {target?.kind === "character" && !!target.casts?.length && (
                <div className="space-y-1 pt-1">
                  <p className="text-xs text-muted-foreground">声优</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {target.casts.map((cv, i) => (
                      <button
                        key={`${cv.id}-${i}`}
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
                        {cv.name}
                        {cv.lang ? `（${cv.lang}）` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
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
