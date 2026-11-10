import { describe, expect, test } from 'bun:test';
import {
  isTrustedProxy,
  parseNetwork,
  parseTrustedProxies,
  resolveClientIp,
} from '../src/lib/client-ip';

describe('trusted proxy parsing', () => {
  test('accepts single addresses and CIDR blocks', () => {
    expect(parseNetwork('10.0.0.0/8')).not.toBeUndefined();
    expect(parseNetwork('192.168.1.7')).not.toBeUndefined();
    expect(parseNetwork('2001:db8::/32')).not.toBeUndefined();
    expect(parseNetwork('::1')).not.toBeUndefined();
  });

  test('rejects malformed addresses and prefixes', () => {
    expect(parseNetwork('10.0.0.256')).toBeUndefined();
    expect(parseNetwork('10.0.0.0/33')).toBeUndefined();
    expect(parseNetwork('10.0.0')).toBeUndefined();
    expect(parseNetwork('2001:db8::/129')).toBeUndefined();
    expect(parseNetwork('2001:db8::1::2')).toBeUndefined();
    expect(parseNetwork('not-an-ip')).toBeUndefined();
  });

  test('reports the entry that is not an address', () => {
    expect(() => parseTrustedProxies('10.0.0.0/8, nonsense')).toThrow('nonsense');
  });
});

describe('client IP resolution', () => {
  test('ignores forwarded headers from untrusted peers', () => {
    const ip = resolveClientIp({
      directAddress: '203.0.113.7',
      forwardedFor: '198.51.100.1',
      trustedProxies: parseTrustedProxies('10.0.0.0/8'),
    });
    expect(ip).toBe('203.0.113.7');
  });

  test('uses the rightmost untrusted hop when the peer is a trusted proxy', () => {
    const ip = resolveClientIp({
      directAddress: '10.0.0.5',
      forwardedFor: '198.51.100.1, 203.0.113.9, 10.0.0.2',
      trustedProxies: parseTrustedProxies('10.0.0.0/8'),
    });
    expect(ip).toBe('203.0.113.9');
  });

  test('cannot be bypassed by prepending a spoofed address', () => {
    const ip = resolveClientIp({
      directAddress: '10.0.0.5',
      forwardedFor: '1.2.3.4, 203.0.113.9',
      trustedProxies: parseTrustedProxies('10.0.0.5'),
    });
    expect(ip).toBe('203.0.113.9');
  });

  test('handles IPv6 peers and hops', () => {
    const trustedProxies = parseTrustedProxies('::1');
    expect(isTrustedProxy('::1', trustedProxies)).toBe(true);
    expect(
      resolveClientIp({
        directAddress: '::1',
        forwardedFor: '2001:db8::7',
        trustedProxies,
      }),
    ).toBe('2001:db8::7');
  });

  test('matches IPv6 CIDR blocks', () => {
    const trustedProxies = parseTrustedProxies('2001:db8::/32');
    expect(isTrustedProxy('2001:db8:1::5', trustedProxies)).toBe(true);
    expect(isTrustedProxy('2001:db9::5', trustedProxies)).toBe(false);
  });

  test('falls back to a single shared identity without connection information', () => {
    const ip = resolveClientIp({
      directAddress: undefined,
      forwardedFor: '198.51.100.1',
      trustedProxies: parseTrustedProxies('10.0.0.0/8'),
    });
    expect(ip).toBe('unknown');
  });

  test('skips invalid forwarded entries instead of trusting them', () => {
    const ip = resolveClientIp({
      directAddress: '10.0.0.5',
      forwardedFor: '198.51.100.1, not-an-ip',
      trustedProxies: parseTrustedProxies('10.0.0.0/8'),
    });
    expect(ip).toBe('198.51.100.1');
  });
});
