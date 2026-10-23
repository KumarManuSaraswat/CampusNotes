import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { getStudyGateStatus, processStudyNote } from './studyGateApi';
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  api: vi.fn(),
}));
const id = '0123456789abcdef01234567';
beforeEach(() => vi.clearAllMocks());
describe('studyGateApi', () => {
  it('uses the existing authenticated API with typed results and cancellation', async () => {
    const result = {
      noteId: id,
      processingStatus: 'completed',
      studyGateStatus: 'rejected',
      assessment: null,
    };
    vi.mocked(api).mockResolvedValue(result);
    const signal = new AbortController().signal;
    expect(await processStudyNote(id, signal)).toEqual(result);
    expect(api).toHaveBeenLastCalledWith(`/notes/${id}/ai-process`, { method: 'POST', signal });
    expect(await getStudyGateStatus(id)).toEqual(result);
    expect(api).toHaveBeenLastCalledWith(`/notes/${id}/ai-status`, {
      method: 'GET',
      signal: undefined,
    });
  });
  it.each([
    [401, false],
    [403, false],
    [404, false],
    [409, true],
    [429, true],
    [500, true],
    [501, false],
    [0, true],
  ])('maps status %s without exposing provider details', async (status, retryable) => {
    vi.mocked(api).mockRejectedValue(
      new ApiError('TEST', 'secret provider details', Number(status)),
    );
    await expect(processStudyNote(id)).rejects.toMatchObject({
      name: 'StudyGateApiError',
      retryable,
    });
    await expect(processStudyNote(id)).rejects.not.toHaveProperty(
      'message',
      'secret provider details',
    );
  });
  it('preserves cancellation', async () => {
    const error = new DOMException('Aborted', 'AbortError');
    vi.mocked(api).mockRejectedValue(error);
    await expect(getStudyGateStatus(id)).rejects.toBe(error);
  });
  it('rejects an invalid identifier without sending a request', async () => {
    await expect(processStudyNote('../other')).rejects.toMatchObject({ code: 'INVALID_NOTE' });
    expect(api).not.toHaveBeenCalled();
  });
});
