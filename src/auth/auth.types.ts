// Mirrors seyora-frontend's redux/auth/type.ts AuthUser shape so the
// frontend can eventually swap its mocked auth saga for this API directly.
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: AuthUser;
}

export interface JwtPayload {
  sub: number;
  email: string;
}

// @nestjs/jwt types `expiresIn` as a branded `ms`-style string
// (`StringValue`, e.g. "15m") rather than a plain `string`, so a value read
// from ConfigService needs an explicit (non-`any`) cast to satisfy it. The
// value itself is validated at boot in env.validation.ts.
export type JwtExpiresIn =
  number | `${number}${'s' | 'm' | 'h' | 'd' | 'y'}` | undefined;

export function asExpiresIn(value: string | undefined): JwtExpiresIn {
  return value as unknown as JwtExpiresIn;
}
