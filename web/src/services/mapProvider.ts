import type { MapProviderStatus } from "../types";

export function getInitialMapProviderStatus(): MapProviderStatus {
  return {
    provider: "OpenStreetMap",
    state: "available",
    message: "底图使用 OpenStreetMap，首期开放北京区域。"
  };
}
