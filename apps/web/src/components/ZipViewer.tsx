'use client';

import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import {
  Folder as FolderIcon,
  FileText,
  Download,
  Loader2,
  Archive,
  Search,
  ChevronRight,
  HardDrive,
  FileCode,
  Image as ImageIcon,
  Music,
  Video as VideoIcon,
} from 'lucide-react';

interface ZipEntry {
  name: string;
  path: string;
  dir: boolean;
  sizeBytes: number;
  date?: Date;
  parentPath: string;
}

interface ZipViewerProps {
  url: string;
  fileName: string;
  onDownloadOriginal: () => void;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
    return <ImageIcon className="w-4 h-4 text-sky-400" />;
  }
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
    return <VideoIcon className="w-4 h-4 text-purple-400" />;
  }
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    return <Music className="w-4 h-4 text-pink-400" />;
  }
  if (['js', 'ts', 'tsx', 'jsx', 'json', 'py', 'html', 'css'].includes(ext)) {
    return <FileCode className="w-4 h-4 text-emerald-400" />;
  }
  return <FileText className="w-4 h-4 text-slate-400" />;
}

export default function ZipViewer({ url, fileName, onDownloadOriginal }: ZipViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zipInstance, setZipInstance] = useState<JSZip | null>(null);
  const [entries, setEntries] = useState<ZipEntry[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [search, setSearch] = useState('');
  const [totalUncompressedBytes, setTotalUncompressedBytes] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load archive');
        return res.arrayBuffer();
      })
      .then(async (buf) => {
        if (cancelled) return;
        const zip = await JSZip.loadAsync(buf);
        setZipInstance(zip);

        const list: ZipEntry[] = [];
        let totalBytes = 0;

        zip.forEach((relativePath, zipObj) => {
          const cleanPath = relativePath.replace(/\/$/, '');
          const parts = cleanPath.split('/');
          const name = parts[parts.length - 1];
          const parentPath = parts.slice(0, -1).join('/');
          const isDir = zipObj.dir;
          // JSZip _data uncompressed size
          const size = (zipObj as any)._data?.uncompressedSize || 0;
          totalBytes += size;

          list.push({
            name,
            path: relativePath,
            dir: isDir,
            sizeBytes: size,
            date: zipObj.date,
            parentPath,
          });
        });

        setEntries(list);
        setTotalUncompressedBytes(totalBytes);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Cannot read archive');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  const downloadFileFromZip = async (entry: ZipEntry) => {
    if (!zipInstance || entry.dir) return;
    try {
      const fileObj = zipInstance.file(entry.path);
      if (!fileObj) return;
      const blob = await fileObj.async('blob');
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = entry.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {}
  };

  const breadcrumbs = currentFolder
    ? currentFolder.split('/').filter(Boolean)
    : [];

  const filteredEntries = search
    ? entries.filter(
        (e) => !e.dir && e.name.toLowerCase().includes(search.toLowerCase()),
      )
    : entries.filter((e) => e.parentPath === currentFolder);

  return (
    <div className="w-full max-w-4xl max-h-[85dvh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white animate-in zoom-in-95">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/60">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <Archive className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm sm:text-base text-white truncate max-w-md">
              {fileName}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Archive Inspector • {entries.length} items • {formatBytes(totalUncompressedBytes)} uncompressed
            </p>
          </div>
        </div>

        <button
          onClick={onDownloadOriginal}
          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs flex items-center gap-2 transition shrink-0"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Download ZIP</span>
        </button>
      </div>

      {/* Search & Breadcrumb Bar */}
      <div className="px-4 sm:px-5 py-2.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1">
          <button
            onClick={() => {
              setCurrentFolder('');
              setSearch('');
            }}
            className={`font-semibold hover:text-indigo-400 transition shrink-0 ${
              !currentFolder ? 'text-indigo-400' : 'text-slate-400'
            }`}
          >
            Root
          </button>
          {breadcrumbs.map((part, idx) => {
            const pathUpTo = breadcrumbs.slice(0, idx + 1).join('/');
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={pathUpTo}>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <button
                  onClick={() => setCurrentFolder(pathUpTo)}
                  className={`hover:text-indigo-400 transition truncate max-w-[120px] ${
                    isLast ? 'text-indigo-400 font-bold' : 'text-slate-400'
                  }`}
                >
                  {part}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="relative w-40 sm:w-56 shrink-0">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter archive..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs focus:outline-none focus:border-indigo-500 text-white transition placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Body List */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 divide-y divide-slate-800/60 min-h-[320px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-56 text-slate-400 space-y-3">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-xs">Reading archive structure with NOOR DRIVE Engine...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-56 text-rose-400 text-center p-4">
            <Archive className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 text-slate-400 text-center">
            <p className="text-sm">Folder is empty</p>
          </div>
        ) : (
          filteredEntries.map((entry) => {
            if (entry.dir) {
              const cleanFolder = entry.path.replace(/\/$/, '');
              return (
                <div
                  key={entry.path}
                  onClick={() => setCurrentFolder(cleanFolder)}
                  className="py-2.5 px-3 rounded-xl hover:bg-slate-800/60 cursor-pointer flex items-center justify-between gap-3 transition group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FolderIcon className="w-4.5 h-4.5 text-amber-400 shrink-0 fill-amber-400/20" />
                    <span className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-amber-300 transition truncate">
                      {entry.name}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">Folder</span>
                </div>
              );
            }

            return (
              <div
                key={entry.path}
                className="py-2.5 px-3 rounded-xl hover:bg-slate-800/60 flex items-center justify-between gap-3 transition group"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {getFileIcon(entry.name)}
                  <span className="text-xs sm:text-sm font-medium text-slate-200 group-hover:text-white transition truncate">
                    {entry.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] font-mono text-slate-400">
                    {formatBytes(entry.sizeBytes)}
                  </span>
                  <button
                    onClick={() => downloadFileFromZip(entry)}
                    title={`Extract & Download ${entry.name}`}
                    className="p-1.5 rounded-lg hover:bg-indigo-600 text-slate-400 hover:text-white transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
