'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  HardDrive,
  Folder as FolderIcon,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Archive,
  Star,
  Trash2,
  Clock,
  Search,
  Upload,
  FolderPlus,
  LayoutGrid,
  List,
  Sun,
  Moon,
  LogOut,
  Shield,
  Database,
  Download,
  Eye,
  Edit3,
  RotateCcw,
  X,
  Check,
  Loader2,
  Menu,
  ChevronRight,
  Send,
  Smartphone,
  Cloud,
  Sparkles,
  Lock,
  Share2,
  Copy,
  Link2,
  ArrowLeft,
} from 'lucide-react';
import {
  apiFetch,
  clearStoredTokens,
  fetchAuthorizedBlobUrl,
  getApiUrl,
  getStoredTokens,
  uploadFileWithProgress,
  UploadProgressInfo,
} from '@/lib/api';
import PdfViewer from '@/components/PdfViewer';
import DocxViewer from '@/components/DocxViewer';
import PptxViewer from '@/components/PptxViewer';

type ViewMode = 'my-drive' | 'recent' | 'starred' | 'photos' | 'videos' | 'documents' | 'trash';

function formatBytes(bytesStr: string | number) {
  const bytes = Number(bytesStr || 0);
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getFileVisual(mime: string) {
  if (mime.startsWith('image/')) {
    return {
      icon: <ImageIcon className="w-6 h-6 text-sky-600 dark:text-sky-400" />,
      bg: 'bg-sky-50 dark:bg-sky-500/10',
      badge: 'Image',
    };
  }
  if (mime.startsWith('video/')) {
    return {
      icon: <Video className="w-6 h-6 text-purple-600 dark:text-purple-400" />,
      bg: 'bg-purple-50 dark:bg-purple-500/10',
      badge: 'Video',
    };
  }
  if (mime.startsWith('audio/')) {
    return {
      icon: <Music className="w-6 h-6 text-pink-600 dark:text-pink-400" />,
      bg: 'bg-pink-50 dark:bg-pink-500/10',
      badge: 'Audio',
    };
  }
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar')) {
    return {
      icon: <Archive className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
      bg: 'bg-amber-50 dark:bg-amber-500/10',
      badge: 'Archive',
    };
  }
  if (mime.includes('pdf')) {
    return {
      icon: <FileText className="w-6 h-6 text-rose-600 dark:text-rose-400" />,
      bg: 'bg-rose-50 dark:bg-rose-500/10',
      badge: 'PDF',
    };
  }
  return {
    icon: <FileText className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />,
    bg: 'bg-indigo-50 dark:bg-indigo-500/10',
    badge: 'Document',
  };
}

const thumbnailCache = new Map<string, string>();
const textSnippetCache = new Map<string, string>();
const driveViewCache = new Map<string, { folders: any[]; files: any[]; breadcrumbs: any[] }>();

function FileThumbnail({
  fileId,
  mimeType,
  extension,
  fallbackIcon,
}: {
  fileId: string;
  mimeType: string;
  extension?: string;
  fallbackIcon: React.ReactNode;
}) {
  const [src, setSrc] = useState<string | null>(thumbnailCache.get(fileId) || null);
  const [snippet, setSnippet] = useState<string | null>(textSnippetCache.get(fileId) || null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfReady, setPdfReady] = useState(false);

  const isText =
    mimeType.startsWith('text/') ||
    ['md', 'txt', 'json', 'csv', 'log', 'ts', 'js', 'py'].includes(extension || '');
  const isPdf = mimeType.includes('pdf');

  useEffect(() => {
    if (!mimeType.startsWith('image/') && !isText && !isPdf) return;
    if (thumbnailCache.has(fileId)) {
      setSrc(thumbnailCache.get(fileId)!);
      return;
    }
    if (textSnippetCache.has(fileId)) {
      setSnippet(textSnippetCache.get(fileId)!);
      return;
    }
    let cancelled = false;
    fetchAuthorizedBlobUrl(fileId)
      .then(async (url) => {
        if (isText) {
          const res = await fetch(url);
          const txt = (await res.text()).slice(0, 320);
          URL.revokeObjectURL(url);
          textSnippetCache.set(fileId, txt);
          if (!cancelled) setSnippet(txt);
        } else {
          thumbnailCache.set(fileId, url);
          if (!cancelled) setSrc(url);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fileId, mimeType, isText, isPdf]);

  useEffect(() => {
    if (!isPdf || !src || !pdfCanvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const buf = await (await fetch(src)).arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        if (cancelled || !pdfCanvasRef.current) return;
        const page = await pdf.getPage(1);
        const vp1 = page.getViewport({ scale: 1 });
        const scale = 320 / vp1.width;
        const viewport = page.getViewport({ scale });
        const canvas = pdfCanvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (!cancelled) setPdfReady(true);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [isPdf, src]);

  if (src && mimeType.startsWith('image/')) {
    return (
      <img
        src={src}
        alt=""
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
    );
  }

  if (src && isPdf) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white overflow-hidden">
        <canvas
          ref={pdfCanvasRef}
          className={`w-full h-full object-cover object-top ${pdfReady ? 'block' : 'hidden'}`}
        />
        {!pdfReady && fallbackIcon}
      </div>
    );
  }

  if (snippet !== null) {
    return (
      <div className="w-full h-full p-3 bg-white/85 dark:bg-slate-900/80 text-left overflow-hidden select-none">
        <pre className="text-[9px] leading-relaxed font-mono text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">
          {snippet}
        </pre>
      </div>
    );
  }

  return <>{fallbackIcon}</>;
}

function DriveDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const view = (searchParams.get('view') as ViewMode) || 'my-drive';
  const folderId = searchParams.get('folderId') || null;

  const navigateDrive = useCallback(
    (nextView: ViewMode, nextFolderId: string | null = null) => {
      const params = new URLSearchParams();
      if (nextView && nextView !== 'my-drive') params.set('view', nextView);
      if (nextFolderId) params.set('folderId', nextFolderId);
      const qs = params.toString();
      router.push(qs ? `/?${qs}` : '/');
    },
    [router],
  );

  const [user, setUser] = useState<any>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [darkMode, setDarkMode] = useState(false); // White / Light Mode by default
  const [accentColor, setAccentColor] = useState<string>('#18181b');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Upload & Drag states
  const [isDragging, setIsDragging] = useState(false);
  const [dragTargetFolderId, setDragTargetFolderId] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<
    { id: string; name: string; progress: UploadProgressInfo; controller: AbortController }[]
  >([]);

  // Modals
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameModal, setRenameModal] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);
  const [previewModal, setPreviewModal] = useState<{
    file: any;
    url?: string;
    textContent?: string;
    loading?: boolean;
  } | null>(null);
  const [storageModalOpen, setStorageModalOpen] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [appDownloadModalOpen, setAppDownloadModalOpen] = useState(false);
  const [apkSizeBytes, setApkSizeBytes] = useState<string | null>(null);
  const [apkVersion, setApkVersion] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    description: string;
    confirmText: string;
    onConfirm: () => void;
  } | null>(null);

  // Share Modal State
  const [shareModal, setShareModal] = useState<{
    type: 'file' | 'folder';
    id: string;
    name: string;
  } | null>(null);
  const [sharePermission, setSharePermission] = useState<'VIEWER' | 'EDITOR'>('VIEWER');
  const [shareExpiresHours, setShareExpiresHours] = useState<number>(0);
  const [shareLinks, setShareLinks] = useState<any[]>([]);
  const [creatingShare, setCreatingShare] = useState(false);

  // Storage Settings
  const [selectedBackend, setSelectedBackend] = useState<'LOCAL_DISK' | 'TELEGRAM_MTPROTO'>('TELEGRAM_MTPROTO');
  const [tgConsent, setTgConsent] = useState(true);
  const [tgTarget, setTgTarget] = useState('me');

  // Security Settings
  const [sessions, setSessions] = useState<any[]>([]);
  const [twoFaQr, setTwoFaQr] = useState<string | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const saved = localStorage.getItem('noor_accent_color');
    if (saved) setAccentColor(saved);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const loadUser = useCallback(async () => {
    const { accessToken } = getStoredTokens();
    if (!accessToken) {
      router.push('/login');
      return;
    }
    try {
      const me = await apiFetch('/auth/me');
      setUser(me);
      setSelectedBackend(me.preferredStorageBackend);
      setTgConsent(me.telegramConsentGiven);
    } catch (err: any) {
      if (err.message?.includes('Session') || err.message?.includes('Unauthorized')) {
        router.push('/login');
      }
    }
  }, [router]);

  const loadDrive = useCallback(
    async (silent = false) => {
      const { accessToken } = getStoredTokens();
      if (!accessToken) {
        router.push('/login');
        return;
      }

      const cacheKey = `${view}:${folderId || 'root'}:${debouncedSearch}`;
      const cached = driveViewCache.get(cacheKey);
      if (cached && !silent) {
        setFolders(cached.folders);
        setFiles(cached.files);
        setBreadcrumbs(cached.breadcrumbs);
        setLoading(false);
      }

      try {
        if (!silent && !cached) setLoading(true);
        const driveData = await apiFetch(
          `/drive?view=${view}${folderId ? `&folderId=${folderId}` : ''}${
            debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''
          }`,
        );
        const normalized = {
          folders: driveData.folders || [],
          files: driveData.files || [],
          breadcrumbs: driveData.breadcrumbs || [],
        };
        driveViewCache.set(cacheKey, normalized);
        setFolders(normalized.folders);
        setFiles(normalized.files);
        setBreadcrumbs(normalized.breadcrumbs);
      } catch (err: any) {
        if (err.message?.includes('Session') || err.message?.includes('Unauthorized')) {
          router.push('/login');
        } else {
          showToast(err.message || 'Failed to load drive', 'error');
        }
      } finally {
        setLoading(false);
      }
    },
    [view, folderId, debouncedSearch, router],
  );

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    loadDrive();
  }, [loadDrive]);

  const formatEta = (sec: number) => {
    if (sec <= 0) return 'Almost done';
    if (sec < 60) return `${sec}s left`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s left`;
  };

  const handleUploadFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;

    // Cache folder paths when uploading a directory (webkitRelativePath)
    const folderCache = new Map<string, string>();
    const resolveTargetFolder = async (relativePath?: string): Promise<string | null> => {
      if (!relativePath || !relativePath.includes('/')) return folderId;
      const parts = relativePath.split('/').slice(0, -1); // exclude filename
      let currentParent = folderId;
      let builtPath = '';
      for (const part of parts) {
        builtPath = builtPath ? `${builtPath}/${part}` : part;
        if (folderCache.has(builtPath)) {
          currentParent = folderCache.get(builtPath)!;
        } else {
          const created = await apiFetch('/drive/folders', {
            method: 'POST',
            body: JSON.stringify({ name: part, parentId: currentParent }),
          });
          folderCache.set(builtPath, created.id);
          currentParent = created.id;
        }
      }
      return currentParent;
    };

    for (const file of arr) {
      const uploadId = `${file.name}-${Date.now()}-${Math.random()}`;
      const controller = new AbortController();
      setUploadingFiles((prev) => [
        ...prev,
        {
          id: uploadId,
          name: file.name,
          controller,
          progress: {
            loadedBytes: 0,
            totalBytes: file.size,
            percent: 0,
            speedBytesPerSec: 0,
            etaSeconds: 0,
            phase: 'uploading',
          },
        },
      ]);

      try {
        const relPath = ((file as any)._relativePath || (file as any).webkitRelativePath) as
          | string
          | undefined;
        const targetFolderId = await resolveTargetFolder(relPath);

        const formData = new FormData();
        formData.append('file', file);
        if (targetFolderId) formData.append('folderId', targetFolderId);
        formData.append('backend', selectedBackend);

        await uploadFileWithProgress(
          formData,
          (progress) => {
            setUploadingFiles((prev) =>
              prev.map((u) => (u.id === uploadId ? { ...u, progress } : u)),
            );
          },
          controller.signal,
        );
        showToast(`Uploaded "${file.name}" to NOOR DRIVE`);
      } catch (err: any) {
        if (err.message === 'Upload cancelled') {
          showToast(`Cancelled "${file.name}"`, 'error');
        } else {
          showToast(`${file.name}: ${err.message}`, 'error');
        }
      } finally {
        setUploadingFiles((prev) => prev.filter((u) => u.id !== uploadId));
      }
    }
    loadDrive(true);
    loadUser();
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const created = await apiFetch('/drive/folders', {
        method: 'POST',
        body: JSON.stringify({ name: newFolderName.trim(), parentId: folderId }),
      });
      setFolders((prev) => [created, ...prev]);
      setNewFolderName('');
      setNewFolderOpen(false);
      showToast('Folder created');
      loadDrive(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleStar = async (type: 'file' | 'folder', id: string) => {
    if (type === 'file') {
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, isStarred: !f.isStarred } : f)));
    } else {
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, isStarred: !f.isStarred } : f)));
    }
    try {
      await apiFetch(`/drive/${type}/${id}/star`, { method: 'PATCH' });
    } catch (err: any) {
      showToast(err.message, 'error');
      loadDrive(true);
    }
  };

  const handleTrash = async (type: 'file' | 'folder', id: string) => {
    if (type === 'file') {
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } else {
      setFolders((prev) => prev.filter((f) => f.id !== id));
    }
    try {
      await apiFetch(`/drive/${type}/${id}/trash`, { method: 'PATCH' });
      showToast('Moved to Trash');
    } catch (err: any) {
      showToast(err.message, 'error');
      loadDrive(true);
    }
  };

  const handleRestore = async (type: 'file' | 'folder', id: string) => {
    if (type === 'file') {
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } else {
      setFolders((prev) => prev.filter((f) => f.id !== id));
    }
    try {
      await apiFetch(`/drive/${type}/${id}/restore`, { method: 'PATCH' });
      showToast('Restored successfully');
    } catch (err: any) {
      showToast(err.message, 'error');
      loadDrive(true);
    }
  };

  const handlePermanentDelete = async (type: 'file' | 'folder', id: string) => {
    if (type === 'file') {
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } else {
      setFolders((prev) => prev.filter((f) => f.id !== id));
    }
    try {
      await apiFetch(`/drive/${type === 'file' ? 'files' : 'folders'}/${id}`, { method: 'DELETE' });
      showToast('Permanently deleted');
      loadUser();
    } catch (err: any) {
      showToast(err.message, 'error');
      loadDrive(true);
    }
  };

  const handleEmptyTrash = async () => {
    setFiles([]);
    setFolders([]);
    try {
      await apiFetch('/drive/trash/empty', { method: 'DELETE' });
      showToast('Trash emptied');
      loadUser();
    } catch (err: any) {
      showToast(err.message, 'error');
      loadDrive(true);
    }
  };

  const handleChangePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: currentPasscode,
          newPassword: newPasscode,
        }),
      });
      setCurrentPasscode('');
      setNewPasscode('');
      showToast('Passcode updated successfully');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleLogoutAll = async () => {
    try {
      await apiFetch('/auth/logout-all', { method: 'POST' });
      clearStoredTokens();
      router.push('/login');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameModal || !renameModal.name.trim()) return;
    const trimmed = renameModal.name.trim();
    if (renameModal.type === 'file') {
      setFiles((prev) => prev.map((f) => (f.id === renameModal.id ? { ...f, name: trimmed } : f)));
    } else {
      setFolders((prev) => prev.map((f) => (f.id === renameModal.id ? { ...f, name: trimmed } : f)));
    }
    const target = renameModal;
    setRenameModal(null);
    try {
      await apiFetch(`/drive/${target.type}/${target.id}/rename`, {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      });
      showToast('Renamed');
    } catch (err: any) {
      showToast(err.message, 'error');
      loadDrive(true);
    }
  };

  const handlePreview = async (file: any) => {
    setPreviewModal({ file, loading: true });
    try {
      const url = await fetchAuthorizedBlobUrl(file.id);
      let textContent: string | undefined;
      if (
        file.mimeType.startsWith('text/') ||
        ['json', 'md', 'csv', 'log', 'ts', 'js', 'py'].includes(file.extension)
      ) {
        const res = await fetch(url);
        textContent = await res.text();
      }
      setPreviewModal({ file, url, textContent, loading: false });
    } catch {
      setPreviewModal(null);
      showToast('Could not preview file', 'error');
    }
  };

  const handleDownload = async (file: any) => {
    try {
      const url = await fetchAuthorizedBlobUrl(file.id);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Download failed', 'error');
    }
  };

  const handleDownloadFolder = async (folder: any) => {
    try {
      showToast(`Preparing ${folder.name}.zip...`);
      const { accessToken } = getStoredTokens();
      const res = await fetch(`${getApiUrl()}/drive/folders/${folder.id}/download`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) throw new Error('Folder download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folder.name}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Folder download failed', 'error');
    }
  };

  const saveStoragePreferences = async () => {
    try {
      await apiFetch('/drive/storage/preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          preferredStorageBackend: selectedBackend,
          telegramConsentGiven: tgConsent,
          telegramChatTarget: tgTarget,
        }),
      });
      showToast('Storage preferences updated');
      setStorageModalOpen(false);
      loadUser();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const openSecuritySettings = async () => {
    setSecurityModalOpen(true);
    try {
      const list = await apiFetch('/auth/sessions');
      setSessions(list);
    } catch {}
  };

  const handleSetup2fa = async () => {
    try {
      const res = await apiFetch('/auth/2fa/setup', { method: 'POST' });
      setTwoFaQr(res.qrCodeDataUrl);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleVerify2fa = async () => {
    try {
      await apiFetch('/auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ code: twoFaCode }),
      });
      setTwoFaQr(null);
      setTwoFaCode('');
      showToast('Two-Factor Authentication enabled!');
      loadUser();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const openShareModal = async (type: 'file' | 'folder', id: string, name: string) => {
    setShareModal({ type, id, name });
    setSharePermission(type === 'folder' ? 'EDITOR' : 'VIEWER');
    setShareExpiresHours(0);
    try {
      const list = await apiFetch(`/shares?type=${type}&targetId=${id}`);
      setShareLinks(list || []);
    } catch {
      setShareLinks([]);
    }
  };

  const handleCreateShareLink = async () => {
    if (!shareModal) return;
    setCreatingShare(true);
    try {
      const created = await apiFetch('/shares', {
        method: 'POST',
        body: JSON.stringify({
          type: shareModal.type,
          targetId: shareModal.id,
          permission: sharePermission,
          expiresInHours: shareExpiresHours > 0 ? shareExpiresHours : undefined,
        }),
      });
      setShareLinks((prev) => [created, ...prev]);
      const url = `${window.location.origin}/share/${created.shareToken}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      showToast('Share link created & copied!');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setCreatingShare(false);
    }
  };

  const handleRevokeShareLink = async (shareId: string) => {
    setShareLinks((prev) => prev.filter((s) => s.id !== shareId));
    try {
      await apiFetch(`/shares/${shareId}`, { method: 'DELETE' });
      showToast('Share link revoked');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {}
    clearStoredTokens();
    router.push('/login');
  };

  const handleMoveItem = async (
    type: 'file' | 'folder',
    id: string,
    targetFolderId: string | null,
  ) => {
    if (type === 'folder' && id === targetFolderId) return;
    if (targetFolderId === folderId) return;

    if (type === 'file') {
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } else {
      setFolders((prev) => prev.filter((f) => f.id !== id));
    }

    try {
      await apiFetch(`/drive/${type}/${id}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ parentId: targetFolderId }),
      });
      showToast('Moved successfully');
      driveViewCache.clear();
      loadDrive(true);
    } catch (err: any) {
      showToast(err.message || 'Move failed', 'error');
      loadDrive(true);
    }
  };

  const handleDropItems = async (dataTransfer: DataTransfer) => {
    const items = dataTransfer.items;
    if (!items || items.length === 0) {
      if (dataTransfer.files?.length) handleUploadFiles(dataTransfer.files);
      return;
    }

    const collectedFiles: File[] = [];
    const emptyDirs: string[] = [];
    const readEntry = async (entry: any, pathPrefix = ''): Promise<void> => {
      if (entry.isFile) {
        await new Promise<void>((resolve) => {
          entry.file(
            (file: File) => {
              if (pathPrefix) {
                const rel = `${pathPrefix}${file.name}`;
                (file as any)._relativePath = rel;
                try {
                  Object.defineProperty(file, 'webkitRelativePath', {
                    value: rel,
                    configurable: true,
                  });
                } catch {}
              }
              collectedFiles.push(file);
              resolve();
            },
            () => resolve(),
          );
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries: any[] = await new Promise((resolve) => {
          const all: any[] = [];
          const readBatch = () => {
            reader.readEntries(
              (batch: any[]) => {
                if (batch.length === 0) resolve(all);
                else {
                  all.push(...batch);
                  readBatch();
                }
              },
              () => resolve(all),
            );
          };
          readBatch();
        });
        if (entries.length === 0) {
          emptyDirs.push(`${pathPrefix}${entry.name}`);
        } else {
          for (const child of entries) {
            await readEntry(child, `${pathPrefix}${entry.name}/`);
          }
        }
      }
    };

    const entries: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }

    if (entries.length > 0) {
      for (const entry of entries) {
        await readEntry(entry);
      }
      for (const dirName of emptyDirs) {
        try {
          const parts = dirName.split('/').filter(Boolean);
          let parent = folderId;
          for (const part of parts) {
            const created = await apiFetch('/drive/folders', {
              method: 'POST',
              body: JSON.stringify({ name: part, parentId: parent || undefined }),
            });
            parent = created.id;
          }
        } catch {}
      }
      if (emptyDirs.length > 0 && collectedFiles.length === 0) {
        showToast('Folder uploaded');
        driveViewCache.clear();
        loadDrive(true);
      }
      if (collectedFiles.length > 0) {
        handleUploadFiles(collectedFiles);
      }
    } else if (dataTransfer.files?.length) {
      handleUploadFiles(dataTransfer.files);
    }
  };

  const usedPercent = user
    ? Math.min(
        100,
        Math.round((Number(user.usedStorageBytes) / Math.max(1, Number(user.storageQuotaBytes))) * 100),
      )
    : 0;

  const navItems: { id: ViewMode; label: string; icon: any }[] = [
    { id: 'my-drive', label: 'My Drive', icon: HardDrive },
    { id: 'recent', label: 'Recent', icon: Clock },
    { id: 'starred', label: 'Starred', icon: Star },
    { id: 'photos', label: 'Photos', icon: ImageIcon },
    { id: 'videos', label: 'Videos', icon: Video },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'trash', label: 'Trash', icon: Trash2 },
  ];

  return (
    <div
      className="min-h-screen flex bg-[#f6f7f9] dark:bg-[#0b0f17] text-zinc-900 dark:text-slate-100"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsDragging(true);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          if (!isDragging) setIsDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragging(false);
          setDragTargetFolderId(null);
        }
      }}
      onDrop={(e) => {
        setIsDragging(false);
        setDragTargetFolderId(null);
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          handleDropItems(e.dataTransfer);
        }
      }}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-indigo-500/15 backdrop-blur-sm border-4 border-dashed border-indigo-500 flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-slate-900 px-10 py-8 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
              <Upload className="w-7 h-7 animate-bounce" />
            </div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              Drop files to upload to NOOR DRIVE
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Destination: Noor Cloud Vault
            </p>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-xs md:hidden"
        />
      )}

      {/* White Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-68 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight block leading-none text-slate-900 dark:text-white">
                NOOR DRIVE
              </span>
              <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                Personal Vault
              </span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Action Buttons */}
        <div className="px-4 mb-5 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ backgroundColor: accentColor }}
              className="flex-1 py-2.5 px-3 rounded-xl hover:opacity-90 text-white text-sm font-semibold shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <Upload className="w-4 h-4" />
              <span>Upload File</span>
            </button>
            <button
              onClick={() => setNewFolderOpen(true)}
              title="New Folder"
              className="p-2.5 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition border border-slate-200/90 dark:border-slate-700 shadow-xs active:scale-[0.98]"
            >
              <FolderPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </button>
          </div>
          <button
            onClick={() => folderInputRef.current?.click()}
            className="w-full py-2 px-3 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition border border-slate-200/90 dark:border-slate-700 shadow-xs active:scale-[0.98]"
          >
            <FolderIcon className="w-3.5 h-3.5 text-amber-500" />
            <span>Upload Folder</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                handleUploadFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            {...({ webkitdirectory: '', directory: '' } as any)}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                handleUploadFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  navigateDrive(item.id, null);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                  active
                    ? 'bg-zinc-100 text-zinc-950 font-semibold dark:bg-zinc-800 dark:text-white'
                    : 'text-zinc-600 dark:text-slate-400 hover:bg-zinc-100/70 dark:hover:bg-slate-800/60 hover:text-zinc-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-blue-600 dark:text-blue-400' : ''}`} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 space-y-1">
            <p className="px-3.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Vault &amp; Security
            </p>
            <button
              onClick={() => setStorageModalOpen(true)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition"
            >
              <Database className="w-4 h-4 text-sky-500" />
              <span>Cloud Storage</span>
            </button>
            <button
              onClick={openSecuritySettings}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition"
            >
              <Shield className="w-4 h-4 text-emerald-500" />
              <span>Passcode &amp; 2FA</span>
            </button>
            <button
              onClick={() => {
                setAppDownloadModalOpen(true);
                fetch(`${getApiUrl()}/shares/app-release`)
                  .then((r) => (r.ok ? r.json() : null))
                  .then((d) => {
                    if (d?.sizeBytes) setApkSizeBytes(String(d.sizeBytes));
                    if (d?.version) setApkVersion(d.version);
                  })
                  .catch(() => {});
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition"
            >
              <Smartphone className="w-4 h-4 text-indigo-500" />
              <span>Download Android App</span>
            </button>
          </div>
        </nav>

        {/* Storage Quota Card */}
        <div className="p-4 m-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5 text-indigo-500" /> Storage
            </span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">{usedPercent}%</span>
          </div>
          <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-indigo-600 to-sky-500 rounded-full transition-all duration-500"
              style={{ width: `${usedPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {user
              ? `${formatBytes(user.usedStorageBytes)} of ${formatBytes(user.storageQuotaBytes)}`
              : '...'}
          </p>
          <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 flex items-center gap-1">
              <Send className="w-3 h-3 text-sky-500" />
              Noor Cloud
            </span>
            <div className="flex items-center gap-1.5">
              {['#18181b', '#2563eb', '#4f46e5', '#059669', '#e11d48'].map((hex) => (
                <button
                  key={hex}
                  onClick={() => {
                    setAccentColor(hex);
                    localStorage.setItem('noor_accent_color', hex);
                  }}
                  title="Customize Theme Color"
                  style={{ backgroundColor: hex }}
                  className={`w-3.5 h-3.5 rounded-full transition ${
                    accentColor === hex ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : 'opacity-75 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Crisp White Top Header */}
        <header className="px-4 md:px-8 py-3 border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl sticky top-0 z-30 space-y-2.5 sm:space-y-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-1 max-w-2xl">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="sm:hidden font-bold text-sm tracking-tight text-zinc-900 dark:text-white">
                NOOR DRIVE
              </span>
              <div className="relative flex-1 hidden sm:block">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search files, folders, extensions..."
                  className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-slate-100/80 dark:bg-slate-800/80 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500/40 focus:shadow-sm text-sm focus:outline-none transition"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setLayout('grid')}
                  className={`p-1.5 rounded-lg transition ${
                    layout === 'grid'
                      ? 'bg-white dark:bg-slate-700 shadow-xs text-indigo-600'
                      : 'text-slate-500'
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setLayout('list')}
                  className={`p-1.5 rounded-lg transition ${
                    layout === 'list'
                      ? 'bg-white dark:bg-slate-700 shadow-xs text-indigo-600'
                      : 'text-slate-500'
                  }`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
                title="Toggle Light/Dark Mode"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-500/10 text-slate-700 dark:text-slate-200 hover:text-rose-600 border border-slate-200/90 dark:border-slate-700 hover:border-rose-200 text-xs font-semibold shadow-xs transition"
                title="Lock Drive"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lock Vault</span>
              </button>

              <img
                src="/owner.jpg"
                alt="Noor Abdullah"
                title="Noor Abdullah (Owner)"
                onClick={openSecuritySettings}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover object-top border-2 border-indigo-500/30 cursor-pointer hover:scale-105 transition shadow-xs"
              />
            </div>
          </div>

          {/* Full-width Search Bar on Mobile */}
          <div className="relative sm:hidden">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files & folders..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500/40 text-sm focus:outline-none transition"
            />
          </div>
        </header>

        {/* Drive Workspace */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto space-y-6">
          {/* Quick Overview Cards (Only on My Drive root) */}
          {view === 'my-drive' && !folderId && !search && (
            <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 overflow-x-auto pb-1 sm:pb-0">
              <div className="min-w-[140px] sm:min-w-0 p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-[0_2px_10px_-4px_rgba(15,23,42,0.05)] flex items-center gap-3 shrink-0">
                <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Files Here</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{files.length}</p>
                </div>
              </div>

              <div className="min-w-[140px] sm:min-w-0 p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-[0_2px_10px_-4px_rgba(15,23,42,0.05)] flex items-center gap-3 shrink-0">
                <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                  <FolderIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Folders</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{folders.length}</p>
                </div>
              </div>

              <div
                onClick={() => setStorageModalOpen(true)}
                className="min-w-[155px] sm:min-w-0 p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-[0_2px_10px_-4px_rgba(15,23,42,0.05)] flex items-center gap-3 cursor-pointer hover:border-sky-300 transition shrink-0"
              >
                <div className="w-11 h-11 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
                  <Send className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">Storage Engine</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    Noor Cloud
                  </p>
                </div>
              </div>

              <div className="min-w-[140px] sm:min-w-0 p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-[0_2px_10px_-4px_rgba(15,23,42,0.05)] flex items-center gap-3 shrink-0">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">Used Space</p>
                  <p className="text-base font-bold text-slate-900 dark:text-white truncate">
                    {user ? formatBytes(user.usedStorageBytes) : '0 B'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Breadcrumbs + In-App Back Button */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm flex-wrap">
              {(folderId || view !== 'my-drive') && (
                <button
                  onClick={() => {
                    if (breadcrumbs.length > 1) {
                      navigateDrive(view, breadcrumbs[breadcrumbs.length - 2].id);
                    } else if (folderId) {
                      navigateDrive(view, null);
                    } else {
                      navigateDrive('my-drive', null);
                    }
                  }}
                  title="Go Back"
                  className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 shadow-xs transition active:scale-95"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => navigateDrive(view, null)}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('application/x-noor-item')) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragTargetFolderId('root');
                  }
                }}
                onDragLeave={() => setDragTargetFolderId((prev) => (prev === 'root' ? null : prev))}
                onDrop={(e) => {
                  const raw = e.dataTransfer.getData('application/x-noor-item');
                  if (raw) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragTargetFolderId(null);
                    try {
                      const item = JSON.parse(raw);
                      handleMoveItem(item.type, item.id, null);
                    } catch {}
                  }
                }}
                className={`font-bold text-lg text-slate-900 dark:text-white hover:text-indigo-600 transition capitalize px-1.5 py-0.5 rounded-lg ${
                  dragTargetFolderId === 'root' ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-500/20' : ''
                }`}
              >
                {view.replace('-', ' ')}
              </button>
              {breadcrumbs.map((crumb) => (
                <div key={crumb.id} className="flex items-center gap-1.5">
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                  <button
                    onClick={() => navigateDrive(view, crumb.id)}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes('application/x-noor-item')) {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragTargetFolderId(crumb.id);
                      }
                    }}
                    onDragLeave={() => setDragTargetFolderId((prev) => (prev === crumb.id ? null : prev))}
                    onDrop={(e) => {
                      const raw = e.dataTransfer.getData('application/x-noor-item');
                      if (raw) {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragTargetFolderId(null);
                        try {
                          const item = JSON.parse(raw);
                          handleMoveItem(item.type, item.id, crumb.id);
                        } catch {}
                      }
                    }}
                    className={`font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition px-1.5 py-0.5 rounded-lg ${
                      dragTargetFolderId === crumb.id ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-500/20' : ''
                    }`}
                  >
                    {crumb.name}
                  </button>
                </div>
              ))}
            </div>
            {view === 'trash' && (folders.length > 0 || files.length > 0) && (
              <button
                onClick={() =>
                  setConfirmModal({
                    title: 'Empty Trash?',
                    description:
                      'All files and folders in Trash will be permanently deleted from NOOR DRIVE.',
                    confirmText: 'Empty Trash',
                    onConfirm: handleEmptyTrash,
                  })
                }
                className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" /> Empty Trash
              </button>
            )}
          </div>

          {/* Active Uploads Banner with MB, Speed, and ETA */}
          {uploadingFiles.length > 0 && (
            <div className="space-y-2.5">
              {uploadingFiles.map((u) => (
                <div
                  key={u.id}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 shadow-sm space-y-2"
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
                      <span className="font-semibold text-slate-800 dark:text-white truncate">
                        {u.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-indigo-600">
                        {u.progress.phase === 'telegram'
                          ? 'Saving to NOOR DRIVE...'
                          : `${u.progress.percent}%`}
                      </span>
                      <button
                        onClick={() => u.controller.abort()}
                        title="Cancel Upload"
                        className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-600 to-sky-500 rounded-full transition-all duration-150"
                      style={{ width: `${u.progress.percent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {formatBytes(u.progress.loadedBytes)} / {formatBytes(u.progress.totalBytes)}
                    </span>
                    <span>
                      {u.progress.phase === 'telegram'
                        ? 'Finalizing in NOOR DRIVE...'
                        : `${formatBytes(u.progress.speedBytesPerSec)}/s • ${formatEta(
                            u.progress.etaSeconds,
                          )}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-36 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200/60 animate-pulse"
                />
              ))}
            </div>
          ) : folders.length === 0 && files.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center py-20 text-center shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-slate-800 flex items-center justify-center mb-4">
                <Upload className="w-7 h-7 text-indigo-500" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Your drive space is ready
              </h3>
              <p className="text-sm text-slate-500 max-w-sm mt-1 mb-5">
                Drag and drop photos, videos, or documents here, or click Upload to store them securely.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-md shadow-indigo-500/20 transition"
              >
                Upload First File
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Folders */}
              {folders.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Folders
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
                    {folders.map((folder) => (
                      <div
                        key={folder.id}
                        draggable={view !== 'trash'}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            'application/x-noor-item',
                            JSON.stringify({ type: 'folder', id: folder.id }),
                          );
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          if (e.dataTransfer.types.includes('application/x-noor-item')) {
                            e.preventDefault();
                            e.stopPropagation();
                            if (dragTargetFolderId !== folder.id) {
                              setDragTargetFolderId(folder.id);
                            }
                          }
                        }}
                        onDragLeave={() =>
                          setDragTargetFolderId((prev) => (prev === folder.id ? null : prev))
                        }
                        onDrop={(e) => {
                          const raw = e.dataTransfer.getData('application/x-noor-item');
                          if (raw) {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragTargetFolderId(null);
                            try {
                              const item = JSON.parse(raw);
                              handleMoveItem(item.type, item.id, folder.id);
                            } catch {}
                          }
                        }}
                        className={`group p-3.5 rounded-2xl bg-white dark:bg-slate-900 border hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-md hover:-translate-y-0.5 flex items-center justify-between gap-2 cursor-pointer transition-all ${
                          dragTargetFolderId === folder.id
                            ? 'border-indigo-500 ring-2 ring-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10'
                            : 'border-slate-200/80 dark:border-slate-800'
                        }`}
                        onDoubleClick={() => navigateDrive(view, folder.id)}
                      >
                        <div
                          className="flex items-center gap-3 min-w-0 flex-1"
                          onClick={() => navigateDrive(view, folder.id)}
                        >
                          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                            <FolderIcon className="w-5 h-5 text-amber-500 fill-amber-500/20" />
                          </div>
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                            {folder.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStar('folder', folder.id);
                            }}
                            title="Star"
                            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                folder.isStarred ? 'text-amber-400 fill-amber-400' : 'text-slate-400'
                              }`}
                            />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadFolder(folder);
                            }}
                            title="Download Folder (.zip)"
                            className="p-1 rounded-lg hover:bg-sky-50 dark:hover:bg-slate-800 text-slate-400 hover:text-sky-600"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openShareModal('folder', folder.id, folder.name);
                            }}
                            title="Share Folder"
                            className="p-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenameModal({ type: 'folder', id: folder.id, name: folder.name });
                            }}
                            title="Rename"
                            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {view === 'trash' ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRestore('folder', folder.id);
                                }}
                                title="Restore"
                                className="p-1 rounded-lg hover:bg-emerald-50 text-emerald-600"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmModal({
                                    title: `Delete "${folder.name}" forever?`,
                                    description: 'This folder will be permanently deleted and cannot be recovered.',
                                    confirmText: 'Delete Forever',
                                    onConfirm: () => handlePermanentDelete('folder', folder.id),
                                  });
                                }}
                                title="Delete Forever"
                                className="p-1 rounded-lg hover:bg-rose-50 text-rose-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmModal({
                                  title: `Move "${folder.name}" to Trash?`,
                                  description: 'You can restore this folder later from Trash.',
                                  confirmText: 'Move to Trash',
                                  onConfirm: () => handleTrash('folder', folder.id),
                                });
                              }}
                              title="Move to Trash"
                              className="p-1 rounded-lg hover:bg-rose-50 text-rose-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Files */}
              {files.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Files
                  </h2>
                  {layout === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {files.map((file) => {
                        const visual = getFileVisual(file.mimeType);
                        return (
                          <div
                            key={file.id}
                            draggable={view !== 'trash'}
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                'application/x-noor-item',
                                JSON.stringify({ type: 'file', id: file.id }),
                              );
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            className="group rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden flex flex-col justify-between transition-all"
                          >
                            {/* Visual Preview Header */}
                            <div
                              onClick={() => handlePreview(file)}
                              className={`h-32 ${visual.bg} flex items-center justify-center relative cursor-pointer overflow-hidden`}
                            >
                              <FileThumbnail
                                fileId={file.id}
                                mimeType={file.mimeType}
                                extension={file.extension}
                                fallbackIcon={visual.icon}
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStar('file', file.id);
                                }}
                                className="absolute top-2.5 right-2.5 p-1.5 rounded-xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs shadow-xs hover:scale-105 transition"
                              >
                                <Star
                                  className={`w-3.5 h-3.5 ${
                                    file.isStarred ? 'text-amber-400 fill-amber-400' : 'text-slate-400'
                                  }`}
                                />
                              </button>
                              <span className="absolute bottom-2 left-2.5 px-2 py-0.5 rounded-md bg-white/90 dark:bg-slate-900/90 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                                NOOR DRIVE
                              </span>
                            </div>

                            <div
                              onClick={() => handlePreview(file)}
                              className="p-3.5 flex-1 flex flex-col justify-between cursor-pointer"
                            >
                              <div className="mb-3">
                                <p
                                  className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate"
                                  title={file.name}
                                >
                                  {file.name}
                                </p>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  {formatBytes(file.sizeBytes)} • {visual.badge}
                                </p>
                              </div>

                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-slate-800"
                              >
                                <div className="flex items-center gap-0.5">
                                  <button
                                    onClick={() => handlePreview(file)}
                                    title="Preview"
                                    className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 transition"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDownload(file)}
                                    title="Download"
                                    className="p-1.5 rounded-lg hover:bg-sky-50 dark:hover:bg-slate-800 text-slate-500 hover:text-sky-600 transition"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => openShareModal('file', file.id, file.name)}
                                    title="Share"
                                    className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 transition"
                                  >
                                    <Share2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setRenameModal({ type: 'file', id: file.id, name: file.name })
                                    }
                                    title="Rename"
                                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {view === 'trash' ? (
                                  <div className="flex items-center gap-0.5">
                                    <button
                                      onClick={() => handleRestore('file', file.id)}
                                      title="Restore"
                                      className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() =>
                                        setConfirmModal({
                                          title: `Delete "${file.name}" forever?`,
                                          description:
                                            'This file will be permanently deleted from NOOR DRIVE.',
                                          confirmText: 'Delete Forever',
                                          onConfirm: () => handlePermanentDelete('file', file.id),
                                        })
                                      }
                                      title="Delete Forever"
                                      className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() =>
                                      setConfirmModal({
                                        title: `Move "${file.name}" to Trash?`,
                                        description: 'You can restore this file later from Trash.',
                                        confirmText: 'Move to Trash',
                                        onConfirm: () => handleTrash('file', file.id),
                                      })
                                    }
                                    title="Move to Trash"
                                    className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-400 hover:text-rose-600 transition"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-x-auto shadow-xs">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 uppercase">
                          <tr>
                            <th className="py-3.5 px-4 font-semibold">Name</th>
                            <th className="py-3.5 px-4 font-semibold">Size</th>
                            <th className="py-3.5 px-4 font-semibold">Backend</th>
                            <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {files.map((file) => {
                            const visual = getFileVisual(file.mimeType);
                            return (
                              <tr
                                key={file.id}
                                draggable={view !== 'trash'}
                                onDragStart={(e) => {
                                  e.dataTransfer.setData(
                                    'application/x-noor-item',
                                    JSON.stringify({ type: 'file', id: file.id }),
                                  );
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                              >
                                <td
                                  onClick={() => handlePreview(file)}
                                  className="py-3 px-4 flex items-center gap-3 font-medium cursor-pointer hover:text-indigo-600"
                                >
                                  <div className={`p-2 rounded-xl ${visual.bg}`}>{visual.icon}</div>
                                  <span className="truncate max-w-xs">{file.name}</span>
                                </td>
                                <td className="py-3 px-4 text-slate-500">{formatBytes(file.sizeBytes)}</td>
                                <td className="py-3 px-4">
                                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    NOOR DRIVE
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right space-x-1">
                                  <button
                                    onClick={() => handleStar('file', file.id)}
                                    title="Star"
                                    className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400"
                                  >
                                    <Star
                                      className={`w-4 h-4 ${
                                        file.isStarred ? 'text-amber-400 fill-amber-400' : ''
                                      }`}
                                    />
                                  </button>
                                  <button
                                    onClick={() => handlePreview(file)}
                                    title="Preview"
                                    className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-500 hover:text-indigo-600"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDownload(file)}
                                    title="Download"
                                    className="p-1.5 rounded-lg hover:bg-sky-50 text-slate-500 hover:text-sky-600"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => openShareModal('file', file.id, file.name)}
                                    title="Share"
                                    className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 transition"
                                  >
                                    <Share2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setRenameModal({ type: 'file', id: file.id, name: file.name })
                                    }
                                    title="Rename"
                                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  {view === 'trash' ? (
                                    <>
                                      <button
                                        onClick={() => handleRestore('file', file.id)}
                                        title="Restore"
                                        className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600"
                                      >
                                        <RotateCcw className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() =>
                                          setConfirmModal({
                                            title: `Delete "${file.name}" forever?`,
                                            description:
                                              'This file will be permanently deleted from NOOR DRIVE.',
                                            confirmText: 'Delete Forever',
                                            onConfirm: () => handlePermanentDelete('file', file.id),
                                          })
                                        }
                                        title="Delete Forever"
                                        className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        setConfirmModal({
                                          title: `Move "${file.name}" to Trash?`,
                                          description: 'You can restore this file later from Trash.',
                                          confirmText: 'Move to Trash',
                                          onConfirm: () => handleTrash('file', file.id),
                                        })
                                      }
                                      title="Move to Trash"
                                      className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </main>
      </div>

      {/* New Folder Modal */}
      {newFolderOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateFolder}
            className="animate-modal-pop w-full max-w-sm bg-white/95 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[26px] p-6 shadow-[0_25px_70px_-15px_rgba(15,23,42,0.22)]"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center">
                <FolderPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Create New Folder
                </h3>
                <p className="text-xs text-slate-500">Organize your Noor Cloud</p>
              </div>
            </div>
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Personal Photos"
              className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm mb-5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFolderOpen(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl text-sm bg-zinc-900 hover:bg-zinc-800 text-white font-semibold shadow-sm transition"
              >
                Create Folder
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rename Modal */}
      {renameModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleRenameSubmit}
            className="animate-modal-pop w-full max-w-sm bg-white/95 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[26px] p-6 shadow-[0_25px_70px_-15px_rgba(15,23,42,0.22)]"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Rename {renameModal.type === 'folder' ? 'Folder' : 'File'}
                </h3>
                <p className="text-xs text-slate-500">Update item name in vault</p>
              </div>
            </div>
            <input
              type="text"
              autoFocus
              value={renameModal.name}
              onChange={(e) => setRenameModal({ ...renameModal, name: e.target.value })}
              className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm mb-5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameModal(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl text-sm bg-zinc-900 hover:bg-zinc-800 text-white font-semibold shadow-sm transition"
              >
                Save Name
              </button>
            </div>
          </form>
        </div>
      )}

      {/* File Preview Modal */}
      {previewModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col p-3 sm:p-5 h-[100dvh]">
          <div className="flex items-center justify-between gap-3 text-white pb-3 shrink-0">
            <span className="font-semibold text-sm sm:text-base truncate min-w-0 flex-1">
              {previewModal.file.name}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleDownload(previewModal.file)}
                className="px-3 sm:px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs sm:text-sm font-medium flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Download</span>
              </button>
              <button
                onClick={() => {
                  if (previewModal.url) URL.revokeObjectURL(previewModal.url);
                  setPreviewModal(null);
                }}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center overflow-auto">
            {previewModal.loading || !previewModal.url ? (
              <div className="text-white text-center space-y-3">
                <Loader2 className="w-10 h-10 animate-spin mx-auto text-sky-400" />
                <p className="text-sm text-slate-300">Loading preview from NOOR DRIVE...</p>
              </div>
            ) : previewModal.file.mimeType.startsWith('image/') ? (
              <img
                src={previewModal.url}
                alt={previewModal.file.name}
                className="max-h-[80dvh] max-w-full rounded-2xl object-contain shadow-2xl"
              />
            ) : previewModal.file.mimeType.startsWith('video/') ? (
              <video
                src={previewModal.url}
                controls
                playsInline
                className="max-h-[80dvh] max-w-full rounded-2xl"
              />
            ) : previewModal.file.mimeType.startsWith('audio/') ? (
              <audio src={previewModal.url} controls className="w-full max-w-md" />
            ) : previewModal.file.mimeType.includes('pdf') ? (
              <PdfViewer url={previewModal.url} />
            ) : previewModal.file.extension === 'docx' ||
              previewModal.file.mimeType.includes('wordprocessingml') ? (
              <DocxViewer url={previewModal.url} />
            ) : previewModal.file.extension === 'pptx' ||
              previewModal.file.mimeType.includes('presentationml') ? (
              <PptxViewer url={previewModal.url} />
            ) : previewModal.textContent !== undefined ? (
              <pre className="w-full max-w-4xl max-h-[80dvh] overflow-auto p-4 sm:p-6 rounded-2xl bg-white text-slate-900 text-xs font-mono shadow-2xl whitespace-pre-wrap break-words">
                {previewModal.textContent}
              </pre>
            ) : (
              <div className="text-white text-center space-y-3">
                <FileText className="w-12 h-12 mx-auto text-slate-400" />
                <p className="text-sm text-slate-300">Preview not available for this file type.</p>
                <button
                  onClick={() => handleDownload(previewModal.file)}
                  className="px-4 py-2 rounded-xl bg-white text-zinc-900 text-xs font-semibold"
                >
                  Download File
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Storage & Telegram Settings Modal */}
      {storageModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="animate-modal-pop w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Database className="w-5 h-5 text-sky-500" /> Noor Cloud Storage
              </h3>
              <button onClick={() => setStorageModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-4 rounded-2xl border border-sky-500/40 bg-sky-50/60 dark:bg-sky-500/10 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500 text-white flex items-center justify-center shrink-0">
                  <Send className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      Noor Cloud Private Vault
                    </p>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">
                      Always Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    All files are encrypted and stored securely in your private Noor Cloud (up to 2 GB per file). Zero files are stored on local disk.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tgConsent}
                  onChange={(e) => setTgConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I confirm storing my files in my private Noor Cloud storage (2 GB per-file limit).
                </span>
              </label>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Vault Target (Locked)
                </label>
                <div className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
                  <span className="font-mono font-semibold">me</span>
                  <span className="text-[10px] font-bold uppercase text-emerald-600 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Protected
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setStorageModalOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={saveStoragePreferences}
                className="px-5 py-2.5 rounded-xl text-sm bg-zinc-900 hover:bg-zinc-800 text-white font-semibold shadow-sm transition"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security & Devices Modal */}
      {securityModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="animate-modal-pop w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-500" /> Passcode &amp; 2FA Security
              </h3>
              <button onClick={() => setSecurityModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">Two-Factor Authentication (2FA)</p>
                  <p className="text-xs text-slate-500">
                    Status: {user?.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                {!user?.twoFactorEnabled && !twoFaQr && (
                  <button
                    onClick={handleSetup2fa}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                  >
                    Enable 2FA
                  </button>
                )}
              </div>

              {twoFaQr && (
                <div className="pt-2 space-y-3">
                  <img
                    src={twoFaQr}
                    alt="2FA QR Code"
                    className="w-40 h-40 rounded-xl bg-white p-2 border border-slate-200"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter 6-digit code"
                      value={twoFaCode}
                      onChange={(e) => setTwoFaCode(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm"
                    />
                    <button
                      onClick={handleVerify2fa}
                      className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold"
                    >
                      Verify
                    </button>
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={handleChangePasscode}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-3"
            >
              <p className="text-sm font-bold">Change Drive Passcode</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="password"
                  required
                  placeholder="Current passcode"
                  value={currentPasscode}
                  onChange={(e) => setCurrentPasscode(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
                <input
                  type="password"
                  required
                  minLength={4}
                  placeholder="New passcode"
                  value={newPasscode}
                  onChange={(e) => setNewPasscode(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                Update Passcode
              </button>
            </form>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Active Devices ({sessions.length})
                </h4>
                <button
                  onClick={handleLogoutAll}
                  className="text-xs font-semibold text-rose-600 hover:underline"
                >
                  Lock All Devices
                </button>
              </div>
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <Smartphone className="w-4 h-4 text-slate-400" />
                      <div>
                        <p className="font-semibold">{s.device?.deviceName || 'Web Session'}</p>
                        <p className="text-slate-400">{s.ipAddress || 'localhost'}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-semibold">
                      Active
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="animate-modal-pop w-full max-w-lg bg-white/95 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[26px] p-6 shadow-[0_25px_70px_-15px_rgba(15,23,42,0.22)] space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white truncate max-w-[260px]">
                    Share &quot;{shareModal.name}&quot;
                  </h3>
                  <p className="text-xs text-slate-500">
                    Anyone with the link can access without a passcode
                  </p>
                </div>
              </div>
              <button onClick={() => setShareModal(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Access Permission
                  </label>
                  <select
                    value={sharePermission}
                    onChange={(e) => setSharePermission(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium"
                  >
                    <option value="VIEWER">Viewer (View &amp; Download)</option>
                    {shareModal.type === 'folder' && (
                      <option value="EDITOR">Editor (View, Download &amp; Upload)</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Expiration
                  </label>
                  <select
                    value={shareExpiresHours}
                    onChange={(e) => setShareExpiresHours(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium"
                  >
                    <option value={0}>Never expires</option>
                    <option value={24}>24 Hours</option>
                    <option value={168}>7 Days</option>
                    <option value={720}>30 Days</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleCreateShareLink}
                disabled={creatingShare}
                className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-60"
              >
                {creatingShare ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4" />
                )}
                <span>Create &amp; Copy Share Link</span>
              </button>
            </div>

            {shareLinks.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Active Share Links ({shareLinks.length})
                </h4>
                {shareLinks.map((s) => {
                  const fullUrl =
                    typeof window !== 'undefined'
                      ? `${window.location.origin}/share/${s.shareToken}`
                      : `/share/${s.shareToken}`;
                  return (
                    <div
                      key={s.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate">
                          {fullUrl}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {s.permission} • {s.accessCount} views
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(fullUrl);
                          showToast('Copied link!');
                        }}
                        title="Copy Link"
                        className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRevokeShareLink(s.id)}
                        title="Revoke Link"
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Floating Upload Button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        title="Upload File"
        style={{ backgroundColor: accentColor }}
        className="md:hidden fixed bottom-6 right-6 z-30 w-14 h-14 rounded-2xl hover:opacity-90 text-white shadow-xl flex items-center justify-center active:scale-95 transition"
      >
        <Upload className="w-6 h-6" />
      </button>

      {/* Download App Modal */}
      {appDownloadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="animate-modal-pop w-full max-w-md bg-white/95 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[26px] p-6 shadow-[0_25px_70px_-15px_rgba(15,23,42,0.22)] space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Download Android App
                  </h3>
                  <p className="text-xs text-slate-500">NOOR DRIVE Mobile (.apk)</p>
                </div>
              </div>
              <button onClick={() => setAppDownloadModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-2.5">
              <a
                href={
                  process.env.NEXT_PUBLIC_ANDROID_APK_URL ||
                  'https://github.com/NoorAbdullah02/open-cloud-vault/releases/latest/download/noor-drive.apk'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-zinc-400 bg-slate-50/70 dark:bg-slate-800/50 transition"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    NOOR DRIVE for Android (.apk)
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {apkSizeBytes
                      ? `${apkVersion || 'Latest'} • Size: ${formatBytes(apkSizeBytes)}`
                      : 'Loading exact APK size...'}
                  </p>
                </div>
                <div className="px-3.5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-semibold flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Download
                </div>
              </a>
            </div>

            <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-xs text-slate-600 dark:text-slate-300">
              <strong>Instant Phone Install (PWA):</strong> You can also tap <strong>Add to Home Screen</strong> / <strong>Install App</strong> in your Android browser menu right now.
            </div>
          </div>
        </div>
      )}

      {/* Trash / Delete Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="animate-modal-pop w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[26px] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {confirmModal.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{confirmModal.description}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const fn = confirmModal.onConfirm;
                  setConfirmModal(null);
                  fn();
                }}
                className="px-4 py-2 rounded-xl text-sm bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-sm"
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold flex items-center gap-2 text-white ${
            toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
          }`}
        >
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default function DriveDashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f6f7f9]">
          <Loader2 className="w-8 h-8 text-zinc-700 animate-spin" />
        </div>
      }
    >
      <DriveDashboardContent />
    </Suspense>
  );
}
