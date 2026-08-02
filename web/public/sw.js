const CACHE_NAME = "wuzhangtong-demo-v1";
const BASE_PATH = new URL("./", self.location.href).pathname;
const ASSETS = [BASE_PATH, `${BASE_PATH}manifest.webmanifest`, `${BASE_PATH}pwa-icon.svg`];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      // 新版本立即激活，不等待旧标签页关闭
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // 只接管同源请求；地图瓦片等跨域请求直接放行，避免 SW 成为故障中间层
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
