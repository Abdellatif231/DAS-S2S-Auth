import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

/**
 * ServiceAuthGuard validates service-to-service JWTs.
 *
 * This guard:
 * 1. Extracts the JWT from the Authorization header
 * 2. Verifies the signature, issuer, audience, and expiration
 * 3. REJECTS user tokens (only accepts service tokens)
 * 4. Extracts serviceName and scopes
 * 5. Attaches them to request.user
 *
 * Runs BEFORE ScopeGuard (authentication before authorization).
 */
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Step 1: Extract JWT from Authorization header
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    try {
      // Step 2: Verify and decode the JWT
      // JwtService.verifyAsync checks signature, exp, iss, aud automatically
      // based on JwtModule configuration
      const payload = await this.jwtService.verifyAsync(token);

      // Step 3: CRITICAL - Reject user tokens
      // Services MUST include tokenType: 'service'
      // Users either won't have this claim, or will have tokenType: 'user'
      if (payload.tokenType !== 'service') {
        throw new UnauthorizedException(
          'Invalid token type. Only service tokens are accepted.',
        );
      }

      // Step 4: Validate required service claims
      if (!payload.serviceName || !Array.isArray(payload.scopes)) {
        throw new UnauthorizedException(
          'Invalid service token: missing serviceName or scopes',
        );
      }

      // Step 5: Attach service identity to request
      // This makes { serviceName, scopes } available to:
      // - ScopeGuard (next guard)
      // - Controllers (via @Req() or custom decorator)
      request['user'] = {
        serviceName: payload.serviceName,
        scopes: payload.scopes,
      };

      return true; // Allow request to proceed
    } catch (error) {
      // JWT verification failed (invalid signature, expired, wrong iss/aud, etc.)
      throw new UnauthorizedException(
        `Service authentication failed: ${error.message}`,
      );
    }
  }

  /**
   * Extracts JWT from "Authorization: Bearer <token>" header.
   * Returns null if header is missing or malformed.
   */
  private extractTokenFromHeader(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return null;
    }

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' && token ? token : null;
  }
}
