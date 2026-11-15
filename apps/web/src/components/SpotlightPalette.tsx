'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Folder as FolderIcon,
  FileText,
  Clock,
  Star,
  Image as ImageIcon,
  Video,
  Trash2,
  Lock,
  Upload,
  FolderPlus,
  Sun,
  Moon,
  Smartphone,
  Sparkles,
  Command,
  ArrowRight,
  HardDrive,
} from 'lucide-react';

export interface SpotlightItem {
  id: string;
  name: string;
  type: 'file' | 'folder' | 'action' | 'navigation';
  category: string;
  icon: React.ReactNode;
  action: () => void;
  badge?: string;
}

interface SpotlightPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  files: any[];
  folders: any[];
  onNavigate: (view: any, folderId: string | null) => void;
  onOpenFile: (file: any) => void;
  onNewFolder: () => void;
  onUpload: () => void;
  onToggleDarkMode: () => void;
  darkMode: boolean;
  onLockVault: () => void;
  onOpenAppDownload: () => void;
  onOpenStorageCleaner: () => void;
}

export default function SpotlightPalette({
  isOpen,
  onClose,
  files,
  folders,
  onNavigate,
  onOpenFile,
  onNewFolder,
  onUpload,
  onToggleDarkMode,
  darkMode,
  onLockVault,
  onOpenAppDownload,
  onOpenStorageCleaner,
}: SpotlightPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Build searchable items list
  const defaultItems: SpotlightItem[] = [
    {
      id: 'nav-my-drive',
      name: 'Go to My Drive',
      type: 'navigation',
      category: 'Navigation',
      icon: <HardDrive className="w-4 h-4 text-indigo-500" />,
      action: () => {
        onNavigate('my-drive', null);
        onClose();
      },
      badge: 'Root',
    },
    {
      id: 'nav-recent',
      name: 'Go to Recent Files',
      type: 'navigation',
      category: 'Navigation',
      icon: <Clock className="w-4 h-4 text-sky-500" />,
      action: () => {
        onNavigate('recent', null);
        onClose();
      },
    },
    {
      id: 'nav-starred',
      name: 'Go to Starred Items',
      type: 'navigation',
      category: 'Navigation',
      icon: <Star className="w-4 h-4 text-amber-400 fill-amber-400" />,
      action: () => {
        onNavigate('starred', null);
        onClose();
      },
    },
    {
      id: 'nav-photos',
      name: 'Photos & Images',
      type: 'navigation',
      category: 'Navigation',
      icon: <ImageIcon className="w-4 h-4 text-emerald-500" />,
      action: () => {
        onNavigate('photos', null);
        onClose();
      },
    },
    {
      id: 'nav-videos',
      name: 'Videos & Media',
      type: 'navigation',
      category: 'Navigation',
      icon: <Video className="w-4 h-4 text-purple-500" />,
      action: () => {
        onNavigate('videos', null);
        onClose();
      },
    },
    {
      id: 'nav-documents',
      name: 'Documents & PDFs',
      type: 'navigation',
      category: 'Navigation',
      icon: <FileText className="w-4 h-4 text-blue-500" />,
      action: () => {
        onNavigate('documents', null);
        onClose();
      },
    },
    {
      id: 'nav-trash',
      name: 'Open Trash (Bin)',
      type: 'navigation',
      category: 'Navigation',
      icon: <Trash2 className="w-4 h-4 text-rose-500" />,
      action: () => {
        onNavigate('trash', null);
        onClose();
      },
    },
    {
      id: 'nav-vault',
      name: 'Open Secret Vault 🔒',
      type: 'navigation',
      category: 'Navigation',
      icon: <Lock className="w-4 h-4 text-amber-500" />,
      action: () => {
        onNavigate('vault', null);
        onClose();
      },
      badge: 'Protected',
    },
    {
      id: 'act-upload',
      name: 'Upload Files to Drive',
      type: 'action',
      category: 'Actions',
      icon: <Upload className="w-4 h-4 text-indigo-500" />,
      action: () => {
        onUpload();
        onClose();
      },
    },
    {
      id: 'act-new-folder',
      name: 'Create New Folder',
      type: 'action',
      category: 'Actions',
      icon: <FolderPlus className="w-4 h-4 text-amber-500" />,
      action: () => {
        onNewFolder();
        onClose();
      },
    },
    {
      id: 'act-dark-mode',
      name: `Switch to ${darkMode ? 'Light' : 'Dark'} Mode`,
      type: 'action',
      category: 'Actions',
      icon: darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />,
      action: () => {
        onToggleDarkMode();
        onClose();
      },
    },
    {
      id: 'act-cleaner',
      name: 'Clean Duplicates & Space',
      type: 'action',
      category: 'Actions',
      icon: <Sparkles className="w-4 h-4 text-sky-400" />,
      action: () => {
        onOpenStorageCleaner();
        onClose();
      },
    },
    {
      id: 'act-mobile',
      name: 'Get NOOR DRIVE Mobile App (APK & iOS)',
      type: 'action',
      category: 'Actions',
      icon: <Smartphone className="w-4 h-4 text-emerald-400" />,
      action: () => {
        onOpenAppDownload();
        onClose();
      },
    },
    {
      id: 'act-lock',
      name: 'Lock Vault / Lock Drive',
      type: 'action',
      category: 'Actions',
      icon: <Lock className="w-4 h-4 text-rose-400" />,
      action: () => {
        onLockVault();
        onClose();
      },
    },
  ];

  // Search in folders
  const folderItems: SpotlightItem[] = folders.map((f) => ({
    id: `folder-${f.id}`,
    name: f.name,
    type: 'folder',
    category: 'Folders',
    icon: <FolderIcon className="w-4 h-4 text-amber-500 fill-amber-500/20" />,
    action: () => {
      onNavigate('my-drive', f.id);
      onClose();
    },
  }));

  // Search in files
  const fileItems: SpotlightItem[] = files.map((f) => ({
    id: `file-${f.id}`,
    name: f.name,
    type: 'file',
    category: 'Files',
    icon: <FileText className="w-4 h-4 text-slate-400" />,
    action: () => {
      onOpenFile(f);
      onClose();
    },
    badge: (f.extension || f.name.split('.').pop() || 'FILE').toUpperCase(),
  }));

  const allItems = [...folderItems, ...fileItems, ...defaultItems];

  const filtered = query.trim()
    ? allItems.filter(
        (it) =>
          it.name.toLowerCase().includes(query.toLowerCase()) ||
          it.category.toLowerCase().includes(query.toLowerCase()),
      )
    : defaultItems;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh] sm:pt-[15vh] p-4 animate-in fade-in duration-200 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] animate-modal-pop"
      >
        {/* Search Input Bar */}
        <div className="p-4 sm:p-4.5 border-b border-slate-200/80 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <Search className="w-5 h-5 text-indigo-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search files, folders, or run quick actions..."
            className="w-full bg-transparent text-sm sm:text-base font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          <div className="flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg bg-slate-200/80 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
            <Command className="w-3 h-3" />
            <span>K</span>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-2.5 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No matching files, folders, or actions found for &quot;{query}&quot;
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`px-3.5 py-2.5 rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-1.5 rounded-xl shrink-0 ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <span className="text-xs sm:text-sm font-semibold truncate">
                      {item.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.badge && (
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-medium hidden sm:inline ${
                        isSelected ? 'text-indigo-200' : 'text-slate-400'
                      }`}
                    >
                      {item.category}
                    </span>
                    <ArrowRight
                      className={`w-3.5 h-3.5 transition-transform ${
                        isSelected ? 'translate-x-0.5 text-white' : 'opacity-0'
                      }`}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Hint Bar */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>esc Close</span>
          </div>
          <span>NOOR DRIVE Spotlight</span>
        </div>
      </div>
    </div>
  );
}

