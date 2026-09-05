import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ArrowUpToLine,
  Check,
  ChevronDown,
  Filter,
  ListCollapse,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  COLLECTION_LABELS,
  COLLECTION_ORDER,
  CollectionType,
  SUBJECT_LABELS,
  SUBJECT_TYPES,
  SubjectType,
} from "@/types/bgm";
import { WATCH_SORT_LABELS, type WatchSortDir, type WatchSortKey } from "@/App";
import { cn } from "@/lib/utils";

interface WatchlistToolbarProps {
  loading: boolean;
  totalCount: number;
  /** 收藏夹类型 -> 该分组条目数 */
  counts: Record<number, number>;
  /** 条目类型 -> 该类型条目数 */
  subjectCounts: Record<number, number>;
  /** 当前选中的条目类型筛选（undefined = 全部） */
  subjectType: SubjectType | undefined;
  onSubjectTypeChange: (type: SubjectType | undefined) => void;
  /** 列表排序方式 */
  sortKey: WatchSortKey;
  onSortChange: (key: WatchSortKey) => void;
  /** 当前排序方向（升/降序） */
  sortDir: WatchSortDir;
  onToggleSortDir: () => void;
  onRefresh: () => void;
  onJumpTo: (type: CollectionType) => void;
  onJumpToTop: () => void;
}

/** 追番页标题栏工具：类型筛选 + 排序（键 + 升降序 toggle）+ 跳转下拉 + 刷新。 */
export function WatchlistToolbar({
  loading,
  totalCount,
  counts,
  subjectCounts,
  subjectType,
  onSubjectTypeChange,
  sortKey,
  onSortChange,
  sortDir,
  onToggleSortDir,
  onRefresh,
  onJumpTo,
  onJumpToTop,
}: WatchlistToolbarProps) {
  const jumpDisabled = loading || totalCount === 0;

  return (
    <div className="ml-auto flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Filter className="size-3.5" />
            {subjectType ? SUBJECT_LABELS[subjectType] : "全部"}
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onSubjectTypeChange(undefined)}>
            <Check
              className={cn(
                "size-3.5",
                subjectType === undefined ? "opacity-100" : "opacity-0",
              )}
            />
            全部
            <span className="ml-auto text-muted-foreground">
              {SUBJECT_TYPES.reduce((a, t) => a + (subjectCounts[t] ?? 0), 0)}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {SUBJECT_TYPES.map((t) => (
            <DropdownMenuItem key={t} onClick={() => onSubjectTypeChange(t)}>
              <Check
                className={cn(
                  "size-3.5",
                  subjectType === t ? "opacity-100" : "opacity-0",
                )}
              />
              {SUBJECT_LABELS[t]}
              <span className="ml-auto text-muted-foreground">
                {subjectCounts[t] ?? 0}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 排序：左半 toggle 升/降序，右半选排序键 */}
      <ButtonGroup>
        <Button
          variant="outline"
          size="sm"
          className="w-8 p-0"
          onClick={onToggleSortDir}
          title={sortDir === "desc" ? "降序（大→小）" : "升序（小→大）"}
        >
          {sortDir === "desc" ? (
            <ArrowDownWideNarrow className="size-3.5" />
          ) : (
            <ArrowUpNarrowWide className="size-3.5" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              {WATCH_SORT_LABELS[sortKey]}
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(WATCH_SORT_LABELS) as WatchSortKey[]).map((k) => (
              <DropdownMenuItem key={k} onClick={() => onSortChange(k)}>
                <Check
                  className={cn(
                    "size-3.5",
                    sortKey === k ? "opacity-100" : "opacity-0",
                  )}
                />
                {WATCH_SORT_LABELS[k]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={jumpDisabled}
            className="gap-1"
          >
            <ListCollapse className="size-3.5" />
            跳转
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onJumpToTop}>
            <ArrowUpToLine className="size-3.5" />
            回到顶部
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {COLLECTION_ORDER.map((type) => (
            <DropdownMenuItem key={type} onClick={() => onJumpTo(type)}>
              {COLLECTION_LABELS[type]}
              <span className="ml-auto text-muted-foreground">
                {counts[type] ?? 0}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="icon-sm"
        onClick={onRefresh}
        disabled={loading}
        title="刷新"
      >
        <RefreshCw className={cn("size-4", loading && "animate-spin")} />
      </Button>
    </div>
  );
}
