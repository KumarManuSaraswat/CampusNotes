import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
afterEach(() => vi.unstubAllGlobals());
describe('API client', () => {
  it('includes cookie credentials and returns the response data', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: '123' }, message: 'Done' }),
    });
    vi.stubGlobal('fetch', fetch);
    expect(await api<{ id: string }>('/notes')).toEqual({ id: '123' });
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
  });
  it('surfaces backend errors without losing their code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only the author can edit this note.' },
        }),
      }),
    );
    await expect(api('/notes/123', { method: 'DELETE' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
      message: 'Only the author can edit this note.',
    } satisfies Partial<ApiError>);
  });
  it('turns a connection failure into retry guidance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api('/notes')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Cannot reach CampusNotes. Please retry.',
    });
  });
});
