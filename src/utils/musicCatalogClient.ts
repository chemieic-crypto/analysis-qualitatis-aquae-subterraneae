/**
 * Client-Side & Hybrid Indian Music Catalog Engine
 *
 * Works seamlessly in BOTH:
 *  1. Static HTTPS hosting (GitHub Pages `*.github.io`, Netlify, Vercel, S3) where no Express
 *     `/api/music/*` server exists — fetches directly from CORS-enabled HTTPS iTunes Search API
 *     (with automatic JSONP fallback) and Radio Browser HTTPS mirrors.
 *  2. Full-stack Node/Express deployments — tries `/api/music/*` first and seamlessly falls back
 *     to direct browser HTTPS APIs if the backend route is unavailable or returns non-JSON.
 */

export interface MusicTrackItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  category: string;
  genre: string;
  artworkUrl: string | null;
  previewUrl: string;
  durationSec: number;
  releaseYear: string | null;
}

export interface RadioStationItem {
  id: string;
  name: string;
  tags: string;
  language: string;
  country: string;
  bitrate: number;
  favicon: string | null;
  streamUrl: string;
  category: string;
}

export interface MusicCategoryConfig {
  id: string;
  label: string;
  subtitle: string;
  itunesQueries: string[];
  radioTags: string[];
  countryCode?: string;
}

export const MUSIC_CLIENT_CATEGORIES: readonly MusicCategoryConfig[] = [
  {
    id: "hindi",
    label: "Hindi",
    subtitle: "Top Trending Bollywood & Hindi",
    itunesQueries: ["Arijit Singh Bollywood Hindi", "Pritam Shreya Ghoshal Hindi"],
    radioTags: ["bollywood", "hindi"],
    countryCode: "IN",
  },
  {
    id: "malayalam",
    label: "Malayalam",
    subtitle: "Top Trending Malayalam",
    itunesQueries: ["Sushin Shyam Malayalam", "Hesham Abdul Wahab Malayalam"],
    radioTags: ["malayalam"],
    countryCode: "IN",
  },
  {
    id: "telugu",
    label: "Telugu",
    subtitle: "Top Trending Telugu",
    itunesQueries: ["Devi Sri Prasad Telugu", "Thaman S Telugu"],
    radioTags: ["telugu"],
    countryCode: "IN",
  },
  {
    id: "kannada",
    label: "Kannada",
    subtitle: "Top Trending Kannada",
    itunesQueries: ["Sanjith Hegde Kannada", "Vijay Prakash Kannada"],
    radioTags: ["kannada"],
    countryCode: "IN",
  },
  {
    id: "bihari",
    label: "Bihari",
    subtitle: "Trending Bhojpuri & Bihari",
    itunesQueries: ["Pawan Singh Bhojpuri", "Khesari Lal Yadav Bhojpuri"],
    radioTags: ["bhojpuri", "hindi"],
    countryCode: "IN",
  },
  {
    id: "bengali",
    label: "Bengali",
    subtitle: "Top Trending Bengali & Rabindra Sangeet",
    itunesQueries: ["Anupam Roy Bengali", "Rabindra Sangeet Bengali"],
    radioTags: ["bengali", "bangla"],
    countryCode: "IN",
  },
  {
    id: "tamil",
    label: "Tamil",
    subtitle: "Top Trending Tamil",
    itunesQueries: ["Anirudh Ravichander Tamil", "A R Rahman Tamil"],
    radioTags: ["tamil"],
    countryCode: "IN",
  },
  {
    id: "maharashtrian",
    label: "Maharashtrian",
    subtitle: "Top Trending Marathi & Lavani",
    itunesQueries: ["Ajay Atul Marathi", "Avadhoot Gupte Marathi"],
    radioTags: ["marathi"],
    countryCode: "IN",
  },
  {
    id: "shastriya",
    label: "Shastriya Sangeet",
    subtitle: "Hindustani & Carnatic Classical Ragas",
    itunesQueries: ["Pandit Bhimsen Joshi Raga", "Ustad Rashid Khan Classical"],
    radioTags: ["indian classical", "carnatic", "hindustani", "classical"],
    countryCode: "IN",
  },
  {
    id: "instrumental",
    label: "Instrumental",
    subtitle: "Sitar, Bansuri, Santoor & Acoustic",
    itunesQueries: ["Hariprasad Chaurasia Flute", "Pandit Ravi Shankar Sitar"],
    radioTags: ["instrumental", "sitar", "meditation"],
    countryCode: "IN",
  },
] as const;

const CATEGORY_MAP = new Map<string, MusicCategoryConfig>(
  MUSIC_CLIENT_CATEGORIES.map((c) => [c.id, c])
);

const ITUNES_ENDPOINT = "https://itunes.apple.com/search";
const RADIO_BROWSER_HOSTS = [
  "https://de1.api.radio-browser.info/json/stations/search",
  "https://nl1.api.radio-browser.info/json/stations/search",
  "https://fi1.api.radio-browser.info/json/stations/search",
] as const;

const CACHE_TTL_MS = 10 * 60 * 1000;
const trackMemoryCache = new Map<string, { expiresAt: number; data: MusicTrackItem[] }>();
const radioMemoryCache = new Map<string, { expiresAt: number; data: RadioStationItem[] }>();

export function isSafeHttpsAudioUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 1000) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isStaticHostingEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host.endsWith(".github.io") ||
    host.endsWith(".pages.dev") ||
    host.endsWith(".netlify.app") ||
    window.location.protocol === "file:"
  );
}

function getApiBaseUrl(): string {
  const configured =
    typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE_URL
      ? String((import.meta as any).env.VITE_API_BASE_URL).trim().replace(/\/+$/, "")
      : "";
  return configured;
}

function upgradeArtworkUrl(raw: unknown): string | null {
  if (!isSafeHttpsAudioUrl(raw)) return null;
  return raw.replace(/100x100bb/i, "300x300bb");
}

function normalizeItunesResults(results: unknown[], categoryId: string): MusicTrackItem[] {
  const seen = new Set<string>();
  const tracks: MusicTrackItem[] = [];

  for (const raw of results) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, any>;
    if (!isSafeHttpsAudioUrl(item.previewUrl)) continue;

    const title = typeof item.trackName === "string" ? item.trackName.trim() : "";
    const artist = typeof item.artistName === "string" ? item.artistName.trim() : "Unknown Artist";
    if (!title) continue;

    const dedupeKey = `${title.toLowerCase()}::${artist.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const releaseYear =
      typeof item.releaseDate === "string" && /^\d{4}/.test(item.releaseDate)
        ? item.releaseDate.slice(0, 4)
        : null;

    tracks.push({
      id: `itunes-${item.trackId ?? tracks.length}`,
      title,
      artist,
      album: typeof item.collectionName === "string" ? item.collectionName.trim() : "",
      category: categoryId,
      genre: typeof item.primaryGenreName === "string" ? item.primaryGenreName.trim() : "Indian Music",
      artworkUrl: upgradeArtworkUrl(item.artworkUrl100 || item.artworkUrl60),
      previewUrl: item.previewUrl.trim(),
      durationSec: 30,
      releaseYear,
    });
  }

  return tracks;
}

/**
 * Browser JSONP fallback for iTunes Search API in case a strict corporate proxy or extension blocks CORS fetch.
 */
function fetchItunesJsonp(url: string, timeoutMs = 8000): Promise<any> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return Promise.reject(new Error("JSONP unavailable outside browser."));
  }

  return new Promise((resolve, reject) => {
    const cbName = `__sangeet_itunes_cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const script = document.createElement("script");
    let settled = false;

    const cleanup = () => {
      try {
        delete (window as any)[cbName];
      } catch {
        (window as any)[cbName] = undefined;
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("iTunes JSONP request timed out."));
      }
    }, timeoutMs);

    (window as any)[cbName] = (payload: any) => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        cleanup();
        resolve(payload);
      }
    };

    script.onerror = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        cleanup();
        reject(new Error("iTunes JSONP script failed to load."));
      }
    };

    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}callback=${encodeURIComponent(cbName)}`;
    script.async = true;
    document.head.appendChild(script);
  });
}

async function fetchSimpleCorsJson(url: string, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Intentionally omit custom headers so browser sends a simple CORS GET with zero preflight
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function queryItunesDirectly(
  term: string,
  categoryId: string,
  limit = 20
): Promise<MusicTrackItem[]> {
  const params = new URLSearchParams({
    term,
    country: "IN",
    media: "music",
    entity: "song",
    limit: String(limit),
  });
  const url = `${ITUNES_ENDPOINT}?${params.toString()}`;

  let data: any;
  try {
    data = await fetchSimpleCorsJson(url, 8000);
  } catch {
    // Fallback to JSONP if browser extension / proxy blocks cross-origin fetch
    data = await fetchItunesJsonp(url, 8000);
  }

  const results = Array.isArray(data?.results) ? data.results : [];
  return normalizeItunesResults(results, categoryId);
}

async function queryRadioDirectly(categoryDef: MusicCategoryConfig): Promise<RadioStationItem[]> {
  const stations: RadioStationItem[] = [];
  const seenUrls = new Set<string>();

  for (const tag of categoryDef.radioTags) {
    if (stations.length >= 12) break;

    for (const host of RADIO_BROWSER_HOSTS) {
      try {
        const params = new URLSearchParams({
          tag,
          hidebroken: "true",
          is_https: "true",
          order: "clickcount",
          reverse: "true",
          limit: "15",
        });
        if (
          categoryDef.countryCode &&
          (tag === "classical" || tag === "instrumental" || tag === "meditation")
        ) {
          params.set("countrycode", categoryDef.countryCode);
        }

        const data = await fetchSimpleCorsJson(`${host}?${params.toString()}`, 6500);
        if (!Array.isArray(data)) continue;

        for (const st of data) {
          if (!st || typeof st !== "object") continue;
          const streamUrl =
            typeof st.url_resolved === "string" && st.url_resolved.trim()
              ? st.url_resolved.trim()
              : typeof st.url === "string"
                ? st.url.trim()
                : "";

          if (!isSafeHttpsAudioUrl(streamUrl)) continue;
          if (/\.(m3u8?|pls)(\?|$)/i.test(streamUrl)) continue;
          if (seenUrls.has(streamUrl)) continue;

          const name = typeof st.name === "string" ? st.name.trim() : "";
          if (!name) continue;

          seenUrls.add(streamUrl);
          stations.push({
            id: `radio-${st.stationuuid || stations.length}`,
            name: name.slice(0, 80),
            tags:
              typeof st.tags === "string"
                ? st.tags.split(",").slice(0, 3).join(" · ")
                : categoryDef.label,
            language:
              typeof st.language === "string" && st.language.trim()
                ? st.language.trim()
                : categoryDef.label,
            country:
              typeof st.country === "string" && st.country.trim()
                ? st.country.trim()
                : "India",
            bitrate: typeof st.bitrate === "number" && st.bitrate > 0 ? st.bitrate : 128,
            favicon: isSafeHttpsAudioUrl(st.favicon) ? st.favicon : null,
            streamUrl,
            category: categoryDef.id,
          });

          if (stations.length >= 12) break;
        }
        break; // Mirror succeeded
      } catch {
        // Try next HTTPS mirror
      }
    }
  }

  return stations;
}

async function tryBackendJson(pathAndQuery: string): Promise<any | null> {
  const apiBase = getApiBaseUrl();
  // Skip relative /api/* on static hosts like GitHub Pages unless an external VITE_API_BASE_URL is configured
  if (!apiBase && isStaticHostingEnvironment()) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${apiBase}${pathAndQuery}`, { signal: controller.signal });
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok || !contentType.includes("application/json")) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches trending tracks for any of the 10 Indian music categories (or custom search query).
 * Guaranteed to work on GitHub Pages (`*.github.io`) as well as Express server deployments.
 */
export async function fetchTrendingMusicTracks(
  categoryId: string,
  queryText = ""
): Promise<MusicTrackItem[]> {
  const cleanQuery = queryText.trim().slice(0, 80);
  const categoryDef = CATEGORY_MAP.get(categoryId) ?? MUSIC_CLIENT_CATEGORIES[0]!;
  const cacheKey = cleanQuery
    ? `search::${categoryDef.id}::${cleanQuery.toLowerCase()}`
    : `cat::${categoryDef.id}`;

  const cached = trackMemoryCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt && cached.data.length > 0) {
    return cached.data;
  }

  // 1. Try backend proxy when running with Express server
  const params = new URLSearchParams({ category: categoryDef.id });
  if (cleanQuery) params.set("q", cleanQuery);
  const backendPayload = await tryBackendJson(`/api/music/tracks?${params.toString()}`);
  if (backendPayload && Array.isArray(backendPayload.tracks) && backendPayload.tracks.length > 0) {
    trackMemoryCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: backendPayload.tracks,
    });
    return backendPayload.tracks;
  }

  // 2. Direct browser HTTPS fetch (Primary path on GitHub Pages & automatic fallback)
  let merged: MusicTrackItem[] = [];
  if (cleanQuery) {
    merged = await queryItunesDirectly(cleanQuery, categoryDef.id, 25);
  } else {
    const seen = new Set<string>();
    for (const q of categoryDef.itunesQueries) {
      try {
        const batch = await queryItunesDirectly(q, categoryDef.id, 15);
        for (const item of batch) {
          const k = `${item.title.toLowerCase()}::${item.artist.toLowerCase()}`;
          if (!seen.has(k)) {
            seen.add(k);
            merged.push(item);
          }
        }
        if (merged.length >= 20) break;
      } catch {
        // Continue to next query term
      }
    }
  }

  if (merged.length > 0) {
    trackMemoryCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: merged,
    });
  }

  return merged;
}

/**
 * Fetches live HTTPS Indian radio stations for any of the 10 genres.
 * Guaranteed to work on GitHub Pages (`*.github.io`) as well as Express server deployments.
 */
export async function fetchLiveRadioStations(categoryId: string): Promise<RadioStationItem[]> {
  const categoryDef = CATEGORY_MAP.get(categoryId) ?? MUSIC_CLIENT_CATEGORIES[0]!;
  const cacheKey = `radio::${categoryDef.id}`;

  const cached = radioMemoryCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt && cached.data.length > 0) {
    return cached.data;
  }

  // 1. Try backend proxy when running with Express server
  const params = new URLSearchParams({ category: categoryDef.id });
  const backendPayload = await tryBackendJson(`/api/music/radio?${params.toString()}`);
  if (backendPayload && Array.isArray(backendPayload.stations) && backendPayload.stations.length > 0) {
    radioMemoryCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: backendPayload.stations,
    });
    return backendPayload.stations;
  }

  // 2. Direct browser HTTPS Radio Browser fetch (Primary path on GitHub Pages & automatic fallback)
  const stations = await queryRadioDirectly(categoryDef);
  if (stations.length > 0) {
    radioMemoryCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: stations,
    });
  }

  return stations;
}
