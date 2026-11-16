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
  X,
  Loader2,
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
  const [isLightbox, setIsLightbox] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Mutable refs to eliminate stale closure issues during high-frequency gesture updates
  const scaleRef = useRef<number>(1);
  const posRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  scaleRef.current = scale;
  posRef.current = position;

  // Gesture tracking refs
  const pinchStartDistRef = useRef<number>(0);
  const pinchStartScaleRef = useRef<number>(1);
  const pinchStartMidpointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapTimeRef = useRef<number>(0);
  const lastTapPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Mouse drag tracking
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
      const next = Math.min(prev * 1.35, 6);
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
      return Math.max(next, 0.6);
    });
  }, []);

  const zoomToFocalPoint = useCallback((clientX: number, clientY: number, targetScale: number) => {
    const container = containerRef.current;
    if (!container) return;

    if (targetScale <= 1.05) {
      resetZoom();
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
  }, [resetZoom]);

  // Touch Event Listeners (Native non-passive listeners with hardware-synced e.touches)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

        pinchStartDistRef.current = Math.max(dist, 10);
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

        // Double-tap zoom detection (< 320ms, < 30px)
        if (timeDiff > 40 && timeDiff < 320 && distDiff < 30) {
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

        if (scaleRef.current > 1.05) {
          e.preventDefault();
          dragStartPosRef.current = {
            x: t.clientX - posRef.current.x,
            y: t.clientY - posRef.current.y,
          };
          setIsInteracting(true);
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

        // Auto-initialize if finger 2 touched down during active move
        if (pinchStartDistRef.current <= 0) {
          pinchStartDistRef.current = Math.max(currentDist, 10);
          pinchStartScaleRef.current = scaleRef.current;
          pinchStartMidpointRef.current = {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2,
          };
          pinchStartPosRef.current = { ...posRef.current };
          return;
        }

        const currentMid = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };

        const scaleRatio = currentDist / pinchStartDistRef.current;
        const targetScale = Math.min(Math.max(pinchStartScaleRef.current * scaleRatio, 0.6), 6.0);

        const rect = container.getBoundingClientRect();
        const containerCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };

        const ratio = targetScale / pinchStartScaleRef.current;
        const dx = currentMid.x - pinchStartMidpointRef.current.x;
        const dy = currentMid.y - pinchStartMidpointRef.current.y;

        const newX =
          pinchStartPosRef.current.x * ratio +
          (currentMid.x - containerCenter.x) * (1 - ratio) +
          dx;
        const newY =
          pinchStartPosRef.current.y * ratio +
          (currentMid.y - containerCenter.y) * (1 - ratio) +
          dy;

        setScale(targetScale);
        scaleRef.current = targetScale;
        setPosition({ x: newX, y: newY });
        posRef.current = { x: newX, y: newY };
      } else if (e.touches.length === 1 && scaleRef.current > 1.05) {
        e.preventDefault();
        const t = e.touches[0];
        const newX = t.clientX - dragStartPosRef.current.x;
        const newY = t.clientY - dragStartPosRef.current.y;
        setPosition({ x: newX, y: newY });
        posRef.current = { x: newX, y: newY };
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        pinchStartDistRef.current = Math.max(Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY), 10);
        pinchStartScaleRef.current = scaleRef.current;
        pinchStartMidpointRef.current = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };
        pinchStartPosRef.current = { ...posRef.current };
      } else if (e.touches.length === 1) {
        // Smoothly transfer to single-finger drag without sudden displacement
        const remaining = e.touches[0];
        dragStartPosRef.current = {
          x: remaining.clientX - posRef.current.x,
          y: remaining.clientY - posRef.current.y,
        };
        pinchStartDistRef.current = 0;
      } else {
        setIsInteracting(false);
        pinchStartDistRef.current = 0;
        // Snap back to 1x if pinched out below 1.05x
        if (scaleRef.current < 1.05) {
          setScale(1);
          scaleRef.current = 1;
          setPosition({ x: 0, y: 0 });
          posRef.current = { x: 0, y: 0 };
        }
      }
    };

    // iOS Safari WebKit proprietary gestures
    const onGestureStart = (e: any) => {
      e.preventDefault();
      pinchStartScaleRef.current = scaleRef.current;
      setIsInteracting(true);
    };

    const onGestureChange = (e: any) => {
      e.preventDefault();
      const targetScale = Math.min(Math.max(pinchStartScaleRef.current * (e.scale || 1), 0.6), 6.0);
      setScale(targetScale);
      scaleRef.current = targetScale;
    };

    const onGestureEnd = (e: any) => {
      e.preventDefault();
      setIsInteracting(false);
      if (scaleRef.current < 1.05) {
        setScale(1);
        scaleRef.current = 1;
        setPosition({ x: 0, y: 0 });
        posRef.current = { x: 0, y: 0 };
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: false });
    container.addEventListener('touchcancel', onTouchEnd, { passive: false });

    container.addEventListener('gesturestart', onGestureStart as any, { passive: false });
    container.addEventListener('gesturechange', onGestureChange as any, { passive: false });
    container.addEventListener('gestureend', onGestureEnd as any, { passive: false });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);

      container.removeEventListener('gesturestart', onGestureStart as any);
      container.removeEventListener('gesturechange', onGestureChange as any);
      container.removeEventListener('gestureend', onGestureEnd as any);
    };
  }, [resetZoom, zoomToFocalPoint]);

  // Desktop Mouse Wheel & Mac Trackpad Pinch Zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      let nextScale: number;

      if (e.ctrlKey) {
        // Mac Trackpad two-finger pinch!
        const pinchDelta = -e.deltaY * 0.015;
        nextScale = Math.min(Math.max(scaleRef.current * (1 + pinchDelta), 0.6), 6.0);
      } else {
        // Regular mouse scroll wheel
        const factor = e.deltaY < 0 ? 1.15 : 0.88;
        nextScale = Math.min(Math.max(scaleRef.current * factor, 0.6), 6.0);
      }

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

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
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
    setIsLightbox((prev) => !prev);
    resetZoom();
  };

  // Close lightbox on Escape key
  useEffect(() => {
    if (!isLightbox) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLightbox(false);
        resetZoom();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLightbox, resetZoom]);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      style={{
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      className={
        isLightbox
          ? 'fixed inset-0 z-[9999] bg-black/95 backdrop-blur-2xl flex flex-col p-2 sm:p-4 select-none animate-in fade-in duration-200'
          : `relative w-full h-full flex items-center justify-center overflow-hidden select-none bg-zinc-950 rounded-2xl sm:rounded-3xl ${
              scale > 1.05 ? (isInteracting ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
            } ${containerClassName}`
      }
    >
      {/* Lightbox Header with File Title and Close Button */}
      {isLightbox && (
        <div className="flex items-center justify-between text-white px-3 py-2 z-30 shrink-0">
          <span className="text-sm font-semibold truncate max-w-[65vw]">{alt}</span>
          <button
            type="button"
            onClick={() => {
              setIsLightbox(false);
              resetZoom();
            }}
            className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 transition"
            title="Exit Fullscreen (Esc)"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      )}

      {/* Floating Auto-Fading Hint */}
      {showHint && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1 rounded-full bg-black/70 backdrop-blur-md text-white/90 text-[11px] font-medium flex items-center gap-1.5 pointer-events-none shadow-xl border border-white/10 animate-in fade-in zoom-in-95 duration-200">
          <Hand className="w-3.5 h-3.5 text-indigo-400" />
          <span>Pinch with 2 fingers or double-tap to zoom • Drag to pan</span>
        </div>
      )}

      {/* Loading Spinner */}
      {imageLoading && !imageError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 text-white/50 space-y-2">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
          <span className="text-xs">Loading image...</span>
        </div>
      )}

      {/* Error Fallback */}
      {imageError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 text-white/60 text-xs space-y-1">
          <span>Failed to load image preview</span>
        </div>
      )}

      {/* Main Image Stage */}
      <div
        className="flex-1 w-full h-full relative flex items-center justify-center overflow-hidden"
        onClick={() => {
          if (!isLightbox && scale <= 1.05) {
            toggleFullscreen();
          }
        }}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1})`,
            transition: isInteracting ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            willChange: 'transform',
          }}
          className="flex items-center justify-center w-full h-full pointer-events-none p-3 sm:p-5"
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            onLoad={() => setImageLoading(false)}
            onError={() => {
              setImageLoading(false);
              setImageError(true);
            }}
            className={`max-w-[92%] max-h-[88%] object-contain rounded-xl select-none shadow-2xl transition-opacity duration-300 ${
              imageLoading ? 'opacity-0' : 'opacity-100'
            } ${className}`}
          />
        </div>
      </div>

      {/* Glassmorphic Floating Controls Pill */}
      <div
        className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 sm:gap-1 px-2.5 py-1.5 rounded-full bg-zinc-900/85 backdrop-blur-xl border border-white/15 shadow-2xl text-white select-none max-w-[92vw] overflow-x-auto"
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
          disabled={scale >= 5.9}
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
          title={isLightbox ? 'Exit Fullscreen' : 'Fullscreen Lightbox'}
          className="p-1.5 sm:p-2 rounded-full hover:bg-white/15 active:scale-95 text-zinc-200 transition"
        >
          {isLightbox ? (
            <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
