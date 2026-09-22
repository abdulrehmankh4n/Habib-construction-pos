export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function buildQuery(params?: Query): string {
  if (!params) return '';
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

let unauthorizedHandler: (() => void) | null = null;
let passwordChangeHandler: (() => void) | null = null;

export function onUnauthorized(fn: () => void) {
  unauthorizedHandler = fn;
}

export function onPasswordChangeRequired(fn: () => void) {
  passwordChangeHandler = fn;
}

async function request<T>(method: string, url: string, body?: unknown, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof Blob) {
    payload = body;
    headers['Content-Type'] = body.type;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: payload, credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the POS server. Check the network connection.');
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    let message = err?.message ?? `Request failed (${res.status})`;
    if (res.status === 404 && url.startsWith('/auth/')) {
      message =
        'No POS server is connected to this website. Use the app on your shop computer (npm start → http://localhost:3000), or deploy the API and point Vercel /api to it.';
    }
    const apiError = new ApiError(res.status, err?.code ?? 'ERROR', message, err?.details);
    if (res.status === 401 && !url.startsWith('/auth/login')) unauthorizedHandler?.();
    if (res.status === 403 && apiError.code === 'PASSWORD_CHANGE_REQUIRED') passwordChangeHandler?.();
    throw apiError;
  }
  if (typeof data === 'string') {
    throw new ApiError(0, 'NETWORK', 'Unexpected response from the POS server.');
  }
  return data as T;
}

export const api = {
  get: <T>(url: string, params?: Query) => request<T>('GET', `${url}${buildQuery(params)}`),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, blob: Blob) => request<T>('PUT', url, blob),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
