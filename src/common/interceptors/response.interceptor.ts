import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { map, Observable } from 'rxjs';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';

export interface ApiResponse<T> {
  status: 'success';
  code: number;
  data: T;
  message: string;
}

const DEFAULT_MESSAGE = 'Success';

// Wraps every controller's return value in the app's standard envelope.
// Registered globally (APP_INTERCEPTOR in AppModule) so individual
// controllers just return plain data; pair with @ResponseMessage() to
// customize the message, and see HttpExceptionFilter for the matching
// error-path envelope.
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const message =
      this.reflector.get<string>(RESPONSE_MESSAGE_KEY, context.getHandler()) ??
      DEFAULT_MESSAGE;

    return next.handle().pipe(
      map((data) => ({
        status: 'success' as const,
        code: context.switchToHttp().getResponse<Response>().statusCode,
        data,
        message,
      })),
    );
  }
}
