import type { Coordinate, DangerSegment, Facility, HelpRequest, RouteOption } from "../types";

export const mapConfig = {
  region: "北京市全域",
  provider: "OpenStreetMap" as const,
  center: { lat: 39.9042, lng: 116.4074 } satisfies Coordinate,
  minZoom: 10,
  maxZoom: 17,
  initialZoom: 13,
  // 初始视野聚焦王府井周边（演示数据密集区），缩放时再向外扩展
  bounds: {
    minLat: 39.8092,
    maxLat: 39.9992,
    minLng: 116.3024,
    maxLng: 116.5124
  }
};

export const center: Coordinate = mapConfig.center;

export const dangerSegments: DangerSegment[] = [
  {
    id: "danger-1",
    type: "盲道占用",
    location: { lat: 39.9106, lng: 116.3947 },
    radius: 80,
    level: 4,
    reportCount: 22,
    updatedAt: "10 分钟前"
  },
  {
    id: "danger-2",
    type: "电梯故障",
    location: { lat: 39.9568, lng: 116.3398 },
    radius: 60,
    level: 2,
    reportCount: 5,
    updatedAt: "23 分钟前"
  },
  {
    id: "danger-3",
    type: "施工围挡",
    location: { lat: 39.8748, lng: 116.4519 },
    radius: 50,
    level: 2,
    reportCount: 4,
    updatedAt: "42 分钟前"
  },
  {
    id: "danger-4",
    type: "台阶障碍",
    location: { lat: 39.9132, lng: 116.4034 },
    radius: 55,
    level: 3,
    reportCount: 14,
    updatedAt: "1 小时前"
  },
  {
    id: "danger-5",
    type: "盲道占用",
    location: { lat: 39.9288, lng: 116.4501 },
    radius: 70,
    level: 4,
    reportCount: 19,
    updatedAt: "8 分钟前"
  },
  {
    id: "danger-6",
    type: "台阶障碍",
    location: { lat: 39.8915, lng: 116.3556 },
    radius: 45,
    level: 3,
    reportCount: 8,
    updatedAt: "37 分钟前"
  },
  {
    id: "danger-7",
    type: "盲道占用",
    location: { lat: 39.9612, lng: 116.3989 },
    radius: 65,
    level: 3,
    reportCount: 12,
    updatedAt: "19 分钟前"
  },
  {
    id: "danger-8",
    type: "盲道占用",
    location: { lat: 39.8584, lng: 116.4150 },
    radius: 55,
    level: 3,
    reportCount: 10,
    updatedAt: "53 分钟前"
  },
  {
    id: "danger-9",
    type: "台阶障碍",
    location: { lat: 39.9475, lng: 116.3089 },
    radius: 50,
    level: 2,
    reportCount: 6,
    updatedAt: "1 小时前"
  },
  {
    id: "danger-10",
    type: "盲道占用",
    location: { lat: 39.8851, lng: 116.3383 },
    radius: 60,
    level: 3,
    reportCount: 11,
    updatedAt: "31 分钟前"
  }
];

export const facilities: Facility[] = [
  {
    id: "facility-1",
    name: "王府井站无障碍电梯",
    type: "电梯",
    location: { lat: 39.9094, lng: 116.3981 },
    distance: 180,
    status: "正常",
    rating: 4.8,
    openingHours: "06:00-23:30"
  },
  {
    id: "facility-2",
    name: "王府井步行街南口坡道",
    type: "坡道",
    location: { lat: 39.9112, lng: 116.4006 },
    distance: 260,
    status: "正常",
    rating: 4.5,
    openingHours: "全天"
  },
  {
    id: "facility-3",
    name: "天安门广场东侧无障碍卫生间",
    type: "卫生间",
    location: { lat: 39.906, lng: 116.3953 },
    distance: 420,
    status: "正常",
    rating: 4.4,
    openingHours: "07:00-21:00"
  },
  {
    id: "facility-4",
    name: "王府井大街连续盲道",
    type: "盲道",
    location: { lat: 39.9148, lng: 116.3979 },
    distance: 510,
    status: "正常",
    rating: 4.1,
    openingHours: "全天"
  },
  {
    id: "facility-5",
    name: "西单站 A 口无障碍电梯",
    type: "电梯",
    location: { lat: 39.9089, lng: 116.3725 },
    distance: 850,
    status: "正常",
    rating: 4.7,
    openingHours: "05:30-23:00"
  },
  {
    id: "facility-6",
    name: "海淀黄庄站无障碍坡道",
    type: "坡道",
    location: { lat: 39.9767, lng: 116.3188 },
    distance: 4200,
    status: "正常",
    rating: 4.3,
    openingHours: "全天"
  },
  {
    id: "facility-7",
    name: "国贸商城无障碍卫生间",
    type: "卫生间",
    location: { lat: 39.9087, lng: 116.4594 },
    distance: 3100,
    status: "正常",
    rating: 4.5,
    openingHours: "10:00-22:00"
  },
  {
    id: "facility-8",
    name: "奥体中心连续盲道",
    type: "盲道",
    location: { lat: 39.9896, lng: 116.3928 },
    distance: 5800,
    status: "正常",
    rating: 4.2,
    openingHours: "全天"
  },
  {
    id: "facility-9",
    name: "北京南站无障碍电梯",
    type: "电梯",
    location: { lat: 39.8649, lng: 116.3785 },
    distance: 5200,
    status: "正常",
    rating: 4.6,
    openingHours: "05:00-23:30"
  },
  {
    id: "facility-10",
    name: "望京 SOHO 无障碍坡道",
    type: "坡道",
    location: { lat: 39.9856, lng: 116.4785 },
    distance: 7200,
    status: "正常",
    rating: 4.0,
    openingHours: "08:00-20:00"
  },
  {
    id: "facility-11",
    name: "三里屯太古里无障碍卫生间",
    type: "卫生间",
    location: { lat: 39.9335, lng: 116.4558 },
    distance: 2800,
    status: "正常",
    rating: 4.3,
    openingHours: "10:00-22:00"
  },
  {
    id: "facility-12",
    name: "五道口地铁站盲道",
    type: "盲道",
    location: { lat: 39.9928, lng: 116.3372 },
    distance: 6100,
    status: "正常",
    rating: 3.9,
    openingHours: "全天"
  }
];

export const initialHelpRequests: HelpRequest[] = [
  {
    id: "help-1",
    content: "需要协助通过商场门口临时坡道",
    requestedTime: "今天 18:30",
    contactInfo: "13812342468",
    locationLabel: "王府井站 8 号口附近",
    distance: 320,
    status: "待接单",
    createdAt: "刚刚"
  },
  {
    id: "help-2",
    content: "请帮忙确认无障碍电梯是否可用",
    requestedTime: "今天 19:00",
    contactInfo: "13900081234",
    locationLabel: "王府井步行街南口",
    distance: 480,
    status: "待接单",
    createdAt: "4 分钟前"
  }
];

export const routeOptions: RouteOption[] = [
  {
    id: "safe",
    name: "安全路线",
    distance: 960,
    duration: 14,
    riskScore: 18,
    avoided: 3,
    path: [
      { lat: 39.9087, lng: 116.3975 },
      { lat: 39.9101, lng: 116.3991 },
      { lat: 39.9124, lng: 116.4002 },
      { lat: 39.9143, lng: 116.4024 },
      { lat: 39.9164, lng: 116.4056 }
    ],
    summary: "多走 180 米，避开盲道占用和台阶障碍热点。"
  },
  {
    id: "short",
    name: "最短路线",
    distance: 780,
    duration: 11,
    riskScore: 64,
    avoided: 0,
    path: [
      { lat: 39.9087, lng: 116.3975 },
      { lat: 39.9072, lng: 116.3994 },
      { lat: 39.9061, lng: 116.4015 },
      { lat: 39.9095, lng: 116.4042 },
      { lat: 39.9164, lng: 116.4056 }
    ],
    summary: "距离更短，但穿过高风险盲道占用区域。"
  }
];
