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
  useUserCollection,
  useSetCollection,
  usePatchCollection,
  useDeleteCollection,
} from "@/lib/queries";
import { COLLECTION_LABELS, COLLECTION_ORDER } from "@/types/bgm";
import type { CollectionType } from "@/types/bgm";

interface CollectActionProps {
  subjectId: number;
}

/**
 * 收藏页展开后的收藏操作。懒加载该条目真实收藏状态（缓存）：
 * 已收藏则显示当前收藏夹（带 ✓），未收藏则显示「+ 收藏」。
 * 选中夹：未收藏走 POST 新增，已收藏走 PATCH 改夹；成功后缓存自动失效。
 */
export function CollectAction({ subjectId }: CollectActionProps) {
  const { user } = useAuthUser();
  const { data, isLoading, error } = useUserCollection(
    user?.username,
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
    const payload = { subjectId, type };
    if (current === null) setMut.mutate(payload);
    else patchMut.mutate(payload);
  }

  function handleDelete() {
    // 两步确认：第一次点击进入确认态，第二次才真正删除
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteMut.mutate(subjectId, {
      onSuccess: () => toast.success("已取消收藏"),
      onError: (e) =>
        toast.error("取消收藏失败", {
          description: e instanceof Error ? e.message : String(e),
        }),
    });
  }

  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="size-4 animate-spin" />
      </Button>
    );
  }

  if (error) {
    return (
      <Button
        variant="outline"
        size="sm"
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
        <Button
          variant={current ? "secondary" : "outline"}
          size="sm"
          disabled={busy}
          className="gap-1"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : current === null ? (
            <Plus className="size-4" />
          ) : null}
          {current ? COLLECTION_LABELS[current] : "收藏"}
          <ChevronDown className="size-3.5" />
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
