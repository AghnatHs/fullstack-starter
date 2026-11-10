export type ParsedNetwork = {
  readonly family: 4 | 6;
  readonly address: bigint;
  readonly prefix: number;
};

type ParsedAddress = { readonly family: 4 | 6; readonly address: bigint };

const IPV4_BITS = 32;
const IPV6_BITS = 128;
const IPV4_PATTERN = /^\d{1,3}$/;
const IPV6_GROUP_PATTERN = /^[0-9a-fA-F]{1,4}$/;
const PREFIX_PATTERN = /^\d{1,3}$/;

function combineGroups(groups: number[]): bigint {
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
}

function parseIpv4(address: string): ParsedAddress | undefined {
  const parts = address.split('.');
  if (parts.length !== 4) return undefined;

  let value = 0n;
  for (const part of parts) {
    if (!IPV4_PATTERN.test(part)) return undefined;
    const byte = Number(part);
    if (byte > 255) return undefined;
    value = (value << 8n) | BigInt(byte);
  }

  return { family: 4, address: value };
}

function parseIpv6(address: string): ParsedAddress | undefined {
  const segments = address.split('::');
  if (segments.length > 2) return undefined;

  const parseGroups = (segment: string): number[] | undefined => {
    if (segment === '') return [];
    const groups: number[] = [];

    for (const [index, group] of segment.split(':').entries()) {
      if (group.includes('.')) {
        if (index !== segment.split(':').length - 1) return undefined;
        const ipv4 = parseIpv4(group);
        if (!ipv4) return undefined;
        groups.push(Number((ipv4.address >> 16n) & 0xffffn), Number(ipv4.address & 0xffffn));
        continue;
      }
      if (!IPV6_GROUP_PATTERN.test(group)) return undefined;
      groups.push(Number.parseInt(group, 16));
    }

    return groups;
  };

  const head = parseGroups(segments[0]);
  if (!head) return undefined;

  if (segments.length === 1) {
    return head.length === 8 ? { family: 6, address: combineGroups(head) } : undefined;
  }

  const tail = parseGroups(segments[1]);
  if (!tail) return undefined;
  if (head.length + tail.length >= 8) return undefined;

  const groups = [...head, ...Array<number>(8 - head.length - tail.length).fill(0), ...tail];
  return { family: 6, address: combineGroups(groups) };
}

function parseAddress(address: string): ParsedAddress | undefined {
  const trimmed = address.trim();
  if (trimmed === '') return undefined;
  return trimmed.includes(':') ? parseIpv6(trimmed) : parseIpv4(trimmed);
}

export function parseNetwork(input: string): ParsedNetwork | undefined {
  const parts = input.trim().split('/');
  if (parts.length > 2) return undefined;

  const parsed = parseAddress(parts[0]);
  if (!parsed) return undefined;

  const maxPrefix = parsed.family === 4 ? IPV4_BITS : IPV6_BITS;
  const prefixText = parts[1];
  if (prefixText !== undefined && !PREFIX_PATTERN.test(prefixText)) return undefined;

  const prefix = prefixText === undefined ? maxPrefix : Number(prefixText);
  if (prefix > maxPrefix) return undefined;

  return { family: parsed.family, address: parsed.address, prefix };
}

export function parseTrustedProxies(value: string): ParsedNetwork[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      const network = parseNetwork(entry);
      if (!network) throw new Error(`Invalid trusted proxy address: ${entry}`);
      return network;
    });
}

export function isTrustedProxy(address: string, trustedProxies: ParsedNetwork[]): boolean {
  const parsed = parseAddress(address);
  if (!parsed) return false;

  return trustedProxies.some((network) => {
    if (network.family !== parsed.family) return false;
    if (network.prefix === 0) return true;

    const shift = BigInt((parsed.family === 4 ? IPV4_BITS : IPV6_BITS) - network.prefix);
    return parsed.address >> shift === network.address >> shift;
  });
}

export function resolveClientIp(input: {
  directAddress: string | undefined;
  forwardedFor: string | null | undefined;
  trustedProxies: ParsedNetwork[];
}): string {
  const direct = input.directAddress?.trim();
  if (!direct || !parseAddress(direct)) return 'unknown';
  if (!isTrustedProxy(direct, input.trustedProxies)) return direct;

  const chain = (input.forwardedFor ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const candidate = chain[index];
    if (!parseAddress(candidate)) continue;
    if (isTrustedProxy(candidate, input.trustedProxies)) continue;
    return candidate;
  }

  return direct;
}
