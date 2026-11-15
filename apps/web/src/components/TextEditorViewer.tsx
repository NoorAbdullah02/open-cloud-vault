'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FileText,
  Save,
  Check,
  Copy,
  Download,
  X,
  Columns,
  Eye,
  Edit3,
  Loader2,
  Terminal,
  Type,
  AlignLeft,
  Sparkles,
  RotateCcw,
} from 'lucide-react';

interface TextEditorViewerProps {
  file: any;
  initialContent: string;
  onSave: (newContent: string) => Promise<void>;
  onDownload: () => void;
  onClose: () => void;
}

// Zero-dependency GitHub Flavored Markdown Renderer
function MarkdownRenderer({ content }: { content: string }) {
  const renderedElements = useMemo(() => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Code Block (fenced ```)
      if (line.trim().startsWith('```')) {
        const lang = line.trim().slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        elements.push(
          <div key={`code-${i}`} className="my-3 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 font-mono text-xs">
            {lang && (
              <div className="px-3.5 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                {lang}
              </div>
            )}
            <pre className="p-3.5 text-slate-200 overflow-x-auto leading-relaxed">
              <code>{codeLines.join('\n')}</code>
            </pre>
          </div>,
        );
        continue;
      }

      // Headings
      if (line.startsWith('# ')) {
        elements.push(
          <h1 key={`h1-${i}`} className="text-2xl font-extrabold text-white pb-2 mb-3 mt-4 border-b border-slate-700/60">
            {renderInlineMarkdown(line.slice(2))}
          </h1>,
        );
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h2 key={`h2-${i}`} className="text-xl font-bold text-white pb-1.5 mb-2 mt-4 border-b border-slate-700/40">
            {renderInlineMarkdown(line.slice(3))}
          </h2>,
        );
        i++;
        continue;
      }
      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={`h3-${i}`} className="text-lg font-bold text-slate-100 mb-2 mt-3">
            {renderInlineMarkdown(line.slice(4))}
          </h3>,
        );
        i++;
        continue;
      }
      if (line.startsWith('#### ')) {
        elements.push(
          <h4 key={`h4-${i}`} className="text-base font-semibold text-slate-200 mb-1.5 mt-2.5">
            {renderInlineMarkdown(line.slice(5))}
          </h4>,
        );
        i++;
        continue;
      }

      // Horizontal Rule
      if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
        elements.push(<hr key={`hr-${i}`} className="my-4 border-slate-800" />);
        i++;
        continue;
      }

      // Blockquote
      if (line.startsWith('> ')) {
        const quoteLines: string[] = [line.slice(2)];
        i++;
        while (i < lines.length && lines[i].startsWith('> ')) {
          quoteLines.push(lines[i].slice(2));
          i++;
        }
        elements.push(
          <blockquote
            key={`quote-${i}`}
            className="my-3 pl-4 py-1.5 border-l-4 border-indigo-500 bg-indigo-500/10 text-slate-300 italic rounded-r-xl"
          >
            {quoteLines.map((ql, qi) => (
              <p key={qi}>{renderInlineMarkdown(ql)}</p>
            ))}
          </blockquote>,
        );
        continue;
      }

      // Task List (- [ ] or - [x])
      if (/^\s*-\s*\[([ xX])\]\s+(.*)/.test(line)) {
        const match = line.match(/^\s*-\s*\[([ xX])\]\s+(.*)/)!;
        const checked = match[1].toLowerCase() === 'x';
        elements.push(
          <div key={`task-${i}`} className="flex items-center gap-2.5 my-1.5 text-sm">
            <input
              type="checkbox"
              checked={checked}
              readOnly
              className="w-4 h-4 rounded accent-indigo-500 pointer-events-none"
            />
            <span className={checked ? 'line-through text-slate-500' : 'text-slate-200'}>
              {renderInlineMarkdown(match[2])}
            </span>
          </div>,
        );
        i++;
        continue;
      }

      // Bullet List (- or *)
      if (/^\s*[-*]\s+(.*)/.test(line)) {
        const listItems: string[] = [];
        while (i < lines.length && /^\s*[-*]\s+(.*)/.test(lines[i])) {
          const m = lines[i].match(/^\s*[-*]\s+(.*)/);
          if (m) listItems.push(m[1]);
          i++;
        }
        elements.push(
          <ul key={`ul-${i}`} className="list-disc list-inside space-y-1 my-2.5 text-slate-300 text-sm pl-2">
            {listItems.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {renderInlineMarkdown(item)}
              </li>
            ))}
          </ul>,
        );
        continue;
      }

      // Numbered List (1. 2.)
      if (/^\s*\d+\.\s+(.*)/.test(line)) {
        const listItems: string[] = [];
        while (i < lines.length && /^\s*\d+\.\s+(.*)/.test(lines[i])) {
          const m = lines[i].match(/^\s*\d+\.\s+(.*)/);
          if (m) listItems.push(m[1]);
          i++;
        }
        elements.push(
          <ol key={`ol-${i}`} className="list-decimal list-inside space-y-1 my-2.5 text-slate-300 text-sm pl-2">
            {listItems.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {renderInlineMarkdown(item)}
              </li>
            ))}
          </ol>,
        );
        continue;
      }

      // Table (| col | col |)
      if (line.includes('|') && line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const tableLines: string[] = [];
        while (
          i < lines.length &&
          lines[i].includes('|') &&
          lines[i].trim().startsWith('|') &&
          lines[i].trim().endsWith('|')
        ) {
          tableLines.push(lines[i]);
          i++;
        }
        if (tableLines.length >= 2) {
          const headerCols = tableLines[0]
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim());
          const bodyRows = tableLines.slice(2).map((r) =>
            r
              .split('|')
              .slice(1, -1)
              .map((c) => c.trim()),
          );
          elements.push(
            <div key={`table-${i}`} className="my-3 overflow-x-auto rounded-xl border border-slate-700">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800 text-slate-300 uppercase font-semibold">
                  <tr>
                    {headerCols.map((h, hi) => (
                      <th key={hi} className="py-2 px-3 border-b border-slate-700">
                        {renderInlineMarkdown(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {bodyRows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-slate-800/40">
                      {row.map((cell, ci) => (
                        <td key={ci} className="py-2 px-3 text-slate-200">
                          {renderInlineMarkdown(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>,
          );
          continue;
        }
      }

      // Regular Paragraph or Empty line
      if (line.trim().length === 0) {
        elements.push(<div key={`blank-${i}`} className="h-3" />);
      } else {
        elements.push(
          <p key={`p-${i}`} className="text-slate-300 text-sm leading-relaxed mb-2 break-words">
            {renderInlineMarkdown(line)}
          </p>,
        );
      }
      i++;
    }

    return elements;
  }, [content]);

  return <div className="space-y-1">{renderedElements}</div>;
}

// Inline Markdown Helper (Bold, Italic, Code, Links)
function renderInlineMarkdown(text: string): React.ReactNode {
  // Split by inline code first
  const parts = text.split(/(`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-emerald-400 font-mono text-xs"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Sanitize raw HTML characters first to prevent XSS
    const safePart = part
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    // Bold & Italic & Strikethrough & Links
    let innerHtml = safePart
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:underline">$1</a>',
      );

    return <span key={index} dangerouslySetInnerHTML={{ __html: innerHtml }} />;
  });
}

export default function TextEditorViewer({
  file,
  initialContent,
  onSave,
  onDownload,
  onClose,
}: TextEditorViewerProps) {
  const [content, setContent] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);

  const ext = (file.extension || file.name.split('.').pop() || 'txt').toLowerCase();
  const isMarkdown = ext === 'md' || ext === 'markdown';

  // Default mode: split for markdown on wide screens, edit otherwise
  const [mode, setMode] = useState<'edit' | 'split' | 'preview'>(isMarkdown ? 'split' : 'edit');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasUnsavedChanges = content !== savedContent;

  const lines = useMemo(() => content.split('\n'), [content]);
  const charCount = content.length;
  const wordCount = useMemo(() => {
    const trimmed = content.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [content]);

  // Handle Ctrl+S / Cmd+S save shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content, hasUnsavedChanges, isSaving]);

  const handleSave = async () => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      await onSave(content);
      setSavedContent(content);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch {
      // Error handled by caller toast
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevert = () => {
    if (window.confirm('Discard all unsaved changes and revert to original?')) {
      setContent(savedContent);
    }
  };

  // Intercept Tab key in textarea to insert 2 spaces
  const handleKeyDownInTextarea = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      setContent(newContent);

      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div className="w-full max-w-6xl max-h-[88dvh] h-[85dvh] bg-[#0d1117] border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100 animate-in zoom-in-95">
      {/* Top Header Bar */}
      <div className="px-4 sm:px-6 py-3.5 bg-[#161b22] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 select-none">
        {/* File Info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
            {isMarkdown ? <FileText className="w-5 h-5" /> : <Terminal className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white truncate max-w-[200px] sm:max-w-xs md:max-w-md">
                {file.name}
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 font-mono text-[10px] font-bold uppercase">
                {ext}
              </span>
              {hasUnsavedChanges ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Unsaved (⌘S)
                </span>
              ) : saveSuccess ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
              {lines.length} lines • {wordCount} words • {charCount.toLocaleString()} chars
            </p>
          </div>
        </div>

        {/* View/Edit Mode Toggles */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5 text-xs font-semibold">
            <button
              onClick={() => setMode('edit')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition ${
                mode === 'edit'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Code / Text Editor"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Edit</span>
            </button>
            {isMarkdown && (
              <button
                onClick={() => setMode('split')}
                className={`hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition ${
                  mode === 'split'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Side-by-side Editor & Live Preview"
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Split Live</span>
              </button>
            )}
            <button
              onClick={() => setMode('preview')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition ${
                mode === 'preview'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Formatted Preview"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Preview</span>
            </button>
          </div>

          {/* Action Buttons */}
          {hasUnsavedChanges && (
            <button
              onClick={handleRevert}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-rose-400 transition"
              title="Discard unsaved changes"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition active:scale-95 ${
              hasUnsavedChanges
                ? 'bg-gradient-to-r from-indigo-500 to-sky-500 hover:opacity-90 text-white shadow-indigo-500/20'
                : 'bg-white/10 text-slate-400 cursor-not-allowed'
            }`}
            title="Save file to NOOR DRIVE (⌘S / Ctrl+S)"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{isSaving ? 'Saving...' : 'Save File'}</span>
          </button>

          <button
            onClick={handleCopy}
            className={`p-2 rounded-xl transition ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-white/10 hover:bg-white/15 text-slate-200'
            }`}
            title="Copy content"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            onClick={onDownload}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 transition"
            title="Download file"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-400 hover:text-white transition"
            title="Close editor (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor & Preview Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Code / Text Editor */}
        {(mode === 'edit' || mode === 'split') && (
          <div
            className={`flex-1 flex flex-col min-w-0 bg-[#0d1117] ${
              mode === 'split' ? 'border-r border-slate-800' : ''
            }`}
          >
            <div className="flex-1 flex overflow-hidden">
              {/* Line Numbers */}
              <div className="select-none text-slate-600 py-4 pl-4 pr-3 text-right shrink-0 border-r border-slate-800/80 font-mono text-xs leading-6 overflow-hidden">
                {lines.map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDownInTextarea}
                placeholder="Type your notes or code here..."
                spellCheck={false}
                wrap={wordWrap ? 'on' : 'off'}
                className="flex-1 w-full h-full p-4 bg-transparent resize-none text-slate-100 font-mono text-xs sm:text-sm leading-6 outline-none focus:ring-0 border-none selection:bg-indigo-500/30 overflow-auto"
              />
            </div>

            {/* Bottom Status Bar */}
            <div className="px-4 py-1.5 bg-[#161b22] border-t border-slate-800/80 text-[11px] font-mono text-slate-400 flex items-center justify-between select-none">
              <div className="flex items-center gap-3">
                <span>UTF-8</span>
                <span>•</span>
                <span>Tab: 2 spaces</span>
                <span>•</span>
                <button
                  onClick={() => setWordWrap(!wordWrap)}
                  className={`hover:text-white transition ${wordWrap ? 'text-indigo-400 font-bold' : ''}`}
                >
                  Wrap: {wordWrap ? 'ON' : 'OFF'}
                </button>
              </div>
              <div>
                <span>Press </span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300">
                  ⌘S
                </kbd>
                <span> to save</span>
              </div>
            </div>
          </div>
        )}

        {/* Right Pane: Markdown / Preview */}
        {(mode === 'preview' || mode === 'split') && (
          <div className="flex-1 flex flex-col min-w-0 bg-[#0b0e14] overflow-y-auto">
            {mode === 'split' && (
              <div className="px-4 py-2 bg-[#161b22]/70 border-b border-slate-800/80 text-xs font-semibold text-slate-400 flex items-center gap-1.5 select-none shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Live Markdown Preview</span>
              </div>
            )}
            <div className="p-6 md:p-8 flex-1 overflow-y-auto">
              {isMarkdown ? (
                <MarkdownRenderer content={content} />
              ) : (
                <pre className="font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {content}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

