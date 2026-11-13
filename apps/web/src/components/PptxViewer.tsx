'use client';

import { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';

interface SlideItem {
  number: number;
  title: string;
  points: string[];
  images: string[];
}

function extractParagraphs(xml: string): string[] {
  const pBlocks = xml.split(/<\/?(?:[a-zA-Z0-9]+:)?p[ >]/i);
  const result: string[] = [];
  for (const block of pBlocks) {
    const matches = [
      ...block.matchAll(/<(?:[a-zA-Z0-9]+:)?t[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?t>/gi),
    ];
    if (matches.length > 0) {
      const text = matches
        .map((m) =>
          m[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'"),
        )
        .join('')
        .trim();
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
  const [viewMode, setViewMode] = useState<'google' | 'deck'>('google');
  const [loading, setLoading] = useState(true);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleError, setGoogleError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleRefreshKey, setGoogleRefreshKey] = useState(0);

  // Build Google Docs Viewer URL
  const googleViewerUrl = (() => {
    if (typeof window === 'undefined') return null;
    const origin = window.location.origin;
    // Pass access token as query param (backend supports fromUrlQueryParameter)
    const streamUrl = fileId && accessToken
      ? `${origin}/api/drive/files/${fileId}/download?inline=true&token=${encodeURIComponent(accessToken)}`
      : url;
    return `https://docs.google.com/viewer?url=${encodeURIComponent(streamUrl)}&embedded=true`;
  })();

  // Parse PPTX for text deck fallback
  useEffect(() => {
    if (viewMode !== 'deck') return;
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
                const mediaZip = zip.file(`ppt/media/${mediaName}`);
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

    if (slides.length === 0) loadPptx();
    else setLoading(false);

    return () => {
      cancelled = true;
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [viewMode, url]);

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
      {/* Minimal top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-orange-500/20">
            <Presentation className="w-4 h-4 text-orange-400" />
          </div>
          <span className="text-white text-xs font-semibold truncate max-w-[180px] sm:max-w-xs">
            {fileName || 'Presentation'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center bg-white/10 rounded-xl p-0.5 text-xs">
            <button
              onClick={() => { setViewMode('google'); setGoogleLoading(true); setGoogleError(false); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition text-xs font-semibold ${
                viewMode === 'google' ? 'bg-orange-500 text-white shadow' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Google View</span>
            </button>
            <button
              onClick={() => setViewMode('deck')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition text-xs font-semibold ${
                viewMode === 'deck' ? 'bg-orange-500 text-white shadow' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Slide Deck</span>
            </button>
          </div>

          {onDownloadOriginal && (
            <button
              onClick={onDownloadOriginal}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
              title="Download PPTX"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Google Docs Viewer Mode */}
      {viewMode === 'google' && (
        <div className="flex-1 relative overflow-hidden">
          {googleLoading && !googleError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
              <p className="text-slate-300 text-sm">Loading presentation viewer…</p>
              <p className="text-slate-500 text-xs">Google Docs Viewer is rendering your slides</p>
            </div>
          )}
          {googleError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-4 p-6">
              <div className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/30">
                <AlertCircle className="w-10 h-10 text-orange-400 mx-auto" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-white font-semibold">Google Viewer unavailable</p>
                <p className="text-slate-400 text-xs max-w-xs">
                  Google Docs Viewer couldn't load. Try the Slide Deck view, or download the file.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setGoogleError(false); setGoogleLoading(true); setGoogleRefreshKey(k => k + 1); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
                <button
                  onClick={() => setViewMode('deck')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
                >
                  <Layers className="w-3.5 h-3.5" /> Slide Deck View
                </button>
              </div>
            </div>
          )}
          {googleViewerUrl && (
            <iframe
              key={googleRefreshKey}
              src={googleViewerUrl}
              className={`w-full h-full border-none ${googleError ? 'hidden' : 'block'}`}
              onLoad={() => { setGoogleLoading(false); setGoogleError(false); }}
              onError={() => { setGoogleLoading(false); setGoogleError(true); }}
              title="PowerPoint Preview"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          )}
        </div>
      )}

      {/* Slide Deck Mode */}
      {viewMode === 'deck' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Loading */}
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
              <p className="text-slate-300 text-sm">Parsing slides…</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="max-w-sm text-center space-y-3">
                <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
                <p className="text-white font-semibold">Could not parse slides</p>
                <p className="text-slate-400 text-xs">{error}</p>
                <button
                  onClick={() => setViewMode('google')}
                  className="px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-semibold"
                >Try Google View</button>
              </div>
            </div>
          )}

          {/* Slide Content */}
          {!loading && !error && slides.length > 0 && slide && (
            <>
              {/* Main Slide Area */}
              <div className="flex-1 overflow-y-auto flex items-start justify-center p-4 sm:p-8">
                <div className="w-full max-w-3xl">
                  {/* Slide Card */}
                  <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-white/10 overflow-hidden min-h-[300px] sm:min-h-[400px] p-6 sm:p-10 flex flex-col">
                    {/* Slide number badge */}
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-300 text-[10px] font-bold uppercase tracking-wider border border-orange-500/30">
                        Slide {slide.number} / {slides.length}
                      </span>
                    </div>

                    {/* Title */}
                    <h2 className="text-xl sm:text-3xl font-bold text-white leading-tight mb-6 pr-20">
                      {slide.title}
                    </h2>

                    {/* Content grid: text + images */}
                    <div className={`flex-1 grid gap-5 ${slide.images.length > 0 ? 'grid-cols-1 md:grid-cols-5' : 'grid-cols-1'}`}>
                      {/* Bullet points */}
                      {slide.points.length > 0 && (
                        <div className={`space-y-2.5 ${slide.images.length > 0 ? 'md:col-span-3' : ''}`}>
                          {slide.points.map((pt, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/8">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 shrink-0" />
                              <p className="text-sm text-slate-200 leading-relaxed">{pt}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Images */}
                      {slide.images.length > 0 && (
                        <div className="md:col-span-2 flex flex-col gap-3">
                          {slide.images.map((imgSrc, i) => (
                            <div key={i} className="rounded-xl overflow-hidden border border-white/10 bg-slate-700/40">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={imgSrc}
                                alt={`Slide ${slide.number} image ${i + 1}`}
                                className="w-full object-contain max-h-56"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Empty slide */}
                      {slide.points.length === 0 && slide.images.length === 0 && (
                        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                          <span>Slide contains only design elements (shapes/graphics)</span>
                        </div>
                      )}
                    </div>

                    {/* Slide footer */}
                    <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-500">
                      <span className="font-semibold tracking-wider uppercase text-orange-400/70">NOOR DRIVE</span>
                      <span>Use ← → keys to navigate</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation bar */}
              <div className="shrink-0 flex items-center justify-center gap-4 py-3 px-4 bg-slate-900/60 border-t border-white/10">
                <button
                  onClick={() => setCurrentSlideIndex((i) => Math.max(0, i - 1))}
                  disabled={currentSlideIndex === 0}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 transition text-white"
                  title="Previous (←)"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                {/* Slide dots */}
                <div className="flex items-center gap-1.5 max-w-[200px] overflow-x-auto">
                  {slides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentSlideIndex(i)}
                      className={`shrink-0 rounded-full transition-all ${
                        i === currentSlideIndex
                          ? 'w-6 h-2 bg-orange-400'
                          : 'w-2 h-2 bg-white/30 hover:bg-white/60'
                      }`}
                    />
                  ))}
                </div>

                <button
                  onClick={() => setCurrentSlideIndex((i) => Math.min(slides.length - 1, i + 1))}
                  disabled={currentSlideIndex === slides.length - 1}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 transition text-white"
                  title="Next (→)"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </>
          )}

          {/* No slides parsed */}
          {!loading && !error && slides.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <Presentation className="w-12 h-12 text-orange-400/50" />
              <div>
                <p className="text-white font-semibold">No slide text found</p>
                <p className="text-slate-400 text-xs mt-1">This presentation may use image-only slides.</p>
              </div>
              <button
                onClick={() => setViewMode('google')}
                className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold transition"
              >
                Try Google View instead
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
