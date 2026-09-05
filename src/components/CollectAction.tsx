import { useState } from "react";
import { Check, ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  useUserCollectionSmart,
  useSetCollection,
  usePatchCollection,
  useDeleteCollection,
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
  const deleteMut = useDeleteCollection();
  const busy = setMut.isPending || patchMut.isPending || deleteMut.isPending;
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  function handleDelete() {
    // 两步确认：第一次点击进入确认态，第二次才真正删除
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteMut.mutate(
      { subjectId, username },
      {
        onSuccess: () => toast.success("已取消收藏"),
        onError: (e) =>
          toast.error("取消收藏失败", {
            description: e instanceof Error ? e.message : String(e),
          }),
      },
    );
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
    <DropdownMenu>
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
        {current !== null && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={handleDelete}
              onMouseLeave={() => setConfirmDelete(false)}
            >
              <Trash2 className="size-3.5" />
              {confirmDelete ? "确认取消收藏？" : "取消收藏"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
