/**
 * Centralised rules for serving user-supplied files.
 *
 * Files are served from the same origin as the web app, so rendering an
 * uploaded HTML/SVG/JS file inline would execute attacker code with access to
 * localStorage (including auth tokens). Only an explicit allowlist of passive
 * media types may be rendered inline; everything else is forced to download.
 */
const SAFE_INLINE_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/avif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'text/plain',
]);

export function normalizeMimeType(mime: string | undefined | null): string {
  return String(mime || 'application/octet-stream').split(';')[0].trim().toLowerCase();
}

export function isSafeInlineMime(mime: string | undefined | null): boolean {
  return SAFE_INLINE_MIME_TYPES.has(normalizeMimeType(mime));
}

export function getDownloadDisposition(
  requestedInline: string | boolean | undefined,
  mime: string | undefined | null,
): 'inline' | 'attachment' {
  const wantsInline = requestedInline === true || requestedInline === 'true';
  return wantsInline && isSafeInlineMime(mime) ? 'inline' : 'attachment';
}

/** Adds defence-in-depth headers before streaming a user-supplied file. */
export function applyDownloadSecurityHeaders(res: any, mime: string | undefined | null) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!isSafeInlineMime(mime)) {
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  }
}
