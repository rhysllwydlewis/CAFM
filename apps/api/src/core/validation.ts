import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/** Validates a request body with zod; 400 with the field messages on failure. */
export function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(result.error.issues.map((i) => i.message));
  return result.data;
}
