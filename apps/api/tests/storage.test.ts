import { describe, expect, test } from 'bun:test';
import { createStorageFromEnv } from '../src/lib/storage';

const validEnv = {
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'starter-files',
  S3_ACCESS_KEY_ID: 'starter',
  S3_SECRET_ACCESS_KEY: 'starter-local-only',
  S3_FORCE_PATH_STYLE: 'true',
};

describe('object storage configuration', () => {
  test('refuses to construct storage before it is configured', () => {
    expect(() => createStorageFromEnv({})).toThrow('not configured');
  });

  test('names the missing credentials in a partial configuration', () => {
    expect(() => createStorageFromEnv({ S3_BUCKET: 'starter-files' })).toThrow('S3_ACCESS_KEY_ID');
  });

  test('rejects an invalid endpoint or path-style flag', () => {
    expect(() => createStorageFromEnv({ ...validEnv, S3_ENDPOINT: 'not a url' })).toThrow(
      'S3_ENDPOINT',
    );
    expect(() => createStorageFromEnv({ ...validEnv, S3_FORCE_PATH_STYLE: 'sometimes' })).toThrow(
      'S3_FORCE_PATH_STYLE',
    );
  });

  test('constructs the adapter from a complete configuration', () => {
    const storage = createStorageFromEnv(validEnv);
    expect(Object.keys(storage).sort()).toEqual(['copy', 'download', 'remove', 'upload']);
  });

  test('defaults empty optional values instead of rejecting them', () => {
    const storage = createStorageFromEnv({
      ...validEnv,
      S3_REGION: '',
      S3_FORCE_PATH_STYLE: '',
    });
    expect(Object.keys(storage).sort()).toEqual(['copy', 'download', 'remove', 'upload']);
  });
});
