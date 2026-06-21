import { ArrowUpRight } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";

/** 打开该条目的 Bangumi 主页（系统默认浏览器）。 */
export function BangumiLink({ subjectId }: { subjectId: number }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1"
      onClick={() => openUrl(`https://bangumi.tv/subject/${subjectId}`)}
      title="在 Bangumi 打开"
    >
      Bangumi
      <ArrowUpRight className="size-3.5" />
    </Button>
  );
}
