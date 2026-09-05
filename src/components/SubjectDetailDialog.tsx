import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SubjectDetailView } from "@/components/SubjectDetailView";
import type { SlimSubject } from "@/types/bgm";

/**
 * 应用内条目详情弹窗壳：统一尺寸/关闭/无障碍标题，内容复用 SubjectDetailView(dialog)。
 * 网格卡片、p1 关联/推荐行等「点击条目打开详情」的入口共用；
 * 关闭时内容由 Radix 卸载，重开按缓存秒显。
 */
export function SubjectDetailDialog({
  subjectId,
  title,
  subject,
  open,
  onOpenChange,
}: {
  subjectId: number;
  /** 头部标题，缺省显示 #id */
  title?: string;
  /** 新增收藏时用于乐观插入列表缓存的条目数据 */
  subject?: SlimSubject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[80vh] max-h-[80vh] w-[1080px] max-w-[92vw] flex-col overflow-hidden p-4 sm:max-w-[1080px]"
      >
        <DialogTitle className="sr-only">
          {title ?? `#${subjectId}`} 详情
        </DialogTitle>
        <SubjectDetailView
          subjectId={subjectId}
          variant="dialog"
          title={title}
          subject={subject}
        />
      </DialogContent>
    </Dialog>
  );
}
