'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function DocxViewer({ url }: { url: string }) {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDocx() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load Word document');
        const arrayBuffer = await res.arrayBuffer();
        const mammoth = await import('mammoth/mammoth.browser');
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const safeHtml = result.value.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
        if (!cancelled) setHtml(safeHtml);
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

  if (loading) {
    return (
      <div className="py-12 text-center text-white space-y-2">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-sky-400" />
        <p className="text-xs text-slate-300">Rendering Word document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-2xl bg-rose-500/20 text-rose-200 text-xs">{error}</div>
    );
  }

  return (
    <div className="w-full max-w-4xl max-h-[80dvh] overflow-y-auto bg-white text-slate-900 rounded-2xl shadow-2xl p-5 sm:p-8">
      <div
        className="prose prose-sm sm:prose max-w-none leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_p]:mb-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:p-2 [&_th]:border [&_th]:border-slate-200 [&_th]:p-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

