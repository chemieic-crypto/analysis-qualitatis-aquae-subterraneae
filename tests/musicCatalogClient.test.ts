import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MUSIC_CLIENT_CATEGORIES,
  isSafeHttpsAudioUrl,
  fetchTrendingMusicTracks,
} from "../src/utils/musicCatalogClient.ts";

describe("Music Catalog Client (GitHub Pages Static + Hybrid Playback)", () => {
  it("defines all 10 requested Indian music genres", () => {
    const ids = MUSIC_CLIENT_CATEGORIES.map((c) => c.id);
    assert.deepEqual(ids, [
      "hindi",
      "malayalam",
      "telugu",
      "kannada",
      "bihari",
      "bengali",
      "tamil",
      "maharashtrian",
      "shastriya",
      "instrumental",
    ]);
  });

  it("strictly validates HTTPS public audio URLs and rejects HTTP/localhost/private IPs", () => {
    assert.equal(isSafeHttpsAudioUrl("https://audio-ssl.itunes.apple.com/sample.m4a"), true);
    assert.equal(isSafeHttpsAudioUrl("http://audio-ssl.itunes.apple.com/sample.m4a"), false);
    assert.equal(isSafeHttpsAudioUrl("javascript:alert(1)"), false);
    assert.equal(isSafeHttpsAudioUrl("https://localhost:3000/track.mp3"), false);
    assert.equal(isSafeHttpsAudioUrl("https://192.168.1.5/stream.mp3"), false);
    assert.equal(isSafeHttpsAudioUrl(""), false);
  });

  it("falls back cleanly to direct iTunes HTTPS API when /api/music returns HTML 404 (GitHub Pages simulation)", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/music/")) {
          // Simulate GitHub Pages returning 404.html (HTML instead of JSON)
          return new Response("<!doctype html><html><body>404</body></html>", {
            status: 404,
            headers: { "content-type": "text/html" },
          });
        }
        if (url.startsWith("https://itunes.apple.com/search")) {
          return new Response(
            JSON.stringify({
              results: [
                {
                  trackId: 99001,
                  trackName: "Kesariya",
                  artistName: "Arijit Singh",
                  collectionName: "Brahmastra",
                  primaryGenreName: "Bollywood",
                  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg",
                  previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/sample.m4a",
                  releaseDate: "2022-07-17T07:00:00Z",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "text/javascript; charset=utf-8" } }
          );
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      }) as typeof fetch;

      const tracks = await fetchTrendingMusicTracks("hindi", "Kesariya");
      assert.equal(tracks.length, 1);
      assert.equal(tracks[0].title, "Kesariya");
      assert.equal(tracks[0].artist, "Arijit Singh");
      assert.equal(tracks[0].previewUrl, "https://audio-ssl.itunes.apple.com/itunes-assets/sample.m4a");
      assert.equal(tracks[0].artworkUrl, "https://is1-ssl.mzstatic.com/image/thumb/300x300bb.jpg");
      assert.equal(tracks[0].releaseYear, "2022");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
