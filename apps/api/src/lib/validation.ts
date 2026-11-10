import type { ZodError } from 'zod';

export function formatIssues(error: ZodError, root = 'environment'): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || root}: ${issue.message}`)
    .join('\n');
}
