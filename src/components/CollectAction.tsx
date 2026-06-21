import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  useUserCollection,
  useSetCollection,
  usePatchCollection,
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
  const busy = setMut.isPending || patchMut.isPending;

  const current = data ? (data.type as CollectionType) : null;

  function handleSelect(type: CollectionType) {
    if (busy || current === type) return;
    const payload = { subjectId, type };
    if (current === null) setMut.mutate(payload);
    else patchMut.mutate(payload);
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
