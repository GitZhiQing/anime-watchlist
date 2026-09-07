import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  useUserCollectionSmart,
  useSetCollection,
  usePatchCollection,
} from "@/lib/queries";
import { COLLECTION_LABELS, COLLECTION_ORDER } from "@/types/bgm";
import type { CollectionType, SlimSubject } from "@/types/bgm";

interface CollectActionProps {
  subjectId: number;
  /** 条目数据：新增收藏时用于乐观插入收藏列表缓存（可选，缺省时仅精准失效） */
  subject?: SlimSubject;
  /** 按钮尺寸：嵌入标题行等紧凑场景用 xs */
  size?: "sm" | "xs";
}

/**
 * 收藏操作（追番/找番/新番三页统一）。收藏状态优先读收藏列表缓存
 * （useUserCollectionSmart，命中零请求），未命中才回退单条 GET：
 * 已收藏则显示当前收藏夹（带 ✓），未收藏则显示「+ 收藏」。
 * 选中夹：未收藏走 POST 新增，已收藏走 PATCH 改夹；乐观更新缓存，失败自动回滚。
 * 不提供取消收藏：Bangumi v0 API 无此端点（见 docs/API.md「在用端点总表」注记）。
 */
export function CollectAction({ subjectId, subject, size = "sm" }: CollectActionProps) {
  const { user } = useAuthUser();
  const username = user?.username;
  const { data, isLoading, error } = useUserCollectionSmart(
    username,
    subjectId,
  );
  const setMut = useSetCollection();
  const patchMut = usePatchCollection();
  const busy = setMut.isPending || patchMut.isPending;

  const current = data ? (data.type as CollectionType) : null;

  function handleSelect(type: CollectionType) {
    if (busy || current === type) return;
    if (current === null) {
      setMut.mutate(
        { subjectId, username, type, subject },
        {
          onSuccess: () =>
            toast.success(`已加入「${COLLECTION_LABELS[type]}」`),
          onError: (e) =>
            toast.error("收藏失败", {
              description: e instanceof Error ? e.message : String(e),
            }),
        },
      );
    } else {
      patchMut.mutate(
        { subjectId, username, type },
        {
          onSuccess: () =>
            toast.success(`已移入「${COLLECTION_LABELS[type]}」`),
          onError: (e) =>
            toast.error("移动失败", {
              description: e instanceof Error ? e.message : String(e),
            }),
        },
      );
    }
  }

  if (isLoading) {
    return (
      <Button variant="ghost" size={size} disabled>
        <Loader2 className="size-4 animate-spin" />
      </Button>
    );
  }

  if (error) {
    return (
      <Button
        variant="ghost"
        size={size}
        disabled
        title={error instanceof Error ? error.message : String(error)}
      >
        收藏失败
      </Button>
    );
  }

  return (
    // 非 modal：本组件嵌在 modal 详情弹窗头部。modal 下拉会把弹窗内容压成
    // pointer-events:none，点击弹窗任意处（含收藏按钮本身）都穿透到遮罩——
    // 下拉在 pointerdown 关闭并退出层栈，弹窗延迟到 click 的 dismiss 判定时
    // 已重新成为最高层而被放行，导致详情卡片被连带关闭（Radix #3346 时序）。
    // 非 modal 下无此穿透，点击弹窗内部只关下拉。
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size} disabled={busy} className="gap-1">
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : current === null ? (
            <Plus className={size === "xs" ? "size-3" : "size-4"} />
          ) : null}
          {current ? COLLECTION_LABELS[current] : "收藏"}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {COLLECTION_ORDER.map((t) => (
          <DropdownMenuItem key={t} onClick={() => handleSelect(t)}>
            <Check
              className={
                current === t ? "size-3.5 opacity-100" : "size-3.5 opacity-0"
              }
            />
            {COLLECTION_LABELS[t]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
