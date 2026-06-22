import {
  ArrowUpToLine,
  Check,
  ChevronDown,
  Filter,
  ListCollapse,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  onRefresh: () => void;
  onJumpTo: (type: CollectionType) => void;
  onJumpToTop: () => void;
}

/** 追番页标题栏工具：类型筛选 + 跳转下拉 + 刷新。 */
export function WatchlistToolbar({
  loading,
  totalCount,
  counts,
  subjectCounts,
  subjectType,
  onSubjectTypeChange,
  onRefresh,
  onJumpTo,
  onJumpToTop,
}: WatchlistToolbarProps) {
  const jumpDisabled = loading || totalCount === 0;

  return (
    <div className="ml-auto flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1">
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
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

      <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
        <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        刷新
      </Button>
    </div>
  );
}
