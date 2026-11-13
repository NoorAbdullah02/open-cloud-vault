'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Hand,
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
        // Shift center toward click point
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
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1 && position.x === 0 && position.y === 0) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers for mobile pinch & drag
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      initialTouchDistRef.current = dist;
      initialTouchScaleRef.current = scale;
    } else if (e.touches.length === 1 && scale > 1) {
      // Drag
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialTouchDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const factor = dist / initialTouchDistRef.current;
      const next = Math.min(Math.max(initialTouchScaleRef.current * factor, 0.5), 5);
      setScale(next);
      if (next <= 1) setPosition({ x: 0, y: 0 });
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
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative w-full h-full min-h-[350px] overflow-hidden select-none flex items-center justify-center bg-zinc-950/90 rounded-2xl ${
        scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
      } ${containerClassName}`}
    >
      {/* Zoom / Pan Instruction Hint */}
      {showHint && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-3.5 py-1.5 rounded-full bg-black/75 backdrop-blur-md text-white text-[11px] font-medium shadow-lg transition-opacity duration-500 border border-white/10 flex items-center gap-1.5">
          <Hand className="w-3.5 h-3.5 text-sky-400" />
          <span>Double-click or pinch to zoom • Drag to pan</span>
        </div>
      )}

      {/* Main Image */}
      <div
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)',
        }}
        className="flex items-center justify-center max-w-full max-h-full pointer-events-none"
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={`max-w-full max-h-[75vh] object-contain rounded-xl select-none ${className}`}
        />
      </div>

      {/* Floating Zoom Toolbar */}
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
