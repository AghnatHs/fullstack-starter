import { z } from 'zod';

export const HealthSchema = z.object({ status: z.literal('ok') });

export const ReadinessSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready'), database: z.literal('up') }),
  z.object({ status: z.literal('not_ready'), database: z.literal('down') }),
]);

export type Health = z.infer<typeof HealthSchema>;
export type Readiness = z.infer<typeof ReadinessSchema>;
