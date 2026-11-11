import { describe, it, expect } from 'vitest';
import { classifyPublishError, MAX_PUBLISH_ATTEMPTS } from './publishErrors';

describe('classifyPublishError', () => {
  it('marks auth failures permanent — retrying cannot fix them', () => {
    expect(classifyPublishError(new Error('401 Unauthorized'))).toBe('permanent');
    expect(classifyPublishError(new Error('invalid_token'))).toBe('permanent');
    expect(classifyPublishError(new Error('token expired, reconnect required'))).toBe('permanent');
  });

  it('marks duplicates permanent — never double-post', () => {
    expect(classifyPublishError(new Error('duplicate status'))).toBe('permanent');
    expect(classifyPublishError(new Error('already_published'))).toBe('permanent');
  });

  it('marks validation errors permanent — the platform will reject again', () => {
    expect(classifyPublishError(new Error('invalid_text'))).toBe('permanent');
    expect(classifyPublishError(new Error('too_long'))).toBe('permanent');
    expect(classifyPublishError(new Error('missing_param'))).toBe('permanent');
    expect(classifyPublishError(new Error('400 Bad Request'))).toBe('permanent');
  });

  it('marks transient failures retryable — refresh flakiness recovers on retry', () => {
    expect(classifyPublishError(new Error('token_refresh_failed'))).toBe('retryable');
    expect(classifyPublishError(new Error('500 Internal Server Error'))).toBe('retryable');
    expect(classifyPublishError(new Error('network timeout'))).toBe('retryable');
    expect(classifyPublishError(new Error('rate limited, retry later'))).toBe('retryable');
    expect(classifyPublishError('ECONNRESET')).toBe('retryable');
  });
});

describe('MAX_PUBLISH_ATTEMPTS', () => {
  it('is a small positive bound', () => {
    expect(MAX_PUBLISH_ATTEMPTS).toBeGreaterThan(0);
    expect(MAX_PUBLISH_ATTEMPTS).toBeLessThanOrEqual(10);
  });
});
