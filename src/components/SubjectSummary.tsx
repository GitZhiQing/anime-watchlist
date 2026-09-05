import { useMemo, useState } from "react";
import { ChevronDown, ImagePlay } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "@/lib/utils";

/**
 * 简介区（着重排版优化）：
 * - 清洗 Bangumi 简介常见 BBCode：[img]…[/img] 剥离为「插图」折叠链接，
 *   [url=…]文字[/url] 与裸链接转为可点击链接，其余标记（[b]/[size] 等）剔除
 * - 连续 3+ 空行折叠为 1，按空行分段落，阅读行高 leading-7
 * - 长简介折叠：collapsible 时超长渐隐 +「展开全文/收起」；滚动容器内传 collapsible=false
 */

const IMG_BLOCK = /\[img\]([\s\S]*?)\[\/img\]/gi;
const URL_TAG = /\[url=(https?:\/\/[^\]\s]+)\]([\s\S]*?)\[\/url\]/gi;
/** 其余 BBCode 标记（b/i/u/s/size/color/font/quote/hide/code 等），只留内容 */
const OTHER_BBCODE = /\[\/?(?:b|i|u|s|size|color|font|align|left|center|right|quote|hide|code|list|metadata|thumb)[^\]]*\]/gi;
const BARE_URL = /(https?:\/\/[^\s<>"')\]]+)/g;

/** 超过该长度（或段落数过多）视为长简介，折叠展示 */
const COLLAPSE_CHARS = 260;
const COLLAPSE_PARAGRAPHS = 6;
/** 折叠态最大高度（px），配渐隐遮罩 */
const COLLAPSED_MAX_H = 168;

/** 解析后的简介：文本段落 + 剥离出的插图链接 */
interface ParsedSummary {
  paragraphs: string[];
  images: string[];
}

function parseSummary(raw: string): ParsedSummary {
  const images: string[] = [];
  let text = raw.replace(IMG_BLOCK, (_m, url: string) => {
    const u = url.trim();
    if (u) images.push(u);
    return "";
  });
  // [url=href]label[/url] → label（href）：正文保持纯文本但保留出处信息
  text = text.replace(URL_TAG, (_m, href: string, label: string) => {
    const l = label.trim();
    return l && l !== href ? `${l}（${href}）` : href;
  });
  text = text.replace(OTHER_BBCODE, "");
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const paragraphs = text ? text.split(/\n{2,}/) : [];
  return { paragraphs, images };
}

/** 单个文本段：裸链接转 <a>，其余保持原样（含段内单换行） */
function TextSegment({ text }: { text: string }) {
  const parts = useMemo(() => text.split(BARE_URL), [text]);
  return (
    <p className="whitespace-pre-line">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            onClick={(e) => {
              e.preventDefault();
              void openUrl(part);
            }}
            className="break-all text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
            title={part}
          >
            {part.length > 60 ? `${part.slice(0, 60)}…` : part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}

export function SubjectSummary({
  summary,
  collapsible = false,
  className,
}: {
  summary?: string;
  /** 展开行内嵌等无独立滚动区的容器传 true：超长简介折叠 + 展开全文 */
  collapsible?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const parsed = useMemo(
    () => (summary ? parseSummary(summary) : undefined),
    [summary],
  );

  if (!parsed || (parsed.paragraphs.length === 0 && parsed.images.length === 0))
    return null;

  const { paragraphs, images } = parsed;
  const tooLong =
    collapsible &&
    (summary!.length > COLLAPSE_CHARS || paragraphs.length > COLLAPSE_PARAGRAPHS);
  const collapsed = tooLong && !expanded;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="text-xs text-muted-foreground">简介</div>

      <div className="relative">
        <div
          className={cn(
            "space-y-2.5 text-sm leading-7 text-foreground/90 transition-[max-height,opacity]",
            collapsed && "max-h-[168px] overflow-hidden opacity-90",
          )}
          style={collapsed ? { maxHeight: COLLAPSED_MAX_H } : undefined}
        >
          {paragraphs.map((p, i) => (
            <TextSegment key={i} text={p} />
          ))}
        </div>
        {collapsed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
        )}
      </div>

      {images.length > 0 && <SummaryImages images={images} />}

      {tooLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? "收起" : "展开全文"}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
      )}
    </div>
  );
}

/** [img] 剥离出的插图：默认折叠为一行占位，展开后为可点击链接列表 */
function SummaryImages({ images }: { images: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ImagePlay className="size-3.5" />
        插图（{images.length}）
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-1">
          {images.map((url, i) => (
            <a
              key={i}
              href={url}
              onClick={(e) => {
                e.preventDefault();
                void openUrl(url);
              }}
              className="block truncate text-xs text-primary/80 hover:text-primary hover:underline"
              title={url}
            >
              {url}
            </a>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
