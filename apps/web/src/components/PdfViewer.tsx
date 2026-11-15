'use client';

import { useState, useRef } from 'react';
import { FileText, Download, ExternalLink, Loader2, Printer, Moon, Sun } from 'lucide-react';

export default function PdfViewer({
  url,
  fileName,
  onDownload,
}: {
  url: string;
  fileName?: string;
  onDownload?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [isNightMode, setIsNightMode] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = () => {
    try {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();
        return;
      }
    } catch {}
    window.open(url, '_blank');
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <span className="text-white text-xs font-semibold truncate max-w-[160px] sm:max-w-xs">
            {fileName || 'PDF Document'}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] uppercase font-bold font-mono shrink-0">
            PDF Reader
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Night / Invert Reading Mode */}
          <button
            onClick={() => setIsNightMode((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              isNightMode
                ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-xs'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            title={isNightMode ? 'Switch to Standard White PDF' : 'Switch to Inverted Night Reading Mode'}
          >
            {isNightMode ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5 text-slate-300" />}
            <span className="hidden sm:inline">{isNightMode ? 'Night Mode On' : 'Night Mode'}</span>
          </button>

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition text-xs flex items-center gap-1.5"
            title="Open PDF in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Tab</span>
          </a>

          <button
            onClick={handlePrint}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition text-xs flex items-center gap-1.5"
            title="Print PDF"
          >
            <Printer className="w-3.5 h-3.5 text-rose-300" />
            <span className="hidden sm:inline">Print</span>
          </button>

          {onDownload && (
            <button
              onClick={onDownload}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition text-xs flex items-center gap-1.5"
              title="Download PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
          )}
        </div>
      </div>

      {/* Embedded Native Browser PDF */}
      <div className="flex-1 relative bg-slate-900 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-rose-400" />
            <p className="text-slate-300 text-xs font-medium">Opening PDF reader...</p>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={`${url}#toolbar=1&navpanes=1`}
          className={`w-full h-full border-none bg-white transition-all duration-300 ${
            isNightMode ? 'invert-[0.9] hue-rotate-180 brightness-[0.88] contrast-[1.1]' : ''
          }`}
          onLoad={() => setLoading(false)}
          title={fileName || 'PDF Preview'}
        />
      </div>
    </div>
  );
}
