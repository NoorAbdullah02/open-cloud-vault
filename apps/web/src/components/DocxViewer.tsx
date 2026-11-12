'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Download, FileText, ZoomIn, ZoomOut, RotateCcw, Printer } from 'lucide-react';

export default function DocxViewer({
  url,
  fileName,
  onDownloadOriginal,
}: {
  url: string;
  fileName?: string;
  onDownloadOriginal?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [mammothHtml, setMammothHtml] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDocx() {
      setLoading(true);
      setError(null);
      setMammothHtml(null);

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load Word document');
        const arrayBuffer = await res.arrayBuffer();

        if (cancelled) return;

        // Try high-fidelity docx-preview first
        try {
          const docxPreview = await import('docx-preview');
          if (containerRef.current && !cancelled) {
            containerRef.current.innerHTML = '';
            await docxPreview.renderAsync(arrayBuffer, containerRef.current, undefined, {
              className: 'docx-preview-doc',
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              ignoreFonts: false,
              breakPages: true,
              renderHeaders: true,
              renderFooters: true,
              renderFootnotes: true,
            });
            setLoading(false);
            return;
          }
        } catch (docxErr) {
          console.warn('[DocxViewer] docx-preview fallback to mammoth:', docxErr);
        }

        // Fallback to mammoth HTML
        const mammoth = await import('mammoth/mammoth.browser');
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const safeHtml = result.value.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
        if (!cancelled) {
          setMammothHtml(safeHtml);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not preview Word document');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDocx();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const target = containerRef.current;
      if (!target) return;

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
      });

      await pdf.html(target, {
        callback: (doc) => {
          const base = (fileName || 'document').replace(/\.[^/.]+$/, '');
          doc.save(`${base}.pdf`);
          setExportingPdf(false);
        },
        margin: [20, 20, 20, 20],
        autoPaging: 'text',
        width: 555,
        windowWidth: target.scrollWidth || 800,
      });
    } catch (err) {
      console.error('[DocxViewer] PDF export fallback to print window:', err);
      // Fallback: open print dialog
      window.print();
      setExportingPdf(false);
    }
  };

  return (
    <div className="w-full max-w-5xl h-[85dvh] flex flex-col bg-slate-900/60 rounded-3xl border border-white/10 shadow-2xl overflow-hidden backdrop-blur-md">
      {/* Top Document Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-white/10 text-white shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
            <FileText className="w-4 h-4" />
          </div>
          <span className="truncate max-w-[200px] sm:max-w-xs">{fileName || 'Word Document'}</span>
          <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] uppercase font-bold">
            PDF Layout
          </span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-white/10 rounded-xl p-0.5 text-xs">
            <button
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
              title="Zoom Out"
              className="p-1.5 hover:bg-white/15 rounded-lg transition"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-mono text-[11px] select-none">{zoom}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(180, z + 10))}
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

          {/* Export as PDF */}
          <button
            onClick={handleExportPdf}
            disabled={loading || exportingPdf}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
            title="Convert and Download as PDF"
          >
            {exportingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Printer className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Export PDF</span>
          </button>

          {/* Download Original DOCX */}
          {onDownloadOriginal && (
            <button
              onClick={onDownloadOriginal}
              className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 transition"
              title="Download original .docx file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Original DOCX</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Document Content */}
      <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-8 flex justify-center bg-slate-900/90">
        {loading && (
          <div className="py-20 text-center text-white space-y-3">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-400" />
            <p className="text-xs text-slate-300">Converting Word pages to PDF preview...</p>
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
                Download Word File Instead
              </button>
            )}
          </div>
        )}

        {/* docx-preview rendering target */}
        <div
          ref={containerRef}
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
          }}
          className={`docx-preview-container max-w-full ${loading || error ? 'hidden' : 'block'}`}
        />

        {/* Mammoth fallback if needed */}
        {mammothHtml && !loading && !error && (
          <div
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out',
            }}
            className="w-full max-w-3xl bg-white text-slate-900 rounded-2xl shadow-2xl p-8 sm:p-12 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: mammothHtml }}
          />
        )}
      </div>
    </div>
  );
}
