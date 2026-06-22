import { Check, ChevronDown, Loader2 } from "lucide-react";
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
import { usePatchCollection } from "@/lib/queries";
import {
  COLLECTION_LABELS,
  COLLECTION_ORDER,
  CollectionType,
} from "@/types/bgm";
import type { UserCollection } from "@/types/bgm";
import { cn } from "@/lib/utils";

interface WatchlistProps {
  loading: boolean;
  totalCount: number;
  groups: Record<number, UserCollection[]>;
  openMap: Record<number, boolean>;
  setOpenMap: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
}

/** 追番列表：按收藏夹分组的受控展示组件。数据与展开状态由 App 持有。 */
export function Watchlist({
  loading,
  totalCount,
  groups,
  openMap,
  setOpenMap,
}: WatchlistProps) {
  const patchMut = usePatchCollection();

  function handleMove(item: UserCollection, type: CollectionType) {
    if (type === item.type || patchMut.isPending) return;
    patchMut.mutate({ subjectId: item.subject_id, type });
  }

  return (
    <div className="space-y-2">
      <span className="block px-1 text-sm text-muted-foreground">
        {loading ? "加载中…" : `共 ${totalCount} 项`}
      </span>

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
              id={`collection-${type}`}
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
