import { safeZipEntryName } from './zip-path.util';

describe('safeZipEntryName', () => {
  it('keeps normal names untouched', () => {
    expect(safeZipEntryName('holiday photo.jpg')).toBe('holiday photo.jpg');
    expect(safeZipEntryName('reports/2026/q1.pdf')).toBe('reports/2026/q1.pdf');
  });

  it('removes parent-directory traversal segments', () => {
    expect(safeZipEntryName('../../etc/passwd')).toBe('etc/passwd');
    expect(safeZipEntryName('..\\..\\Windows\\system32')).toBe('Windows/system32');
    expect(safeZipEntryName('/absolute/path.txt')).toBe('absolute/path.txt');
  });

  it('strips control characters and falls back for empty names', () => {
    expect(safeZipEntryName('bad\u0000name.txt')).toBe('badname.txt');
    expect(safeZipEntryName('..')).toBe('file');
    expect(safeZipEntryName('')).toBe('file');
  });
});
