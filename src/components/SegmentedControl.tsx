import { useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  title?: string;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentedOption<T>[];
  /** 当前值；不在 options 中（如新番「本季」模式下的季度段）时全部不选中 */
  value: T | null;
  onChange: (value: T) => void;
  /** radiogroup 的可访问名称 */
  ariaLabel: string;
  disabled?: boolean;
  /**
   * 方向键移动焦点时是否立即选中（WAI-ARIA radio group 的 selection-follows-focus 模式）。
   * 默认 true（纯 UI 切换无成本）；切换有请求成本的场景（季度切换）传 false，
   * 方向键只移焦点、Space/Enter（原生按钮行为）确认选中。
   */
  arrowSelects?: boolean;
  className?: string;
}

/**
 * 分段单选控件：视觉为「选中项 primary 反白」的分段按钮，语义为 ARIA radiogroup
 * （读屏播报「单选组，N 项，已选 X」；方向键/Home/End 在选项间移动）。
 * 键盘：roving tabindex——选中项（无选中时首项）Tab 可达，其余 tabIndex=-1。
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  arrowSelects = true,
  className,
}: SegmentedControlProps<T>) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(e: React.KeyboardEvent, idx: number) {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = (idx + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (idx - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else return;
    e.preventDefault();
    itemRefs.current[next]?.focus();
    if (arrowSelects && options[next].value !== value) {
      onChange(options[next].value);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex rounded-md border border-border p-0.5", className)}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        // roving tabindex：无任何选中（如新番本季模式）时保留首项 Tab 可达，键盘不至于进不了组
        const tabStop = selected || (value === null && i === 0);
        return (
          <button
            key={opt.value}
            type="button"
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            role="radio"
            aria-checked={selected}
            tabIndex={tabStop ? 0 : -1}
            title={opt.title}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              "rounded px-3 py-1 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
