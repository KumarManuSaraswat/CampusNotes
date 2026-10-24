import { describe, expect, it } from 'vitest';
import { analysisFailure } from './analysisFailure.js';

describe('safe analysis diagnostics', () => {
  it.each(['MODEL_UNAVAILABLE', 'PROVIDER_AUTH', 'RATE_LIMITED', 'TIMEOUT', 'MALFORMED_RESPONSE'])(
    'preserves actionable provider code %s without raw details',
    (code) => {
      const result = analysisFailure('classification', {
        code,
        message: 'secret key and document text',
        stack: 'secret',
      });
      expect(result.code).toBe(code);
      expect(result.message).toContain(`[classification/${code}]`);
      expect(JSON.stringify(result)).not.toContain('secret');
    },
  );
  it('distinguishes PDF preparation from a provider timeout', () => {
    expect(analysisFailure('document', { code: 'TIMEOUT' }).message).toContain(
      'Reading the document',
    );
    expect(analysisFailure('vision', { code: 'TIMEOUT' }).message).toContain('AI provider');
  });
  it.each(['secret-key', 'toString', '__proto__'])('does not echo unknown code %s', (code) => {
    expect(analysisFailure('vision', { code, message: 'private original' }).code).toBe(
      'VISION_FAILED',
    );
    expect(
      JSON.stringify(analysisFailure('storage', { code, message: 'private original' })),
    ).not.toContain('private original');
  });
});
