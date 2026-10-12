import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FadeImg } from "@/components/FadeImg";

interface ZoomableImageProps {
  /** 常规尺寸图（列表/弹窗内展示的小图） */
  src: string;
  /** 放大查看图（800 档），缺省回退 src */
  zoomSrc?: string;
  alt: string;
  /** 触发按钮悬浮提示（默认「查看大图」） */
  title?: string;
  /** 小图样式（尺寸与裁切模式由调用方定，如人物头像 object-cover object-top） */
  className?: string;
}

/**
 * 点击放大查看的图片（角色/人物头像共用）：小图 FadeImg，点击弹按原始比例
 * 居中的大图 Dialog（variant="image"，Esc/点遮罩关闭）。可嵌套在人物详情
 * 弹窗内使用（Radix 层栈管理，关闭大图回到原弹窗）。
 */
export function ZoomableImage({
  src,
  zoomSrc,
  alt,
  title,
  className,
}: ZoomableImageProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="cursor-zoom-in"
          title={title ?? "查看大图"}
        >
          <FadeImg src={src} alt={alt} className={className} />
        </button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} variant="image">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <img
          src={zoomSrc ?? src}
          alt={alt}
          decoding="async"
          className="max-h-[85vh] max-w-[90vw] rounded object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
