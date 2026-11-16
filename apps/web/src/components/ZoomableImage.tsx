'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Maximize2,
  Minimize2,
  Hand,
  FlipHorizontal,
} from 'lucide-react';

interface ZoomableImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
}

export default function ZoomableImage({
  src,
  alt,
  className = '',
  containerClassName = '',
}: ZoomableImageProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHint, setShowHint] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);

  // Mutable refs for high-frequency gesture calculations (prevents stale closures)
  const scaleRef = useRef<number>(1);
  const posRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  scaleRef.current = scale;
  posRef.current = position;

  // Touch tracking refs
  const pinchStartDistRef = useRef<number>(0);
  const pinchStartScaleRef = useRef<number>(1);
  const pinchStartMidpointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapTimeRef = useRef<number>(0);
  const lastTapPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Mouse drag tracking refs
  const isMouseDownRef = useRef<boolean>(false);
  const mouseDragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Auto fade-out hint banner after 2.5s
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
    scaleRef.current = 1;
    setPosition({ x: 0, y: 0 });
    posRef.current = { x: 0, y: 0 };
    setRotation(0);
    setFlipH(false);
  }, []);

  const rotateCw = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const toggleFlip = useCallback(() => {
    setFlipH((prev) => !prev);
  }, []);

  const zoomIn = useCallback(() => {
    setScale((prev) => {
      const next = Math.min(prev * 1.35, 5);
      scaleRef.current = next;
      return next;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => {
      const next = prev / 1.35;
      if (next <= 1.05) {
        setPosition({ x: 0, y: 0 });
        posRef.current = { x: 0, y: 0 };
        scaleRef.current = 1;
        return 1;
      }
      scaleRef.current = next;
      return Math.max(next, 0.7);
    });
  }, []);

  const zoomToFocalPoint = useCallback((clientX: number, clientY: number, targetScale: number) => {
    const container = containerRef.current;
    if (!container) return;

    if (targetScale <= 1.05) {
      setScale(1);
      scaleRef.current = 1;
      setPosition({ x: 0, y: 0 });
      posRef.current = { x: 0, y: 0 };
      return;
    }

    const rect = container.getBoundingClientRect();
    const offsetX = clientX - (rect.left + rect.width / 2);
    const offsetY = clientY - (rect.top + rect.height / 2);

    const newX = -offsetX * (targetScale - 1);
    const newY = -offsetY * (targetScale - 1);

    setScale(targetScale);
    scaleRef.current = targetScale;
    setPosition({ x: newX, y: newY });
    posRef.current = { x: newX, y: newY };
  }, []);

  // Native Non-Passive Multi-Touch Listeners (Pinch-to-zoom, Double-tap, 1-finger pan)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Two fingers detected -> initialize pinch zoom
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        pinchStartDistRef.current = Math.max(dist, 1);
        pinchStartScaleRef.current = scaleRef.current;
        pinchStartMidpointRef.current = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };
        pinchStartPosRef.current = { ...posRef.current };
        setIsInteracting(true);
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        const now = Date.now();
        const timeDiff = now - lastTapTimeRef.current;
        const distDiff = Math.hypot(t.clientX - lastTapPosRef.current.x, t.clientY - lastTapPosRef.current.y);

        // Double tap detection (< 320ms, < 28px)
        if (timeDiff > 40 && timeDiff < 320 && distDiff < 28) {
          e.preventDefault();
          lastTapTimeRef.current = 0;
          if (scaleRef.current > 1.15) {
            resetZoom();
          } else {
            zoomToFocalPoint(t.clientX, t.clientY, 2.5);
          }
          return;
        }

        lastTapTimeRef.current = now;
        lastTapPosRef.current = { x: t.clientX, y: t.clientY };

        // If already zoomed in, single touch initiates panning
        if (scaleRef.current > 1.05) {
          e.preventDefault();
          touchStartPosRef.current = {
            x: t.clientX - posRef.current.x,
            y: t.clientY - posRef.current.y,
          };
          setIsInteracting(true);
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDistRef.current > 0) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const ratio = currentDist / pinchStartDistRef.current;
        const newScale = Math.min(Math.max(pinchStartScaleRef.current * ratio, 0.7), 5.0);

        const currentMid = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };

        const rect = container.getBoundingClientRect();
        const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

        const factor = newScale / pinchStartScaleRef.current;
        const newX =
          currentMid.x -
          center.x -
          (pinchStartMidpointRef.current.x - center.x - pinchStartPosRef.current.x) * factor;
        const newY =
          currentMid.y -
          center.y -
          (pinchStartMidpointRef.current.y - center.y - pinchStartPosRef.current.y) * factor;

        setScale(newScale);
        scaleRef.current = newScale;
        setPosition({ x: newX, y: newY });
        posRef.current = { x: newX, y: newY };
      } else if (e.touches.length === 1 && scaleRef.current > 1.05) {
        e.preventDefault();
        const t = e.touches[0];
        const newX = t.clientX - touchStartPosRef.current.x;
        const newY = t.clientY - touchStartPosRef.current.y;
        setPosition({ x: newX, y: newY });
        posRef.current = { x: newX, y: newY };
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStartDistRef.current = 0;
      }
      if (e.touches.length === 0) {
        setIsInteracting(false);
        // Snap back if scaled below 1.05x
        if (scaleRef.current < 1.05) {
          setScale(1);
          scaleRef.current = 1;
          setPosition({ x: 0, y: 0 });
          posRef.current = { x: 0, y: 0 };
        }
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [resetZoom, zoomToFocalPoint]);

  // Desktop Mouse Wheel Zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.88;
      const nextScale = Math.min(Math.max(scaleRef.current * factor, 0.75), 5.0);

      if (nextScale <= 1.02) {
        setScale(1);
        scaleRef.current = 1;
        setPosition({ x: 0, y: 0 });
        posRef.current = { x: 0, y: 0 };
      } else {
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - (rect.left + rect.width / 2);
        const mouseY = e.clientY - (rect.top + rect.height / 2);
        const scaleChange = nextScale / scaleRef.current;
        const nextX = mouseX - (mouseX - posRef.current.x) * scaleChange;
        const nextY = mouseY - (mouseY - posRef.current.y) * scaleChange;

        setScale(nextScale);
        scaleRef.current = nextScale;
        setPosition({ x: nextX, y: nextY });
        posRef.current = { x: nextX, y: nextY };
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Desktop Mouse Drag Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (scaleRef.current <= 1.02) return;
    isMouseDownRef.current = true;
    setIsInteracting(true);
    mouseDragStartRef.current = {
      x: e.clientX - posRef.current.x,
      y: e.clientY - posRef.current.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMouseDownRef.current) return;
    const nextX = e.clientX - mouseDragStartRef.current.x;
    const nextY = e.clientY - mouseDragStartRef.current.y;
    setPosition({ x: nextX, y: nextY });
    posRef.current = { x: nextX, y: nextY };
  };

  const handleMouseUp = () => {
    isMouseDownRef.current = false;
    setIsInteracting(false);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (scaleRef.current > 1.15) {
      resetZoom();
    } else {
      zoomToFocalPoint(e.clientX, e.clientY, 2.5);
    }
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      style={{
        touchAction: scale > 1.05 ? 'none' : 'pan-y pinch-zoom',
      }}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden select-none bg-zinc-950/90 rounded-2xl sm:rounded-3xl ${
        scale > 1.05 ? (isInteracting ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
      } ${containerClassName}`}
    >
      {/* Floating Subtle Hint (auto fades out) */}
      {showHint && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1 rounded-full bg-black/65 backdrop-blur-md text-white/85 text-[11px] font-medium flex items-center gap-1.5 pointer-events-none shadow-lg border border-white/10 animate-in fade-in zoom-in-95 duration-200">
          <Hand className="w-3.5 h-3.5 text-indigo-400" />
          <span>Pinch with 2 fingers or double-tap to zoom • Drag to pan</span>
        </div>
      )}

      {/* Main Image Frame */}
      <div
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1})`,
          transition: isInteracting ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'transform',
        }}
        className="flex items-center justify-center w-full h-full pointer-events-none p-2 sm:p-4"
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={`max-w-[94%] max-h-[90%] object-contain rounded-xl select-none shadow-2xl transition-opacity duration-300 ${className}`}
        />
      </div>

      {/* Modern Translucent Floating Controls Pill */}
      <div
        className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 sm:gap-1 px-2 py-1.5 rounded-full bg-zinc-900/80 backdrop-blur-xl border border-white/15 shadow-2xl text-white select-none max-w-[92vw] overflow-x-auto"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={zoomOut}
          disabled={scale <= 0.75}
          title="Zoom Out (-)"
          className="p-1.5 sm:p-2 rounded-full hover:bg-white/15 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition"
        >
          <ZoomOut className="w-4 h-4 text-zinc-200" />
        </button>

        <button
          type="button"
          onClick={resetZoom}
          title="Reset to 100%"
          className="px-2 py-1 text-[11px] sm:text-xs font-bold text-zinc-200 hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition min-w-[46px] text-center"
        >
          {Math.round(scale * 100)}%
        </button>

        <button
          type="button"
          onClick={zoomIn}
          disabled={scale >= 4.9}
          title="Zoom In (+)"
          className="p-1.5 sm:p-2 rounded-full hover:bg-white/15 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition"
        >
          <ZoomIn className="w-4 h-4 text-zinc-200" />
        </button>

        <div className="w-px h-3.5 bg-white/20 mx-0.5" />

        <button
          type="button"
          onClick={rotateCw}
          title="Rotate 90° Clockwise"
          className="p-1.5 sm:p-2 rounded-full hover:bg-white/15 active:scale-95 text-zinc-200 transition"
        >
          <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        <button
          type="button"
          onClick={toggleFlip}
          title="Flip Horizontal"
          className={`p-1.5 sm:p-2 rounded-full hover:bg-white/15 active:scale-95 transition ${
            flipH ? 'text-indigo-400 bg-white/15' : 'text-zinc-200'
          }`}
        >
          <FlipHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        <button
          type="button"
          onClick={resetZoom}
          title="Reset View"
          className="p-1.5 sm:p-2 rounded-full hover:bg-white/15 active:scale-95 text-zinc-200 transition"
        >
          <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Lightbox'}
          className="p-1.5 sm:p-2 rounded-full hover:bg-white/15 active:scale-95 text-zinc-200 transition"
        >
          {isFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
