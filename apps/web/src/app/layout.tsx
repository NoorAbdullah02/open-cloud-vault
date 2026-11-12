import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'NOOR DRIVE — Personal Cloud Vault',
  description: 'Private multi-platform cloud storage ecosystem',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${jakarta.className} min-h-screen bg-[#f8fafc] text-slate-900 antialiased selection:bg-indigo-500/20`}
      >
        {children}
      </body>
    </html>
  );
}
