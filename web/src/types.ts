export type Coordinate = {
  lat: number;
  lng: number;
};

export type DangerType = "盲道占用" | "电梯故障" | "施工围挡" | "台阶障碍";

export type DangerSegment = {
  id: string;
  type: DangerType;
  location: Coordinate;
  radius: number;
  level: 1 | 2 | 3 | 4 | 5;
  reportCount: number;
  updatedAt: string;
};

export type FacilityType = "电梯" | "坡道" | "卫生间" | "盲道";

export type Facility = {
  id: string;
  name: string;
  type: FacilityType;
  location: Coordinate;
  distance: number;
  status: "正常" | "维护中" | "拥堵" | "需核验";
  rating: number;
  openingHours: string;
};

export type HelpStatus = "待接单" | "已接单" | "进行中" | "已完成" | "已取消";

export type HelpRequest = {
  id: string;
  content: string;
  requestedTime: string;
  contactInfo: string;
  locationLabel: string;
  distance: number;
  status: HelpStatus;
  volunteerName?: string;
  createdAt: string;
};

export type ReportRecord = {
  id: string;
  type: DangerType;
  confidence: number;
  locationLabel: string;
  status: "待确认" | "已确认";
  points: number;
};

export type RouteOption = {
  id: "safe" | "short";
  name: string;
  distance: number;
  duration: number;
  riskScore: number;
  avoided: number;
  path: Coordinate[];
  summary: string;
};

export type MapProviderStatus = {
  provider: "OpenStreetMap";
  state: "available" | "fallback" | "not-configured" | "error";
  message: string;
};
