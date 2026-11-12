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
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4 relative overflow-hidden">
      {/* Soft Pastel Ambient Blobs */}
      <div className="absolute -top-48 -left-48 w-[500px] h-[500px] bg-indigo-200/50 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-48 -right-48 w-[500px] h-[500px] bg-sky-200/50 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-[28px] shadow-[0_20px_60px_-15px_rgba(15,23,42,0.1)] p-8 sm:p-10 relative z-10">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-5">
            <img
              src="/owner.jpg"
              alt="Noor Abdullah"
              className="w-20 h-20 rounded-full object-cover object-top border-4 border-white shadow-xl ring-2 ring-indigo-500/30"
            />
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gradient-to-br from-indigo-600 to-sky-500 flex items-center justify-center border-2 border-white shadow-md">
              <HardDrive className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[11px] font-semibold uppercase tracking-wider mb-2.5">
            <Sparkles className="w-3 h-3" /> Noor&apos;s Personal Vault
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            NOOR DRIVE
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Enter your passcode to unlock
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 text-sm flex items-center gap-2.5">
            <Lock className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!requires2fa ? (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 text-center">
                Passcode
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  autoFocus
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="•••••"
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 text-center tracking-[0.4em] text-lg font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 text-center">
                Two-Factor Code (6 Digits)
              </label>
              <div className="relative">
                <ShieldCheck className="w-4 h-4 text-indigo-500 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  maxLength={6}
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="000000"
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 text-center tracking-widest text-lg font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3.5 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm shadow-[0_8px_20px_-6px_rgba(24,24,27,0.45)] flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>{requires2fa ? 'Verify & Unlock' : 'Unlock Drive'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-7 pt-5 border-t border-slate-100 text-center text-xs text-slate-400">
          Private Personal Cloud • Protected by Argon2id
        </div>
      </div>
    </div>
  );
}
