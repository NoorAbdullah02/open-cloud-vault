'use client';

import { useEffect, useState } from 'react';
import {
  Loader2,
  Presentation,
  Download,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Printer,
  Sparkles,
} from 'lucide-react';

interface SlideItem {
  number: number;
  title: string;
  points: string[];
}

export default function PptxViewer({
  url,
  fileName,
  onDownloadOriginal,
}: {
  url: string;
  fileName?: string;
  onDownloadOriginal?: () => void;
}) {
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPptx() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load presentation');
        const buf = await res.arrayBuffer();

        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(buf);

        // Check for embedded thumbnail
        const thumbFile = zip.file('docProps/thumbnail.jpeg') || zip.file('docProps/thumbnail.png');
        if (thumbFile && !cancelled) {
          const thumbBlob = await thumbFile.async('blob');
          const thumbObjUrl = URL.createObjectURL(thumbBlob);
          setThumbnailUrl(thumbObjUrl);
        }

        const slidePaths = Object.keys(zip.files)
          .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
          .sort((a, b) => {
            const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
            const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
            return numA - numB;
          });

        const parsed: SlideItem[] = [];
        const parser = new DOMParser();

        for (const p of slidePaths) {
          const xmlText = await zip.files[p].async('string');
          const doc = parser.parseFromString(xmlText, 'application/xml');
          const pNodes = Array.from(doc.getElementsByTagName('a:p'));
          const lines: string[] = [];

          for (const pNode of pNodes) {
            const tNodes = Array.from(pNode.getElementsByTagName('a:t'));
            const line = tNodes.map((t) => t.textContent || '').join('').trim();
            if (line) lines.push(line);
          }

          const slideNum = parseInt(p.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
          const title = lines.length > 0 ? lines[0] : `Slide ${slideNum}`;
          const points = lines.length > 1 ? lines.slice(1) : [];

          parsed.push({ number: slideNum, title, points });
        }

        if (!cancelled) {
          setSlides(parsed);
          setCurrentSlideIndex(0);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not parse PowerPoint file');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPptx();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Keyboard navigation for slides
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        setCurrentSlideIndex((idx) => Math.min(slides.length - 1, idx + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setCurrentSlideIndex((idx) => Math.max(0, idx - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slides.length]);

  const handleExportPdf = async () => {
    if (slides.length === 0) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      // Create landscape presentation PDF (16:9 ratio approx 841 x 473 pt)
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: [842, 474],
      });

      slides.forEach((slide, idx) => {
        if (idx > 0) pdf.addPage([842, 474], 'landscape');

        // Dark modern slide background
        pdf.setFillColor(15, 23, 42); // slate-900
        pdf.rect(0, 0, 842, 474, 'F');

        // Accent header bar
        pdf.setFillColor(249, 115, 22); // orange-500
        pdf.rect(40, 36, 120, 4, 'F');

        // Slide Number Badge
        pdf.setFontSize(10);
        pdf.setTextColor(249, 115, 22);
        pdf.text(`SLIDE ${slide.number} OF ${slides.length}`, 40, 56);

        // Slide Title
        pdf.setFontSize(22);
        pdf.setTextColor(255, 255, 255);
        const splitTitle = pdf.splitTextToSize(slide.title, 760);
        pdf.text(splitTitle, 40, 90);

        // Slide Content Points
        pdf.setFontSize(13);
        pdf.setTextColor(203, 213, 225); // slate-300
        let y = 140;
        slide.points.forEach((point) => {
          if (y > 430) return;
          const wrapped = pdf.splitTextToSize(`•  ${point}`, 740);
          pdf.text(wrapped, 40, y);
          y += wrapped.length * 20 + 8;
        });

        // Footer brand
        pdf.setFontSize(9);
        pdf.setTextColor(100, 116, 139);
        pdf.text('NOOR DRIVE Vault Presentation Viewer', 40, 455);
      });

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
    <div className="w-full max-w-5xl h-[85dvh] flex flex-col bg-slate-950 rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
      {/* Top Slide Deck Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-white/10 text-white shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <div className="p-1.5 rounded-lg bg-orange-500/20 text-orange-400">
            <Presentation className="w-4 h-4" />
          </div>
          <span className="truncate max-w-[200px] sm:max-w-xs">{fileName || 'Presentation'}</span>
          {slides.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] uppercase font-bold">
              {currentSlideIndex + 1} / {slides.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
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
              title="Download original .pptx presentation"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Original PPTX</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Slide Deck Canvas */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row bg-slate-950/95 overflow-hidden">
        {/* Slide Thumbnail Strip (Desktop) */}
        {slides.length > 1 && (
          <div className="w-full md:w-56 bg-slate-900/60 border-r border-white/10 p-3 overflow-y-auto space-y-2.5 shrink-0 hidden md:block">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-2">
              Slides ({slides.length})
            </p>
            {slides.map((s, idx) => (
              <button
                key={s.number}
                onClick={() => setCurrentSlideIndex(idx)}
                className={`w-full p-2.5 rounded-xl text-left border transition flex flex-col gap-1 ${
                  idx === currentSlideIndex
                    ? 'bg-orange-500/15 border-orange-500 text-white shadow-md'
                    : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-orange-400">#{s.number}</span>
                  <span className="text-slate-400">{s.points.length} points</span>
                </div>
                <p className="text-xs font-medium truncate text-white">{s.title}</p>
              </button>
            ))}
          </div>
        )}

        {/* Current Active Slide Stage */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 min-h-0 overflow-auto">
          {loading && (
            <div className="text-center text-white space-y-3 py-16">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-orange-400" />
              <p className="text-xs text-slate-300">Rendering PowerPoint presentation...</p>
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
            <div className="w-full max-w-4xl aspect-[16/9] bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-800 rounded-3xl border border-white/15 p-6 sm:p-10 shadow-2xl flex flex-col justify-between relative overflow-hidden select-text">
              {/* Top Slide Header */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-orange-400">
                      Slide {currentSlide.number}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {currentSlideIndex + 1} / {slides.length}
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug">
                  {currentSlide.title}
                </h2>
              </div>

              {/* Slide Body Points */}
              <div className="flex-1 my-4 sm:my-6 overflow-y-auto space-y-3 pr-2">
                {currentSlide.points.length > 0 ? (
                  currentSlide.points.map((pt, pIdx) => (
                    <div key={pIdx} className="flex items-start gap-3">
                      <span className="w-2 h-2 rounded-full bg-orange-400/80 mt-2 shrink-0" />
                      <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">
                        {pt}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 italic pt-4">
                    Visual presentation slide or graphic content.
                  </p>
                )}
              </div>

              {/* Slide Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-white/10 text-[10px] text-slate-400">
                <span>NOOR DRIVE Cloud Presentation</span>
                <span>Press &larr; &rarr; keys to navigate</span>
              </div>
            </div>
          )}

          {/* Navigation Controls Bar */}
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
      </div>
    </div>
  );
}
