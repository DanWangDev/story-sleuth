import type { AuthServerConfig } from "@danwangdev/auth-client/server";
import type { Env } from "../config/env.js";

/**
 * Build the AuthServerConfig that auth-client's routes + middleware
 * need. Derives from the validated Env so a bad env is caught at boot,
 * not mid-request.
 */
export function buildAuthConfig(env: Env): AuthServerConfig {
  return {
    issuer: env.OIDC_ISSUER,
    internalIssuer: env.OIDC_INTERNAL_ISSUER,
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET,
    redirectUri: env.OIDC_REDIRECT_URI,
    /**
     * After logout, the hub redirects the user here. We use the first
     * CORS_ORIGIN value (the primary frontend host) so the user lands
     * on story-sleuth's own landing page, not the hub.
     */
    postLogoutRedirectUri: env.CORS_ORIGIN.split(",")[0]?.trim() ?? env.CORS_ORIGIN,
    sessionSecret: env.SESSION_SECRET,
    /**
     * Enables the OIDC back-channel logout endpoint at
     * /{basePath}/backchannel-logout. When the user logs out of ANY app
     * (writing-buddy, vocab-master, story-sleuth), the hub POSTs a
     * signed logout_token to EVERY registered app's BCL endpoint,
     * revoking the session locally. That's what gives the suite
     * "one logout, logged out everywhere" behaviour.
     */
    backchannelLogout: true,
  };
}
