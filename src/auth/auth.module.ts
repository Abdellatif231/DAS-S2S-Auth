import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServiceAuthGuard } from './guards/service-auth.guard';
import { ScopeGuard } from './guards/scope.guard';

/**
 * AuthModule
 *
 * Provides:
 * - JWT verification configuration
 * - ServiceAuthGuard (authentication)
 * - ScopeGuard (authorization)
 *
 * Other modules import this to get access to guards.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        // JWT verification secret
        // In production: Use RS256 with public key, not HS256 with shared secret
        // For now, we'll use a shared secret from env
        secret: configService.get<string>('JWT_SECRET'),

        // Signature algorithm (HS256 = HMAC with SHA256, requires shared secret)
        // For asymmetric: use RS256 and provide publicKey instead of secret
        signOptions: {
          algorithm: 'HS256',
        },

        // Verification options (enforced by JwtService.verifyAsync)
        verifyOptions: {
          algorithms: ['HS256'], // Only accept HS256 tokens

          // Expected issuer (who minted the token)
          // Should match what auth-service puts in JWT
          issuer: configService.get<string>('JWT_ISSUER') || 'auth-service',

          // Expected audience (who the token is for)
          // Should be this service's name
          audience: configService.get<string>('JWT_AUDIENCE') || 'das',

          // Clock tolerance for exp/nbf checks (in seconds)
          // Allows for small clock drift between services
          clockTolerance: 10,
        },
      }),
    }),
  ],
  providers: [ServiceAuthGuard, ScopeGuard],
  exports: [ServiceAuthGuard, ScopeGuard, JwtModule],
})
export class AuthModule {}
