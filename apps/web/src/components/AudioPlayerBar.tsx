'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
  Music2,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  ListMusic,
} from 'lucide-react';

export interface AudioTrack {
  id?: string;
  url: string;
  title: string;
  artist?: string;
  duration?: number;
}

interface AudioPlayerBarProps {
  track: AudioTrack | null;
  playlist?: AudioTrack[];
  currentIndex?: number;
  onTrackChange?: (track: AudioTrack, index: number) => void;
  onClose: () => void;
}

export default function AudioPlayerBar({
  track,
  playlist = [],
  currentIndex = 0,
  onTrackChange,
  onClose,
}: AudioPlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  const activeIndex = currentIndex;

  const playNext = useCallback(() => {
    if (!playlist || playlist.length <= 1) return;
    let nextIdx = activeIndex + 1;
    if (isShuffle) {
      nextIdx = Math.floor(Math.random() * playlist.length);
      if (nextIdx === activeIndex && playlist.length > 1) {
        nextIdx = (activeIndex + 1) % playlist.length;
      }
    } else if (nextIdx >= playlist.length) {
      nextIdx = 0;
    }
    onTrackChange?.(playlist[nextIdx], nextIdx);
  }, [playlist, activeIndex, isShuffle, onTrackChange]);

  const playPrev = useCallback(() => {
    if (!playlist || playlist.length <= 1) return;
    let prevIdx = activeIndex - 1;
    if (prevIdx < 0) prevIdx = playlist.length - 1;
    onTrackChange?.(playlist[prevIdx], prevIdx);
  }, [playlist, activeIndex, onTrackChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = 0;
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => {
      if (isLooping) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else if (playlist && playlist.length > 1) {
        // Continuous auto-play next track in album/folder!
        playNext();
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [track?.url, isLooping, playlist, playNext]);

  if (!track) return null;

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const seek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(time, 0), duration);
  };

  const skip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    seek(audio.currentTime + seconds);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const changeVolume = (val: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = val;
    setVolume(val);
    if (val === 0) {
      setIsMuted(true);
      audio.muted = true;
    } else {
      setIsMuted(false);
      audio.muted = false;
    }
  };

  const formatTime = (sec: number) => {
    if (isNaN(sec) || !isFinite(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:bottom-4 left-4 right-4 md:left-auto md:right-8 md:w-[480px] z-40 animate-in slide-in-from-bottom-5 duration-300">
      <audio ref={audioRef} src={track.url} />

      {/* Playlist Queue Popover */}
      {showQueue && playlist.length > 0 && (
        <div className="mb-2 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl max-h-56 overflow-y-auto text-white divide-y divide-white/10">
          <div className="flex items-center justify-between pb-2 px-1 text-xs font-bold text-zinc-300">
            <span>Now Playing Queue ({playlist.length} tracks)</span>
            <button onClick={() => setShowQueue(false)} className="text-zinc-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {playlist.map((item, idx) => {
            const isCurrent = idx === activeIndex;
            return (
              <div
                key={item.id || item.url || idx}
                onClick={() => {
                  onTrackChange?.(item, idx);
                  setShowQueue(false);
                }}
                className={`py-2 px-2 rounded-xl flex items-center justify-between text-xs cursor-pointer transition ${
                  isCurrent
                    ? 'bg-indigo-600/30 text-indigo-300 font-bold'
                    : 'hover:bg-white/10 text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  <span className="font-mono text-[10px] text-zinc-500 w-4">{idx + 1}</span>
                  <span className="truncate">{item.title}</span>
                </div>
                {isCurrent && (
                  <span className="text-[10px] text-indigo-400 font-bold uppercase shrink-0">Playing</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-zinc-900/95 backdrop-blur-xl border border-white/15 rounded-2xl p-4 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] text-white flex flex-col gap-2.5">
        {/* Track Info & Actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center shrink-0 shadow-sm animate-pulse">
              <Music2 className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate max-w-[240px]">
                {track.title}
              </p>
              <p className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                {playlist.length > 1 && (
                  <>
                    <span>•</span>
                    <span className="text-indigo-400 font-medium">Track {activeIndex + 1}/{playlist.length}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {playlist.length > 1 && (
              <button
                type="button"
                onClick={() => setShowQueue(!showQueue)}
                className={`p-1.5 rounded-xl transition ${
                  showQueue ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-zinc-400 hover:text-white'
                }`}
                title="View Queue / Playlist"
              >
                <ListMusic className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white transition"
              title="Close Player"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrubber Progress Bar */}
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={(e) => seek(Number(e.target.value))}
          className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-400 hover:h-1.5 transition-all"
        />

        {/* Controls Bar */}
        <div className="flex items-center justify-between text-xs pt-1">
          <div className="flex items-center gap-1 sm:gap-1.5">
            {playlist.length > 1 && (
              <button
                type="button"
                onClick={playPrev}
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition active:scale-95"
                title="Previous Track"
              >
                <SkipBack className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => skip(-10)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition"
              title="Rewind 10s"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white flex items-center justify-center shadow-sm transition"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => skip(10)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition"
              title="Forward 10s"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {playlist.length > 1 && (
              <button
                type="button"
                onClick={playNext}
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition active:scale-95"
                title="Next Track"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsLooping(!isLooping)}
              className={`p-1.5 rounded-lg transition ${
                isLooping ? 'bg-indigo-500/20 text-indigo-400 font-bold' : 'text-zinc-400 hover:text-white'
              }`}
              title={isLooping ? 'Looping enabled' : 'Loop'}
            >
              <Repeat className="w-4 h-4" />
            </button>

            {playlist.length > 1 && (
              <button
                type="button"
                onClick={() => setIsShuffle(!isShuffle)}
                className={`p-1.5 rounded-lg transition ${
                  isShuffle ? 'bg-indigo-500/20 text-indigo-400 font-bold' : 'text-zinc-400 hover:text-white'
                }`}
                title={isShuffle ? 'Shuffle enabled' : 'Shuffle'}
              >
                <Shuffle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleMute}
              className="p-1 rounded-lg hover:bg-white/10 text-zinc-300"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="w-14 sm:w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
