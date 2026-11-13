'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  HardDrive,
  Lock,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Sparkles,
  Cloud,
} from 'lucide-react';
import { apiFetch, setStoredTokens } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2fa, setRequires2fa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch('/auth/passcode', {
        method: 'POST',
        body: JSON.stringify({
          passcode,
          totpCode: requires2fa ? totpCode : undefined,
          deviceName: typeof navigator !== 'undefined' ? navigator.platform : 'Web',
          platform: 'web',
        }),
      });

      if (res.requiresTwoFactor) {
        setRequires2fa(true);
        setLoading(false);
        return;
      }

      setStoredTokens(res.accessToken, res.refreshToken);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Incorrect passcode');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#f6f7f9] p-4 relative overflow-hidden">
      {/* Subtle Modern Ambient Glow */}
      <div className="absolute -top-40 -left-40 w-[440px] h-[440px] bg-blue-100/70 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[440px] h-[440px] bg-indigo-100/70 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-[390px] bg-white/95 backdrop-blur-xl border border-zinc-200/80 rounded-[32px] shadow-[0_24px_64px_-16px_rgba(15,23,42,0.12)] p-7 sm:p-9 relative z-10">
        {/* Top Brand + Owner Pill */}
        <div className="flex items-center justify-between mb-7">
          <a
            href="/"
            className="flex items-center gap-2.5 cursor-pointer group"
            title="Go to NOOR DRIVE Root (/)"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-zinc-900 to-blue-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight text-zinc-900 group-hover:text-blue-600 transition-colors">
              NOOR DRIVE
            </span>
          </a>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
            <Sparkles className="w-3 h-3" /> Private
          </span>
        </div>

        {/* Avatar & Welcome */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="relative mb-4">
            <img
              src="/owner.jpg"
              alt="Noor Abdullah"
              className="w-20 h-20 rounded-full object-cover object-top border-4 border-white shadow-lg ring-1 ring-zinc-200"
            />
            <div className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-zinc-900 flex items-center justify-center border-2 border-white shadow-sm">
              <HardDrive className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">
            Welcome back, Noor
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            Enter your personal passcode to unlock your cloud
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-medium flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!requires2fa ? (
            <div>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  autoFocus
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="•••••"
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 text-zinc-900 text-center tracking-[0.45em] text-lg font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/15 focus:border-zinc-900 transition"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 text-center">
                Two-Factor Code (6 Digits)
              </label>
              <div className="relative">
                <ShieldCheck className="w-4 h-4 text-blue-600 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  maxLength={6}
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="000000"
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 text-zinc-900 text-center tracking-widest text-lg font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/15 focus:border-zinc-900 transition"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm shadow-[0_10px_24px_-8px_rgba(24,24,27,0.5)] flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>{requires2fa ? 'Verify & Unlock' : 'Unlock Noor Cloud'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-zinc-100 text-center text-[11px] text-zinc-400">
          NOOR DRIVE • Protected Personal Cloud
        </div>
      </div>
    </div>
  );
}
