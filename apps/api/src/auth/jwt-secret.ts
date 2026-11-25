/**
 * Resolve the JWT signing secret in one place so the signing and verification
 * code can never disagree, and so a production deployment fails loudly instead
 * of silently signing tokens with a public fallback value.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET;
  if (secret && secret.trim().length > 0) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_ACCESS_SECRET (or JWT_SECRET) must be configured in production.',
    );
  }
  return 'fallback-dev-secret-change-me';
}
