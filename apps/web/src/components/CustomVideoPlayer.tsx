'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Tv,
  Download,
  AlertCircle,
  Video as VideoIcon,
  Sparkles,
} from 'lucide-react';

interface CustomVideoPlayerProps {
  src: string;
  fileName?: string;
  fileSize?: string | number;
  className?: string;
  autoPlay?: boolean;
  onDownload?: () => void;
}

export default function CustomVideoPlayer({
  src,
  fileName = 'Video',
  fileSize,
  className = '',
  autoPlay = true,
  onDownload,
}: CustomVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showCenterIcon, setShowCenterIcon] = useState(false);
  const [centerIconType, setCenterIconType] = useState<'play' | 'pause' | 'skip-fwd' | 'skip-bwd'>('play');
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Restore volume preference from localStorage
  useEffect(() => {
    try {
      const savedVol = localStorage.getItem('noor_video_volume');
      if (savedVol !== null) {
        const v = parseFloat(savedVol);
        if (!isNaN(v) && v >= 0 && v <= 1) {
          setVolume(v);
          if (videoRef.current) videoRef.current.volume = v;
        }
      }
    } catch {}
  }, []);

  const triggerCenterFeedback = (type: 'play' | 'pause' | 'skip-fwd' | 'skip-bwd') => {
    setCenterIconType(type);
    setShowCenterIcon(true);
    setTimeout(() => setShowCenterIcon(false), 550);
  };

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      triggerCenterFeedback('play');
    } else {
      video.pause();
      triggerCenterFeedback('pause');
    }
  }, []);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(time, 0), duration);
  }, [duration]);

  const skip = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    seek(video.currentTime + seconds);
    triggerCenterFeedback(seconds > 0 ? 'skip-fwd' : 'skip-bwd');
  }, [seek]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const changeVolume = useCallback((val: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = val;
    setVolume(val);
    try {
      localStorage.setItem('noor_video_volume', String(val));
    } catch {}
    if (val === 0) {
      setIsMuted(true);
      video.muted = true;
    } else {
      setIsMuted(false);
      video.muted = false;
    }
  }, []);

  const changePlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setSpeedMenuOpen(false);
  }, []);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch {}
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  const formatTime = (sec: number) => {
    if (isNaN(sec) || !isFinite(sec)) return '00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setSpeedMenuOpen(false);
      }
    }, 2500);
  };

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setHasError(false);

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => {
      setDuration(video.duration);
      setIsBuffering(false);
      if (autoPlay) {
        video.play().catch(() => {
          // Autoplay blocked by browser policy without user gesture
          setIsPlaying(false);
        });
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onError = () => {
      setIsBuffering(false);
      setHasError(true);
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
    };
  }, [src, autoPlay]);

  // Fullscreen change listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Global Keyboard shortcuts when player is visible
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.code === 'Space' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        skip(10);
      } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        skip(-10);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        changeVolume(Math.min(1, volume + 0.1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        changeVolume(Math.max(0, volume - 0.1));
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skip, changeVolume, volume, toggleFullscreen, toggleMute]);

  // Handle timeline scrubber hover
  const handleTimelineHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos * 100);
    setHoverTime(pos * duration);
  };

  const ext = (fileName.split('.').pop() || 'mp4').toUpperCase();

  if (hasError) {
    return (
      <div className="w-full max-w-2xl bg-zinc-950/95 border border-zinc-800 rounded-3xl p-8 text-center text-white space-y-4 shadow-2xl mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20 shadow-inner">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">Browser Video Codec Notice</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto mt-1.5 leading-relaxed">
            This video file (<strong>{fileName}</strong>) uses a container format or codec (like high-profile MKV/AVI) that your browser cannot stream directly.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          {onDownload ? (
            <button
              onClick={onDownload}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg transition flex items-center gap-2 active:scale-95"
            >
              <Download className="w-4 h-4" /> Download Video Directly
            </button>
          ) : (
            <a
              href={src}
              download={fileName}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg transition flex items-center gap-2 active:scale-95"
            >
              <Download className="w-4 h-4" /> Download Video File
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onTouchStart={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onDoubleClick={toggleFullscreen}
      className={`relative group bg-black/95 rounded-3xl overflow-hidden flex items-center justify-center select-none shadow-2xl border border-white/10 w-full ${className}`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={src}
        onClick={togglePlay}
        playsInline
        className="w-full max-h-[80vh] object-contain cursor-pointer"
      />

      {/* Buffering Spinner */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 bg-black/30 backdrop-blur-[1px]">
          <div className="w-14 h-14 rounded-2xl bg-black/80 border border-white/20 flex items-center justify-center shadow-2xl animate-spin">
            <div className="w-7 h-7 border-3 border-sky-400 border-t-transparent rounded-full" />
          </div>
        </div>
      )}

      {/* Center Feedback Animation (YouTube style Play / Pause / Skip pulse) */}
      {showCenterIcon && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="w-20 h-20 rounded-full bg-black/75 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-2xl animate-in zoom-in-75 fade-out duration-500">
            {centerIconType === 'play' && <Play className="w-9 h-9 text-white fill-white ml-1" />}
            {centerIconType === 'pause' && <Pause className="w-9 h-9 text-white fill-white" />}
            {centerIconType === 'skip-fwd' && <RotateCw className="w-9 h-9 text-white" />}
            {centerIconType === 'skip-bwd' && <RotateCcw className="w-9 h-9 text-white" />}
          </div>
        </div>
      )}

      {/* Top Header Overlay with Title & Format Badge */}
      <div
        className={`absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 sm:p-5 flex items-center justify-between transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-4">
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
            <VideoIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-bold text-white truncate max-w-md sm:max-w-xl">
              {fileName}
            </p>
            <p className="text-[10px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
              <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-white font-mono font-bold">
                {ext}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-sky-400 font-medium">
                <Sparkles className="w-2.5 h-2.5" /> High-Speed Streaming
              </span>
            </p>
          </div>
        </div>

        {onDownload && (
          <button
            onClick={onDownload}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition shrink-0"
            title="Download Video"
          >
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Floating Bottom Controls Overlay */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-4 sm:p-5 transition-opacity duration-300 flex flex-col gap-2.5 ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Scrubber Progress Bar with Hover Timestamp */}
        <div
          className="relative w-full py-1 cursor-pointer group/slider"
          onMouseMove={handleTimelineHover}
          onMouseLeave={() => setHoverTime(null)}
        >
          {hoverTime !== null && (
            <div
              style={{ left: `${hoverPosition}%` }}
              className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-md bg-zinc-900 border border-white/20 text-[10px] font-mono text-white pointer-events-none shadow-lg z-30"
            >
              {formatTime(hoverTime)}
            </div>
          )}
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full h-1.5 sm:h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-sky-400 hover:h-2.5 transition-all"
          />
        </div>

        {/* Control Toolbar Buttons */}
        <div className="flex items-center justify-between text-white text-xs">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="w-9 h-9 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-95 text-white flex items-center justify-center shadow-lg transition"
              title={isPlaying ? 'Pause (Space / K)' : 'Play (Space / K)'}
            >
              {isPlaying ? (
                <Pause className="w-4.5 h-4.5 fill-white" />
              ) : (
                <Play className="w-4.5 h-4.5 fill-white ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => skip(-10)}
              className="p-2 rounded-xl hover:bg-white/10 active:scale-95 text-zinc-300 hover:text-white transition"
              title="Rewind 10s (Left Arrow / J)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => skip(10)}
              className="p-2 rounded-xl hover:bg-white/10 active:scale-95 text-zinc-300 hover:text-white transition"
              title="Forward 10s (Right Arrow / L)"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-1.5 ml-1 group/vol">
              <button
                type="button"
                onClick={toggleMute}
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition"
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                className="w-14 sm:w-20 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-sky-400"
              />
            </div>

            {/* Time Indicator */}
            <span className="text-[11px] font-mono text-zinc-300 ml-2 hidden sm:inline">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 relative">
            <span className="text-[10px] font-mono text-zinc-400 sm:hidden">
              {formatTime(currentTime)}
            </span>

            {/* Playback speed selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setSpeedMenuOpen(!speedMenuOpen)}
                className="px-2 sm:px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold text-zinc-200 transition flex items-center gap-1"
                title="Playback Speed"
              >
                <span>{playbackRate}x</span>
              </button>

              {speedMenuOpen && (
                <div className="absolute right-0 bottom-full mb-2 bg-zinc-900 border border-white/15 rounded-2xl p-1.5 shadow-2xl flex flex-col gap-1 z-30 min-w-[70px]">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => changePlaybackRate(rate)}
                      className={`px-2.5 py-1 rounded-xl text-left text-xs font-semibold transition ${
                        playbackRate === rate
                          ? 'bg-sky-500 text-white'
                          : 'text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Picture-in-Picture */}
            <button
              type="button"
              onClick={togglePiP}
              className="p-2 rounded-xl hover:bg-white/10 active:scale-95 text-zinc-300 hover:text-white transition hidden sm:flex"
              title="Picture in Picture"
            >
              <Tv className="w-4 h-4" />
            </button>

            {/* Fullscreen */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl hover:bg-white/10 active:scale-95 text-zinc-300 hover:text-white transition"
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
