export function getApiUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && !envUrl.includes('localhost')) {
    return envUrl;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:4000/api`;
  }
  return envUrl || 'http://localhost:4000/api';
}

const API_URL = getApiUrl();

export function getStoredTokens() {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null };
  return {
    accessToken: localStorage.getItem('noor_access_token'),
    refreshToken: localStorage.getItem('noor_refresh_token'),
  };
}

export function setStoredTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('noor_access_token', accessToken);
  localStorage.setItem('noor_refresh_token', refreshToken);
}

export function clearStoredTokens() {
  localStorage.removeItem('noor_access_token');
  localStorage.removeItem('noor_refresh_token');
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const { accessToken, refreshToken } = getStoredTokens();
  const headers = new Headers(options.headers);

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && refreshToken) {
    const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      setStoredTokens(data.accessToken, data.refreshToken);
      headers.set('Authorization', `Bearer ${data.accessToken}`);
      res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });
    } else {
      clearStoredTokens();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(errBody.message || 'API error');
  }

  return res.json();
}

export function getDownloadUrl(fileId: string, inline = false): string {
  const { accessToken } = getStoredTokens();
  return `${API_URL}/drive/files/${fileId}/download?inline=${inline}`;
}

export async function fetchAuthorizedBlobUrl(fileId: string): Promise<string> {
  const { accessToken } = getStoredTokens();
  const res = await fetch(`${API_URL}/drive/files/${fileId}/download?inline=true`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!res.ok) throw new Error('Failed to load file');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export interface UploadProgressInfo {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  phase: 'uploading' | 'telegram';
}

export function uploadFileWithProgress(
  formData: FormData,
  onProgress: (info: UploadProgressInfo) => void,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const { accessToken } = getStoredTokens();
    const xhr = new XMLHttpRequest();
    const startTime = Date.now();

    xhr.open('POST', `${API_URL}/drive/upload`, true);
    if (accessToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    }

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
      const speedBytesPerSec = e.loaded / elapsedSec;
      const remainingBytes = Math.max(0, e.total - e.loaded);
      const etaSeconds = speedBytesPerSec > 0 ? Math.ceil(remainingBytes / speedBytesPerSec) : 0;
      const percent = Math.round((e.loaded / e.total) * 100);

      onProgress({
        loadedBytes: e.loaded,
        totalBytes: e.total,
        percent,
        speedBytesPerSec,
        etaSeconds,
        phase: percent >= 100 ? 'telegram' : 'uploading',
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({});
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.message || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

