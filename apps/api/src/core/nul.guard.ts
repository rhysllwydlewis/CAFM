import { BadRequestException, type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/** The most values one request is searched through, so a deeply nested body can't make this slow. */
const MAX_VALUES = 20_000;

/** True when any string in the value, or any key of an object in it, holds a NUL character. */
export function holdsNul(root: unknown): boolean {
  const stack: unknown[] = [root];
  let seen = 0;
  while (stack.length > 0 && seen < MAX_VALUES) {
    const value = stack.pop();
    seen += 1;
    if (typeof value === 'string') {
      if (value.includes('\u0000')) return true;
    } else if (Array.isArray(value)) {
      stack.push(...value);
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, inner] of Object.entries(value)) {
        if (key.includes('\u0000')) return true;
        stack.push(inner);
      }
    }
  }
  return false;
}

/**
 * Refuses a request with a NUL character (U+0000) in its address, query string or JSON body. Postgres cannot store
 * one, so it used to get as far as the database and come back as a 500 (issue #127). It is never real text, so it is a
 * 400 for every route at once, whether the value is a search term or a name in a form.
 */
@Injectable()
export class NulGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.originalUrl.includes('%00') || holdsNul(req.query) || holdsNul(req.params) || holdsNul(req.body)) {
      throw new BadRequestException({
        code: 'invalid_character',
        message: 'Text can’t contain a null character.',
      });
    }
    return true;
  }
}
