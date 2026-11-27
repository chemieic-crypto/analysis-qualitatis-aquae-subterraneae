import express, { type Request, type Response, type Router } from "express";
import { FixedWindowRateLimiter } from "./aiEngine.ts";

export interface MusicCategoryDefinition {
  id: string;
  label: string;
  subtitle: string;
  itunesQueries: string[];
  radioTags: string[];
  countryCode?: string;
}

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

export const MUSIC_CATEGORIES: readonly MusicCategoryDefinition[] = [
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

const CATEGORY_MAP = new Map<string, MusicCategoryDefinition>(
  MUSIC_CATEGORIES.map((c) => [c.id, c])
);

const ALLOWED_CATEGORY_IDS = new Set<string>(MUSIC_CATEGORIES.map((c) => c.id));

const ITUNES_ENDPOINT = "https://itunes.apple.com/search";
const RADIO_BROWSER_HOSTS = [
  "https://de1.api.radio-browser.info/json/stations/search",
  "https://nl1.api.radio-browser.info/json/stations/search",
] as const;

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const UPSTREAM_TIMEOUT_MS = 8000;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

class BoundedTtlCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs = CACHE_TTL_MS): void {
    if (this.store.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

export function isSafeHttpsUrl(raw: unknown): raw is string {
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

export function sanitizeMusicSearchQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001F\u007F<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function resolveCategoryId(raw: unknown): string {
  if (typeof raw !== "string") return "hindi";
  const normalized = raw.trim().toLowerCase();
  return ALLOWED_CATEGORY_IDS.has(normalized) ? normalized : "hindi";
}

function upgradeArtworkUrl(raw: unknown): string | null {
  if (!isSafeHttpsUrl(raw)) return null;
  return raw.replace(/100x100bb/i, "300x300bb");
}

async function fetchJsonWithTimeout(url: string, timeoutMs = UPSTREAM_TIMEOUT_MS): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "AquaIntel-SangeetPlayer/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(`Upstream returned HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function queryItunesTracks(term: string, categoryId: string, limit = 25): Promise<MusicTrackItem[]> {
  const params = new URLSearchParams({
    term,
    country: "IN",
    media: "music",
    entity: "song",
    limit: String(limit),
  });

  const data = await fetchJsonWithTimeout(`${ITUNES_ENDPOINT}?${params.toString()}`);
  const results = Array.isArray(data?.results) ? data.results : [];

  const seen = new Set<string>();
  const tracks: MusicTrackItem[] = [];

  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    if (!isSafeHttpsUrl(item.previewUrl)) continue;

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

async function queryRadioStations(categoryDef: MusicCategoryDefinition): Promise<RadioStationItem[]> {
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
        if (categoryDef.countryCode && (tag === "classical" || tag === "instrumental" || tag === "meditation")) {
          params.set("countrycode", categoryDef.countryCode);
        }

        const data = await fetchJsonWithTimeout(`${host}?${params.toString()}`, 6500);
        if (!Array.isArray(data)) continue;

        for (const st of data) {
          if (!st || typeof st !== "object") continue;
          const streamUrl = typeof st.url_resolved === "string" && st.url_resolved.trim()
            ? st.url_resolved.trim()
            : typeof st.url === "string"
            ? st.url.trim()
            : "";

          if (!isSafeHttpsUrl(streamUrl)) continue;
          if (/\.(m3u8?|pls)(\?|$)/i.test(streamUrl)) continue;
          if (seenUrls.has(streamUrl)) continue;

          const name = typeof st.name === "string" ? st.name.trim() : "";
          if (!name) continue;

          seenUrls.add(streamUrl);
          stations.push({
            id: `radio-${st.stationuuid || stations.length}`,
            name: name.slice(0, 80),
            tags: typeof st.tags === "string" ? st.tags.split(",").slice(0, 3).join(" · ") : categoryDef.label,
            language: typeof st.language === "string" && st.language.trim() ? st.language.trim() : categoryDef.label,
            country: typeof st.country === "string" && st.country.trim() ? st.country.trim() : "India",
            bitrate: typeof st.bitrate === "number" && st.bitrate > 0 ? st.bitrate : 128,
            favicon: isSafeHttpsUrl(st.favicon) ? st.favicon : null,
            streamUrl,
            category: categoryDef.id,
          });

          if (stations.length >= 12) break;
        }
        break; // Host succeeded
      } catch {
        // Try next mirror host
      }
    }
  }

  return stations;
}

function getClientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function createMusicRouter(): Router {
  const router = express.Router();
  const trackCache = new BoundedTtlCache<MusicTrackItem[]>();
  const radioCache = new BoundedTtlCache<RadioStationItem[]>();
  const rateLimiter = new FixedWindowRateLimiter(60_000, 60);

  router.use((req: Request, res: Response, next) => {
    const rate = rateLimiter.consume(getClientKey(req));
    res.setHeader("X-RateLimit-Limit", "60");
    res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      res.status(429).json({ error: "Too many music requests. Please pause briefly." });
      return;
    }
    next();
  });

  router.get("/categories", (_req: Request, res: Response) => {
    res.json({
      categories: MUSIC_CATEGORIES.map(({ id, label, subtitle }) => ({
        id,
        label,
        subtitle,
      })),
    });
  });

  router.get("/tracks", async (req: Request, res: Response) => {
    const categoryId = resolveCategoryId(req.query.category);
    const searchQuery = sanitizeMusicSearchQuery(req.query.q);
    const categoryDef = CATEGORY_MAP.get(categoryId) ?? MUSIC_CATEGORIES[0]!;

    const cacheKey = searchQuery
      ? `search::${categoryId}::${searchQuery.toLowerCase()}`
      : `cat::${categoryId}`;

    const cached = trackCache.get(cacheKey);
    if (cached) {
      res.json({
        category: categoryId,
        query: searchQuery || null,
        tracks: cached,
        cached: true,
      });
      return;
    }

    try {
      let tracks: MusicTrackItem[] = [];

      if (searchQuery) {
        tracks = await queryItunesTracks(searchQuery, categoryId, 25);
      } else {
        for (const queryTerm of categoryDef.itunesQueries) {
          const fetched = await queryItunesTracks(queryTerm, categoryId, 20);
          if (fetched.length > 0) {
            tracks = fetched;
            break;
          }
        }
      }

      if (tracks.length > 0) {
        trackCache.set(cacheKey, tracks);
      }

      res.json({
        category: categoryId,
        query: searchQuery || null,
        tracks,
        cached: false,
      });
    } catch {
      res.status(502).json({
        error: "Unable to load trending tracks from upstream catalog right now.",
        tracks: [],
      });
    }
  });

  router.get("/radio", async (req: Request, res: Response) => {
    const categoryId = resolveCategoryId(req.query.category);
    const categoryDef = CATEGORY_MAP.get(categoryId) ?? MUSIC_CATEGORIES[0]!;
    const cacheKey = `radio::${categoryId}`;

    const cached = radioCache.get(cacheKey);
    if (cached) {
      res.json({
        category: categoryId,
        stations: cached,
        cached: true,
      });
      return;
    }

    try {
      const stations = await queryRadioStations(categoryDef);
      if (stations.length > 0) {
        radioCache.set(cacheKey, stations);
      }
      res.json({
        category: categoryId,
        stations,
        cached: false,
      });
    } catch {
      res.status(502).json({
        error: "Unable to load live Indian radio stations right now.",
        stations: [],
      });
    }
  });

  return router;
}
