'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      setLoading(true);
      setError(null);
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load PDF');
        const buf = await res.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
        const pdf = await loadingTask.promise;
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = '';
        const containerWidth = Math.min(containerRef.current.clientWidth || 360, 900);

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          if (cancelled || !containerRef.current) return;

          const unscaledViewport = page.getViewport({ scale: 1 });
          const scale = (containerWidth - 16) / unscaledViewport.width;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const viewport = page.getViewport({ scale: scale * dpr });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
          canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
          canvas.className = 'rounded-xl shadow-md bg-white mx-auto mb-3 block';

          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
          }
          containerRef.current.appendChild(canvas);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not render PDF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    renderPdf();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="w-full h-full overflow-y-auto px-2 py-2 flex flex-col items-center">
      {loading && (
        <div className="py-12 text-center text-white space-y-2">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-sky-400" />
          <p className="text-xs text-slate-300">Rendering PDF pages...</p>
        </div>
      )}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/20 text-rose-200 text-xs">{error}</div>
      )}
      <div ref={containerRef} className="w-full max-w-4xl" />
    </div>
  );
}

