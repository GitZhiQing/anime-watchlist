// Bangumi 数据类型，依据 docs/BGM-API/open-api/v0.yaml 与 TMP.json 样例定义。

/** 条目类型 SubjectType。本应用只用 Book(1)=漫画 / Anime(2)=动画 */
export enum SubjectType {
  Book = 1,
  Anime = 2,
  Music = 3,
  Game = 4,
  Real = 6,
}

/** 全部条目类型（无 5），用于按类型筛选。顺序：动画优先（追番主场景）。 */
export const SUBJECT_TYPES: SubjectType[] = [
  SubjectType.Anime,
  SubjectType.Book,
  SubjectType.Music,
  SubjectType.Game,
  SubjectType.Real,
];

export const SUBJECT_LABELS: Record<SubjectType, string> = {
  [SubjectType.Book]: "书籍",
  [SubjectType.Anime]: "动画",
  [SubjectType.Music]: "音乐",
  [SubjectType.Game]: "游戏",
  [SubjectType.Real]: "三次元",
};

/**
 * 条目类型徽标的配色（Tailwind 完整静态 class，避免被 purge）。
 * 每种类型固定一个颜色，白字 + 彩底圆角胶囊，与下方灰色 tag 拉开层次。
 */
export const SUBJECT_BADGE_STYLES: Record<SubjectType, string> = {
  [SubjectType.Book]: "bg-blue-500 text-white",
  [SubjectType.Anime]: "bg-amber-500 text-white",
  [SubjectType.Music]: "bg-purple-500 text-white",
  [SubjectType.Game]: "bg-emerald-500 text-white",
  [SubjectType.Real]: "bg-pink-500 text-white",
};

/** 收藏夹类型 SubjectCollectionType */
export enum CollectionType {
  Wish = 1, // 想看
  Done = 2, // 看过
  Doing = 3, // 在看
  OnHold = 4, // 搁置
  Dropped = 5, // 抛弃
}

export const COLLECTION_LABELS: Record<CollectionType, string> = {
  [CollectionType.Doing]: "在看",
  [CollectionType.Wish]: "想看",
  [CollectionType.Done]: "看过",
  [CollectionType.OnHold]: "搁置",
  [CollectionType.Dropped]: "抛弃",
};

/** 追番页五个收藏夹的展示顺序 */
export const COLLECTION_ORDER: CollectionType[] = [
  CollectionType.Doing,
  CollectionType.Wish,
  CollectionType.Done,
  CollectionType.OnHold,
  CollectionType.Dropped,
];

export interface SubjectImages {
  small?: string;
  grid?: string;
  large?: string;
  medium?: string;
  common?: string;
}

export interface Tag {
  name: string;
  count: number;
}

/**
 * SlimSubject —— 列表接口（/users/{username}/collections、/v0/search/subjects）返回的精简条目。
 * 见 open-api/v0.yaml:3702。
 * 注意：简介字段是 `short_summary`（截短），评分是顶层 `score`。
 */
export interface SlimSubject {
  id: number;
  type: number;
  name: string;
  name_cn: string;
  short_summary: string;
  date?: string | null;
  images: SubjectImages;
  volumes?: number;
  eps?: number;
  collection_total?: number;
  score?: number;
  rank?: number;
  tags: Tag[];
}

export interface Rating {
  rank: number;
  total: number;
  score: number;
  count: Record<string, number>;
}

export interface CollectionStat {
  wish: number;
  collect: number;
  doing: number;
  on_hold: number;
  dropped: number;
}

/**
 * 完整 Subject —— `GET /v0/subjects/{id}` 返回。
 * 含 SlimSubject 全部字段，外加完整简介 `summary`、`rating` 对象、`total_episodes` 等。
 */
export interface Subject extends SlimSubject {
  summary: string;
  platform?: string;
  infobox?: unknown;
  total_episodes?: number;
  rating?: Rating;
  collection?: CollectionStat;
  meta_tags?: string[];
  nsfw?: boolean;
  locked?: boolean;
  series?: boolean;
}

/** 搜索接口 /v0/search/subjects 返回结构 */
export interface SearchResponse {
  data: SlimSubject[];
  total: number;
  limit: number;
  offset: number;
}

/** 单条用户收藏（含 SlimSubject） */
export interface UserCollection {
  subject_id: number;
  subject_type: number;
  type: CollectionType;
  rate: number;
  tags: string[];
  comment: string | null;
  ep_status: number;
  vol_status: number;
  updated_at: string;
  private: boolean;
  subject: SlimSubject;
}

/** /v0/users/{username}/collections 分页返回 */
export interface PagedUserCollections {
  data: UserCollection[];
  total: number;
  limit: number;
  offset: number;
}

export interface Avatar {
  large: string;
  medium: string;
  small: string;
}

export interface BgmUser {
  id: number;
  username: string;
  nickname: string;
  sign: string;
  avatar: Avatar;
  user_group: number;
}

export interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string | null;
  refresh_token: string;
  user_id: number;
}
