'use client';

import React, { useState } from 'react';
import {
  FileCode,
  Copy,
  Check,
  Download,
  Terminal,
} from 'lucide-react';

interface CodeViewerProps {
  content: string;
  fileName: string;
  onDownload: () => void;
}

export default function CodeViewer({ content, fileName, onDownload }: CodeViewerProps) {
  const [copied, setCopied] = useState(false);

  const lines = content.split('\n');
  const ext = (fileName.split('.').pop() || 'txt').toUpperCase();

  const handleCopy = () => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-5xl max-h-[85dvh] bg-[#0d1117] border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100 animate-in zoom-in-95">
      {/* Top Header */}
      <div className="px-5 py-3.5 bg-[#161b22] border-b border-slate-800 flex items-center justify-between gap-3 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Terminal className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white truncate max-w-sm sm:max-w-md">
                {fileName}
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold">
                {ext}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
              {lines.length} lines • {content.length.toLocaleString()} characters
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopy}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-white/10 hover:bg-white/15 text-slate-200'
            }`}
            title="Copy all code to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy Code'}</span>
          </button>

          <button
            onClick={onDownload}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 transition"
            title="Download file"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Code Editor Body */}
      <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed selection:bg-indigo-500/30">
        <div className="flex min-w-full">
          {/* Line Numbers */}
          <div className="select-none text-slate-600 pr-4 text-right shrink-0 border-r border-slate-800/80 mr-4 space-y-0.5">
            {lines.map((_, i) => (
              <div key={i} className="leading-6">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code Text Content */}
          <pre className="flex-1 text-slate-200 whitespace-pre overflow-x-visible space-y-0.5">
            {lines.map((line, i) => (
              <div key={i} className="leading-6">
                {line || ' '}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}

