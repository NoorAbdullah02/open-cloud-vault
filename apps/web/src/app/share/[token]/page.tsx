'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  HardDrive,
  Folder as FolderIcon,
  FileText,
  Download,
  Eye,
  Upload,
  Loader2,
  X,
  ArrowLeft,
  ShieldCheck,
  Share2,
  MessageCircle,
  Printer,
} from 'lucide-react';

import { getApiUrl } from '@/lib/api';
import PdfViewer from '@/components/PdfViewer';
import DocxViewer from '@/components/DocxViewer';
import PptxViewer from '@/components/PptxViewer';

const API_URL = getApiUrl();

function formatBytes(bytesStr: string | number) {
  const bytes = Number(bytesStr || 0);
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function PublicSharePage() {
  const params = useParams();
  const token = params.token as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<any>(null);
  const [subFolderId, setSubFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<any>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);

  const openPreview = async (file: any) => {
    setPreviewFile(file);
    setPreviewText(null);
    if (
      file.mimeType.startsWith('text/') ||
      ['md', 'json', 'csv', 'log', 'ts', 'js', 'py'].includes(file.extension)
    ) {
      try {
        const res = await fetch(getDownloadLink(file.id, true));
        if (res.ok) setPreviewText(await res.text());
      } catch {}
    }
  };

  const loadShare = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `${API_URL}/shares/public/${token}${
        subFolderId ? `?folderId=${subFolderId}` : ''
      }`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Share link invalid or expired');
      }
      const json = await res.json();
      setData(json);
      if (
        json.type === 'file' &&
        json.file &&
        (json.file.mimeType.startsWith('text/') ||
          ['md', 'json', 'csv', 'log', 'ts', 'js', 'py'].includes(json.file.extension))
      ) {
        try {
          const textRes = await fetch(
            `${API_URL}/shares/public/${token}/download/${json.file.id}?inline=true`,
          );
          if (textRes.ok) setPreviewText(await textRes.text());
        } catch {}
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, subFolderId]);

  useEffect(() => {
    loadShare();
  }, [loadShare]);

  const handleUpload = async (files: FileList) => {
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        if (subFolderId) formData.append('folderId', subFolderId);

        const res = await fetch(`${API_URL}/shares/public/${token}/upload`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Upload failed');
        }
      }
      loadShare();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const getDownloadLink = (fileId: string, inline = false) =>
    `${API_URL}/shares/public/${token}/download/${fileId}?inline=${inline}`;

  const handlePrintShareFile = async (file: any) => {
    const inlineUrl = getDownloadLink(file.id, true);
    const mime = (file.mimeType || '').toLowerCase();
    const ext = (file.extension || file.name.split('.').pop() || '').toLowerCase();

    // 1. PDF printing via invisible iframe
    if (mime.includes('pdf') || ext === 'pdf') {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = inlineUrl;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.open(inlineUrl, '_blank');
        }
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch {}
        }, 60000);
      };
      return;
    }

    // 2. Image printing via dedicated print window
    if (mime.startsWith('image/')) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Print - ${file.name}</title>
              <style>
                body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fff; }
                img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                @media print { body { margin: 0; } img { max-width: 100%; height: auto; } }
              </style>
            </head>
            <body>
              <img src="${inlineUrl}" onload="window.focus(); window.print(); window.close();" />
            </body>
          </html>
        `);
        printWindow.document.close();
      }
      return;
    }

    // 3. Text / Code printing
    if (mime.startsWith('text/') || ['txt', 'md', 'json', 'csv', 'log', 'ts', 'js', 'py', 'html', 'css'].includes(ext)) {
      let content = previewText;
      if (!content && file.id === data?.file?.id) content = previewText;
      if (!content) {
        try {
          const res = await fetch(inlineUrl);
          if (res.ok) content = await res.text();
        } catch {}
      }
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Print - ${file.name}</title>
              <style>
                body { font-family: monospace; padding: 24px; font-size: 13px; line-height: 1.5; color: #1e293b; background: #fff; }
                h1 { font-family: sans-serif; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 16px; }
                pre { white-space: pre-wrap; word-break: break-word; font-family: inherit; }
                @media print { body { padding: 0; } }
              </style>
            </head>
            <body>
              <h1>${file.name}</h1>
              <pre>${(content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
              <script>window.onload = function() { window.focus(); window.print(); window.close(); };</script>
            </body>
          </html>
        `);
        printWindow.document.close();
      }
      return;
    }

    // 4. Fallback for other formats
    const printWindow = window.open(inlineUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        try { printWindow.print(); } catch {}
      };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 p-8 text-center shadow-lg">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
            <X className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Link Unavailable</h1>
          <p className="text-sm text-slate-500 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <header className="h-16 px-4 md:px-8 bg-white border-b border-slate-200/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 flex items-center justify-center shadow-sm">
            <HardDrive className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-base tracking-tight block leading-none">
              NOOR DRIVE
            </span>
            <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              Shared {data.type === 'folder' ? 'Folder' : 'File'} • {data.permission}
            </span>
          </div>
        </div>

        {data.type === 'folder' && data.permission === 'EDITOR' && (
          <div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-semibold shadow-sm flex items-center gap-2 transition disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>{uploading ? 'Uploading...' : 'Upload Files'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  handleUpload(e.target.files);
                  e.target.value = '';
                }
              }}
            />
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        {data.type === 'file' ? (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-700 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base sm:text-lg font-bold text-zinc-900 truncate">
                    {data.file.name}
                  </h1>
                  <p className="text-xs sm:text-sm text-zinc-500">
                    {formatBytes(data.file.sizeBytes)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handlePrintShareFile(data.file)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold shadow-xs flex items-center gap-1.5 transition border border-slate-200"
                  title="Print File"
                >
                  <Printer className="w-4 h-4 text-slate-600" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const fullUrl = window.location.href;
                    const text = encodeURIComponent(`Check out "${data.file.name}" on NOOR DRIVE:\n${fullUrl}`);
                    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white text-sm font-semibold shadow-sm flex items-center gap-2 transition"
                  title="Share to WhatsApp"
                >
                  <MessageCircle className="w-4 h-4 fill-white/20" />
                  <span className="hidden sm:inline">WhatsApp</span>
                </button>
                <a
                  href={getDownloadLink(data.file.id, false)}
                  download={data.file.name}
                  className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold shadow-sm flex items-center gap-2 transition"
                >
                  <Download className="w-4 h-4" /> Download File
                </a>
              </div>
            </div>

            {/* Direct Inline Preview */}
            <div className={`rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden ${
              data.file.mimeType.includes('pdf') ||
              data.file.extension === 'docx' ||
              data.file.mimeType.includes('wordprocessingml') ||
              data.file.extension === 'pptx' ||
              data.file.mimeType.includes('presentationml')
                ? 'h-[80dvh] flex flex-col'
                : 'bg-white p-4 sm:p-6 flex items-center justify-center min-h-[420px]'
            }`}>
              {data.file.mimeType.startsWith('image/') ? (
                <img
                  src={getDownloadLink(data.file.id, true)}
                  alt={data.file.name}
                  className="max-h-[75vh] max-w-full rounded-2xl object-contain"
                />
              ) : data.file.mimeType.startsWith('video/') ? (
                <video
                  src={getDownloadLink(data.file.id, true)}
                  controls
                  className="max-h-[75vh] max-w-full rounded-2xl"
                />
              ) : data.file.mimeType.startsWith('audio/') ? (
                <audio src={getDownloadLink(data.file.id, true)} controls className="w-full max-w-md" />
              ) : data.file.mimeType.includes('pdf') ? (
                <PdfViewer
                  url={getDownloadLink(data.file.id, true)}
                  fileName={data.file.name}
                  onDownload={() => window.open(getDownloadLink(data.file.id, false), '_blank')}
                />
              ) : data.file.extension === 'docx' ||
                data.file.mimeType.includes('wordprocessingml') ? (
                <DocxViewer
                  url={getDownloadLink(data.file.id, true)}
                  fileName={data.file.name}
                  onDownloadOriginal={() => window.open(getDownloadLink(data.file.id, false), '_blank')}
                />
              ) : data.file.extension === 'pptx' ||
                data.file.mimeType.includes('presentationml') ? (
                <PptxViewer
                  url={getDownloadLink(data.file.id, true)}
                  fileName={data.file.name}
                  onDownloadOriginal={() => window.open(getDownloadLink(data.file.id, false), '_blank')}
                />
              ) : previewText !== null ? (
                <pre className="w-full max-h-[75vh] overflow-auto p-5 rounded-2xl bg-zinc-50 border border-zinc-200/70 text-zinc-800 text-xs font-mono whitespace-pre-wrap">
                  {previewText}
                </pre>
              ) : (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-zinc-300" />
                  <p className="text-sm text-zinc-500">
                    Click Download File above to open this file.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              {subFolderId && subFolderId !== data.rootFolderId && (
                <button
                  onClick={() => setSubFolderId(data.folder?.parentId || data.rootFolderId)}
                  className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <h1 className="text-xl font-bold text-slate-900">
                {data.folder?.name || 'Shared Folder'}
              </h1>
            </div>

            {data.subFolders?.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {data.subFolders.map((folder: any) => (
                  <button
                    key={folder.id}
                    onClick={() => setSubFolderId(folder.id)}
                    className="p-3.5 rounded-2xl bg-white border border-slate-200/80 hover:border-indigo-300 hover:shadow-md flex items-center gap-3 text-left transition"
                  >
                    <FolderIcon className="w-5 h-5 text-amber-500 shrink-0" />
                    <span className="text-sm font-semibold truncate">{folder.name}</span>
                  </button>
                ))}
              </div>
            )}

            {data.files?.length === 0 && data.subFolders?.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-500 text-sm">
                This shared folder is empty.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {data.files?.map((file: any) => (
                  <div
                    key={file.id}
                    className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs hover:shadow-md transition flex flex-col justify-between gap-3"
                  >
                    <div
                      onClick={() => openPreview(file)}
                      className="cursor-pointer space-y-2"
                    >
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <FileText className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-semibold truncate">{file.name}</p>
                      <p className="text-xs text-slate-400">{formatBytes(file.sizeBytes)}</p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openPreview(file)}
                          className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> Preview
                        </button>
                        <button
                          onClick={() => handlePrintShareFile(file)}
                          className="text-xs font-semibold text-emerald-600 hover:underline flex items-center gap-1"
                          title="Print File"
                        >
                          <Printer className="w-3.5 h-3.5" /> Print
                        </button>
                      </div>
                      <a
                        href={getDownloadLink(file.id, false)}
                        download={file.name}
                        className="text-xs font-semibold text-sky-600 hover:underline flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" /> Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {previewFile && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col p-4">
          <div className="flex items-center justify-between text-white pb-4">
            <span className="font-semibold truncate">{previewFile.name}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePrintShareFile(previewFile)}
                className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-sm font-medium flex items-center gap-1.5"
                title="Print File"
              >
                <Printer className="w-4 h-4" /> Print
              </button>
              <a
                href={getDownloadLink(previewFile.id, false)}
                download={previewFile.name}
                className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-sm font-medium flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" /> Download
              </a>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-auto">
            {previewFile.mimeType.startsWith('image/') ? (
              <img
                src={getDownloadLink(previewFile.id, true)}
                alt={previewFile.name}
                className="max-h-full max-w-full rounded-2xl object-contain"
              />
            ) : previewFile.mimeType.startsWith('video/') ? (
              <video
                src={getDownloadLink(previewFile.id, true)}
                controls
                className="max-h-full max-w-full rounded-2xl"
              />
            ) : previewFile.mimeType.startsWith('audio/') ? (
              <audio src={getDownloadLink(previewFile.id, true)} controls />
            ) : previewFile.mimeType.includes('pdf') ? (
              <iframe
                src={getDownloadLink(previewFile.id, true)}
                className="w-full h-full rounded-2xl bg-white"
              />
            ) : previewText !== null ? (
              <pre className="w-full max-w-4xl max-h-full overflow-auto p-6 rounded-2xl bg-white text-slate-900 text-xs font-mono shadow-2xl whitespace-pre-wrap">
                {previewText}
              </pre>
            ) : (
              <div className="text-white text-center">
                <FileText className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                <p className="text-sm text-slate-300">Click Download to open this file.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

