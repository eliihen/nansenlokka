const CACHE_NAME = "timelapse-cache-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "prefetch" && Array.isArray(event.data.urls)) {
    event.waitUntil(cacheImages(event.data.urls));
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isImage = event.request.destination === "image" || url.pathname.includes("/archive/");
  if (!isImage) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;

      try {
        const response = await fetch(event.request, { cache: "no-cache" });
        if (!response || !response.ok) return response;

        const optimized = await optimizeImage(response.clone());
        cache.put(event.request, optimized.clone());
        return optimized;
      } catch (error) {
        return cached || Promise.reject(error);
      }
    }),
  );
});

async function cacheImages(urls) {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "no-cache" });
        if (response.ok) {
          //const optimized = await optimizeImage(response);
          await cache.put(url, response);
        }
      } catch (error) {
        console.warn("Failed to cache", url, error);
      }
    }),
  );
}

async function optimizeImage(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return response;
  try {
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const optimizedBlob = await canvas.convertToBlob({
      type: "image/webp",
      quality: 0.82,
    });
    return new Response(optimizedBlob, {
      headers: { "Content-Type": "image/webp" },
    });
  } catch (error) {
    console.warn("Optimization failed, falling back to original", error);
    return response;
  }
}
