/** Fails loudly when a required key is missing, without printing any value. */
export function requireEnv(...names: string[]): void {
  const missing = names.filter(name => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}. See .env.example.`);
  }
}
