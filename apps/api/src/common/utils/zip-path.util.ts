/**
 * Normalise a file or folder name before it becomes a ZIP entry.
 * Without this, a name such as `../../etc/passwd` (possible through rename or
 * a public editor share upload) would be written into the archive as a path
 * traversal and could escape the extraction directory.
 */
export function safeZipEntryName(name: string): string {
  const cleaned = String(name || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/')
    // Strip control characters that are invalid in ZIP entries.
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();

  return cleaned || 'file';
}
