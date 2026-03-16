# Request Flow Diagram

## Complete Request Journey Through DAS

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CALLING SERVICE                                 │
│                      (e.g., chat-service)                               │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                │ 1. Service needs to create a user
                                │
                                ▼
                    ┌───────────────────────┐
                    │   Get JWT Token       │
                    │   from auth-service   │
                    └───────────┬───────────┘
                                │
                                │ 2. Receives JWT:
                                │    {
                                │      tokenType: 'service',
                                │      serviceName: 'chat-service',
                                │      scopes: ['user:read', 'user:write'],
                                │      iss: 'auth-service',
                                │      aud: 'das',
                                │      exp: 1738598400
                                │    }
                                ▼
                    ┌───────────────────────┐
                    │  Make HTTP Request    │
                    │  POST /user           │
                    │  Header:              │
                    │  Authorization:       │
                    │  Bearer <JWT>         │
                    └───────────┬───────────┘
                                │
                                │ HTTP Request
                                │
┌───────────────────────────────▼─────────────────────────────────────────┐
│                           DAS - NestJS                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │            GLOBAL GUARD #1: ServiceAuthGuard                    │  │
│   │                 (Authentication Layer)                          │  │
│   ├─────────────────────────────────────────────────────────────────┤  │
│   │  1. Extract JWT from Authorization header                      │  │
│   │     ✓ Header present?                                          │  │
│   │     ✓ Format: "Bearer <token>"?                                │  │
│   │                                                                 │  │
│   │  2. Verify JWT signature                                       │  │
│   │     ✓ Signature valid using JWT_SECRET?                        │  │
│   │                                                                 │  │
│   │  3. Validate standard claims                                   │  │
│   │     ✓ iss === 'auth-service'?                                  │  │
│   │     ✓ aud === 'das'?                                           │  │
│   │     ✓ exp > now?                                               │  │
│   │                                                                 │  │
│   │  4. Validate service-specific claims                           │  │
│   │     ✓ tokenType === 'service'? ← CRITICAL CHECK                │  │
│   │     ✓ serviceName present?                                     │  │
│   │     ✓ scopes is array?                                         │  │
│   │                                                                 │  │
│   │  5. Attach to request                                          │  │
│   │     request.user = {                                           │  │
│   │       serviceName: 'chat-service',                             │  │
│   │       scopes: ['user:read', 'user:write']                      │  │
│   │     }                                                           │  │
│   │                                                                 │  │
│   │  ❌ If any check fails → UnauthorizedException (401)            │  │
│   │  ✅ All checks pass → Continue to next guard                    │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                 │                                       │
│                                 │ request.user populated                │
│                                 ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │            GLOBAL GUARD #2: ScopeGuard                          │  │
│   │                (Authorization Layer)                            │  │
│   ├─────────────────────────────────────────────────────────────────┤  │
│   │  1. Read endpoint metadata                                     │  │
│   │     Uses Reflector to get @RequireScopes('user:write')         │  │
│   │     requiredScopes = ['user:write']                            │  │
│   │                                                                 │  │
│   │  2. Get service scopes from request.user                       │  │
│   │     serviceScopes = ['user:read', 'user:write']                │  │
│   │                                                                 │  │
│   │  3. Check if service has ALL required scopes                   │  │
│   │     Does serviceScopes include 'user:write'? ✓                 │  │
│   │                                                                 │  │
│   │  ❌ Missing scopes → ForbiddenException (403)                   │  │
│   │     "Service 'chat-service' is missing required scopes: ..."   │  │
│   │  ✅ Has all scopes → Continue to controller                     │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                 │                                       │
│                                 │ Authorized                            │
│                                 ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │              CONTROLLER: UserController                         │  │
│   ├─────────────────────────────────────────────────────────────────┤  │
│   │  @RequireScopes('user:write')  ← Metadata read by ScopeGuard   │  │
│   │  @Post()                                                        │  │
│   │  async createUser(@Body() dto: CreateUserDto) {                │  │
│   │    return this.userService.createUser(dto);                    │  │
│   │  }                                                              │  │
│   └─────────────────────────────┬───────────────────────────────────┘  │
│                                 │                                       │
│                                 ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │              SERVICE: UserService                               │  │
│   ├─────────────────────────────────────────────────────────────────┤  │
│   │  async createUser(dto: CreateUserDto) {                        │  │
│   │    return this.prisma.user.create({ data: dto });              │  │
│   │  }                                                              │  │
│   └─────────────────────────────┬───────────────────────────────────┘  │
│                                 │                                       │
│                                 ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │         PRISMA → PostgreSQL                                     │  │
│   │         INSERT INTO users ...                                   │  │
│   └─────────────────────────────┬───────────────────────────────────┘  │
│                                 │                                       │
│                                 │ User created                          │
│                                 ▼                                       │
│                     ┌───────────────────────┐                           │
│                     │    HTTP Response      │                           │
│                     │    201 Created        │                           │
│                     │    { id, username }   │                           │
│                     └───────────┬───────────┘                           │
└─────────────────────────────────┼───────────────────────────────────────┘
                                  │
                                  │ Response
                                  ▼
                      ┌───────────────────────┐
                      │   CALLING SERVICE     │
                      │   Receives user data  │
                      └───────────────────────┘
```

## Error Scenarios

### ❌ Scenario 1: Missing Authorization Header
```
Request: POST /user (no Authorization header)
         │
         ▼
ServiceAuthGuard
         │
         └─→ ❌ 401 Unauthorized
             "Missing or invalid Authorization header"
```

### ❌ Scenario 2: Invalid/Expired JWT
```
Request: POST /user (expired JWT)
         │
         ▼
ServiceAuthGuard
         │
         ├─ Extract JWT: ✓
         ├─ Verify signature: ✓
         ├─ Check exp: ❌ Expired!
         │
         └─→ ❌ 401 Unauthorized
             "Service authentication failed: jwt expired"
```

### ❌ Scenario 3: User Token (Not Service Token)
```
Request: POST /user (user JWT with tokenType='user')
         │
         ▼
ServiceAuthGuard
         │
         ├─ Extract JWT: ✓
         ├─ Verify signature: ✓
         ├─ Check iss/aud/exp: ✓
         ├─ Check tokenType: ❌ tokenType='user' (not 'service')
         │
         └─→ ❌ 401 Unauthorized
             "Invalid token type. Only service tokens are accepted."
```

### ❌ Scenario 4: Missing Required Scope
```
Request: POST /user (JWT with scopes=['message:read'])
         │
         ▼
ServiceAuthGuard
         │
         ├─ All checks pass ✓
         ├─ Set request.user = { serviceName, scopes: ['message:read'] }
         │
         ▼
ScopeGuard
         │
         ├─ Read metadata: requiredScopes = ['user:write']
         ├─ Get service scopes: ['message:read']
         ├─ Check: Does ['message:read'] include 'user:write'? ❌ NO
         │
         └─→ ❌ 403 Forbidden
             "Service 'X' is missing required scopes: user:write"
```

### ✅ Scenario 5: Valid Request
```
Request: POST /user (valid service JWT with 'user:write')
         │
         ▼
ServiceAuthGuard ✓
         │
         ▼
ScopeGuard ✓
         │
         ▼
UserController
         │
         ▼
UserService
         │
         ▼
Prisma → PostgreSQL
         │
         ▼
✅ 201 Created { id, username }
```

## Key Takeaways

1. **Sequential Guards**: ServiceAuthGuard → ScopeGuard → Controller
2. **Fail-Closed**: Any guard failure = request rejected
3. **Separation**: Authentication (JWT) separate from Authorization (scopes)
4. **Metadata-Driven**: @RequireScopes() declares, ScopeGuard enforces
5. **Clear Errors**: Different HTTP codes for different failures (401 vs 403)
