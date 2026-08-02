import type { Coordinate, DangerSegment, RouteOption } from "../types";

const EARTH_RADIUS = 6371000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceInMeters(a: Coordinate, b: Coordinate) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

function pointToSegmentDistance(point: Coordinate, start: Coordinate, end: Coordinate) {
  const scale = 111320;
  const px = point.lng * scale * Math.cos(toRadians(point.lat));
  const py = point.lat * scale;
  const sx = start.lng * scale * Math.cos(toRadians(start.lat));
  const sy = start.lat * scale;
  const ex = end.lng * scale * Math.cos(toRadians(end.lat));
  const ey = end.lat * scale;
  const dx = ex - sx;
  const dy = ey - sy;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared));
  const closestX = sx + t * dx;
  const closestY = sy + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

export function scoreRoute(route: RouteOption, dangers: DangerSegment[]) {
  const collisions = dangers.filter((danger) =>
    route.path.some((point, index) => {
      const next = route.path[index + 1];
      if (!next) return false;
      return pointToSegmentDistance(danger.location, point, next) <= danger.radius;
    })
  );

  const riskScore = collisions.reduce((sum, danger) => sum + danger.level * danger.reportCount, 0);
  return {
    collisions,
    riskScore: riskScore + Math.round(route.distance / 80)
  };
}

