import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { CSSProperties } from "react";
import {
  center,
  dangerSegments as seedDangerSegments,
  facilities,
  initialHelpRequests,
  mapConfig,
  routeOptions
} from "./data/demoData";
import { getInitialMapProviderStatus } from "./services/mapProvider";
import { scoreRoute } from "./services/routePlanner";
import {
  createTileBatch,
  getNextTileUrl,
  getTileUrl,
  subdomainCountOf,
  type TileInfo,
  type TileState
} from "./services/tileService";
import type {
  Coordinate,
  DangerSegment,
  DangerType,
  Facility,
  FacilityType,
  HelpRequest,
  MapProviderStatus,
  ReportRecord,
  RouteOption
} from "./types";

type ViewKey = "map" | "report" | "help" | "facilities" | "profile" | "wall";

const navItems: Array<{ key: ViewKey; label: string; symbol: string }> = [
  { key: "map", label: "首页地图", symbol: "⌖" },
  { key: "report", label: "随手拍", symbol: "▣" },
  { key: "help", label: "志愿接单", symbol: "＋" },
  { key: "facilities", label: "设施查询", symbol: "⌕" },
  { key: "wall", label: "数据墙", symbol: "▥" },
  { key: "profile", label: "个人中心", symbol: "◎" }
];

const dangerTypes: DangerType[] = ["盲道占用", "电梯故障", "施工围挡", "台阶障碍"];
const facilityTypes: Array<FacilityType | "全部"> = ["全部", "电梯", "坡道", "卫生间", "盲道"];
const quickHelp = ["帮我通过临时坡道", "确认电梯是否可用", "陪同到地铁入口"];
const defaultHelpTime = "今天 18:30";
const defaultHelpContact = "13812342468";

type SpeechRecognitionEventLike = {
  results: ArrayLike<{ 0?: { transcript: string } }>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;

function coordinateToTile(point: Coordinate, zoom: number) {
  const latRad = (point.lat * Math.PI) / 180;
  const scale = 2 ** zoom;
  return {
    x: ((point.lng + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale
  };
}

function tileToCoordinate(tile: { x: number; y: number }, zoom: number): Coordinate {
  const scale = 2 ** zoom;
  const lng = (tile.x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * tile.y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

function clampMapCenter(point: Coordinate): Coordinate {
  return {
    lat: Math.max(mapConfig.bounds.minLat, Math.min(mapConfig.bounds.maxLat, point.lat)),
    lng: Math.max(mapConfig.bounds.minLng, Math.min(mapConfig.bounds.maxLng, point.lng))
  };
}

function getVisibleBounds(zoom: number, centerPoint: Coordinate = mapConfig.center) {
  const scale = 2 ** (zoom - mapConfig.initialZoom);
  const halfLatSpan = ((mapConfig.bounds.maxLat - mapConfig.bounds.minLat) / 2) / scale;
  const halfLngSpan = ((mapConfig.bounds.maxLng - mapConfig.bounds.minLng) / 2) / scale;
  return {
    minLat: centerPoint.lat - halfLatSpan,
    maxLat: centerPoint.lat + halfLatSpan,
    minLng: centerPoint.lng - halfLngSpan,
    maxLng: centerPoint.lng + halfLngSpan
  };
}

function getMapTileBounds(zoom: number, centerPoint: Coordinate = mapConfig.center) {
  const visibleBounds = getVisibleBounds(zoom, centerPoint);
  const northWest = coordinateToTile({ lat: visibleBounds.maxLat, lng: visibleBounds.minLng }, zoom);
  const southEast = coordinateToTile({ lat: visibleBounds.minLat, lng: visibleBounds.maxLng }, zoom);
  return {
    ...visibleBounds,
    minX: northWest.x,
    maxX: southEast.x,
    minY: northWest.y,
    maxY: southEast.y
  };
}

function projectOnTiles(point: Coordinate, zoom: number, centerPoint: Coordinate = mapConfig.center) {
  const bounds = getMapTileBounds(zoom, centerPoint);
  const tile = coordinateToTile(point, zoom);
  const x = ((tile.x - bounds.minX) / (bounds.maxX - bounds.minX)) * 100;
  const y = ((tile.y - bounds.minY) / (bounds.maxY - bounds.minY)) * 100;
  return { x: Math.max(4, Math.min(96, x)), y: Math.max(4, Math.min(96, y)) };
}

function createOsmTiles(zoom: number, centerPoint: Coordinate = mapConfig.center): TileInfo[] {
  const bounds = getMapTileBounds(zoom, centerPoint);
  const minX = bounds.minX;
  const maxX = bounds.maxX;
  const minY = bounds.minY;
  const maxY = bounds.maxY;
  const width = maxX - minX;
  const height = maxY - minY;
  const startX = Math.floor(minX);
  const startY = Math.floor(minY);
  // 关键：瓦片数量必须覆盖到 floor(max)，否则视口右缘/下缘会缺一列/一行
  const countX = Math.floor(maxX) - startX + 1;
  const countY = Math.floor(maxY) - startY + 1;

  return createTileBatch(zoom, startX, startY, countX, countY, width, height, minX, minY);
}

function formatMeters(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} 公里` : `${value} 米`;
}

function maskContactInfo(value: string) {
  return value
    .replace(/(\d{3})\d{4}(\d{4})/g, "$1****$2")
    .replace(/(微信[:：]\s?)(.{2}).+(.{2})/, "$1$2****$3");
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructorLike | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructorLike;
    webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function getRouteStepLabels(routeId: RouteOption["id"], startPoint: string, destination: string) {
  const origin = startPoint.trim() || "当前位置";
  const target = destination.trim() || "目的地";
  return routeId === "safe"
    ? [origin, "王府井步行街东侧平缓路段", "东长安街无障碍过街口", "避开盲道占用热点", target]
    : [origin, "王府井站南侧出口", "东长安街北侧近路", "穿过高风险盲道占用区域", target];
}

function App() {
  const [activeView, setActiveView] = useState<ViewKey>("map");
  const [providerStatus, setProviderStatus] = useState<MapProviderStatus>(getInitialMapProviderStatus);
  const [dangers, setDangers] = useState<DangerSegment[]>(seedDangerSegments);
  const [reports, setReports] = useState<ReportRecord[]>([
    {
      id: "report-seed",
      type: "盲道占用",
      confidence: 92,
      locationLabel: "王府井站 8 号口",
      status: "已确认",
      points: 10
    }
  ]);
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>(initialHelpRequests);
  const [selectedRouteId, setSelectedRouteId] = useState<RouteOption["id"]>("safe");
  const [startPoint, setStartPoint] = useState("王府井站 8 号口");
  const [destination, setDestination] = useState("北京市规划展览馆");
  const [isNavigating, setIsNavigating] = useState(false);
  const [navStep, setNavStep] = useState(0);
  const [reportType, setReportType] = useState<DangerType>("盲道占用");
  const [helpText, setHelpText] = useState(quickHelp[0]);
  const [helpRequestedTime, setHelpRequestedTime] = useState(defaultHelpTime);
  const [helpContactInfo, setHelpContactInfo] = useState(defaultHelpContact);
  const [facilityFilter, setFacilityFilter] = useState<FacilityType | "全部">("全部");
  const [facilitySearch, setFacilitySearch] = useState("");
  const [highContrast, setHighContrast] = useState(false);
  const [largeText, setLargeText] = useState(false);

  useEffect(() => {
    if (!isNavigating) return;
    const timer = window.setInterval(() => {
      setNavStep((step) => {
        const next = step + 1;
        if (next >= selectedRoute.path.length) {
          window.clearInterval(timer);
          setIsNavigating(false);
          return selectedRoute.path.length - 1;
        }
        return next;
      });
    }, 1300);
    return () => window.clearInterval(timer);
  }, [isNavigating, selectedRouteId]);

  const selectedRoute = routeOptions.find((route) => route.id === selectedRouteId) ?? routeOptions[0];
  const routeScores = useMemo(
    () =>
      routeOptions.map((route) => ({
        ...route,
        computed: scoreRoute(route, dangers)
      })),
    [dangers]
  );
  const selectedScore = routeScores.find((route) => route.id === selectedRoute.id)?.computed;
  const filteredFacilities = useMemo(() => {
    const keyword = facilitySearch.trim().toLowerCase();
    return facilities.filter((item) => {
      const matchesType = facilityFilter === "全部" || item.type === facilityFilter;
      const haystack = `${item.name} ${item.type} ${item.status} ${item.openingHours}`.toLowerCase();
      return matchesType && (!keyword || haystack.includes(keyword));
    });
  }, [facilityFilter, facilitySearch]);
  const pendingHelpCount = helpRequests.filter((request) => request.status === "待接单").length;
  const totalPoints = reports.reduce((sum, report) => sum + report.points, 168);

  function submitReport() {
    const id = `report-${Date.now()}`;
    const newDanger: DangerSegment = {
      id,
      type: reportType,
      location: {
        lat: center.lat + (Math.random() - 0.5) * 0.0028,
        lng: center.lng + (Math.random() - 0.5) * 0.0032
      },
      radius: 60,
      level: reportType === "盲道占用" ? 4 : reportType === "台阶障碍" ? 3 : 2,
      reportCount: 1,
      updatedAt: "刚刚"
    };
    setDangers((items) => [newDanger, ...items]);
    setReports((items) => [
      {
        id,
        type: reportType,
        confidence: 89,
        locationLabel: "当前位置附近",
        status: "已确认",
        points: 10
      },
      ...items
    ]);
    setActiveView("map");
  }

  function createHelpRequest() {
    const request: HelpRequest = {
      id: `help-${Date.now()}`,
      content: helpText.trim() || quickHelp[0],
      requestedTime: helpRequestedTime.trim() || defaultHelpTime,
      contactInfo: helpContactInfo.trim() || defaultHelpContact,
      locationLabel: "王府井站 8 号口附近",
      distance: 120,
      status: "待接单",
      createdAt: "刚刚"
    };
    setHelpRequests((items) => [request, ...items]);
    setActiveView("help");
  }

  function updateHelpStatus(id: string, status: HelpRequest["status"]) {
    setHelpRequests((items) =>
      items.map((request) =>
        request.id === id
          ? {
              ...request,
              status,
              volunteerName: status === "待接单" ? undefined : request.volunteerName ?? "志愿者老周"
            }
          : request
      )
    );
  }

  function resetDemo() {
    setDangers(seedDangerSegments);
    setHelpRequests(initialHelpRequests);
    setReports([
      {
        id: "report-seed",
        type: "盲道占用",
        confidence: 92,
        locationLabel: "王府井站 8 号口",
        status: "已确认",
        points: 10
      }
    ]);
	    setSelectedRouteId("safe");
    setFacilitySearch("");
	    setNavStep(0);
	    setIsNavigating(false);
	    setActiveView("map");
  }

  const appClass = ["app", highContrast ? "high-contrast" : "", largeText ? "large-text" : ""].join(" ");

  return (
    <div className={appClass}>
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            无
          </span>
          <div>
            <strong>无障通</strong>
            <small>众包安全出行 Demo</small>
          </div>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              className={activeView === item.key ? "nav-item active" : "nav-item"}
              key={item.key}
              onClick={() => setActiveView(item.key)}
              aria-current={activeView === item.key ? "page" : undefined}
            >
              <span aria-hidden="true">{item.symbol}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings">
          <label>
            <input type="checkbox" checked={highContrast} onChange={(event) => setHighContrast(event.target.checked)} />
            高对比
          </label>
          <label>
            <input type="checkbox" checked={largeText} onChange={(event) => setLargeText(event.target.checked)} />
            大字体
          </label>
        </div>
      </aside>

      <main className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">地图：{providerStatus.provider} · {mapConfig.region}</p>
            <h1>{navItems.find((item) => item.key === activeView)?.label}</h1>
          </div>
          <div className={`provider-pill ${providerStatus.state}`}>
            <span aria-hidden="true" />
            {providerStatus.message}
          </div>
        </header>

        {activeView === "map" && (
          <MapDashboard
            startPoint={startPoint}
            setStartPoint={setStartPoint}
            destination={destination}
            setDestination={setDestination}
            dangers={dangers}
            selectedRoute={selectedRoute}
            selectedRouteId={selectedRouteId}
            setSelectedRouteId={setSelectedRouteId}
            routeScores={routeScores}
            navStep={navStep}
            isNavigating={isNavigating}
            onStartNavigation={() => {
              setNavStep(0);
              setIsNavigating(true);
            }}
            onStopNavigation={() => setIsNavigating(false)}
            onCreateHelp={createHelpRequest}
          />
        )}

        {activeView === "report" && (
          <ReportView
            reportType={reportType}
            setReportType={setReportType}
            onSubmit={submitReport}
            reports={reports}
            points={totalPoints}
          />
        )}

        {activeView === "help" && (
          <HelpView
            helpText={helpText}
            setHelpText={setHelpText}
            helpRequestedTime={helpRequestedTime}
            setHelpRequestedTime={setHelpRequestedTime}
            helpContactInfo={helpContactInfo}
            setHelpContactInfo={setHelpContactInfo}
            onCreate={createHelpRequest}
            helpRequests={helpRequests}
            updateHelpStatus={updateHelpStatus}
          />
        )}

        {activeView === "facilities" && (
	          <FacilitiesView
	            filter={facilityFilter}
	            setFilter={setFacilityFilter}
            search={facilitySearch}
            setSearch={setFacilitySearch}
	            facilities={filteredFacilities}
	            onNavigate={(facility) => {
              setDestination(facility.name);
              setSelectedRouteId("safe");
              setActiveView("map");
            }}
          />
        )}

        {activeView === "wall" && (
          <DataWall
            dangers={dangers}
            reports={reports}
            pendingHelpCount={pendingHelpCount}
            completedHelpCount={helpRequests.filter((request) => request.status === "已完成").length}
          />
        )}

        {activeView === "profile" && (
          <ProfileView points={totalPoints} reports={reports.length} resetDemo={resetDemo} />
        )}
      </main>

      <nav className="bottom-nav" aria-label="移动端导航">
        {navItems.slice(0, 5).map((item) => (
          <button
            className={activeView === item.key ? "bottom-item active" : "bottom-item"}
            key={item.key}
            onClick={() => setActiveView(item.key)}
            aria-label={item.label}
          >
            <span aria-hidden="true">{item.symbol}</span>
            <small>{item.label.replace("首页", "")}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}

type MapDashboardProps = {
  startPoint: string;
  setStartPoint: (value: string) => void;
  destination: string;
  setDestination: (value: string) => void;
  dangers: DangerSegment[];
  selectedRoute: RouteOption;
  selectedRouteId: RouteOption["id"];
  setSelectedRouteId: (value: RouteOption["id"]) => void;
  routeScores: Array<RouteOption & { computed: ReturnType<typeof scoreRoute> }>;
  navStep: number;
  isNavigating: boolean;
  onStartNavigation: () => void;
  onStopNavigation: () => void;
  onCreateHelp: () => void;
};

// 单个瓦片切换下一个源（纯函数：不修改外部状态）
function advanceTile(tile: TileInfo): TileInfo {
  const next = getNextTileUrl(tile);
  if (next) {
    return {
      ...tile,
      src: next.src,
      cdnIndex: next.cdnIndex,
      subIndex: next.subIndex,
      retryCount: tile.retryCount + 1,
      attemptStartedAt: Date.now()
    };
  }
  return { ...tile, state: "failed", failedAt: Date.now() };
}

const TILE_ATTEMPT_TIMEOUT = 9000; // 单次尝试超过 9 秒未完成 → 切换下一个源
const TILE_REVIVE_DELAY = 6000; // 全部源失败后 6 秒自动重新排队
const TILE_MAX_REVIVES = 2; // 每片最多自动恢复 2 次

function MapDashboard(props: MapDashboardProps) {
  const currentPoint = props.selectedRoute.path[props.navStep] ?? props.selectedRoute.path[0];
  const [mapZoom, setMapZoom] = useState(mapConfig.initialZoom);
  const [mapCenter, setMapCenter] = useState<Coordinate>(mapConfig.center);
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [tiles, setTiles] = useState<TileInfo[]>(() => createOsmTiles(mapConfig.initialZoom, mapConfig.center));
  const totalTiles = tiles.length;
  // 加载/失败计数直接从瓦片状态派生，避免事件重复计数
  const loadedCount = tiles.filter((tile) => tile.state === "loaded").length;
  const failedCount = tiles.filter((tile) => tile.state === "failed").length;
  const loadProgress = totalTiles > 0 ? (loadedCount + failedCount) / totalTiles : 0;
  const changeZoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    rectWidth: number;
    rectHeight: number;
    centerTile: { x: number; y: number };
    bounds: ReturnType<typeof getMapTileBounds>;
    nextCenter: Coordinate;
  } | null>(null);

  const fallbackZoomScale = 2 ** (mapZoom - mapConfig.initialZoom);
  const localMapStyle = {
    "--fallback-zoom-scale": Math.max(1, fallbackZoomScale),
    "--fallback-grid-size": `${48 * fallbackZoomScale}px`,
  } as CSSProperties;
  const projectedCurrent = projectOnTiles(currentPoint, mapZoom, mapCenter);
  const canZoomOut = mapZoom > mapConfig.minZoom;
  const canZoomIn = mapZoom < mapConfig.maxZoom;

  const queueTileRefresh = useCallback((newZoom: number, newCenter: Coordinate, delay = 180) => {
    if (panTimer.current) clearTimeout(panTimer.current);
    panTimer.current = setTimeout(() => {
      setTiles(createOsmTiles(newZoom, newCenter));
    }, delay);
  }, []);

  const scheduleTileUpdate = useCallback((newZoom: number, newCenter = mapCenter) => {
    const clampedCenter = clampMapCenter(newCenter);
    setMapZoom(newZoom);
    setMapCenter(clampedCenter);
    if (changeZoomTimer.current) clearTimeout(changeZoomTimer.current);
    changeZoomTimer.current = setTimeout(() => {
      setTiles(createOsmTiles(newZoom, clampedCenter));
    }, 180);
  }, [mapCenter]);

  useEffect(() => {
    return () => {
      if (changeZoomTimer.current) clearTimeout(changeZoomTimer.current);
      if (panTimer.current) clearTimeout(panTimer.current);
    };
  }, []);

  // 看门狗：瓦片请求挂起（不触发 onError）时强制切源；失败瓦片自动恢复
  useEffect(() => {
    const watchdog = window.setInterval(() => {
      const now = Date.now();
      setTiles((prev) => {
        let changed = false;
        const updated = prev.map((tile) => {
          // 加载中超时 → 切换下一个源
          if (tile.state === "loading" && now - tile.attemptStartedAt > TILE_ATTEMPT_TIMEOUT) {
            changed = true;
            return advanceTile(tile);
          }
          // 全部源失败 → 延迟后从首选源重新排队（应对限流/临时网络抖动）
          if (
            tile.state === "failed" &&
            tile.failedAt !== null &&
            tile.reviveCount < TILE_MAX_REVIVES &&
            now - tile.failedAt > TILE_REVIVE_DELAY
          ) {
            changed = true;
            const subIndex = (tile.subIndex + 1) % subdomainCountOf(0);
            return {
              ...tile,
              state: "loading" as TileState,
              cdnIndex: 0,
              subIndex,
              retryCount: 0,
              reviveCount: tile.reviveCount + 1,
              src: getTileUrl(0, subIndex, tile.zoom, tile.x, tile.y),
              attemptStartedAt: now,
              failedAt: null
            };
          }
          return tile;
        });
        return changed ? updated : prev;
      });
    }, 2000);
    return () => window.clearInterval(watchdog);
  }, []);

  function changeZoom(delta: number) {
    scheduleTileUpdate(
      Math.max(mapConfig.minZoom, Math.min(mapConfig.maxZoom, mapZoom + delta))
    );
  }

  function resetMapView() {
    scheduleTileUpdate(mapConfig.initialZoom, mapConfig.center);
  }

  function handleMapPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rectWidth: rect.width,
      rectHeight: rect.height,
      centerTile: coordinateToTile(mapCenter, mapZoom),
      bounds: getMapTileBounds(mapZoom, mapCenter),
      nextCenter: mapCenter
    };
    setIsDraggingMap(true);
  }

  function handleMapPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const tileDeltaX = ((event.clientX - drag.startX) / drag.rectWidth) * (drag.bounds.maxX - drag.bounds.minX);
    const tileDeltaY = ((event.clientY - drag.startY) / drag.rectHeight) * (drag.bounds.maxY - drag.bounds.minY);
    const nextCenter = clampMapCenter(
      tileToCoordinate(
        {
          x: drag.centerTile.x - tileDeltaX,
          y: drag.centerTile.y - tileDeltaY
        },
        mapZoom
      )
    );
    drag.nextCenter = nextCenter;
    setMapCenter(nextCenter);
    queueTileRefresh(mapZoom, nextCenter, 90);
  }

  function finishMapDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragState.current = null;
    setIsDraggingMap(false);
    if (panTimer.current) clearTimeout(panTimer.current);
    setTiles(createOsmTiles(mapZoom, drag.nextCenter));
  }

  // 单个瓦片加载成功
  function handleTileLoaded(tileId: string) {
    setTiles((prev) => {
      const idx = prev.findIndex((t) => t.id === tileId);
      if (idx === -1 || prev[idx].state === "loaded") return prev;
      const updated = [...prev];
      updated[idx] = { ...prev[idx], state: "loaded" };
      return updated;
    });
  }

  // 单个瓦片加载失败 → 尝试下一个 CDN
  function handleTileError(tileId: string) {
    setTiles((prev) => {
      const idx = prev.findIndex((t) => t.id === tileId);
      if (idx === -1 || prev[idx].state !== "loading") return prev;
      const updated = [...prev];
      updated[idx] = advanceTile(prev[idx]);
      return updated;
    });
  }

  return (
    <section className="map-layout" aria-labelledby="map-heading">
      <div className="map-panel">
        <div className="map-tools" role="search">
          <label htmlFor="start-point">起点</label>
          <input
            id="start-point"
            value={props.startPoint}
            onChange={(event) => props.setStartPoint(event.target.value)}
          />
          <label htmlFor="destination">目的地</label>
          <input
            id="destination"
            value={props.destination}
            onChange={(event) => props.setDestination(event.target.value)}
          />
          <button onClick={() => props.setSelectedRouteId("safe")}>规划路线</button>
        </div>
        <div className="map-canvas">
          <div className="map-zoom-controls" aria-label="地图缩放">
            <button type="button" onClick={() => changeZoom(-1)} disabled={!canZoomOut} aria-label="缩小地图" title="缩小地图">
              −
            </button>
            <button type="button" onClick={() => changeZoom(1)} disabled={!canZoomIn} aria-label="放大地图" title="放大地图">
              +
            </button>
	            <button
	              type="button"
	              onClick={resetMapView}
	              disabled={mapZoom === mapConfig.initialZoom && mapCenter.lat === mapConfig.center.lat && mapCenter.lng === mapConfig.center.lng}
	              aria-label="重置地图缩放"
	              title="重置视图"
	            >
	              复位
	            </button>
          </div>
          {/* 瓦片加载进度 */}
          {loadProgress < 1 && totalTiles > 0 && (
            <div className="tile-progress" aria-label={`地图加载中 ${Math.round(loadProgress * 100)}%`}>
              <div className="tile-progress-bar">
                <div className="tile-progress-fill" style={{ width: `${loadProgress * 100}%` }} />
              </div>
              <span>{loadedCount}/{totalTiles}</span>
            </div>
          )}
	          <div
              className={isDraggingMap ? "map-viewport dragging" : "map-viewport"}
              role="img"
              aria-label="北京王府井周边无障碍风险、设施和路线示意地图，可拖拽查看周边地点"
              onPointerDown={handleMapPointerDown}
              onPointerMove={handleMapPointerMove}
              onPointerUp={finishMapDrag}
              onPointerCancel={finishMapDrag}
            >
            <div className="map-zoom-content">
              {/* 网格底图（加载中或失败时可见） */}
              <div className="local-map-base" aria-hidden="true" style={localMapStyle}>
                <span className="road road-east-west" />
                <span className="road road-north-south" />
                <span className="road road-diagonal" />
                <span className="place-label label-west">王府井</span>
                <span className="place-label label-south">天安门东</span>
                <span className="place-label label-north">东华门</span>
              </div>
              {/* OSM 瓦片层 */}
              <div className="osm-tile-layer" aria-label="OpenStreetMap 北京真实底图瓦片">
                {tiles.map((tile) => (
                  <div
                    key={tile.id}
                    className={`tile-cell${tile.state === "failed" ? " tile-failed" : ""}`}
                    style={tile.style}
                  >
                    {/* 骨架占位 */}
                    <div className="tile-skeleton" />
                    {/* 实际图片 */}
                    {tile.state !== "failed" && (
                      <img
                        src={tile.src}
                        alt=""
                        loading="eager"
                        draggable={false}
                        className="tile-img"
                        onLoad={() => handleTileLoaded(tile.id)}
                        onError={() => handleTileError(tile.id)}
                      />
                    )}
                    {/* 失败标记 */}
                    {tile.state === "failed" && (
                      <span className="tile-failed-icon" title="瓦片加载失败">!</span>
                    )}
                  </div>
                ))}
              </div>
              {/* 路线层 */}
              <svg className="route-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
	                  <polyline
	                  className={props.selectedRouteId === "safe" ? "safe-route" : "short-route"}
	                  points={props.selectedRoute.path
	                    .map((point) => {
                        const spot = projectOnTiles(point, mapZoom, mapCenter);
                        return `${spot.x},${spot.y}`;
                      })
	                    .join(" ")}
	                />
	              </svg>
              {/* 障碍标记 */}
              {props.dangers.map((danger) => {
	                const spot = projectOnTiles(danger.location, mapZoom, mapCenter);
                return (
                  <span
                    className={`danger-marker level-${danger.level}`}
                    key={danger.id}
                    style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                    title={`${danger.type}，${danger.reportCount} 次上报`}
                  />
                );
              })}
              {/* 设施标记 */}
              {facilities.map((facility) => {
	                const spot = projectOnTiles(facility.location, mapZoom, mapCenter);
                return (
                  <span
                    className="facility-marker"
                    key={facility.id}
                    style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                    title={facility.name}
                  >
                    {facility.type.slice(0, 1)}
                  </span>
                );
              })}
              {/* 用户位置 */}
              <span
                className="user-marker"
                style={{
	                  left: `${projectOnTiles(props.selectedRoute.path[0], mapZoom, mapCenter).x}%`,
	                  top: `${projectOnTiles(props.selectedRoute.path[0], mapZoom, mapCenter).y}%`,
                }}
              >
                起
              </span>
              {/* 导航点 */}
              <span className="nav-marker" style={{ left: `${projectedCurrent.x}%`, top: `${projectedCurrent.y}%` }}>
                行
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧面板保持不变 */}
      <div className="workbench">
        <div className="route-tabs" role="tablist" aria-label="路线选择">
          {props.routeScores.map((route) => (
            <button
              key={route.id}
              role="tab"
              aria-selected={props.selectedRouteId === route.id}
              className={props.selectedRouteId === route.id ? "route-tab active" : "route-tab"}
              onClick={() => props.setSelectedRouteId(route.id)}
            >
              <strong>{route.name}</strong>
              <span>{formatMeters(route.distance)} · {route.duration} 分钟</span>
            </button>
          ))}
        </div>

        <article className="route-summary">
          <h2 id="map-heading">{props.selectedRoute.name}</h2>
          <p className="route-points">
            {props.startPoint || "当前位置"} → {props.destination || "未设置目的地"}
          </p>
          <p>{props.selectedRoute.summary}</p>
          <dl className="metric-grid">
            <div>
              <dt>风险评分</dt>
              <dd>{props.routeScores.find((route) => route.id === props.selectedRoute.id)?.computed.riskScore}</dd>
            </div>
            <div>
              <dt>避开障碍</dt>
              <dd>{props.selectedRoute.avoided} 个</dd>
            </div>
            <div>
              <dt>距离</dt>
              <dd>{formatMeters(props.selectedRoute.distance)}</dd>
            </div>
          </dl>
          <div className="route-detail" aria-label="路线显示">
            <strong>路线显示</strong>
            <ol>
              {getRouteStepLabels(props.selectedRouteId, props.startPoint, props.destination).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          <div className="action-row">
            <button onClick={props.isNavigating ? props.onStopNavigation : props.onStartNavigation}>
              {props.isNavigating ? "暂停模拟" : "开始模拟导航"}
            </button>
            <button className="secondary" onClick={props.onCreateHelp}>
              预约协助
            </button>
          </div>
          <p className="notice" role="status">
            {props.isNavigating
              ? `正在前往第 ${props.navStep + 1} 个导航点。靠近雷区时请减速确认现场情况。`
              : "路线为众包辅助建议，请结合现场交通与官方提示判断。"}
          </p>
        </article>

        <TextMapList dangers={props.dangers} />
      </div>
    </section>
  );
}

function TextMapList({ dangers }: { dangers: DangerSegment[] }) {
  return (
    <section className="list-panel" aria-labelledby="risk-list">
      <h2 id="risk-list">附近风险</h2>
      <ul>
        {dangers.slice(0, 5).map((danger) => (
          <li key={danger.id}>
            <strong>{danger.type}</strong>
            <span>{danger.updatedAt} · {danger.reportCount} 次 · {danger.level} 级</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type ReportViewProps = {
  reportType: DangerType;
  setReportType: (value: DangerType) => void;
  onSubmit: () => void;
  reports: ReportRecord[];
  points: number;
};

function ReportView({ reportType, setReportType, onSubmit, reports, points }: ReportViewProps) {
  return (
    <section className="flow-grid" aria-labelledby="report-heading">
      <div className="panel">
        <p className="eyebrow">众包数据层</p>
        <h2 id="report-heading">随手拍上报</h2>
        <label className="upload-box">
          <input type="file" accept="image/*" capture="environment" />
          <span>拍照或上传现场照片</span>
        </label>
        <fieldset>
          <legend>AI 识别结果确认</legend>
          <div className="chip-row">
            {dangerTypes.map((type) => (
              <button
                type="button"
                key={type}
                className={reportType === type ? "chip active" : "chip"}
                onClick={() => setReportType(type)}
              >
                {type}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="ai-result">
          <strong>Mock 识别：{reportType}</strong>
          <span>置信度 89%，低置信度时进入人工确认。</span>
        </div>
        <button className="primary-wide" onClick={onSubmit}>确认上报并获得积分</button>
      </div>

      <div className="panel">
        <p className="eyebrow">当前积分</p>
        <h2>{points}</h2>
        <ul className="history-list">
          {reports.map((report) => (
            <li key={report.id}>
              <strong>{report.type}</strong>
              <span>{report.locationLabel} · +{report.points} 分 · {report.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

type HelpViewProps = {
  helpText: string;
  setHelpText: (value: string) => void;
  helpRequestedTime: string;
  setHelpRequestedTime: (value: string) => void;
  helpContactInfo: string;
  setHelpContactInfo: (value: string) => void;
  onCreate: () => void;
  helpRequests: HelpRequest[];
  updateHelpStatus: (id: string, status: HelpRequest["status"]) => void;
};

function HelpView({
  helpText,
  setHelpText,
  helpRequestedTime,
  setHelpRequestedTime,
  helpContactInfo,
  setHelpContactInfo,
  onCreate,
  helpRequests,
  updateHelpStatus
}: HelpViewProps) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechRecognition = useMemo(() => getSpeechRecognitionConstructor(), []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function toggleVoiceInput() {
    if (!speechRecognition) return;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new speechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0]?.transcript ?? "";
      }
      const cleanTranscript = transcript.trim();
      if (cleanTranscript) {
        setHelpText(helpText.trim() ? `${helpText.trim()}\n${cleanTranscript}` : cleanTranscript);
      }
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

  return (
    <section className="flow-grid" aria-labelledby="help-heading">
      <div className="panel">
        <p className="eyebrow">社群互助层</p>
        <h2 id="help-heading">一键求助</h2>
        <div className="chip-row">
          {quickHelp.map((text) => (
            <button key={text} className={helpText === text ? "chip active" : "chip"} onClick={() => setHelpText(text)}>
              {text}
            </button>
          ))}
        </div>
        <div className="field-heading">
          <label htmlFor="help-content">求助内容</label>
          <button
            type="button"
            className={isListening ? "voice-button listening" : "voice-button"}
            onClick={toggleVoiceInput}
            disabled={!speechRecognition}
            title={speechRecognition ? "语音输入求助内容" : "当前浏览器不支持语音输入"}
            aria-pressed={isListening}
          >
            {isListening ? "停止录音" : "语音输入"}
          </button>
        </div>
        <textarea id="help-content" value={helpText} onChange={(event) => setHelpText(event.target.value)} rows={4} />
        <div className="form-grid">
          <label htmlFor="help-time">
            需求时间
            <input
              id="help-time"
              value={helpRequestedTime}
              onChange={(event) => setHelpRequestedTime(event.target.value)}
              placeholder="例如：今天 18:30"
            />
          </label>
          <label htmlFor="help-contact">
            联系方式
            <input
              id="help-contact"
              value={helpContactInfo}
              onChange={(event) => setHelpContactInfo(event.target.value)}
              placeholder="手机号或微信"
            />
          </label>
        </div>
        <button className="primary-wide" onClick={onCreate}>发布求助</button>
      </div>

      <div className="panel">
        <p className="eyebrow">接单大厅</p>
        <h2>附近求助</h2>
        <div className="request-list">
          {helpRequests.map((request) => (
            <article className="request-card" key={request.id} data-testid={`help-request-${request.id}`}>
              <div>
                <strong>{request.content}</strong>
                <span>{request.locationLabel} · {formatMeters(request.distance)} · {request.createdAt}</span>
                <span>需求时间：{request.requestedTime}</span>
              </div>
              <span className={`status ${request.status}`}>{request.status}</span>
              <div className="contact-panel" aria-label="需求人联系方式">
                <strong>{request.status === "待接单" ? "联系方式已保护" : "需求人联系方式"}</strong>
                <span>{request.status === "待接单" ? maskContactInfo(request.contactInfo) : request.contactInfo}</span>
                {request.status === "待接单" && <small>接单后显示完整联系方式</small>}
              </div>
              <div className="action-row">
                {request.status === "待接单" && (
                  <button data-testid={`accept-${request.id}`} onClick={() => updateHelpStatus(request.id, "已接单")}>
                    接单
                  </button>
                )}
                {request.status === "已接单" && (
                  <button data-testid={`start-${request.id}`} onClick={() => updateHelpStatus(request.id, "进行中")}>
                    开始服务
                  </button>
                )}
                {request.status === "进行中" && (
                  <button data-testid={`complete-${request.id}`} onClick={() => updateHelpStatus(request.id, "已完成")}>
                    完成评价
                  </button>
                )}
                {request.status === "已完成" && <span className="done-text">已记录双向评价</span>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

type FacilitiesViewProps = {
  filter: FacilityType | "全部";
  setFilter: (value: FacilityType | "全部") => void;
  search: string;
  setSearch: (value: string) => void;
  facilities: Facility[];
  onNavigate: (facility: Facility) => void;
};

function FacilitiesView({ filter, setFilter, search, setSearch, facilities: visibleFacilities, onNavigate }: FacilitiesViewProps) {
  return (
    <section className="panel" aria-labelledby="facility-heading">
      <div className="section-header">
        <div>
          <p className="eyebrow">设施信息查询</p>
          <h2 id="facility-heading">附近无障碍设施</h2>
        </div>
        <div className="facility-controls">
          <label htmlFor="facility-search">
            搜索设施
            <input
              id="facility-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="输入设施名称、类型或状态"
            />
          </label>
          <label htmlFor="facility-type">
            类型
            <select id="facility-type" value={filter} onChange={(event) => setFilter(event.target.value as FacilityType | "全部")}>
              {facilityTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="facility-grid">
        {visibleFacilities.length === 0 && <p className="empty-state">没有匹配的设施，请调整关键词或类型。</p>}
        {visibleFacilities.map((facility) => (
          <article className="facility-card" key={facility.id}>
            <span className="facility-type">{facility.type}</span>
            <h3>{facility.name}</h3>
            <p>{facility.status} · 评分 {facility.rating} · {facility.openingHours}</p>
            <div className="action-row">
              <span>{formatMeters(facility.distance)}</span>
              <button onClick={() => onNavigate(facility)}>导航</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

type DataWallProps = {
  dangers: DangerSegment[];
  reports: ReportRecord[];
  pendingHelpCount: number;
  completedHelpCount: number;
};

function DataWall({ dangers, reports, pendingHelpCount, completedHelpCount }: DataWallProps) {
  const typeCounts = dangerTypes.map((type) => ({
    type,
    count: dangers.filter((danger) => danger.type === type).reduce((sum, danger) => sum + danger.reportCount, 0)
  }));
  const maxCount = Math.max(...typeCounts.map((item) => item.count), 1);

  return (
    <section className="wall" aria-labelledby="wall-heading">
      <div className="section-header">
        <div>
          <p className="eyebrow">治理闭环</p>
          <h2 id="wall-heading">城市无障碍数据墙</h2>
        </div>
        <span className="badge">演示数据</span>
      </div>
      <dl className="wall-metrics">
        <div>
          <dt>风险点</dt>
          <dd>{dangers.length}</dd>
        </div>
        <div>
          <dt>上报记录</dt>
          <dd>{reports.length}</dd>
        </div>
        <div>
          <dt>待接单</dt>
          <dd>{pendingHelpCount}</dd>
        </div>
        <div>
          <dt>已完成</dt>
          <dd>{completedHelpCount}</dd>
        </div>
      </dl>
      <div className="bar-list" aria-label="问题类型统计">
        {typeCounts.map((item) => (
          <div className="bar-row" key={item.type}>
            <span>{item.type}</span>
            <div>
              <i style={{ width: `${(item.count / maxCount) * 100}%` }} />
            </div>
            <strong>{item.count}</strong>
          </div>
        ))}
      </div>
      <div className="timeline">
        <span>发现</span>
        <span>核验</span>
        <span>绕行</span>
        <span>互助</span>
        <span>治理</span>
      </div>
    </section>
  );
}

function ProfileView({ points, reports, resetDemo }: { points: number; reports: number; resetDemo: () => void }) {
  return (
    <section className="flow-grid" aria-labelledby="profile-heading">
      <div className="panel">
        <p className="eyebrow">个人中心</p>
        <h2 id="profile-heading">小云</h2>
        <dl className="metric-grid">
          <div>
            <dt>积分</dt>
            <dd>{points}</dd>
          </div>
          <div>
            <dt>上报</dt>
            <dd>{reports}</dd>
          </div>
          <div>
            <dt>勋章</dt>
            <dd>4</dd>
          </div>
        </dl>
        <button className="primary-wide" onClick={resetDemo}>重置演示数据</button>
      </div>
      <div className="panel">
        <p className="eyebrow">无障碍偏好</p>
        <h2>出行设置</h2>
        <ul className="history-list">
          <li>
            <strong>路线偏好</strong>
            <span>优先避开台阶、电梯故障和围挡</span>
          </li>
          <li>
            <strong>交互偏好</strong>
            <span>大按钮、高对比、文本播报</span>
          </li>
          <li>
            <strong>隐私设置</strong>
            <span>求助端脱敏展示，演示数据本地保存</span>
          </li>
        </ul>
      </div>
    </section>
  );
}

export default App;
