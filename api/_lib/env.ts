/*
 * env.ts — required-env access with failure messages that name the missing
 * variable and the feature it powers. 27+ vars are read across api/ via bare
 * `process.env.X!`; a typo'd Vercel setting otherwise surfaces as an opaque
 * 500 (or a silent `undefined` deep inside a handler) instead of a loud,
 * actionable error.
 */
export function requireEnv(name: string, feature: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name} (needed for ${feature}). ` +
        `Set it in Vercel → Settings → Environment Variables and redeploy.`,
    );
  }
  return value;
}
