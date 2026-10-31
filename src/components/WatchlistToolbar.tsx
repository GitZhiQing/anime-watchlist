import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ArrowUpToLine,
  ChevronDown,
  Clock,
  Filter,
  LayoutGrid,
  ListCollapse,
  ListFilter,
  RefreshCw,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  COLLECTION_ICONS,
  COLLECTION_LABELS,
  COLLECTION_ORDER,
  CollectionType,
  SUBJECT_LABELS,
  SUBJECT_TYPE_ICONS,
  SUBJECT_TYPES,
  SubjectType,
} from "@/types/bgm";
import { WATCH_SORT_LABELS, type WatchSortDir, type WatchSortKey } from "@/App";
import { cn } from "@/lib/utils";

/** 排序键图标（与排序菜单项一一对应） */
const WATCH_SORT_ICONS: Record<WatchSortKey, LucideIcon> = {
  default: ListFilter,
  collect: Users,
  score: Star,
  name: ArrowDownAZ,
  updated: Clock,
};

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
            <Filter className="size-3.5" aria-hidden="true" />
            {subjectType ? SUBJECT_LABELS[subjectType] : "全部"}
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>条目类型</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={subjectType === undefined}
            onSelect={() => onSubjectTypeChange(undefined)}
          >
            <LayoutGrid />
            全部
            <span className="text-xs text-muted-foreground tabular-nums">
              {SUBJECT_TYPES.reduce((a, t) => a + (subjectCounts[t] ?? 0), 0)}
            </span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {SUBJECT_TYPES.map((t) => {
            const Icon = SUBJECT_TYPE_ICONS[t];
            return (
              <DropdownMenuCheckboxItem
                key={t}
                checked={subjectType === t}
                onSelect={() => onSubjectTypeChange(t)}
              >
                <Icon />
                {SUBJECT_LABELS[t]}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {subjectCounts[t] ?? 0}
                </span>
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 排序：排序键 + 方向同在一个下拉（方向为第二组，选中项打勾） */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1" title="排序方式与方向">
            {WATCH_SORT_LABELS[sortKey]}
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>排序方式</DropdownMenuLabel>
          {(Object.keys(WATCH_SORT_LABELS) as WatchSortKey[]).map((k) => {
            const Icon = WATCH_SORT_ICONS[k];
            return (
              <DropdownMenuCheckboxItem
                key={k}
                checked={sortKey === k}
                onSelect={() => onSortChange(k)}
              >
                <Icon />
                {WATCH_SORT_LABELS[k]}
              </DropdownMenuCheckboxItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>排序方向</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={sortDir === "asc"}
            onSelect={() => {
              if (sortDir !== "asc") onToggleSortDir();
            }}
          >
            <ArrowUpNarrowWide />
            升序
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={sortDir === "desc"}
            onSelect={() => {
              if (sortDir !== "desc") onToggleSortDir();
            }}
          >
            <ArrowDownWideNarrow />
            降序
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
            <ArrowUpToLine />
            回到顶部
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>跳转到分组</DropdownMenuLabel>
          {COLLECTION_ORDER.map((type) => {
            const Icon = COLLECTION_ICONS[type];
            return (
              <DropdownMenuItem key={type} onClick={() => onJumpTo(type)}>
                <Icon />
                {COLLECTION_LABELS[type]}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {counts[type] ?? 0}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="icon-sm"
        onClick={onRefresh}
        disabled={loading}
        title="刷新"
        aria-label="刷新收藏列表"
      >
        <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden="true" />
      </Button>
    </div>
  );
}
