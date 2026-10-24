import { describe, expect, it, vi } from 'vitest';
import { recommendRequestNotes, type RecommendationCandidate } from './recommendRequestNotes.js';

const env = {
  AI_PROVIDER: 'groq',
  AI_ENABLED: 'false',
  GEMINI_API_KEY: 'test-only',
  GEMINI_MODEL: 'configured-gemini',
};
const request = {
  title: 'SQL joins',
  subject: 'Databases',
  description: '',
  instructor: '',
  lectureDate: null,
};
const candidate: RecommendationCandidate = {
  ...request,
  noteId: 'a'.repeat(24),
  description: 'Worked SQL joins examples',
  tags: ['SQL'],
};
const match = {
  noteId: candidate.noteId,
  reason: 'These examples may help with SQL joins.',
  evidence: 'SQL joins examples',
};
const generate = (matches: unknown[]) =>
  vi.fn().mockResolvedValue({ text: JSON.stringify({ matches }) });

describe('Gemini request recommendations', () => {
  it('uses Gemini independently of upload provider and treats both inputs as untrusted', async () => {
    const client = generate([match]);
    expect(await recommendRequestNotes(request, [candidate], { env, generate: client })).toEqual([
      match,
    ]);
    expect(client.mock.calls[0][0].model).toBe('configured-gemini');
    expect(client.mock.calls[0][0].systemInstruction).toContain('untrusted data');
    expect(JSON.parse(client.mock.calls[0][0].contents)).toEqual({
      request,
      candidates: [candidate],
    });
  });
  it('supports a dedicated Gemini model override', async () => {
    const client = generate([]);
    await recommendRequestNotes(request, [candidate], {
      env: { ...env, GEMINI_RECOMMENDATION_MODEL: 'separate-model' },
      generate: client,
    });
    expect(client.mock.calls[0][0].model).toBe('separate-model');
  });
  it.each([
    [{ ...match, noteId: 'b'.repeat(24) }],
    [{ ...match, evidence: 'made-up lesson' }],
    [match, match],
    [{ ...match, url: 'https://invented.example' }],
    [match, match, match, match],
  ])(
    'rejects invented IDs, ungrounded evidence, duplicates and malformed output',
    async (...matches) => {
      await expect(
        recommendRequestNotes(request, [candidate], { env, generate: generate(matches) }),
      ).rejects.toMatchObject({ code: 'RECOMMENDATIONS_UNAVAILABLE' });
    },
  );
  it('does not relax a specified instructor or lecture date', async () => {
    expect(
      await recommendRequestNotes({ ...request, instructor: 'Professor Sen' }, [candidate], {
        env,
        generate: generate([match]),
      }),
    ).toEqual([]);
    expect(
      await recommendRequestNotes({ ...request, lectureDate: '2026-10-24' }, [candidate], {
        env,
        generate: generate([match]),
      }),
    ).toEqual([]);
  });
  it('supports no match and skips Gemini for an empty catalog', async () => {
    const client = generate([]);
    expect(await recommendRequestNotes(request, [], { env, generate: client })).toEqual([]);
    expect(client).not.toHaveBeenCalled();
    expect(await recommendRequestNotes(request, [candidate], { env, generate: client })).toEqual(
      [],
    );
  });
  it('fails safely on quota, malformed output, truncation or disabled configuration', async () => {
    await expect(
      recommendRequestNotes(request, [candidate], {
        env,
        generate: vi.fn().mockRejectedValue({ status: 429, message: 'private-key' }),
      }),
    ).rejects.toMatchObject({ code: 'RECOMMENDATIONS_QUOTA' });
    for (const response of [
      { text: 'bad JSON' },
      { text: JSON.stringify({ matches: [match] }), candidates: [{ finishReason: 'MAX_TOKENS' }] },
    ]) {
      await expect(
        recommendRequestNotes(request, [candidate], {
          env,
          generate: vi.fn().mockResolvedValue(response),
        }),
      ).rejects.toMatchObject({ code: 'RECOMMENDATIONS_UNAVAILABLE' });
    }
    const error = await recommendRequestNotes(request, [candidate], {
      env,
      generate: vi.fn().mockRejectedValue(new Error('private-key and source')),
    }).catch((e: Error) => e);
    expect(String(error)).not.toContain('private-key');
    await expect(
      recommendRequestNotes(request, [candidate], {
        env: { ...env, REQUEST_RECOMMENDATIONS_ENABLED: 'false' },
      }),
    ).rejects.toMatchObject({ code: 'RECOMMENDATIONS_UNAVAILABLE' });
  });
  it('ends a hung request within the deadline', async () => {
    vi.useFakeTimers();
    try {
      const pending = recommendRequestNotes(request, [candidate], {
        env,
        generate: () => new Promise(() => {}),
      });
      const assertion = expect(pending).rejects.toMatchObject({
        code: 'RECOMMENDATIONS_UNAVAILABLE',
      });
      await vi.advanceTimersByTimeAsync(15_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
