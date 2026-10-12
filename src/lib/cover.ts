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

/** 封面代理协议源：WebView2 自定义 scheme 的访问形式。
 *  Rust 侧（lib.rs register_uri_scheme_protocol）做磁盘缓存 + 复用代理配置取图；
 *  若实测访问形式不符（如需 https），仅需调整此常量。 */
const COVER_PROTOCOL = "http://cover.localhost/";

/** lain.bgm.tv 图片一律改走应用自定义协议（Rust 侧取图：磁盘缓存跨会话 + 代理用户可用），
 *  非 lain 源原样返回。coverUrl 的全部产出与其他直连 lain 的图（头像/原图放大）统一经此收口。 */
export function resolveCoverSrc(url: string | undefined): string | undefined {
  if (!url) return url;
  if (/^https?:\/\/lain\.bgm\.tv\//.test(url)) {
    return `${COVER_PROTOCOL}?u=${encodeURIComponent(url)}`;
  }
  return url;
}

/** 按容器档位取封面 URL。lain.bgm.tv 的 `/r/<宽>/` 是官方缩放前缀——v0 各字段
 *  即 r/100|200|400|800 包裹同一原始 l/ 路径（2026-10 实测条目详情/用户收藏/
 *  搜索同构、common=r/400；p1 同形但同名键小一档）——故任意 lain 原始路径都可
 *  改写到精确档位（http 顺带归一 https），非 lain/非原始路径源回退就近字段。
 *  产出统一经 resolveCoverSrc 走 cover:// 协议（含回退字段的 lain URL）。 */
export function coverUrl(
  images: SubjectImages | undefined,
  width: CoverWidth,
): string | undefined {
  if (!images) return undefined;
  for (const key of SOURCE_KEYS) {
    const url = images[key];
    if (url && LAIN_SOURCE.test(url)) {
      return resolveCoverSrc(
        url.replace(LAIN_PREFIX, `https://lain.bgm.tv/r/${width}/`),
      );
    }
  }
  for (const key of FALLBACK_KEYS[width]) {
    const url = images[key];
    if (url) return resolveCoverSrc(url);
  }
  return undefined;
}
