import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for storing required scopes.
 * Guards use this key to retrieve scope requirements.
 */
export const REQUIRED_SCOPES_KEY = 'required_scopes';

/**
 * @RequireScopes decorator
 *
 * Declares the scopes required to access an endpoint.
 * Applied to controller methods (routes).
 *
 * Example usage:
 *   @RequireScopes('user:read', 'user:write')
 *   @Post()
 *   createUser() { ... }
 *
 * This means: "The calling service MUST have BOTH user:read AND user:write"
 *
 * Enforcement is done by ScopeGuard (not this decorator).
 * This decorator only DECLARES the requirement.
 *
 * @param scopes - One or more scope strings required for this endpoint
 */
export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(REQUIRED_SCOPES_KEY, scopes);
