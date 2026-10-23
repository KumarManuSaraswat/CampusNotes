import type { ApiResponse } from '@campusnotes/shared';
export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(
  /\/$/,
  '',
);
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_BASE + path, {
      credentials: 'include',
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('NETWORK_ERROR', 'Cannot reach CampusNotes. Please retry.', 0);
  }
  let body: any;
  try {
    body = await response.json();
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Unexpected server response.', response.status);
  }
  if (!response.ok || !body.success)
    throw new ApiError(
      body.error?.code || 'REQUEST_FAILED',
      body.error?.message || 'Request failed.',
      response.status,
    );
  return (body as ApiResponse<T>).data;
}
export const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
export const fileUrl = (path: string) => API_BASE + path;
export function uploadNote(form: FormData, onProgress: (value: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + '/notes');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300 || !body.success)
          reject(
            new ApiError(
              body.error?.code || 'UPLOAD_FAILED',
              body.error?.message || 'Upload failed.',
              xhr.status,
            ),
          );
        else resolve(body.data);
      } catch {
        reject(new ApiError('UPLOAD_FAILED', 'Unexpected upload response.', xhr.status));
      }
    };
    xhr.onerror = () =>
      reject(new ApiError('NETWORK_ERROR', 'Connection failed. Please retry.', 0));
    xhr.send(form);
  });
}
