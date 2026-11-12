import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f6f7f9] p-4">
      <div className="max-w-sm w-full bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">404</h1>
        <p className="text-sm text-slate-500 mt-1 mb-5">Page not found in NOOR DRIVE.</p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition"
        >
          Go to Drive
        </Link>
      </div>
    </div>
  );
}

