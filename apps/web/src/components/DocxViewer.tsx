'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Download, FileText, ZoomIn, ZoomOut, RotateCcw, Globe, AlertCircle } from 'lucide-react';

export default function DocxViewer({
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [mammothHtml, setMammothHtml] = useState<string | null>(null);
  const [mode, setMode] = useState<'docx' | 'google'>('docx');
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleError, setGoogleError] = useState(false);

  // Google Docs Viewer URL
  const googleViewerUrl = (() => {
    if (typeof window === 'undefined') return null;
    const origin = window.location.origin;
    const streamUrl = fileId && accessToken
      ? `${origin}/api/drive/files/${fileId}/download?inline=true&token=${encodeURIComponent(accessToken)}`
      : url;
    return `https://docs.google.com/viewer?url=${encodeURIComponent(streamUrl)}&embedded=true`;
  })();

  useEffect(() => {
    if (mode !== 'docx') return;
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

        // Try docx-preview first (high fidelity)
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
            if (!cancelled) setLoading(false);
            return;
          }
        } catch (docxErr) {
          console.warn('[DocxViewer] docx-preview failed, using mammoth:', docxErr);
        }

        // Fallback: mammoth HTML
        const mammoth = await import('mammoth/mammoth.browser');
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const safeHtml = result.value.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
        if (!cancelled) {
          setMammothHtml(safeHtml);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Could not preview Word document');
          setLoading(false);
        }
      }
    }

    loadDocx();
    return () => { cancelled = true; };
  }, [url, mode]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/20">
            <FileText className="w-4 h-4 text-blue-400" />
          </div>
          <span className="text-white text-xs font-semibold truncate max-w-[180px] sm:max-w-xs">
            {fileName || 'Word Document'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center bg-white/10 rounded-xl p-0.5 text-xs">
            <button
              onClick={() => setMode('docx')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition text-xs font-semibold ${
                mode === 'docx' ? 'bg-blue-500 text-white shadow' : 'text-slate-300 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Doc View</span>
            </button>
            <button
              onClick={() => { setMode('google'); setGoogleLoading(true); setGoogleError(false); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition text-xs font-semibold ${
                mode === 'google' ? 'bg-blue-500 text-white shadow' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Google View</span>
            </button>
          </div>

          {/* Zoom (only for docx mode) */}
          {mode === 'docx' && !loading && !error && (
            <div className="flex items-center bg-white/10 rounded-xl p-0.5 text-xs">
              <button onClick={() => setZoom((z) => Math.max(50, z - 10))} title="Zoom Out" className="p-1.5 hover:bg-white/15 rounded-lg transition text-white">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono text-[11px] text-white select-none">{zoom}%</span>
              <button onClick={() => setZoom((z) => Math.min(200, z + 10))} title="Zoom In" className="p-1.5 hover:bg-white/15 rounded-lg transition text-white">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setZoom(100)} title="Reset" className="p-1.5 hover:bg-white/15 rounded-lg transition text-slate-400 hover:text-white">
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          )}

          {onDownloadOriginal && (
            <button
              onClick={onDownloadOriginal}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
              title="Download DOCX"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Google Docs Mode */}
      {mode === 'google' && (
        <div className="flex-1 relative overflow-hidden">
          {googleLoading && !googleError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
              <p className="text-slate-300 text-sm">Loading Google Docs viewer…</p>
            </div>
          )}
          {googleError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-4 p-6 text-center">
              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30">
                <AlertCircle className="w-10 h-10 text-blue-400 mx-auto" />
              </div>
              <p className="text-white font-semibold">Google Viewer unavailable</p>
              <p className="text-slate-400 text-xs max-w-xs">Switch to Doc View for local rendering.</p>
              <button
                onClick={() => setMode('docx')}
                className="px-4 py-2 rounded-xl bg-blue-500 text-white text-xs font-semibold"
              >
                Switch to Doc View
              </button>
            </div>
          )}
          {googleViewerUrl && (
            <iframe
              src={googleViewerUrl}
              className={`w-full h-full border-none ${googleError ? 'hidden' : 'block'}`}
              onLoad={() => { setGoogleLoading(false); setGoogleError(false); }}
              onError={() => { setGoogleLoading(false); setGoogleError(true); }}
              title="Word Document Preview"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          )}
        </div>
      )}

      {/* Doc View Mode */}
      {mode === 'docx' && (
        <div className="flex-1 min-h-0 overflow-auto bg-slate-800/40 flex justify-center p-4 sm:p-8">
          {loading && (
            <div className="py-20 text-center text-white space-y-3 m-auto">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-400" />
              <p className="text-xs text-slate-300">Rendering document pages…</p>
            </div>
          )}

          {error && !loading && (
            <div className="m-auto text-center space-y-4 max-w-sm">
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
              </div>
              <p className="text-white font-semibold">Preview failed</p>
              <p className="text-slate-400 text-xs">{error}</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => { setMode('google'); setGoogleLoading(true); setGoogleError(false); }}
                  className="px-4 py-2 rounded-xl bg-blue-500 text-white text-xs font-semibold"
                >
                  Try Google View
                </button>
                {onDownloadOriginal && (
                  <button onClick={onDownloadOriginal} className="px-4 py-2 rounded-xl bg-white/10 text-white text-xs font-semibold">
                    Download DOCX
                  </button>
                )}
              </div>
            </div>
          )}

          {/* docx-preview rendered output */}
          <div
            ref={containerRef}
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out',
            }}
            className={`docx-preview-container max-w-full ${loading || error ? 'hidden' : 'block'}`}
          />

          {/* mammoth fallback */}
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
      )}
    </div>
  );
}
