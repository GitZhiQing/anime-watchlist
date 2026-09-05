import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface SubjectGroupProps {
  /** DOM 锚点 id（跳转定位用） */
  id?: string;
  /** 分组标题（可含「今天」徽章等附加元素） */
  title: ReactNode;
  /** 条目数 */
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 触发头附加类名（如今天高亮背景） */
  headerClassName?: string;
  /** 折叠内容（列表行 / 网格卡片 / 空态） */
  children: ReactNode;
}

/** 折叠分组容器：追番页收藏夹分组与新番页星期分组共用的统一样式 */
export function SubjectGroup({
  id,
  title,
  count,
  open,
  onOpenChange,
  headerClassName,
  children,
}: SubjectGroupProps) {
  return (
    <Collapsible
      id={id}
      open={open}
      onOpenChange={onOpenChange}
      className="rounded-lg border border-border"
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/50",
          headerClassName,
        )}
      >
        <span>
          {title}
          <span className="ml-2 text-muted-foreground">({count})</span>
        </span>
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
