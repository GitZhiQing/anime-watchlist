import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** 视图模式：列表 / 网格 */
export type ViewMode = "list" | "grid";

interface ViewTabsProps {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}

/** 列表/网格视图切换（追番页与新番页共用） */
export function ViewTabs({ value, onChange }: ViewTabsProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as ViewMode)}>
      <TabsList className="border border-border bg-background">
        <TabsTrigger value="list">列表</TabsTrigger>
        <TabsTrigger value="grid">网格</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
