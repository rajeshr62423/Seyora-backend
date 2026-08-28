import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from '../strategies/jwt.strategy';

// Pulls the authenticated user (set by JwtAuthGuard) off the request,
// e.g. createProject(@CurrentUser() user: RequestUser). New routes can use
// this instead of the manual @Req() req: Request & { user: RequestUser }
// pattern; existing controllers keep that pattern unchanged.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: RequestUser }>();
    return request.user;
  },
);
