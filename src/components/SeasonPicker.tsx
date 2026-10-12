import { useMemo } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/SegmentedControl";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SeasonKey, SeasonSelection } from "@/types/bgm";

/** 年份下拉覆盖到最早年份 */
const MIN_SEASON_YEAR = 2015;

const SEASON_KEYS: SeasonKey[] = [1, 4, 7, 10];
export const SEASON_LABELS: Record<SeasonKey, string> = { 1: "1月", 4: "4月", 7: "7月", 10: "10月" };

/** 当前日期所处季度（按开播月归组：1-3月冬 / 4-6春 / 7-9夏 / 10-12秋） */
export function currentSeasonSelection(): SeasonSelection {
  const now = new Date();
  return {
    year: now.getFullYear(),
    season: (Math.floor(now.getMonth() / 3) * 3 + 1) as SeasonKey,
  };
}

interface SeasonPickerProps {
  /** null = 本季（每周放送 /calendar）；否则为季度列表（按开播月 3 组） */
  value: SeasonSelection | null;
  onChange: (value: SeasonSelection | null) => void;
}

/**
 * 季度选择条（内容区顶部，固定不滚动）：本季 / 年份（平铺下拉）/ 四季度分段。
 * 单层无嵌套——任意季度一次点击直达（旧版是年份子菜单内再选月份，需悬停穿越两层）。
 */
export function SeasonPicker({ value, onChange }: SeasonPickerProps) {
  const current = currentSeasonSelection();
  // 含次年在内：下一年冬季番在年内即已公布（接口对未定档条目返回 date:null）
  const years = useMemo(
    () =>
      Array.from(
        { length: current.year + 1 - MIN_SEASON_YEAR + 1 },
        (_, i) => current.year + 1 - i,
      ),
    [current.year],
  );
  // 本季模式（value=null）下年份/季度控件仍显示当前季，点任意一项即切到季度列表
  const activeYear = value?.year ?? current.year;

  return (
    <div className="flex items-center gap-3">
      {/* 本季（每周放送）：与季度列表并列的独立视图，同一时间只有一个高亮 */}
      <Button
        variant={value === null ? "default" : "outline"}
        size="sm"
        className="gap-1"
        title="本季每周放送（周一至周日）"
        onClick={() => onChange(null)}
      >
        <CalendarDays className="size-3.5" />
        本季
      </Button>

      <div className="h-4 w-px bg-border" />

      {/* 年份：平铺列表（单层，无子菜单） */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1" title="选择年份">
            {activeYear} 年
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {years.map((y) => (
            <DropdownMenuCheckboxItem
              key={y}
              // 本季模式下按触发器显示的年份打勾，避免「显示 2026 却无一项选中」
              checked={activeYear === y}
              // 本季模式下选年 = 该年 + 当前季度（如 2026-09 点 2025 → 2025年7月）
              onSelect={() => onChange({ year: y, season: value?.season ?? current.season })}
            >
              {y} 年
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 季度：四段分段单选（语义 radiogroup，方向键移焦点、Space/Enter 确认——
          切换季度有数据请求成本，不采用 focus 即选中）。未来季度同样可选——
          接口会返回已公布的下季条目（未定档的 date 为 null） */}
      <SegmentedControl<SeasonKey>
        ariaLabel="季度"
        options={SEASON_KEYS.map((k) => ({
          value: k,
          label: SEASON_LABELS[k],
          title: `${activeYear} 年 ${SEASON_LABELS[k]}新番`,
        }))}
        value={value !== null && value.year === activeYear ? value.season : null}
        onChange={(k) => onChange({ year: activeYear, season: k })}
        arrowSelects={false}
      />
    </div>
  );
}
