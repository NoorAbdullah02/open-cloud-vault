'use client';

import { useEffect, useState } from 'react';
import { Loader2, Presentation } from 'lucide-react';

interface SlideItem {
  number: number;
  paragraphs: string[];
}

export default function PptxViewer({ url }: { url: string }) {
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          const paragraphs: string[] = [];

          for (const pNode of pNodes) {
            const tNodes = Array.from(pNode.getElementsByTagName('a:t'));
            const line = tNodes.map((t) => t.textContent || '').join('').trim();
            if (line) paragraphs.push(line);
          }

          const slideNum = parseInt(p.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
          parsed.push({ number: slideNum, paragraphs });
        }

        if (!cancelled) setSlides(parsed);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not preview PowerPoint file');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPptx();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) {
    return (
      <div className="py-12 text-center text-white space-y-2">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-sky-400" />
        <p className="text-xs text-slate-300">Rendering PowerPoint slides...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-2xl bg-rose-500/20 text-rose-200 text-xs">{error}</div>
    );
  }

  if (slides.length === 0) {
    return (
      <div className="text-white text-center text-sm">No text slides found in presentation.</div>
    );
  }

  return (
    <div className="w-full max-w-4xl max-h-[80dvh] overflow-y-auto space-y-4 px-1">
      {slides.map((slide) => (
        <div
          key={slide.number}
          className="bg-white text-slate-900 rounded-2xl shadow-xl p-5 sm:p-7 border border-slate-200"
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 mb-3 pb-2 border-b border-slate-100">
            <Presentation className="w-4 h-4" />
            <span>Slide {slide.number}</span>
          </div>
          {slide.paragraphs.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Visual / media slide</p>
          ) : (
            <div className="space-y-2">
              {slide.paragraphs.map((text, idx) => (
                <p
                  key={idx}
                  className={
                    idx === 0
                      ? 'text-base sm:text-lg font-bold text-slate-900'
                      : 'text-xs sm:text-sm text-slate-700 leading-relaxed'
                  }
                >
                  {text}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
