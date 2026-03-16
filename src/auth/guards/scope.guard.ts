import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { Request } from 'express';

/**
 * ScopeGuard enforces scope-based authorization.
 *
 * This guard:
 * 1. Reads required scopes from @RequireScopes() decorator metadata
 * 2. Checks if the calling service has ALL required scopes
 * 3. Returns 403 Forbidden if any scope is missing
 *
 * MUST run AFTER ServiceAuthGuard (which populates request.user).
 *
 * Why separate from ServiceAuthGuard?
 * - Single Responsibility: Auth vs. Authz
 * - Reusability: Same auth, different scope requirements per endpoint
 * - Testability: Test scope logic independently from JWT validation
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Step 1: Read required scopes from decorator metadata
    // Reflector looks at the handler (method) for REQUIRED_SCOPES_KEY
    const requiredScopes = this.reflector.get<string[]>(
      REQUIRED_SCOPES_KEY,
      context.getHandler(),
    );

    // If no @RequireScopes() decorator, no scopes required
    // This allows endpoints to opt-out (though not recommended for fail-closed design)
    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    // Step 2: Get service identity from request.user
    // ServiceAuthGuard populated this
    const request = context.switchToHttp().getRequest<Request>();
    const user = request['user'] as { serviceName: string; scopes: string[] };

    // Defensive check: If user is missing, ServiceAuthGuard didn't run
    // This should never happen if guards are properly ordered
    if (!user || !user.scopes) {
      throw new ForbiddenException(
        'Service identity not found. ServiceAuthGuard may not have run.',
      );
    }

    // Step 3: Check if service has ALL required scopes
    // Uses exact string matching (no wildcards)
    const hasAllScopes = requiredScopes.every((requiredScope) =>
      user.scopes.includes(requiredScope),
    );

    if (!hasAllScopes) {
      const missingScopes = requiredScopes.filter(
        (scope) => !user.scopes.includes(scope),
      );

      throw new ForbiddenException(
        `Service '${user.serviceName}' is missing required scopes: ${missingScopes.join(', ')}`,
      );
    }

    // Service has all required scopes - allow access
    return true;
  }
}
