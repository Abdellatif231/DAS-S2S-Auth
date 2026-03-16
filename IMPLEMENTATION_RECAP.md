# 🎓 What We Built: Step-by-Step Recap

## The Problem
You needed strict service-to-service authentication for your DAS where:
- Only backend services can access endpoints
- Each service has specific permissions (scopes)
- No user tokens allowed
- Fail-closed by default

---

## The Solution: JWT-Based S2S Auth with Separated Guards

### Core Components Created

#### 1️⃣ ServiceAuthGuard (`src/auth/guards/service-auth.guard.ts`)
**Role**: Authentication - "Who are you?"

**What it does**:
- Extracts JWT from `Authorization: Bearer <token>` header
- Verifies signature using `JWT_SECRET`
- Validates standard JWT claims (`iss`, `aud`, `exp`)
- **CRITICALLY**: Rejects tokens where `tokenType !== 'service'` (blocks user tokens!)
- Extracts `{ serviceName, scopes }` from JWT payload
- Attaches them to `request.user` for downstream use

**Returns**:
- ✅ `true` if valid service JWT
- ❌ `UnauthorizedException` (401) if invalid

---

#### 2️⃣ ScopeGuard (`src/auth/guards/scope.guard.ts`)
**Role**: Authorization - "What can you do?"

**What it does**:
- Reads required scopes from `@RequireScopes()` metadata using Reflector
- Gets service's scopes from `request.user` (set by ServiceAuthGuard)
- Checks if service has **ALL** required scopes (AND logic)
- Provides clear error messages showing which scopes are missing

**Returns**:
- ✅ `true` if service has all required scopes
- ❌ `ForbiddenException` (403) if missing any scope

---

#### 3️⃣ @RequireScopes Decorator (`src/auth/decorators/require-scopes.decorator.ts`)
**Role**: Declaration - "What does this endpoint need?"

**What it does**:
- Attaches scope requirements as metadata to controller methods
- Does NOT enforce anything (that's ScopeGuard's job)
- Makes permissions explicit and self-documenting in code

**Example**:
```typescript
@RequireScopes('user:read', 'user:write')
@Get()
getAllUsers() { ... }
```

---

#### 4️⃣ AuthModule (`src/auth/auth.module.ts`)
**Role**: Configuration and dependency injection

**What it does**:
- Configures `JwtModule` with:
  - Secret key from environment
  - Issuer/audience validation
  - Algorithm (HS256)
  - Clock tolerance for time drift
- Exports guards so other modules can use them
- Keeps all auth config in one place

---

### How They Work Together

```
┌──────────────────────────────────────────────────────────────┐
│                    Incoming Request                          │
│          Authorization: Bearer <JWT>                         │
└─────────────────────┬────────────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │   ServiceAuthGuard (Step 1)  │ ← Runs FIRST (global guard)
        │  "Is this a valid service?"  │
        ├─────────────────────────────┤
        │ ✓ Verify JWT signature       │
        │ ✓ Check iss/aud/exp          │
        │ ✓ Reject if tokenType != svc │
        │ ✓ Extract serviceName, scopes│
        │ ✓ Set request.user           │
        └─────────────┬───────────────┘
                      │ request.user = { serviceName, scopes }
                      ▼
        ┌─────────────────────────────┐
        │    ScopeGuard (Step 2)       │ ← Runs SECOND (global guard)
        │ "Does service have permission│
        ├─────────────────────────────┤
        │ ✓ Read @RequireScopes()      │
        │ ✓ Get request.user.scopes    │
        │ ✓ Check ALL required scopes  │
        │ ✓ 403 if missing any         │
        └─────────────┬───────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │   Controller Method          │ ← Business logic executes
        │   (e.g., createUser)         │
        └─────────────────────────────┘
```

---

## Configuration Files Modified

### `src/main.ts`
Added global guards in correct order:
```typescript
app.useGlobalGuards(
  app.get(ServiceAuthGuard),  // Auth first
  new ScopeGuard(reflector),  // Authz second
);
```

### `src/app.module.ts`
Imported `AuthModule` to make guards available app-wide.

### `.env`
Added JWT configuration:
- `JWT_SECRET`: Shared secret for signature verification
- `JWT_ISSUER`: Expected issuer ("auth-service")
- `JWT_AUDIENCE`: Expected audience ("das")

---

## Controllers Enhanced

### UserController
Added scope decorators to all endpoints:
- `@RequireScopes('user:read')` for GET requests
- `@RequireScopes('user:write')` for POST/PATCH
- `@RequireScopes('user:delete')` for DELETE

### MessageController
Same pattern:
- `@RequireScopes('message:read')`
- `@RequireScopes('message:write')`
- `@RequireScopes('message:delete')`

---

## Security Properties Achieved

✅ **Fail-closed**: Every endpoint protected by default (global guards)  
✅ **Separation of auth/authz**: ServiceAuthGuard vs ScopeGuard  
✅ **Explicit permissions**: `@RequireScopes()` declares requirements  
✅ **User token rejection**: `tokenType` check prevents user access  
✅ **Standard JWT validation**: Signature, issuer, audience, expiration  
✅ **No business logic in guards**: Guards only check identity and permissions  
✅ **Exact scope matching**: No wildcards or dynamic permission logic  

---

## How Services Should Use This

### Service's Perspective (e.g., chat-service)

1. **Get JWT from auth-service** with:
   ```json
   {
     "tokenType": "service",
     "serviceName": "chat-service",
     "scopes": ["user:read", "message:write", "message:read"],
     "iss": "auth-service",
     "aud": "das",
     "exp": 1738598400
   }
   ```

2. **Make request to DAS** with header:
   ```
   Authorization: Bearer <JWT>
   ```

3. **DAS validates and authorizes**:
   - ServiceAuthGuard: Checks JWT validity
   - ScopeGuard: Checks if service has required scopes

4. **Response**:
   - ✅ 200 OK + data if authorized
   - ❌ 401 if JWT invalid
   - ❌ 403 if missing required scopes

---

## Testing Your Implementation

### Option 1: Use the test script
```bash
# Generate a test JWT
npx ts-node scripts/mint-test-jwt.ts chat-service user:read user:write

# Use the output JWT in curl
curl -H "Authorization: Bearer <JWT>" http://localhost:5000/user
```

### Option 2: Test different scenarios

**Valid request**:
```bash
# JWT with correct scopes
curl -H "Authorization: Bearer <VALID_JWT_WITH_USER_READ>" \
  http://localhost:5000/user
# Expected: 200 OK with user data
```

**Missing scope**:
```bash
# JWT with scopes: ['message:read'] but endpoint needs 'user:read'
curl -H "Authorization: Bearer <JWT_WITHOUT_USER_READ>" \
  http://localhost:5000/user
# Expected: 403 Forbidden
```

**No token**:
```bash
curl http://localhost:5000/user
# Expected: 401 Unauthorized
```

**Expired token**:
```bash
curl -H "Authorization: Bearer <EXPIRED_JWT>" \
  http://localhost:5000/user
# Expected: 401 Unauthorized
```

---

## Key Design Decisions Explained

### Why separate guards?
**Single Responsibility Principle**:
- ServiceAuthGuard: JWT validation logic
- ScopeGuard: Permission checking logic
- Easier to test, maintain, and extend

### Why global guards vs controller-level?
**Fail-closed security**:
- Global = every endpoint protected by default
- Controller-level = opt-in (easy to forget)
- For security, fail-closed is safer

### Why metadata decorator?
**Explicit > Implicit**:
- Reading `@RequireScopes('user:write')` immediately tells you the permission model
- Self-documenting code
- No hidden permission logic

### Why exact scope matching (no wildcards)?
**Simplicity and security**:
- `user:*` wildcards add complexity
- Easy to make mistakes with pattern matching
- Explicit scopes are clearer and safer
- Follows your "no wildcards" requirement

---

## What's Next?

### Your responsibilities:

1. **Implement auth-service**:
   - Mints service JWTs
   - Manages scope assignments
   - Handles token lifecycle

2. **Migrate to RS256** (production):
   - Auth-service: private key for signing
   - DAS + other services: public key for verification
   - More secure than shared secret

3. **Add scope governance**:
   - Document what each scope grants
   - Define who gets what scopes and why
   - Review scope assignments regularly

4. **Implement token rotation**:
   - Short-lived JWTs (5-15 minutes)
   - Refresh token mechanism
   - Reduces impact of leaked tokens

5. **Add observability**:
   - Log authentication failures
   - Monitor for suspicious patterns
   - Alert on repeated 401/403 errors

---

## Learning Takeaways

### NestJS Concepts
- **Guards**: Middleware that returns true/false or throws exceptions
- **ExecutionContext**: Abstraction over HTTP/WebSocket/gRPC requests
- **Reflector**: Reads metadata attached by decorators
- **Dependency Injection**: Guards get JwtService via constructor
- **Global vs Local**: Guards can be app-wide or per-controller/route

### Security Concepts
- **Authentication vs Authorization**: Separate concerns, separate guards
- **JWT Claims**: iss, aud, exp are security boundaries
- **Fail-closed**: Secure by default, not opt-in
- **Least Privilege**: Services only get scopes they need

### Architecture Patterns
- **Single Responsibility**: One guard, one job
- **Explicit Configuration**: No magic, everything declared
- **Separation of Concerns**: Auth logic separate from business logic

---

## Questions?

This implementation follows production-grade patterns for S2S auth. It's:
- ✅ Secure by design (fail-closed, explicit permissions)
- ✅ Maintainable (clear separation of concerns)
- ✅ Testable (guards can be unit tested independently)
- ✅ Scalable (add new scopes by just declaring them)

**You now have a solid foundation for service-to-service authentication!**
