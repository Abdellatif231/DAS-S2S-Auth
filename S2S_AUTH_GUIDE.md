# Service-to-Service Authentication Implementation Guide

## 🎯 Overview

This DAS (Database Access Service) now enforces strict service-to-service authentication using JWTs. Only authenticated backend services with the correct scopes can access endpoints.

## 📐 Architecture

```
┌─────────────────────┐
│  Calling Service    │ (e.g., chat-service)
│  (has JWT lib)      │
└──────────┬──────────┘
           │ 1. Mints JWT with:
           │    {
           │      tokenType: 'service',
           │      serviceName: 'chat-service',
           │      scopes: ['user:read', 'message:write'],
           │      iss: 'auth-service',
           │      aud: 'das',
           │      exp: <timestamp>
           │    }
           │ 2. Adds header: Authorization: Bearer <JWT>
           ▼
┌─────────────────────┐
│   DAS Endpoint      │
└──────────┬──────────┘
           │ 3. ServiceAuthGuard (runs first)
           │    ✓ Validates JWT signature
           │    ✓ Checks iss, aud, exp
           │    ✓ Rejects if tokenType !== 'service'
           │    ✓ Extracts { serviceName, scopes }
           │    ✓ Attaches to request.user
           │
           │ 4. ScopeGuard (runs second)
           │    ✓ Reads @RequireScopes('user:read')
           │    ✓ Checks if service.scopes includes 'user:read'
           │    ✓ Returns 403 if missing
           │
           ▼
┌─────────────────────┐
│  Controller Logic   │
└─────────────────────┘
```

## 🔑 Components

### 1. ServiceAuthGuard
**Location**: `src/auth/guards/service-auth.guard.ts`

**Purpose**: Validates service JWTs and rejects user tokens.

**Checks**:
- JWT signature (using `JWT_SECRET`)
- `iss` (issuer) must match `JWT_ISSUER`
- `aud` (audience) must match `JWT_AUDIENCE`
- `exp` (expiration) must be in the future
- `tokenType` must be `'service'` (critical!)
- Must have `serviceName` and `scopes` claims

**On success**: Attaches `{ serviceName, scopes }` to `request.user`

**On failure**: Throws `UnauthorizedException` (401)

---

### 2. ScopeGuard
**Location**: `src/auth/guards/scope.guard.ts`

**Purpose**: Enforces scope-based authorization.

**Logic**:
1. Reads `@RequireScopes(...)` from endpoint metadata
2. Gets `scopes` from `request.user` (set by ServiceAuthGuard)
3. Checks if service has ALL required scopes
4. Throws `ForbiddenException` (403) if missing any

**Example**:
```typescript
@RequireScopes('user:read', 'user:write')
@Get()
getAllUsers() { ... }
```
Service must have BOTH `user:read` AND `user:write`.

---

### 3. @RequireScopes Decorator
**Location**: `src/auth/decorators/require-scopes.decorator.ts`

**Purpose**: Declares required scopes for an endpoint.

**Usage**:
```typescript
@RequireScopes('user:read')  // Single scope
@RequireScopes('user:read', 'user:write')  // Multiple (AND logic)
```

Does NOT enforce—just declares. ScopeGuard enforces.

---

## 🔒 Scope Definitions

Current scopes in use:

| Scope           | Grants Access To                          |
|-----------------|-------------------------------------------|
| `user:read`     | GET user endpoints (fetch user data)      |
| `user:write`    | POST/PATCH user endpoints (create/update) |
| `user:delete`   | DELETE user endpoints                     |
| `message:read`  | GET message endpoints                     |
| `message:write` | POST message endpoints                    |
| `message:delete`| DELETE message endpoints                  |

**Scope naming convention**: `<resource>:<action>`

---

## ⚙️ Configuration

### Environment Variables
Create `.env` file (see `.env.example`):

```env
JWT_SECRET=your-super-secret-key-change-this-in-production
JWT_ISSUER=auth-service
JWT_AUDIENCE=das
```

**Security note**: 
- Use RS256 (asymmetric) in production, not HS256
- With RS256, DAS only needs the public key
- Auth-service keeps the private key

---

## 🚦 Guard Execution Order

Guards execute in the order they're registered in `main.ts`:

```typescript
app.useGlobalGuards(
  app.get(ServiceAuthGuard),  // 1st - Authentication
  new ScopeGuard(reflector),  // 2nd - Authorization
);
```

**Critical**: ServiceAuthGuard MUST run before ScopeGuard (auth before authz).

---

## 📝 Adding New Endpoints

When creating a new endpoint:

1. **Add `@RequireScopes(...)` decorator**:
   ```typescript
   @RequireScopes('resource:action')
   @Get()
   myEndpoint() { ... }
   ```

2. **Define the scope if new** (update this doc)

3. **Auth-service grants scope** to services that need it

**Without `@RequireScopes()`**: Endpoint is still protected by ServiceAuthGuard (JWT required), but no specific scopes needed.

---

## 🧪 Testing

### Test Valid Service JWT
```bash
# Service mints JWT with:
# { tokenType: 'service', serviceName: 'test-service', scopes: ['user:read'], iss: 'auth-service', aud: 'das' }

curl -H "Authorization: Bearer <VALID_JWT>" http://localhost:5000/user
# ✅ 200 OK
```

### Test Missing Scope
```bash
# JWT has scopes: ['message:read']
curl -H "Authorization: Bearer <JWT>" http://localhost:5000/user
# ❌ 403 Forbidden: "Service 'test-service' is missing required scopes: user:read"
```

### Test User Token
```bash
# JWT has tokenType: 'user'
curl -H "Authorization: Bearer <USER_JWT>" http://localhost:5000/user
# ❌ 401 Unauthorized: "Invalid token type. Only service tokens are accepted."
```

### Test No Token
```bash
curl http://localhost:5000/user
# ❌ 401 Unauthorized: "Missing or invalid Authorization header"
```

---

## 🎯 Why This Design?

### Separation of Concerns
- **ServiceAuthGuard**: "Who are you?" (authentication)
- **ScopeGuard**: "What can you do?" (authorization)
- Keeps code clean, testable, reusable

### Fail-Closed by Default
- Guards are global—every endpoint protected
- No endpoint accessible without valid service JWT + scopes
- Safer than opt-in security

### Explicit Permissions
- `@RequireScopes()` makes permissions visible in code
- No hidden access control logic
- Self-documenting

### No Business Logic in Guards
- Guards only check JWT and scopes
- Controllers remain focused on business logic
- Single Responsibility Principle

---

## 🚨 Security Checklist

✅ Service JWTs are separate from user JWTs (`tokenType` check)  
✅ JWT signature verified on every request  
✅ Issuer and audience validated  
✅ Expiration checked  
✅ Scopes use exact string matching (no wildcards)  
✅ Every endpoint explicitly declares required scopes  
✅ Fail-closed: Guards are global  
✅ No raw SQL or dynamic query endpoints  

---

## 🔄 Next Steps (Your Responsibility)

1. **Implement auth-service** that mints service JWTs
2. **Distribute JWT_SECRET** securely to calling services
3. **Migrate to RS256** for production (asymmetric keys)
4. **Add scope governance**: Document who gets what scopes and why
5. **Implement token rotation**: Short-lived JWTs (5-15 min) with refresh logic
6. **Add observability**: Log authentication failures for security monitoring
7. **Test edge cases**: Expired tokens, malformed JWTs, wrong issuer, etc.

---

## 📚 Key Learnings

1. **Guards are middleware** that run before controllers
2. **Authentication ≠ Authorization**: Separate guards for each
3. **Metadata + Reflector**: How decorators communicate with guards
4. **Fail-closed security**: Global guards + explicit scope declarations
5. **JWT claims**: `iss`, `aud`, `exp`, `tokenType` are security boundaries

---

## 🐛 Troubleshooting

### "Service identity not found"
ScopeGuard ran but ServiceAuthGuard didn't populate `request.user`.  
**Fix**: Ensure guards are in correct order in `main.ts`.

### "Invalid service token: missing serviceName or scopes"
Calling service's JWT doesn't include required claims.  
**Fix**: Auth-service must include `serviceName` and `scopes` array in JWT payload.

### "Invalid token type"
Service sent a user token, or `tokenType` claim is missing/wrong.  
**Fix**: Ensure service JWTs include `tokenType: 'service'`.

### "Service X is missing required scopes: Y"
Service authenticated, but doesn't have the scope.  
**Fix**: Auth-service needs to grant scope Y to service X.

---

**Questions?** This implementation is production-grade for service-to-service auth. Extend as needed for your specific requirements.
