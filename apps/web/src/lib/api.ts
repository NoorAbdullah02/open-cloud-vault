export function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    // In browser: On Render or any production / non-localhost domain, ALWAYS use relative '/api'
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return '/api';
    }
    // On localhost, if port is not 3000 (e.g. custom or production combined server on another port)
    if (window.location.port !== '3000') {
      return '/api';
    }
    // Local standalone Next dev server pointing to Nest API on port 4000
    return `${window.location.protocol}//${window.location.hostname}:4000/api`;
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
}

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

  const base = getApiUrl();
  let res = await fetch(`${base}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && refreshToken) {
    const refreshRes = await fetch(`${base}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      setStoredTokens(data.accessToken, data.refreshToken);
      headers.set('Authorization', `Bearer ${data.accessToken}`);
      res = await fetch(`${base}${endpoint}`, {
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
  return `${getApiUrl()}/drive/files/${fileId}/download?inline=${inline}`;
}

export async function fetchAuthorizedBlobUrl(fileId: string): Promise<string> {
  let { accessToken } = getStoredTokens();
  let res = await fetch(`${getApiUrl()}/drive/files/${fileId}/download?inline=true`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (res.status === 401) {
    const refreshed = await tryRefreshTokens();
    if (refreshed) {
      accessToken = getStoredTokens().accessToken;
      res = await fetch(`${getApiUrl()}/drive/files/${fileId}/download?inline=true`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
    }
  }
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

async function tryRefreshTokens(): Promise<boolean> {
  const { refreshToken } = getStoredTokens();
  if (!refreshToken) return false;
  try {
    const refreshRes = await fetch(`${getApiUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!refreshRes.ok) return false;
    const data = await refreshRes.json();
    setStoredTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function uploadFileWithProgress(
  formData: FormData,
  onProgress: (info: UploadProgressInfo) => void,
  signal?: AbortSignal,
): Promise<any> {
  const attemptUpload = (retriedAuth: boolean, wakeAttempt: number): Promise<any> =>
    new Promise((resolve, reject) => {
      const { accessToken } = getStoredTokens();
      const xhr = new XMLHttpRequest();
      const startTime = Date.now();

      if (signal) {
        if (signal.aborted) {
          reject(new Error('Upload cancelled'));
          return;
        }
        signal.addEventListener('abort', () => xhr.abort(), { once: true });
      }

      xhr.open('POST', `${getApiUrl()}/drive/upload`, true);
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

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve({});
          }
          return;
        }

        if (xhr.status === 401 && !retriedAuth) {
          const refreshed = await tryRefreshTokens();
          if (refreshed) {
            try {
              resolve(await attemptUpload(true, wakeAttempt));
              return;
            } catch (e) {
              reject(e);
              return;
            }
          }
        }

        if ((xhr.status === 502 || xhr.status === 503) && wakeAttempt < 3) {
          await new Promise((r) => setTimeout(r, 3000));
          try {
            resolve(await attemptUpload(retriedAuth, wakeAttempt + 1));
            return;
          } catch (e) {
            reject(e);
            return;
          }
        }

        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.message || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };

      xhr.onabort = () => reject(new Error('Upload cancelled'));
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });

  return attemptUpload(false, 0);
}

