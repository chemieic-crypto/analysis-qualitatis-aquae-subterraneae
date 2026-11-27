import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Volume1,
  VolumeX,
  Radio,
  Disc3,
  Search,
  ChevronUp,
  ChevronDown,
  Repeat,
  Loader2,
  RefreshCw,
  X,
  Sparkles,
} from "lucide-react";
import { AMBIENT_RAGA_PRESETS, AmbientRagaPreset, IndianRagaSynth } from "../utils/ragaSynth";

interface MusicTrackItem {
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

interface RadioStationItem {
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

type PlayerMode = "tracks" | "radio";

interface CategoryTab {
  id: string;
  label: string;
  subtitle: string;
}

const CATEGORIES: CategoryTab[] = [
  { id: "hindi", label: "Hindi", subtitle: "Top Trending Bollywood & Hindi" },
  { id: "malayalam", label: "Malayalam", subtitle: "Top Trending Malayalam" },
  { id: "telugu", label: "Telugu", subtitle: "Top Trending Telugu" },
  { id: "kannada", label: "Kannada", subtitle: "Top Trending Kannada" },
  { id: "bihari", label: "Bihari", subtitle: "Trending Bhojpuri & Bihari" },
  { id: "bengali", label: "Bengali", subtitle: "Top Trending Bengali" },
  { id: "tamil", label: "Tamil", subtitle: "Top Trending Tamil" },
  { id: "maharashtrian", label: "Maharashtrian", subtitle: "Top Trending Marathi" },
  { id: "shastriya", label: "Shastriya Sangeet", subtitle: "Hindustani & Carnatic Classical" },
  { id: "instrumental", label: "Instrumental", subtitle: "Sitar, Flute, Santoor & Acoustic" },
];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function IndianMusicPlayer() {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [mode, setMode] = useState<PlayerMode>("tracks");
  const [activeCategory, setActiveCategory] = useState<string>(() => {
    const saved = localStorage.getItem("sangeet_player_category");
    return saved && CATEGORIES.some((c) => c.id === saved) ? saved : "hindi";
  });

  // Search
  const [searchInput, setSearchInput] = useState<string>("");
  const [activeSearch, setActiveSearch] = useState<string>("");

  // Catalog State
  const [tracks, setTracks] = useState<MusicTrackItem[]>([]);
  const [stations, setStations] = useState<RadioStationItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Playback State
  const [currentTrack, setCurrentTrack] = useState<MusicTrackItem | null>(null);
  const [currentStation, setCurrentStation] = useState<RadioStationItem | null>(null);
  const [activeSynthPreset, setActiveSynthPreset] = useState<AmbientRagaPreset | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(30);
  const [loopOne, setLoopOne] = useState<boolean>(false);

  // Volume State (persisted in localStorage)
  const [volume, setVolume] = useState<number>(() => {
    const saved = parseFloat(localStorage.getItem("sangeet_player_volume") || "0.75");
    return Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 0.75;
  });
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showMiniVolumeSlider, setShowMiniVolumeSlider] = useState<boolean>(false);
  const [failedArtIds, setFailedArtIds] = useState<Record<string, boolean>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthRef = useRef<IndianRagaSynth | null>(null);
  const tracksRef = useRef<MusicTrackItem[]>([]);
  const currentTrackRef = useRef<MusicTrackItem | null>(null);
  const loopOneRef = useRef<boolean>(false);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    loopOneRef.current = loopOne;
  }, [loopOne]);

  // Persist UI preferences
  useEffect(() => {
    localStorage.setItem("sangeet_player_category", activeCategory);
  }, [activeCategory]);

  useEffect(() => {
    localStorage.setItem("sangeet_player_volume", String(volume));
  }, [volume]);

  // Sync volume & mute to both HTML5 <audio> and fallback Raga Synth
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = isMuted ? 0 : volume;
      audio.muted = isMuted;
    }
    if (synthRef.current) {
      synthRef.current.setVolume(volume);
      synthRef.current.setMuted(isMuted);
    }
  }, [volume, isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.destroy();
        synthRef.current = null;
      }
    };
  }, []);

  const stopSynth = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.stop();
    }
    setActiveSynthPreset(null);
  }, []);

  const playTrack = useCallback(
    (track: MusicTrackItem) => {
      stopSynth();
      setCurrentStation(null);
      setCurrentTrack(track);
      setErrorMsg(null);
      setCurrentTime(0);
      setDuration(track.durationSec || 30);

      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.src = track.previewUrl;
      audio.volume = isMuted ? 0 : volume;
      audio.muted = isMuted;
      audio.load();
      setIsBuffering(true);
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
        })
        .catch(() => {
          setIsPlaying(false);
          setIsBuffering(false);
          setErrorMsg("Playback blocked or stream unavailable. Try another track or Ambient Raga.");
        });
    },
    [isMuted, stopSynth, volume]
  );

  const playStation = useCallback(
    (station: RadioStationItem) => {
      stopSynth();
      setCurrentTrack(null);
      setCurrentStation(station);
      setErrorMsg(null);
      setCurrentTime(0);
      setDuration(0);

      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.src = station.streamUrl;
      audio.volume = isMuted ? 0 : volume;
      audio.muted = isMuted;
      audio.load();
      setIsBuffering(true);
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
        })
        .catch(() => {
          setIsPlaying(false);
          setIsBuffering(false);
          setErrorMsg("Radio stream could not connect. Please pick another station or switch to Trending Songs.");
        });
    },
    [isMuted, stopSynth, volume]
  );

  const playSynthPreset = useCallback(
    (preset: AmbientRagaPreset) => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      setCurrentTrack(null);
      setCurrentStation(null);
      setErrorMsg(null);

      if (!synthRef.current) {
        synthRef.current = new IndianRagaSynth();
      }
      synthRef.current.setVolume(volume);
      synthRef.current.setMuted(isMuted);
      synthRef.current.start(preset);
      setActiveSynthPreset(preset);
      setIsPlaying(true);
      setIsBuffering(false);
    },
    [isMuted, volume]
  );

  // Fetch catalog whenever category, mode, or activeSearch changes
  const fetchCatalog = useCallback(
    async (categoryId: string, targetMode: PlayerMode, queryText: string) => {
      setIsLoading(true);
      setErrorMsg(null);

      try {
        if (targetMode === "tracks") {
          const params = new URLSearchParams({ category: categoryId });
          if (queryText.trim()) params.set("q", queryText.trim());
          const res = await fetch(`/api/music/tracks?${params.toString()}`);
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data?.error || "Failed to load trending songs.");
          }
          const list: MusicTrackItem[] = Array.isArray(data?.tracks) ? data.tracks : [];
          setTracks(list);
          if (list.length === 0) {
            setErrorMsg("No matching tracks found. Try another keyword or switch category.");
          }
        } else {
          const params = new URLSearchParams({ category: categoryId });
          const res = await fetch(`/api/music/radio?${params.toString()}`);
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data?.error || "Failed to load live radio stations.");
          }
          const list: RadioStationItem[] = Array.isArray(data?.stations) ? data.stations : [];
          setStations(list);
          if (list.length === 0) {
            setErrorMsg("No live HTTPS stations found for this genre right now. Switch to Trending Songs.");
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Could not load music catalog.";
        setErrorMsg(msg);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchCatalog(activeCategory, mode, mode === "tracks" ? activeSearch : "");
  }, [activeCategory, mode, activeSearch, fetchCatalog]);

  // Audio Element Event Wiring
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onLoadedMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => {
      setIsBuffering(false);
      setIsPlaying(true);
    };
    const onPause = () => {
      setIsPlaying(false);
      setIsBuffering(false);
    };
    const onEnded = () => {
      if (loopOneRef.current) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      const list = tracksRef.current;
      const active = currentTrackRef.current;
      if (active && list.length > 0) {
        const idx = list.findIndex((t) => t.id === active.id);
        const nextTrack = list[(idx + 1) % list.length];
        if (nextTrack) {
          playTrack(nextTrack);
          return;
        }
      }
      setIsPlaying(false);
    };
    const onError = () => {
      setIsBuffering(false);
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMeta);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMeta);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [playTrack]);

  const handleTogglePlayPause = () => {
    if (activeSynthPreset) {
      if (isPlaying) {
        synthRef.current?.stop();
        setIsPlaying(false);
      } else {
        synthRef.current?.start(activeSynthPreset);
        setIsPlaying(true);
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (currentTrack || currentStation) {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        audio
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => setErrorMsg("Unable to resume playback."));
      }
      return;
    }

    // Nothing selected yet — start playing first available item
    if (mode === "tracks" && tracks.length > 0) {
      playTrack(tracks[0]);
    } else if (mode === "radio" && stations.length > 0) {
      playStation(stations[0]);
    } else {
      playSynthPreset(AMBIENT_RAGA_PRESETS[0]);
    }
  };

  const handleStepTrack = (delta: -1 | 1) => {
    if (mode === "tracks" && tracks.length > 0) {
      const idx = currentTrack ? tracks.findIndex((t) => t.id === currentTrack.id) : -1;
      const nextIdx = idx < 0 ? 0 : (idx + delta + tracks.length) % tracks.length;
      playTrack(tracks[nextIdx]);
    } else if (mode === "radio" && stations.length > 0) {
      const idx = currentStation ? stations.findIndex((s) => s.id === currentStation.id) : -1;
      const nextIdx = idx < 0 ? 0 : (idx + delta + stations.length) % stations.length;
      playStation(stations[nextIdx]);
    } else if (activeSynthPreset) {
      const idx = AMBIENT_RAGA_PRESETS.findIndex((p) => p.id === activeSynthPreset.id);
      const nextIdx = (idx + delta + AMBIENT_RAGA_PRESETS.length) % AMBIENT_RAGA_PRESETS.length;
      playSynthPreset(AMBIENT_RAGA_PRESETS[nextIdx]);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const audio = audioRef.current;
    if (audio && Number.isFinite(val)) {
      audio.currentTime = val;
      setCurrentTime(val);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVol = parseFloat(e.target.value);
    if (!Number.isFinite(nextVol)) return;
    setVolume(nextVol);
    if (nextVol > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const handleToggleMute = () => {
    setIsMuted((prev) => {
      if (prev && volume === 0) {
        setVolume(0.5);
      }
      return !prev;
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMode("tracks");
    setActiveSearch(searchInput.trim());
  };

  const handleSelectCategory = (catId: string) => {
    setActiveCategory(catId);
    setActiveSearch("");
    setSearchInput("");
  };

  const activeCategoryMeta = CATEGORIES.find((c) => c.id === activeCategory) || CATEGORIES[0];
  const volumePct = isMuted ? 0 : Math.round(volume * 100);
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.45 ? Volume1 : Volume2;

  const nowPlayingTitle = activeSynthPreset
    ? activeSynthPreset.title
    : currentStation
    ? currentStation.name
    : currentTrack
    ? currentTrack.title
    : "Sangeet Player";

  const nowPlayingSub = activeSynthPreset
    ? activeSynthPreset.description
    : currentStation
    ? `${currentStation.language} · Live Radio`
    : currentTrack
    ? `${currentTrack.artist}${currentTrack.releaseYear ? ` · ${currentTrack.releaseYear}` : ""}`
    : `${activeCategoryMeta.label} · 10 Indian Genres`;

  const nowPlayingArt =
    currentTrack && currentTrack.artworkUrl && !failedArtIds[currentTrack.id]
      ? currentTrack.artworkUrl
      : currentStation && currentStation.favicon && !failedArtIds[currentStation.id]
      ? currentStation.favicon
      : null;

  const nowPlayingId = currentTrack?.id || currentStation?.id || "idle";

  return (
    <div
      data-export-hide="true"
      className="fixed bottom-4 left-4 z-[150] flex flex-col items-start gap-2 font-sans max-w-[calc(100vw-2rem)]"
    >
      {/* Hidden persistent HTML5 Audio Element */}
      <audio ref={audioRef} preload="none" />

      {/* EXPANDED MUSIC STUDIO DRAWER */}
      {isExpanded && (
        <section
          aria-label="Indian Trending Music Player"
          className="w-[380px] sm:w-[440px] max-w-[calc(100vw-2rem)] bg-slate-950/96 text-slate-100 border border-slate-700/90 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden flex flex-col max-h-[78vh]"
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/90">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-400 flex items-center justify-center shrink-0">
                <Music className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white tracking-tight truncate">
                  Indian Music Player
                </h3>
                <p className="text-[11px] text-slate-400 truncate">
                  {activeCategoryMeta.subtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Segmented Mode Control */}
              <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setMode("tracks")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                    mode === "tracks"
                      ? "bg-amber-500 text-slate-950"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  <Disc3 className="w-3 h-3" />
                  <span>Trending</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("radio")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                    mode === "radio"
                      ? "bg-amber-500 text-slate-950"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  <Radio className="w-3 h-3" />
                  <span>Live Radio</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Minimize music player"
                title="Minimize player"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 10 Indian Languages & Classical/Instrumental Category Selector */}
          <div className="px-4 pt-3 pb-2 border-b border-slate-800/80 bg-slate-950">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => {
                const isActive = activeCategory === cat.id && !activeSearch;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectCategory(cat.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 border ${
                      isActive
                        ? "bg-amber-500 text-slate-950 border-amber-400"
                        : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600 hover:text-white"
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Search Input (Trending Mode) */}
            {mode === "tracks" && (
              <form onSubmit={handleSearchSubmit} className="mt-2.5 flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search Hindi, Tamil, Marathi, Raga, artist..."
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput("");
                        setActiveSearch("");
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Search
                </button>
              </form>
            )}
          </div>

          {/* NOW PLAYING DECK + VOLUME CONTROL */}
          <div className="px-4 py-3 bg-slate-900/70 border-b border-slate-800 space-y-2.5">
            <div className="flex items-center gap-3">
              {/* Album Art or Styled SVG Fallback */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/25 via-slate-800 to-indigo-900 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                {nowPlayingArt ? (
                  <img
                    src={nowPlayingArt}
                    alt={nowPlayingTitle}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedArtIds((prev) => ({ ...prev, [nowPlayingId]: true }))
                    }
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Disc3
                    className={`w-6 h-6 text-amber-400 ${
                      isPlaying ? "animate-spin" : ""
                    }`}
                    style={isPlaying ? { animationDuration: "6s" } : undefined}
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{nowPlayingTitle}</p>
                <p className="text-xs text-slate-400 truncate mt-0.5">{nowPlayingSub}</p>
              </div>

              {/* Transport Controls */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleStepTrack(-1)}
                  className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label="Previous track"
                  title="Previous"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleTogglePlayPause}
                  className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-md transition-colors cursor-pointer"
                  aria-label={isPlaying ? "Pause" : "Play"}
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isBuffering ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleStepTrack(1)}
                  className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label="Next track"
                  title="Next"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrubber Row (for Songs) or Stream Info (for Radio/Synth) */}
            {currentTrack ? (
              <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-400">
                <span className="w-8 text-right">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration || 30}
                  step={0.1}
                  value={Math.min(currentTime, duration || 30)}
                  onChange={handleSeek}
                  aria-label="Seek track position"
                  className="flex-1 h-1.5 accent-amber-500 bg-slate-800 rounded-lg cursor-pointer"
                />
                <span className="w-8">{formatTime(duration || 30)}</span>
                <button
                  type="button"
                  onClick={() => setLoopOne((prev) => !prev)}
                  className={`p-1 rounded-md transition-colors cursor-pointer ${
                    loopOne
                      ? "text-amber-400 bg-amber-500/15"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title={loopOne ? "Repeat track: ON" : "Repeat track: OFF"}
                  aria-label="Toggle repeat current track"
                >
                  <Repeat className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : currentStation ? (
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-medium text-emerald-400">Live Radio Stream</span>
                <span className="font-mono tabular-nums">
                  {currentStation.bitrate} kbps · {currentStation.country}
                </span>
              </div>
            ) : activeSynthPreset ? (
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-medium text-amber-300">Continuous Classical Raga Audio</span>
                <span>Tanpura + {activeSynthPreset.instrument}</span>
              </div>
            ) : null}

            {/* Dedicated Volume Button + Slider Strip */}
            <div className="flex items-center gap-2.5 pt-1 border-t border-slate-800/80">
              <button
                type="button"
                onClick={handleToggleMute}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  isMuted || volume === 0
                    ? "bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25"
                    : "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
                }`}
                aria-label={isMuted ? "Unmute volume" : "Mute volume"}
                title={isMuted ? "Click to Unmute" : "Click to Mute"}
              >
                <VolumeIcon className="w-4 h-4 text-amber-400" />
                <span>{isMuted ? "Muted" : "Volume"}</span>
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Master volume"
                className="flex-1 h-1.5 accent-amber-500 bg-slate-800 rounded-lg cursor-pointer"
              />

              <span className="w-10 text-right text-xs font-mono font-semibold tabular-nums text-slate-300">
                {volumePct}%
              </span>
            </div>
          </div>

          {/* TRACK / STATION LIST */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70 min-h-[190px] max-h-[290px]">
            {errorMsg && (
              <div className="px-4 py-3 bg-rose-950/40 border-b border-rose-800/50 text-xs text-rose-200 flex items-center justify-between gap-2">
                <span>{errorMsg}</span>
                <button
                  type="button"
                  onClick={() => fetchCatalog(activeCategory, mode, mode === "tracks" ? activeSearch : "")}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-white font-semibold shrink-0 cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              </div>
            )}

            {isLoading ? (
              <div className="p-4 space-y-2.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="flex items-center gap-3 animate-pulse">
                    <div className="w-9 h-9 rounded-lg bg-slate-800 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-slate-800 rounded w-3/4" />
                      <div className="h-2.5 bg-slate-900 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : mode === "tracks" ? (
              tracks.length > 0 ? (
                tracks.map((track, index) => {
                  const isCurrent = currentTrack?.id === track.id;
                  const artOk = track.artworkUrl && !failedArtIds[track.id];
                  return (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => playTrack(track)}
                      className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                        isCurrent
                          ? "bg-amber-500/15"
                          : "hover:bg-slate-900/90"
                      }`}
                    >
                      <span
                        className={`w-5 text-[11px] font-mono tabular-nums text-right shrink-0 ${
                          isCurrent ? "text-amber-400 font-bold" : "text-slate-500"
                        }`}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700/80 overflow-hidden flex items-center justify-center shrink-0">
                        {artOk ? (
                          <img
                            src={track.artworkUrl!}
                            alt={track.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedArtIds((prev) => ({ ...prev, [track.id]: true }))
                            }
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Music className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs font-semibold truncate ${
                            isCurrent ? "text-amber-300" : "text-slate-100"
                          }`}
                        >
                          {track.title}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {track.artist}
                          {track.album ? ` · ${track.album}` : ""}
                        </p>
                      </div>

                      <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                        {isCurrent && isPlaying ? "Playing" : formatTime(track.durationSec)}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="p-6 text-center space-y-2">
                  <p className="text-xs text-slate-400">
                    No online preview tracks loaded for this selection.
                  </p>
                </div>
              )
            ) : stations.length > 0 ? (
              stations.map((station, index) => {
                const isCurrent = currentStation?.id === station.id;
                return (
                  <button
                    key={station.id}
                    type="button"
                    onClick={() => playStation(station)}
                    className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                      isCurrent ? "bg-amber-500/15" : "hover:bg-slate-900/90"
                    }`}
                  >
                    <span
                      className={`w-5 text-[11px] font-mono tabular-nums text-right shrink-0 ${
                        isCurrent ? "text-amber-400 font-bold" : "text-slate-500"
                      }`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center shrink-0">
                      <Radio className={`w-4 h-4 ${isCurrent ? "text-amber-400" : "text-slate-400"}`} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs font-semibold truncate ${
                          isCurrent ? "text-amber-300" : "text-slate-100"
                        }`}
                      >
                        {station.name}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {station.language} · {station.bitrate} kbps
                      </p>
                    </div>

                    <span className="text-[11px] font-medium text-emerald-400 shrink-0">
                      {isCurrent && isPlaying ? "On Air" : "Tune"}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="p-6 text-center space-y-2">
                <p className="text-xs text-slate-400">
                  No live HTTPS stations currently listed for {activeCategoryMeta.label}.
                </p>
              </div>
            )}

            {/* Built-in Offline Shastriya Sangeet & Instrumental Raga Studio Section */}
            {(activeCategory === "shastriya" || activeCategory === "instrumental" || errorMsg) && (
              <div className="bg-slate-900/60 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Continuous Raga &amp; Instrumental Studio
                  </span>
                  <span>Instant Playback</span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {AMBIENT_RAGA_PRESETS.map((preset) => {
                    const isActive = activeSynthPreset?.id === preset.id && isPlaying;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => playSynthPreset(preset)}
                        className={`px-3 py-2 rounded-lg border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isActive
                            ? "bg-amber-500/20 border-amber-400/60 text-amber-200"
                            : "bg-slate-950/70 border-slate-800 text-slate-200 hover:border-slate-600"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{preset.title}</p>
                          <p className="text-[11px] text-slate-400 truncate">{preset.description}</p>
                        </div>
                        <span className="text-[11px] font-semibold text-amber-400 shrink-0">
                          {isActive ? "Playing" : "Play"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* COMPACT DOCKED MINI PLAYER BAR (ALWAYS HAS PLAY/PAUSE + VOLUME BUTTON + EXPAND) */}
      <div className="bg-slate-950/95 text-white border border-slate-700/90 rounded-2xl shadow-xl backdrop-blur-md px-2.5 py-2 flex items-center gap-2 max-w-[calc(100vw-2rem)]">
        {/* Play / Pause */}
        <button
          type="button"
          onClick={handleTogglePlayPause}
          className="w-9 h-9 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 transition-colors cursor-pointer shadow-sm"
          aria-label={isPlaying ? "Pause music" : "Play trending music"}
          title={isPlaying ? "Pause" : "Play trending Indian music"}
        >
          {isBuffering ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        {/* Track / Status Trigger to Expand */}
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="text-left min-w-0 max-w-[140px] sm:max-w-[190px] px-1 cursor-pointer group"
          title="Open 10-genre Indian Music Player"
        >
          <p className="text-xs font-bold text-white truncate group-hover:text-amber-300 transition-colors">
            {nowPlayingTitle}
          </p>
          <p className="text-[11px] text-slate-400 truncate">
            {nowPlayingSub}
          </p>
        </button>

        {/* Dedicated Volume Button + Inline Popout/Visible Slider */}
        <div
          className="flex items-center gap-1.5 pl-1.5 border-l border-slate-800 shrink-0"
          onMouseEnter={() => setShowMiniVolumeSlider(true)}
          onMouseLeave={() => setShowMiniVolumeSlider(false)}
        >
          <button
            type="button"
            onClick={handleToggleMute}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer border ${
              isMuted || volume === 0
                ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                : "bg-slate-900 border-slate-700 text-amber-400 hover:bg-slate-800"
            }`}
            aria-label={isMuted ? "Unmute volume" : "Mute volume"}
            title={`Volume: ${volumePct}% (Click to ${isMuted ? "Unmute" : "Mute"})`}
          >
            <VolumeIcon className="w-4 h-4" />
          </button>

          <div
            className={`flex items-center gap-1.5 transition-all ${
              showMiniVolumeSlider || isPlaying ? "w-24 sm:w-28 opacity-100" : "hidden sm:flex sm:w-20 opacity-90"
            }`}
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label="Adjust volume"
              className="w-full h-1.5 accent-amber-500 bg-slate-800 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] font-mono tabular-nums text-slate-300 w-7 text-right shrink-0">
              {volumePct}%
            </span>
          </div>
        </div>

        {/* Expand / Collapse Library Button */}
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          aria-expanded={isExpanded}
          title={isExpanded ? "Collapse Music Player" : "Browse Hindi, Malayalam, Telugu, Kannada, Bihari, Bengali, Tamil, Marathi, Shastriya & Instrumental"}
        >
          <Music className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">{isExpanded ? "Hide" : "Songs"}</span>
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
