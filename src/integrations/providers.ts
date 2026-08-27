// Extend as real providers are added. Real OAuth wiring (per PLANNING.md
// Phase 8) is a separate, credential-gated task — this list only bounds
// which provider strings the connection-status endpoints accept.
export const KNOWN_PROVIDERS = ['github'] as const;
export type Provider = (typeof KNOWN_PROVIDERS)[number];

export function isKnownProvider(value: string): value is Provider {
  return (KNOWN_PROVIDERS as readonly string[]).includes(value);
}
