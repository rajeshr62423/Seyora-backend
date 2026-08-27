import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'response_message';

// Sets the `message` field the global ResponseInterceptor wraps a route's
// successful result with, e.g. @ResponseMessage('Registration Successful').
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
