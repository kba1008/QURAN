/* Service Worker — Tasmi'
   Matlamat: aplikasi berfungsi SEPENUHNYA tanpa internet selepas lawatan pertama.

   Strategi:
   - Navigasi HTML  : Network First (fallback ke cache bila offline)
   - Aset app/fon   : Cache First (kekal selamanya)
   - Data Al-Quran  : Stale-While-Revalidate (disimpan untuk kegunaan luar talian)
   - Audio bacaan   : Cache First (diuruskan juga oleh app: 1 ayat ke hadapan)
*/
const VERSION = "v26";
const SHELL = "tasmi-shell-" + VERSION;
const FONTS = "tasmi-fonts-" + VERSION;
const DATA = "tasmi-data-" + VERSION;
const AUDIO = "tasmi-audio-v2"; // cache baharu: jangan guna semula audio rosak versi lama

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

const KEEP = [SHELL, FONTS, DATA, AUDIO];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isFont(url) {
  return /fonts\.(googleapis|gstatic)\.com/.test(url.host);
}
function isQuranData(url) {
  return /(alquran\.cloud|api\.quran\.com|api\.qurancdn\.com)/.test(url.host);
}
function isAudio(url) {
  return /(cdn\.islamic\.network|everyayah\.com|audio\.qurancdn\.com)/.test(url.host) || /\.mp3($|\?)/.test(url.pathname);
}

async function cacheFirst(req, cacheName) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone()).catch(() => {});
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req, { ignoreVary: true });
  const net = fetch(req)
    .then((res) => {
      if (res && res.ok) c.put(req, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  return hit || (await net) || new Response("", { status: 504 });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Navigasi: sentiasa cuba versi terkini, fallback offline
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreVary: true }).then((r) => r || caches.match("./index.html") || caches.match("./")),
        ),
    );
    return;
  }

  if (isFont(url)) {
    e.respondWith(cacheFirst(req, FONTS).catch(() => caches.match(req, { ignoreVary: true })));
    return;
  }
  if (isAudio(url)) {
    e.respondWith(cacheFirst(req, AUDIO).catch(() => caches.match(req, { ignoreVary: true })));
    return;
  }
  if (isQuranData(url)) {
    e.respondWith(staleWhileRevalidate(req, DATA));
    return;
  }

  // Aset tempatan
  if (url.origin === location.origin) {
    e.respondWith(cacheFirst(req, SHELL).catch(() => caches.match(req, { ignoreVary: true })));
  }
});
