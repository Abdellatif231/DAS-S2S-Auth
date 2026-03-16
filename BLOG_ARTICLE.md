# Building Production-Ready Service-to-Service Authentication in NestJS with JWT

*A comprehensive guide to implementing secure, scope-based authentication for microservices*

---

## The Problem: Securing Your Database Access Layer

Imagine this scenario: You're building a microservices architecture where multiple backend services need to access a central Database Access Service (DAS). 
This DAS is the only service allowed to talk to your PostgreSQL database via Prisma.

**The challenge?** How do you ensure:
1. Only **authenticated backend services** can access your DAS (no users, no browsers)
2. Each service has **granular permissions** (not all services should do everything)
3. Security is **fail-closed** (no endpoint accidentally left unprotected)
4. The system is **maintainable** (clear, testable, and follows best practices)

In this article, I'll walk you through implementing a production-grade service-to-service (S2S) authentication system using
**NestJS**, **JWT**, and **scope-based authorization**.

---

## The Architecture: Separation of Concerns

Before diving into code, let's establish our architecture. We'll use **Model B** from common S2S auth patterns:

```
┌─────────────────┐
│  Auth Service   │ ← Trust authority (mints JWTs, defines scopes)
│  (Signing Key)  │
└────────┬────────┘
         │ Issues JWT with scopes
         ▼
┌─────────────────┐
│ Calling Service │ (e.g., chat-service, notification-service)
│  (has JWT)      │
└────────┬────────┘
         │ Sends: Authorization: Bearer <JWT>
         ▼
┌─────────────────┐
│      DAS        │ ← We're building this!
│ (Verifies JWT,  │    (Validates JWTs, enforces scopes)
│  enforces scopes)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
└─────────────────┘
```

**Key principle**: The DAS **never issues tokens**—it only verifies and enforces them.

---

## The Foundation: Two Guards, One Decorator

Our implementation follows **separation of concerns** with three core components:

1. **ServiceAuthGuard** - Handles authentication ("Who are you?")
2. **ScopeGuard** - Handles authorization ("What can you do?")
3. **@RequireScopes()** - Declares required permissions

Why separate guards? Because **authentication ≠ authorization**. This separation makes code more:
- **Testable** (test each concern independently)
- **Reusable** (same auth, different scope requirements)
- **Maintainable** (single responsibility principle)

Let's build each piece.

---

## Step 1: Setting Up JWT Module

First, install dependencies:

```bash
npm install @nestjs/jwt jsonwebtoken
npm install -D @types/jsonwebtoken
```

Create the auth module with JWT configuration:

```typescript
// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServiceAuthGuard } from './guards/service-auth.guard';
import { ScopeGuard } from './guards/scope.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: {
          algorithms: ['HS256'],
          issuer: configService.get<string>('JWT_ISSUER') || 'auth-service',
          audience: configService.get<string>('JWT_AUDIENCE') || 'das',
          clockTolerance: 10, // Allow 10s clock drift
        },
      }),
    }),
  ],
  providers: [ServiceAuthGuard, ScopeGuard],
  exports: [ServiceAuthGuard, ScopeGuard, JwtModule],
})
export class AuthModule {}
```

**Why these settings?**
- **issuer/audience**: Validates the JWT is for this specific service
- **clockTolerance**: Handles time drift between servers
- **algorithm**: HS256 for dev (use RS256 with public/private keys in production)

Create your `.env` file:

```env
JWT_SECRET=your-super-secret-key-change-in-production
JWT_ISSUER=auth-service
JWT_AUDIENCE=das
```

---

## Step 2: Building ServiceAuthGuard (Authentication)

This guard validates service JWTs and **critically** rejects user tokens:

```typescript
// src/auth/guards/service-auth.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Extract JWT from Authorization header
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    try {
      // Verify JWT (signature, exp, iss, aud automatically checked)
      const payload = await this.jwtService.verifyAsync(token);

      // 🔒 CRITICAL: Reject user tokens
      if (payload.tokenType !== 'service') {
        throw new UnauthorizedException(
          'Invalid token type. Only service tokens are accepted.',
        );
      }

      // Validate service claims
      if (!payload.serviceName || !Array.isArray(payload.scopes)) {
        throw new UnauthorizedException(
          'Invalid service token: missing serviceName or scopes',
        );
      }

      // Attach service identity to request for downstream use
      request['user'] = {
        serviceName: payload.serviceName,
        scopes: payload.scopes,
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException(
        `Service authentication failed: ${error.message}`,
      );
    }
  }

  private extractTokenFromHeader(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) return null;

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' && token ? token : null;
  }
}
```

**Key security feature**: The `tokenType === 'service'` check. This prevents a malicious user from using their user JWT to access service endpoints.

**What happens here:**
1. Extract JWT from `Authorization: Bearer <token>`
2. Verify signature and standard claims (exp, iss, aud)
3. Check if it's a service token (not a user token)
4. Extract `{ serviceName, scopes }` and attach to `request.user`

---

## Step 3: Creating the @RequireScopes Decorator

This decorator attaches metadata to controller methods:

```typescript
// src/auth/decorators/require-scopes.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const REQUIRED_SCOPES_KEY = 'required_scopes';

export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(REQUIRED_SCOPES_KEY, scopes);
```

**Simple but powerful**: It's just metadata. The actual enforcement happens in ScopeGuard.

Usage example:
```typescript
@RequireScopes('user:read', 'user:write')  // Requires BOTH scopes
@Get()
getAllUsers() { ... }
```

---

## Step 4: Building ScopeGuard (Authorization)

This guard reads the required scopes and enforces them:

```typescript
// src/auth/guards/scope.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { Request } from 'express';

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Read required scopes from @RequireScopes() decorator
    const requiredScopes = this.reflector.get<string[]>(
      REQUIRED_SCOPES_KEY,
      context.getHandler(),
    );

    if (!requiredScopes || requiredScopes.length === 0) {
      return true; // No scopes required
    }

    // Get service identity from request.user (set by ServiceAuthGuard)
    const request = context.switchToHttp().getRequest<Request>();
    const user = request['user'] as { serviceName: string; scopes: string[] };

    if (!user || !user.scopes) {
      throw new ForbiddenException(
        'Service identity not found. ServiceAuthGuard may not have run.',
      );
    }

    // Check if service has ALL required scopes (AND logic)
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

    return true;
  }
}
```

**What makes this powerful:**
- **Exact string matching** (no wildcards, no complexity)
- **Clear error messages** (tells you exactly which scopes are missing)
- **Assumes authentication** (relies on ServiceAuthGuard running first)

---

## Step 5: Registering Guards Globally

In `main.ts`, register both guards **globally** and **in order**:

```typescript
// src/main.ts
import 'dotenv/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ServiceAuthGuard } from './auth/guards/service-auth.guard';
import { ScopeGuard } from './auth/guards/scope.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe());

  // Register guards in order: Auth first, then Authz
  const reflector = app.get(Reflector);
  app.useGlobalGuards(
    app.get(ServiceAuthGuard),  // 1. Authentication
    new ScopeGuard(reflector),  // 2. Authorization
  );

  await app.listen(5000);
}
bootstrap();
```

**Why global?** Fail-closed security. Every endpoint is protected by default. No risk of forgetting to add guards to new controllers.

**Why this order?** You must know WHO the caller is (authentication) before checking WHAT they can do (authorization).

Don't forget to import AuthModule in `app.module.ts`:

```typescript
// src/app.module.ts
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,  // ← Add this
    UserModule,
    MessageModule,
  ],
  // ...
})
export class AppModule {}
```

---

## Step 6: Protecting Your Endpoints

Now apply scopes to your controllers:

```typescript
// src/user/user.controller.ts
import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @RequireScopes('user:write')
  @Post()
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.userService.createUser(createUserDto);
  }

  @RequireScopes('user:read')
  @Get()
  async getAllUsers() {
    return this.userService.findAll();
  }

  @RequireScopes('user:read')
  @Get(':id')
  async getUserById(@Param('id') id: string) {
    return this.userService.findUserById(id);
  }

  @RequireScopes('user:write')
  @Patch(':id')
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.updateUserById(id, dto);
  }

  @RequireScopes('user:delete')
  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    return this.userService.deleteUserById(id);
  }
}
```

**Scope naming convention**: `<resource>:<action>`
- `user:read` - Read user data
- `user:write` - Create/update users
- `user:delete` - Delete users

This granularity enables **principle of least privilege**: each service gets only the scopes it needs.

---

## Step 7: Testing Your Implementation

Create a helper script to generate test JWTs:

```typescript
// scripts/mint-test-jwt.ts
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';
const JWT_ISSUER = process.env.JWT_ISSUER || 'auth-service';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'das';

function mintServiceJWT(serviceName: string, scopes: string[]): string {
  const payload = {
    tokenType: 'service',
    serviceName,
    scopes,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
  };

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

// Parse CLI args
const [serviceName, ...scopes] = process.argv.slice(2);
const token = mintServiceJWT(serviceName, scopes);

console.log('\n✅ Service JWT Generated!\n');
console.log('JWT Token:', token);
console.log('\nUse in curl:');
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:5000/user\n`);
```

Usage:
```bash
# Generate JWT with user:read scope
npx ts-node scripts/mint-test-jwt.ts chat-service user:read

# Use the token
curl -H "Authorization: Bearer <JWT>" http://localhost:5000/user
```

**Test scenarios:**

✅ **Valid request with correct scope:**
```bash
# JWT has scopes: ['user:read']
curl -H "Authorization: Bearer <JWT>" http://localhost:5000/user
# 200 OK - Returns user data
```

❌ **Missing scope:**
```bash
# JWT has scopes: ['message:read'] (missing 'user:read')
curl -H "Authorization: Bearer <JWT>" http://localhost:5000/user
# 403 Forbidden: "Service 'chat-service' is missing required scopes: user:read"
```

❌ **No token:**
```bash
curl http://localhost:5000/user
# 401 Unauthorized: "Missing or invalid Authorization header"
```

❌ **User token (not service token):**
```bash
# JWT has tokenType: 'user'
curl -H "Authorization: Bearer <USER_JWT>" http://localhost:5000/user
# 401 Unauthorized: "Invalid token type. Only service tokens are accepted."
```

---

## The Complete Request Flow

Here's what happens when a service calls your DAS:

```
1. Service → DAS
   POST /user
   Authorization: Bearer <JWT>

2. ServiceAuthGuard runs (Authentication)
   ✓ Extract JWT from header
   ✓ Verify signature with JWT_SECRET
   ✓ Check iss === 'auth-service'
   ✓ Check aud === 'das'
   ✓ Check exp > now
   ✓ Check tokenType === 'service' (CRITICAL!)
   ✓ Extract { serviceName, scopes }
   ✓ Set request.user

3. ScopeGuard runs (Authorization)
   ✓ Read @RequireScopes('user:write')
   ✓ Get request.user.scopes
   ✓ Check if scopes includes 'user:write'
   ✓ 403 if missing

4. Controller executes
   ✓ Business logic runs
   ✓ Returns response
```

---

## Security Considerations

### 🔒 Why `tokenType === 'service'`?

This is your **critical security boundary**. Without it, a user could mint a user JWT and access service endpoints. By requiring `tokenType: 'service'`, you enforce that only backend services (not users) can access the DAS.

### 🔑 Production: Use RS256, Not HS256

**HS256** (symmetric): All services share the same secret. If one service is compromised, all JWTs can be forged.

**RS256** (asymmetric): 
- Auth-service has **private key** (signs JWTs)
- All other services have **public key** (verify JWTs only)
- Much more secure!

Update your JWT config for production:
```typescript
verifyOptions: {
  algorithms: ['RS256'],
  publicKey: fs.readFileSync('path/to/public.key'),
  // ...
}
```

### ⏱️ Token Expiration

Use **short-lived tokens** (5-15 minutes) with a refresh mechanism. This limits the damage if a token is leaked.

### 📊 Logging & Monitoring

Log authentication failures for security monitoring:
```typescript
catch (error) {
  this.logger.warn(`Auth failed: ${error.message}`, { 
    ip: request.ip,
    path: request.path 
  });
  throw new UnauthorizedException(...);
}
```

---

## Best Practices & Lessons Learned

### ✅ DO:
- **Fail closed**: Use global guards so all endpoints are protected by default
- **Separate auth/authz**: Different guards for different concerns
- **Explicit scopes**: Declare required scopes in code, not config files
- **Test edge cases**: Expired tokens, wrong issuer, missing scopes
- **Document scopes**: Maintain a registry of what each scope grants

### ❌ DON'T:
- **Don't use wildcards**: `user:*` adds complexity; be explicit
- **Don't put business logic in guards**: Guards check identity/permissions only
- **Don't skip the tokenType check**: Critical for separating user/service tokens
- **Don't use long-lived tokens**: 1-hour max, ideally 5-15 minutes
- **Don't commit JWT_SECRET**: Use environment variables, never hardcode

---

## Extending the System

### Adding New Scopes

1. Define the scope: `order:read`, `order:write`, etc.
2. Add to endpoint: `@RequireScopes('order:read')`
3. Auth-service grants scope to services that need it

### Multiple Scopes (AND Logic)

```typescript
@RequireScopes('user:read', 'user:write')  // Needs BOTH
@Post()
complexOperation() { ... }
```

### Optional Endpoints (No Scope Required)

```typescript
@Get('health')
healthCheck() { 
  // Still requires valid service JWT (ServiceAuthGuard)
  // But no specific scopes needed (no @RequireScopes)
  return { status: 'ok' };
}
```

---

## Conclusion

You now have a production-grade S2S authentication system that:

✅ Validates service JWTs with signature, issuer, audience, and expiration  
✅ Rejects user tokens (via `tokenType` check)  
✅ Enforces granular, scope-based permissions  
✅ Fails closed (global guards protect everything by default)  
✅ Follows NestJS best practices (separation of concerns, DI, guards)  
✅ Is testable, maintainable, and scalable  

**Key takeaways:**
1. **Separate authentication from authorization** (two guards)
2. **Use metadata decorators** for explicit permission declarations
3. **Global guards ensure fail-closed security**
4. **The `tokenType` check is critical** for service-only access
5. **RS256 for production**, HS256 for development only

### Next Steps

- Implement your auth-service to mint these JWTs
- Migrate to RS256 with public/private keys
- Add token refresh mechanism
- Implement scope governance and auditing
- Add comprehensive logging and monitoring

**Full code available**: This implementation follows NestJS official patterns and is ready for production use.

---

## Questions or Feedback?

Have you implemented S2S auth differently? What patterns work well in your architecture? Drop a comment below!

**Tags**: #NestJS #JWT #Microservices #Authentication #Authorization #TypeScript #Security

---

*Originally implemented for a Database Access Service (DAS) in a microservices architecture. All code examples are production-tested.*
