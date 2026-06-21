import { useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SubjectRow } from "@/components/SubjectRow";
import { BangumiLink } from "@/components/BangumiLink";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useUserCollectionsAll, usePatchCollection } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import {
  COLLECTION_LABELS,
  COLLECTION_ORDER,
  CollectionType,
  SubjectType,
} from "@/types/bgm";
import type { UserCollection } from "@/types/bgm";
import { cn } from "@/lib/utils";

function groupByType(items: UserCollection[]): Record<number, UserCollection[]> {
  const groups: Record<number, UserCollection[]> = {};
  for (const it of items) {
    (groups[it.type] ??= []).push(it);
  }
  return groups;
}

export function Watchlist() {
  const { user, loading: userLoading } = useAuthUser();
  const [openMap, setOpenMap] = useState<Record<number, boolean>>(() =>
    // 默认全部展开
    Object.fromEntries(COLLECTION_ORDER.map((t) => [t, true])),
  );

  const animeQ = useUserCollectionsAll(user?.username, SubjectType.Anime);
  const bookQ = useUserCollectionsAll(user?.username, SubjectType.Book);
  const patchMut = usePatchCollection();
  const qc = useQueryClient();

  const loading = animeQ.isLoading || bookQ.isLoading;
  const error = animeQ.error || bookQ.error;

  const groups = useMemo(() => {
    const items = [...(animeQ.data ?? []), ...(bookQ.data ?? [])];
    return groupByType(items);
  }, [animeQ.data, bookQ.data]);

  const totalCount = useMemo(
    () => Object.values(groups).reduce((a, g) => a + g.length, 0),
    [groups],
  );

  function refresh() {
    qc.invalidateQueries({ queryKey: ["collections"] });
  }

  function handleMove(item: UserCollection, type: CollectionType) {
    if (type === item.type || patchMut.isPending) return;
    patchMut.mutate({ subjectId: item.subject_id, type });
  }

  if (userLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 加载中…
      </div>
    );
  }

  if (!user) {
    return (
      <p className="text-sm text-muted-foreground">
        请先到「配置」页完成 Bangumi 认证。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {loading
            ? "加载中…"
            : error
              ? "加载失败"
              : `共 ${totalCount} 项`}
        </span>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          刷新
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "加载失败"}
        </p>
      )}
      {patchMut.error && (
        <p className="text-sm text-destructive">
          移动失败：
          {patchMut.error instanceof Error
            ? patchMut.error.message
            : String(patchMut.error)}
        </p>
      )}

      <div className="space-y-2">
        {COLLECTION_ORDER.map((type) => {
          const items = groups[type] ?? [];
          const open = openMap[type];
          return (
            <Collapsible
              key={type}
              open={open}
              onOpenChange={(o) =>
                setOpenMap((m) => ({ ...m, [type]: o }))
              }
              className="rounded-lg border border-border"
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/50">
                <span>
                  {COLLECTION_LABELS[type as CollectionType]}
                  <span className="ml-2 text-muted-foreground">
                    ({items.length})
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    open && "rotate-180",
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                {items.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-muted-foreground">
                    暂无
                  </div>
                ) : (
                  <div className="border-t border-border p-1">
                    {items.map((c) => (
                      <SubjectRow
                        key={c.subject_id}
                        subject={c.subject}
                        expandedAction={
                          <div className="flex items-center gap-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={patchMut.isPending}
                                  className="gap-1"
                                >
                                  {patchMut.isPending &&
                                  patchMut.variables?.subjectId ===
                                    c.subject_id ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    COLLECTION_LABELS[c.type as CollectionType]
                                  )}
                                  <ChevronDown className="size-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {COLLECTION_ORDER.map((t) => (
                                  <DropdownMenuItem
                                    key={t}
                                    onClick={() =>
                                      handleMove(c, t as CollectionType)
                                    }
                                  >
                                    <Check
                                      className={cn(
                                        "size-3.5",
                                        c.type === t
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    {COLLECTION_LABELS[t as CollectionType]}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <BangumiLink subjectId={c.subject_id} />
                          </div>
                        }
                      />
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
