// ──── 多源瓦片策略 ────
// 全部为 OSM 系（WGS-84 Web Mercator）瓦片，与演示数据坐标系一致，可无缝切换
// 注：经实测，a.basemaps.cartocdn.com 在国内会连接挂起（不响应不报错），
// 因此 CartoDB 只保留 b/c/d 三个可用子域名
const TILE_SOURCES = [
  // 源 0: CartoDB Light — 全球 CDN，风格干净（剔除会挂起的 a 子域名）
  {
    urls: ["b", "c", "d"].map((s) => `https://${s}.basemaps.cartocdn.com/light_all`),
  },
  // 源 1: OSM 德国镜像 — 政策宽松，实测国内可稳定访问
  {
    urls: ["https://tile.openstreetmap.de"],
  },
  // 源 2: OSM 主站 — 最后尝试
  {
    urls: ["a", "b", "c"].map((s) => `https://${s}.tile.openstreetmap.org`),
  },
];

// 每个源在同一瓦片上的最大重试次数（首次失败后同源换子域名再试 1 次）
const MAX_RETRIES_PER_CDN = 1;

export const TILE_SOURCE_COUNT = TILE_SOURCES.length;

export function subdomainCountOf(cdnIndex: number): number {
  return (TILE_SOURCES[cdnIndex] ?? TILE_SOURCES[0]).urls.length;
}

// 瓦片加载状态
export type TileState = "loading" | "loaded" | "failed";

export interface TileInfo {
  id: string;
  zoom: number;
  x: number;
  y: number;
  src: string;
  cdnIndex: number;
  subIndex: number;
  retryCount: number;
  reviveCount: number; // 全部源失败后重新排队的次数（自动恢复）
  state: TileState;
  attemptStartedAt: number; // 当前尝试的起始时间（看门狗超时判定用）
  failedAt: number | null; // 进入失败态的时间（自动恢复延迟用）
  style: Record<string, string>;
}

// 生成指定源 + 子域名的瓦片 URL
export function getTileUrl(cdnIndex: number, subIndex: number, zoom: number, x: number, y: number): string {
  const source = TILE_SOURCES[cdnIndex] ?? TILE_SOURCES[0];
  const base = source.urls[subIndex % source.urls.length];
  return `${base}/${zoom}/${x}/${y}.png`;
}

// 生成一组瓦片
// 注意：countX / countY 必须完整覆盖视口，
// 即 countX = floor(maxX) − floor(minX) + 1，否则视口右/下边缘会缺瓦片
export function createTileBatch(
  zoom: number,
  startX: number,
  startY: number,
  countX: number,
  countY: number,
  spanX: number,
  spanY: number,
  boundsMinX: number,
  boundsMinY: number
): TileInfo[] {
  const tiles: TileInfo[] = [];
  const now = Date.now();

  for (let y = startY; y < startY + countY; y += 1) {
    for (let x = startX; x < startX + countX; x += 1) {
      // 每个瓦片用不同的子域名，突破浏览器并发限制
      const subIndex = ((y - startY) * countX + (x - startX)) % subdomainCountOf(0);
      tiles.push({
        id: `${zoom}-${x}-${y}`,
        zoom,
        x,
        y,
        src: getTileUrl(0, subIndex, zoom, x, y),
        cdnIndex: 0,
        subIndex,
        retryCount: 0,
        reviveCount: 0,
        state: "loading",
        attemptStartedAt: now,
        failedAt: null,
        style: {
          left: `${((x - boundsMinX) / spanX) * 100}%`,
          top: `${((y - boundsMinY) / spanY) * 100}%`,
          width: `${(1 / spanX) * 100}%`,
          height: `${(1 / spanY) * 100}%`,
        },
      });
    }
  }

  return tiles;
}

// 加载失败/超时 → 切换下一个源（或同源换子域名重试）
export function getNextTileUrl(tile: TileInfo): { src: string; cdnIndex: number; subIndex: number } | null {
  const nextCdn = tile.retryCount >= MAX_RETRIES_PER_CDN ? tile.cdnIndex + 1 : tile.cdnIndex;
  if (nextCdn >= TILE_SOURCES.length) return null;
  const nextSub = (tile.subIndex + 1) % subdomainCountOf(nextCdn);
  return {
    src: getTileUrl(nextCdn, nextSub, tile.zoom, tile.x, tile.y),
    cdnIndex: nextCdn,
    subIndex: nextSub,
  };
}
