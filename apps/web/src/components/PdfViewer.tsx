'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  ChevronLeft,
  ChevronRight,
  Maximize2,
} from 'lucide-react';

export default function PdfViewer({
  url,
  fileName,
  onDownload,
}: {
  url: string;
  fileName?: string;
  onDownload?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(100);

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      setLoading(true);
      setError(null);
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load PDF file');
        const buf = await res.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
        const pdf = await loadingTask.promise;
        if (cancelled || !containerRef.current) return;

        setNumPages(pdf.numPages);
        containerRef.current.innerHTML = '';
        const baseWidth = Math.min(containerRef.current.clientWidth || 600, 850);

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          if (cancelled || !containerRef.current) return;

          const unscaledViewport = page.getViewport({ scale: 1 });
          const scale = ((baseWidth - 32) / unscaledViewport.width) * (zoom / 100);
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const viewport = page.getViewport({ scale: scale * dpr });

          const wrapper = document.createElement('div');
          wrapper.className =
            'mb-6 bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 transition-transform duration-200';

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
          canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
          canvas.className = 'block mx-auto';

          const pageHeader = document.createElement('div');
          pageHeader.className =
            'px-4 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center text-[10px] text-slate-400 font-mono select-none';
          pageHeader.innerHTML = `<span>Page ${pageNum}</span><span>${pdf.numPages} total</span>`;

          wrapper.appendChild(pageHeader);
          wrapper.appendChild(canvas);

          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
          }
          containerRef.current.appendChild(wrapper);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not render PDF document');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    renderPdf();
    return () => {
      cancelled = true;
    };
  }, [url, zoom]);

  return (
    <div className="w-full max-w-5xl h-[85dvh] flex flex-col bg-slate-950 rounded-3xl border border-white/10 shadow-2xl overflow-hidden backdrop-blur-md">
      {/* Top PDF Reader Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-white/10 text-white shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400">
            <FileText className="w-4 h-4" />
          </div>
          <span className="truncate max-w-[200px] sm:max-w-xs">{fileName || 'PDF Document'}</span>
          {numPages > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] uppercase font-bold font-mono">
              {numPages} {numPages === 1 ? 'Page' : 'Pages'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-white/10 rounded-xl p-0.5 text-xs">
            <button
              onClick={() => setZoom((z) => Math.max(60, z - 15))}
              title="Zoom Out"
              className="p-1.5 hover:bg-white/15 rounded-lg transition"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-mono text-[11px] select-none">{zoom}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(180, z + 15))}
              title="Zoom In"
              className="p-1.5 hover:bg-white/15 rounded-lg transition"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(100)}
              title="Reset Zoom"
              className="p-1.5 hover:bg-white/15 rounded-lg transition text-slate-400 hover:text-white"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          {onDownload && (
            <button
              onClick={onDownload}
              className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
          )}
        </div>
      </div>

      {/* Main PDF Scroll Container */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8 flex flex-col items-center bg-slate-900/80">
        {loading && (
          <div className="py-20 text-center text-white space-y-3">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-rose-400" />
            <p className="text-xs text-slate-300 font-medium">Rendering high-resolution PDF pages...</p>
          </div>
        )}
        {error && (
          <div className="m-auto p-5 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs text-center max-w-md">
            <p className="font-semibold mb-1">Preview Notice</p>
            <p>{error}</p>
          </div>
        )}
        <div ref={containerRef} className="w-full max-w-3xl flex flex-col items-center" />
      </div>
    </div>
  );
}
