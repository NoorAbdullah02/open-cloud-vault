'use client';

import { useEffect, useState } from 'react';
import {
  Loader2,
  Presentation,
  Download,
  ChevronLeft,
  ChevronRight,
  Globe,
  Layers,
  RefreshCw,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface SlideItem {
  number: number;
  title: string;
  points: string[];
  images: string[];
}

function cleanXmlText(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractParagraphs(xml: string): string[] {
  const result: string[] = [];
  // 1. Try paragraph blocks (<a:p>, <p>, etc.)
  const pBlocks = xml.split(/<\/?(?:[a-zA-Z0-9_-]+:)?p[ >]/i);
  for (const block of pBlocks) {
    const matches = [
      ...block.matchAll(/<(?:[a-zA-Z0-9_-]+:)?t[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?t>/gi),
    ];
    if (matches.length > 0) {
      const text = matches
        .map((m) => cleanXmlText(m[1]))
        .filter(Boolean)
        .join(' ')
        .trim();
      if (text) result.push(text);
    }
  }

  // 2. Fallback: if no paragraph blocks found, extract any text tags
  if (result.length === 0) {
    const allMatches = [
      ...xml.matchAll(/<(?:[a-zA-Z0-9_-]+:)?t[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?t>/gi),
    ];
    for (const m of allMatches) {
      const text = cleanXmlText(m[1]);
      if (text) result.push(text);
    }
  }

  return result;
}

export default function PptxViewer({
  url,
  fileName,
  fileId,
  accessToken,
  onDownloadOriginal,
}: {
  url: string;
  fileName?: string;
  fileId?: string;
  accessToken?: string;
  onDownloadOriginal?: () => void;
}) {
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'deck' | 'google'>('deck');
  const [loading, setLoading] = useState(true);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleError, setGoogleError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google Docs Viewer URL (optional fallback)
  const googleViewerUrl = (() => {
    if (typeof window === 'undefined') return null;
    const origin = window.location.origin;
    const streamUrl =
      fileId && accessToken
        ? `${origin}/api/drive/files/${fileId}/download?inline=true&token=${encodeURIComponent(accessToken)}`
        : url;
    return `https://docs.google.com/viewer?url=${encodeURIComponent(streamUrl)}&embedded=true`;
  })();

  // Parse slides locally from blob
  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    async function loadPptx() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load presentation file');
        const buf = await res.arrayBuffer();

        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(buf);

        const slideEntries = Object.keys(zip.files)
          .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
          .map((name) => {
            const num = parseInt(name.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
            return { name, num };
          })
          .sort((a, b) => a.num - b.num);

        const parsedSlides: SlideItem[] = [];

        for (const s of slideEntries) {
          const xml = await zip.files[s.name].async('string');
          const lines = extractParagraphs(xml);

          // Extract slide images
          const relsPath = `ppt/slides/_rels/slide${s.num}.xml.rels`;
          const slideImages: string[] = [];

          if (zip.file(relsPath)) {
            try {
              const relsXml = await zip.files[relsPath].async('string');
              const relMatches = [
                ...relsXml.matchAll(/Target="(?:\.\.\/)?media\/([^"]+)"/gi),
              ];
              for (const rm of relMatches) {
                const mediaName = rm[1];
                const mediaZip =
                  zip.file(`ppt/media/${mediaName}`) ||
                  zip.file(mediaName);
                if (mediaZip) {
                  const blob = await mediaZip.async('blob');
                  const imgUrl = URL.createObjectURL(blob);
                  objectUrls.push(imgUrl);
                  slideImages.push(imgUrl);
                }
              }
            } catch {}
          }

          const title = lines.length > 0 ? lines[0] : `Slide ${s.num}`;
          const points = lines.length > 1 ? lines.slice(1) : [];

          parsedSlides.push({ number: s.num, title, points, images: slideImages });
        }

        if (!cancelled) {
          setSlides(parsedSlides);
          setCurrentSlideIndex(0);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not parse PowerPoint presentation');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPptx();

    return () => {
      cancelled = true;
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [url]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (viewMode !== 'deck') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
        setCurrentSlideIndex((i) => Math.min(slides.length - 1, i + 1));
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
        setCurrentSlideIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [viewMode, slides.length]);

  const slide = slides[currentSlideIndex];

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-orange-500/20 text-orange-400">
            <Presentation className="w-4 h-4" />
          </div>
          <span className="text-white text-xs font-semibold truncate max-w-[180px] sm:max-w-xs">
            {fileName || 'Presentation'}
          </span>
          {slides.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] uppercase font-bold font-mono">
              {slides.length} {slides.length === 1 ? 'Slide' : 'Slides'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Toggle */}
          <div className="flex items-center bg-white/10 rounded-xl p-0.5 text-xs">
            <button
              onClick={() => setViewMode('deck')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition text-xs font-semibold ${
                viewMode === 'deck'
                  ? 'bg-orange-500 text-white shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Slide Deck</span>
            </button>
            <button
              onClick={() => {
                setViewMode('google');
                setGoogleLoading(true);
                setGoogleError(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition text-xs font-semibold ${
                viewMode === 'google'
                  ? 'bg-orange-500 text-white shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Google View</span>
            </button>
          </div>

          {onDownloadOriginal && (
            <button
              onClick={onDownloadOriginal}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition text-xs flex items-center gap-1.5"
              title="Download PPTX file"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
          )}
        </div>
      </div>

      {/* Slide Deck Mode (Default & Fast) */}
      {viewMode === 'deck' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
              <p className="text-slate-300 text-sm font-medium">Opening Presentation Slides...</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="max-w-sm text-center space-y-4">
                <AlertCircle className="w-10 h-10 text-orange-400 mx-auto" />
                <p className="text-white font-semibold">Presentation Preview Notice</p>
                <p className="text-slate-400 text-xs">{error}</p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => setViewMode('google')}
                    className="px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-semibold"
                  >
                    Try Google View
                  </button>
                  {onDownloadOriginal && (
                    <button
                      onClick={onDownloadOriginal}
                      className="px-4 py-2 rounded-xl bg-white/10 text-white text-xs font-semibold"
                    >
                      Download PPTX
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {!loading && !error && slides.length > 0 && slide && (
            <>
              {/* Main Slide Card Area */}
              <div className="flex-1 overflow-y-auto flex items-start justify-center p-4 sm:p-8">
                <div className="w-full max-w-3xl">
                  <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl shadow-2xl border border-white/10 overflow-hidden min-h-[340px] sm:min-h-[440px] p-6 sm:p-10 flex flex-col">
                    {/* Header badge */}
                    <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
                      <span className="px-3 py-1 rounded-full bg-orange-500/20 text-orange-300 text-xs font-bold uppercase tracking-wider border border-orange-500/30">
                        Slide {slide.number} of {slides.length}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">16:9 Presentation</span>
                    </div>

                    {/* Title */}
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white leading-tight mb-6">
                      {slide.title}
                    </h2>

                    {/* Content: Points + Diagrams */}
                    <div
                      className={`flex-1 grid gap-5 ${
                        slide.images.length > 0 ? 'grid-cols-1 md:grid-cols-5' : 'grid-cols-1'
                      }`}
                    >
                      {/* Bullet points */}
                      {slide.points.length > 0 && (
                        <div
                          className={`space-y-3 ${
                            slide.images.length > 0 ? 'md:col-span-3' : ''
                          }`}
                        >
                          {slide.points.map((pt, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/8 hover:bg-white/10 transition"
                            >
                              <span className="w-2 h-2 rounded-full bg-orange-400 mt-2 shrink-0" />
                              <p className="text-sm text-slate-200 leading-relaxed font-medium">
                                {pt}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Embedded Slide Images */}
                      {slide.images.length > 0 && (
                        <div className="md:col-span-2 flex flex-col gap-3">
                          {slide.images.map((imgSrc, i) => (
                            <div
                              key={i}
                              className="rounded-2xl overflow-hidden border border-white/10 bg-slate-800/80 p-2 shadow-inner"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={imgSrc}
                                alt={`Slide ${slide.number} diagram ${i + 1}`}
                                className="w-full object-contain max-h-60 rounded-xl"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {slide.points.length === 0 && slide.images.length === 0 && (
                        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm py-12">
                          <span>Slide visual content (shapes/tables)</span>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-bold tracking-wider uppercase text-orange-400/80">
                        NOOR DRIVE
                      </span>
                      <span>Use ← → Arrow keys to navigate slides</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation Bar */}
              <div className="shrink-0 flex items-center justify-center gap-4 py-3 px-4 bg-slate-900/90 border-t border-white/10">
                <button
                  onClick={() => setCurrentSlideIndex((i) => Math.max(0, i - 1))}
                  disabled={currentSlideIndex === 0}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 transition text-white"
                  title="Previous Slide (←)"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-1.5 max-w-[240px] overflow-x-auto py-1">
                  {slides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentSlideIndex(i)}
                      className={`shrink-0 rounded-full transition-all ${
                        i === currentSlideIndex
                          ? 'w-6 h-2 bg-orange-400'
                          : 'w-2 h-2 bg-white/30 hover:bg-white/60'
                      }`}
                      title={`Go to slide ${i + 1}`}
                    />
                  ))}
                </div>

                <button
                  onClick={() =>
                    setCurrentSlideIndex((i) => Math.min(slides.length - 1, i + 1))
                  }
                  disabled={currentSlideIndex === slides.length - 1}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 transition text-white"
                  title="Next Slide (→)"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </>
          )}

          {!loading && !error && slides.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <Presentation className="w-12 h-12 text-orange-400/50" />
              <p className="text-white font-semibold">No slides extracted</p>
              <button
                onClick={() => setViewMode('google')}
                className="px-5 py-2.5 rounded-xl bg-orange-500 text-white text-xs font-semibold"
              >
                Try Google View
              </button>
            </div>
          )}
        </div>
      )}

      {/* Google Docs Viewer Mode (Optional Alternative) */}
      {viewMode === 'google' && (
        <div className="flex-1 relative overflow-hidden bg-slate-950">
          {googleLoading && !googleError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
              <p className="text-slate-300 text-sm">Connecting to Google Docs Viewer…</p>
            </div>
          )}
          {googleError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-4 p-6">
              <AlertCircle className="w-10 h-10 text-orange-400" />
              <p className="text-white font-semibold">Google Viewer could not load</p>
              <button
                onClick={() => setViewMode('deck')}
                className="px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-semibold"
              >
                Back to Slide Deck
              </button>
            </div>
          )}
          {googleViewerUrl && (
            <iframe
              src={googleViewerUrl}
              className={`w-full h-full border-none ${googleError ? 'hidden' : 'block'}`}
              onLoad={() => {
                setGoogleLoading(false);
                setGoogleError(false);
              }}
              onError={() => {
                setGoogleLoading(false);
                setGoogleError(true);
              }}
              title="PowerPoint Preview"
            />
          )}
        </div>
      )}
    </div>
  );
}
