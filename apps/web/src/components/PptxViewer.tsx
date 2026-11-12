'use client';

import { useEffect, useState } from 'react';
import {
  Loader2,
  Presentation,
  Download,
  ChevronLeft,
  ChevronRight,
  FileText,
  Printer,
  Sparkles,
  Maximize2,
  Image as ImageIcon,
  Sun,
  Moon,
  Globe,
  Monitor,
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
  const [viewMode, setViewMode] = useState<'deck' | 'scroll' | 'google'>('deck');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Compute public/token stream URL for Google Docs Viewer
  const googleViewerUrl = (() => {
    if (typeof window === 'undefined' || !fileId || !accessToken) return null;
    const origin = window.location.origin;
    // URL with token query param supported by backend
    const streamUrl = `${origin}/api/drive/files/${fileId}/download?inline=true&token=${accessToken}`;
    return `https://docs.google.com/viewer?url=${encodeURIComponent(streamUrl)}&embedded=true`;
  })();

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

          // Extract slide embedded diagram images
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

          parsedSlides.push({
            number: s.num,
            title,
            points,
            images: slideImages,
          });
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

  useEffect(() => {
    if (viewMode !== 'deck') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        setCurrentSlideIndex((idx) => Math.min(slides.length - 1, idx + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setCurrentSlideIndex((idx) => Math.max(0, idx - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slides.length, viewMode]);

  const handleExportPdf = async () => {
    if (slides.length === 0) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: [842, 474],
      });

      for (let idx = 0; idx < slides.length; idx++) {
        const slide = slides[idx];
        if (idx > 0) pdf.addPage([842, 474], 'landscape');

        // Clean modern slide background
        pdf.setFillColor(15, 23, 42); // slate-900
        pdf.rect(0, 0, 842, 474, 'F');

        // Top accent orange header bar
        pdf.setFillColor(249, 115, 22); // orange-500
        pdf.rect(40, 32, 100, 4, 'F');

        // Slide number
        pdf.setFontSize(10);
        pdf.setTextColor(249, 115, 22);
        pdf.text(`SLIDE ${slide.number} OF ${slides.length}`, 40, 52);

        // Slide Title
        pdf.setFontSize(20);
        pdf.setTextColor(255, 255, 255);
        const splitTitle = pdf.splitTextToSize(slide.title, 760);
        pdf.text(splitTitle, 40, 85);

        // Bullet points
        pdf.setFontSize(12);
        pdf.setTextColor(226, 232, 240);
        let y = 130;
        for (const point of slide.points) {
          if (y > 420) break;
          const wrapped = pdf.splitTextToSize(`•  ${point}`, 740);
          pdf.text(wrapped, 40, y);
          y += wrapped.length * 18 + 6;
        }

        // Slide Footer brand
        pdf.setFontSize(9);
        pdf.setTextColor(148, 163, 184);
        pdf.text('NOOR DRIVE Cloud Presentation', 40, 455);
        pdf.text(`Page ${idx + 1} of ${slides.length}`, 750, 455);
      }

      const base = (fileName || 'presentation').replace(/\.[^/.]+$/, '');
      pdf.save(`${base}.pdf`);
    } catch (err) {
      console.error('[PptxViewer] Export PDF error:', err);
    } finally {
      setExportingPdf(false);
    }
  };

  const currentSlide = slides[currentSlideIndex];

  return (
    <div className="w-full max-w-5xl h-[85dvh] flex flex-col bg-slate-950 rounded-3xl border border-white/10 shadow-2xl overflow-hidden backdrop-blur-md">
      {/* Top Header Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-white/10 text-white shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <div className="p-1.5 rounded-lg bg-orange-500/20 text-orange-400">
            <Presentation className="w-4 h-4" />
          </div>
          <span className="truncate max-w-[160px] sm:max-w-xs">{fileName || 'Presentation'}</span>
          {slides.length > 0 && viewMode !== 'google' && (
            <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] uppercase font-bold">
              {viewMode === 'deck'
                ? `Slide ${currentSlideIndex + 1} / ${slides.length}`
                : `${slides.length} Slides`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center bg-white/10 rounded-xl p-0.5 text-xs">
            {googleViewerUrl && (
              <button
                onClick={() => setViewMode('google')}
                className={`px-2.5 py-1 rounded-lg transition font-medium flex items-center gap-1 ${
                  viewMode === 'google'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Google Slides HD Cloud Viewer"
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Google HD</span>
              </button>
            )}
            <button
              onClick={() => setViewMode('deck')}
              className={`px-2.5 py-1 rounded-lg transition font-medium flex items-center gap-1 ${
                viewMode === 'deck'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Interactive 16:9 Slide Presentation"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">16:9 Deck</span>
            </button>
            <button
              onClick={() => setViewMode('scroll')}
              className={`px-2.5 py-1 rounded-lg transition font-medium flex items-center gap-1 ${
                viewMode === 'scroll'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Continuous Multi-Page PDF Document"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PDF Pages</span>
            </button>
          </div>

          {/* Theme switcher in deck mode */}
          {viewMode === 'deck' && (
            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              title="Switch Canvas Theme"
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Export Slides as PDF */}
          <button
            onClick={handleExportPdf}
            disabled={loading || exportingPdf || slides.length === 0}
            className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
            title="Convert and Download as PDF"
          >
            {exportingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Printer className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Export PDF</span>
          </button>

          {/* Download Original PPTX */}
          {onDownloadOriginal && (
            <button
              onClick={onDownloadOriginal}
              className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 transition"
              title="Download original .pptx presentation file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Original PPTX</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Presentation Stage */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row bg-slate-950/95 overflow-hidden">
        {/* Google Slides HD Mode */}
        {viewMode === 'google' && googleViewerUrl && (
          <div className="w-full h-full flex flex-col bg-white">
            <iframe
              src={googleViewerUrl}
              className="w-full h-full border-0"
              title="Google Docs Viewer"
              allowFullScreen
            />
          </div>
        )}

        {/* Deck Mode: Left Slide Thumbnails */}
        {viewMode === 'deck' && slides.length > 1 && (
          <div className="w-full md:w-64 bg-slate-900/70 border-r border-white/10 p-3 overflow-y-auto space-y-2 shrink-0 hidden md:block">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-2">
              Slides ({slides.length})
            </p>
            {slides.map((s, idx) => (
              <button
                key={s.number}
                onClick={() => setCurrentSlideIndex(idx)}
                className={`w-full p-2.5 rounded-2xl text-left border transition flex flex-col gap-1 ${
                  idx === currentSlideIndex
                    ? 'bg-orange-500/20 border-orange-500 text-white shadow-md ring-1 ring-orange-500/60'
                    : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-orange-400">SLIDE {s.number}</span>
                  <span className="text-slate-400">
                    {s.images.length > 0 ? `${s.images.length} img • ` : ''}
                    {s.points.length} pts
                  </span>
                </div>
                <p className="text-xs font-medium truncate text-white">{s.title}</p>
              </button>
            ))}
          </div>
        )}

        {/* Deck Mode: Main Slide Canvas */}
        {viewMode === 'deck' && (
          <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 min-h-0 overflow-auto">
            {loading && (
              <div className="text-center text-white space-y-3 py-16">
                <Loader2 className="w-10 h-10 animate-spin mx-auto text-orange-400" />
                <p className="text-xs text-slate-300">Loading PowerPoint slides...</p>
              </div>
            )}

            {error && (
              <div className="m-auto p-5 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs text-center max-w-md">
                <p className="font-semibold mb-1">Preview Notice</p>
                <p>{error}</p>
                {onDownloadOriginal && (
                  <button
                    onClick={onDownloadOriginal}
                    className="mt-3 px-4 py-2 rounded-xl bg-white text-slate-900 font-bold text-xs"
                  >
                    Download Presentation File Instead
                  </button>
                )}
              </div>
            )}

            {!loading && !error && currentSlide && (
              <div
                className={`w-full max-w-4xl aspect-[16/9] rounded-3xl border shadow-2xl p-6 sm:p-10 flex flex-col justify-between relative overflow-hidden select-text transition-colors duration-300 ${
                  theme === 'dark'
                    ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white border-white/15'
                    : 'bg-white text-slate-900 border-slate-200 shadow-slate-900/10'
                }`}
              >
                {/* Slide Header */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      Slide {currentSlide.number}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {currentSlideIndex + 1} / {slides.length}
                    </span>
                  </div>

                  <h2
                    className={`text-xl sm:text-2xl font-bold tracking-tight leading-snug ${
                      theme === 'dark' ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {currentSlide.title}
                  </h2>
                </div>

                {/* Content Section: Text & Diagrams */}
                <div className="flex-1 my-3 sm:my-5 overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  {/* Points column */}
                  <div
                    className={`space-y-3 ${
                      currentSlide.images.length > 0 ? 'md:col-span-7' : 'md:col-span-12'
                    }`}
                  >
                    {currentSlide.points.length > 0 ? (
                      currentSlide.points.map((pt, pIdx) => (
                        <div
                          key={pIdx}
                          className={`p-3 rounded-2xl flex items-start gap-3 border transition ${
                            theme === 'dark'
                              ? 'bg-white/5 border-white/5 text-slate-200'
                              : 'bg-slate-50 border-slate-200/80 text-slate-800'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                          <p className="text-xs sm:text-sm leading-relaxed font-normal">{pt}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic pt-2">
                        {currentSlide.images.length > 0 ? 'Diagram slide.' : 'Title / Section slide.'}
                      </p>
                    )}
                  </div>

                  {/* Diagrams / Images Column */}
                  {currentSlide.images.length > 0 && (
                    <div className="md:col-span-5 flex flex-col gap-2">
                      {currentSlide.images.map((imgSrc, iIdx) => (
                        <div
                          key={iIdx}
                          className="rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 bg-black/10 dark:bg-black/40 shadow-md p-1"
                        >
                          <img
                            src={imgSrc}
                            alt={`Slide diagram`}
                            className="max-h-52 w-full object-contain rounded-xl"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Slide Footer */}
                <div
                  className={`flex items-center justify-between pt-3 border-t text-[10px] ${
                    theme === 'dark'
                      ? 'border-white/10 text-slate-400'
                      : 'border-slate-100 text-slate-500'
                  }`}
                >
                  <span className="font-semibold tracking-wider uppercase">NOOR DRIVE</span>
                  <span>Use &larr; &rarr; keys to switch slides</span>
                </div>
              </div>
            )}

            {/* Bottom Controls */}
            {!loading && !error && slides.length > 1 && (
              <div className="flex items-center gap-3 mt-4 text-white">
                <button
                  onClick={() => setCurrentSlideIndex((idx) => Math.max(0, idx - 1))}
                  disabled={currentSlideIndex === 0}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 transition"
                  title="Previous Slide (Left Arrow)"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <span className="text-xs font-semibold font-mono px-3">
                  {currentSlideIndex + 1} of {slides.length}
                </span>

                <button
                  onClick={() => setCurrentSlideIndex((idx) => Math.min(slides.length - 1, idx + 1))}
                  disabled={currentSlideIndex === slides.length - 1}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 transition"
                  title="Next Slide (Right Arrow)"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Scroll Mode: Stacked PDF Slide Pages */}
        {viewMode === 'scroll' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 flex flex-col items-center bg-slate-900/60">
            {slides.map((slide) => (
              <div
                key={slide.number}
                className="w-full max-w-4xl bg-white text-slate-900 rounded-3xl shadow-2xl p-6 sm:p-10 border border-slate-200 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-bold uppercase tracking-wider">
                    Slide {slide.number}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    Page {slide.number} of {slides.length}
                  </span>
                </div>

                <h3 className="text-lg sm:text-2xl font-bold text-slate-900 leading-snug">
                  {slide.title}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  <div
                    className={`space-y-3 ${
                      slide.images.length > 0 ? 'md:col-span-7' : 'md:col-span-12'
                    }`}
                  >
                    {slide.points.map((pt, pIdx) => (
                      <div
                        key={pIdx}
                        className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3"
                      >
                        <span className="w-2 h-2 rounded-full bg-orange-500 mt-2 shrink-0" />
                        <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">{pt}</p>
                      </div>
                    ))}
                  </div>

                  {slide.images.length > 0 && (
                    <div className="md:col-span-5 flex flex-col gap-2">
                      {slide.images.map((imgSrc, iIdx) => (
                        <div
                          key={iIdx}
                          className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 p-1"
                        >
                          <img
                            src={imgSrc}
                            alt="Slide diagram"
                            className="max-h-56 w-full object-contain rounded-xl"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
