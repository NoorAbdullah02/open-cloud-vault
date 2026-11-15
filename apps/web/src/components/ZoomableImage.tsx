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
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHint, setShowHint] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const initialTouchDistRef = useRef<number | null>(null);
  const initialTouchScaleRef = useRef<number>(1);

  // Fade out hint after 3.5 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 3500);
    return () => clearTimeout(timer);
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
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
    setScale((prev) => Math.min(prev * 1.35, 5));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => {
      const next = prev / 1.35;
      if (next <= 1.05) {
        setPosition({ x: 0, y: 0 });
        return 1;
      }
      return Math.max(next, 0.5);
    });
  }, []);

  // Double click handler: Toggle between 1x and 2.5x centered on click
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (scale > 1.1) {
      resetZoom();
    } else {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const offsetX = e.clientX - rect.left - rect.width / 2;
        const offsetY = e.clientY - rect.top - rect.height / 2;
        setPosition({
          x: -offsetX * 1.2,
          y: -offsetY * 1.2,
        });
      }
      setScale(2.5);
    }
  };

  // Mouse wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      setScale((prev) => {
        const next = Math.min(Math.max(prev * zoomFactor, 0.5), 5);
        if (next <= 1) {
          setPosition({ x: 0, y: 0 });
        }
        return next;
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (scale <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch gesture support: Pinch-to-zoom & two-finger drag
  const getTouchDistance = (e: React.TouchEvent): number | null => {
    if (e.touches.length < 2) return null;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dist = getTouchDistance(e);
      if (dist) {
        initialTouchDistRef.current = dist;
        initialTouchScaleRef.current = scale;
      }
    } else if (e.touches.length === 1 && scale > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && initialTouchDistRef.current) {
      const dist = getTouchDistance(e);
      if (dist) {
        const factor = dist / initialTouchDistRef.current;
        const newScale = Math.min(Math.max(initialTouchScaleRef.current * factor, 0.5), 5);
        setScale(newScale);
      }
    } else if (e.touches.length === 1 && isDragging) {
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    }
  };

  const handleTouchEnd = () => {
    initialTouchDistRef.current = null;
    setIsDragging(false);
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden select-none ${
        scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
      } ${containerClassName}`}
    >
      {/* Floating Hint */}
      {showHint && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 rounded-full bg-black/75 backdrop-blur-md text-white/90 text-xs font-medium flex items-center gap-2 pointer-events-none animate-in fade-in zoom-in-95 duration-200 shadow-xl border border-white/10">
          <Hand className="w-3.5 h-3.5 text-indigo-400" />
          <span>Double-click to zoom • Scroll / Pinch • Drag to pan</span>
        </div>
      )}

      {/* Main Image */}
      <div
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1})`,
          transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)',
        }}
        className="flex items-center justify-center max-w-full max-h-full pointer-events-none"
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={`max-w-full max-h-[75vh] object-contain rounded-xl select-none shadow-2xl ${className}`}
        />
      </div>

      {/* Floating Zoom & Transformation Toolbar */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 p-1.5 rounded-2xl bg-zinc-900/90 backdrop-blur-md border border-white/10 shadow-2xl text-white"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={zoomOut}
          disabled={scale <= 0.6}
          title="Zoom Out (-)"
          className="p-2 rounded-xl hover:bg-white/15 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition"
        >
          <ZoomOut className="w-4 h-4 text-zinc-200" />
        </button>

        <button
          type="button"
          onClick={resetZoom}
          title="Click to reset zoom (100%)"
          className="px-2.5 py-1 text-xs font-bold text-zinc-200 hover:text-white rounded-lg hover:bg-white/10 active:scale-95 transition min-w-[54px] text-center"
        >
          {Math.round(scale * 100)}%
        </button>

        <button
          type="button"
          onClick={zoomIn}
          disabled={scale >= 4.9}
          title="Zoom In (+)"
          className="p-2 rounded-xl hover:bg-white/15 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition"
        >
          <ZoomIn className="w-4 h-4 text-zinc-200" />
        </button>

        <div className="w-px h-4 bg-white/15 mx-0.5" />

        <button
          type="button"
          onClick={rotateCw}
          title="Rotate 90° Clockwise"
          className="p-2 rounded-xl hover:bg-white/15 active:scale-95 text-zinc-200 transition"
        >
          <RotateCw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={toggleFlip}
          title="Flip Horizontal"
          className={`p-2 rounded-xl hover:bg-white/15 active:scale-95 transition ${flipH ? 'text-indigo-400 bg-white/10' : 'text-zinc-200'}`}
        >
          <FlipHorizontal className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={resetZoom}
          title="Reset View"
          className="p-2 rounded-xl hover:bg-white/15 active:scale-95 text-zinc-200 transition"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          className="p-2 rounded-xl hover:bg-white/15 active:scale-95 text-zinc-200 transition"
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
