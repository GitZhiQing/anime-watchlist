import type { SubjectImages } from "@/types/bgm";

/** 封面档位（CSS 像素 × 2 DPI 余量）：
 *  列表行缩略 64px→200、网格卡/详情弹窗缩略/p1 海报卡→400、行点击放大→800 */
type CoverWidth = 200 | 400 | 800;

/** lain.bgm.tv 原始封面路径：原图（无 r/ 前缀）或 r/ 单宽/方形（WxH）缩放包裹，
 *  内层路径的尺寸段必为 l（原图文件）。经典 s/m/c/g 路径是不同尺寸的独立文件，
 *  不可改写——经典源（legacy /calendar）改写自其 large 字段的 l/ 路径。 */
const LAIN_SOURCE =
  /^https?:\/\/lain\.bgm\.tv\/(?:r\/\d+(?:x\d+)?\/)?pic\/[^/]+\/l\/.+$/;

const LAIN_PREFIX = /^https?:\/\/lain\.bgm\.tv\/(?:r\/\d+(?:x\d+)?\/)?/;

/** 改写源优先级：large 是无缩放原图最可靠；其余 r/ 包裹形内层同为此原图 */
const SOURCE_KEYS: (keyof SubjectImages)[] = [
  "large",
  "medium",
  "common",
  "small",
  "grid",
];

/** 无 lain 原始路径可改写时，按档位就近回退的字段序 */
const FALLBACK_KEYS: Record<CoverWidth, (keyof SubjectImages)[]> = {
  200: ["small", "common", "medium", "grid", "large"],
  400: ["common", "medium", "small", "grid", "large"],
  800: ["medium", "large", "common", "small", "grid"],
};

/** 按容器档位取封面 URL。lain.bgm.tv 的 `/r/<宽>/` 是官方缩放前缀——v0 各字段
 *  即 r/100|200|400|800 包裹同一原始 l/ 路径（2026-10 实测条目详情/用户收藏/
 *  搜索同构、common=r/400；p1 同形但同名键小一档）——故任意 lain 原始路径都可
 *  改写到精确档位（http 顺带归一 https），非 lain/非原始路径源回退就近字段。 */
export function coverUrl(
  images: SubjectImages | undefined,
  width: CoverWidth,
): string | undefined {
  if (!images) return undefined;
  for (const key of SOURCE_KEYS) {
    const url = images[key];
    if (url && LAIN_SOURCE.test(url)) {
      return url.replace(LAIN_PREFIX, `https://lain.bgm.tv/r/${width}/`);
    }
  }
  for (const key of FALLBACK_KEYS[width]) {
    const url = images[key];
    if (url) return url;
  }
  return undefined;
}
