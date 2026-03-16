<div align="center">

# DAS — Database Access Service

### Service-to-Service Authentication & Authorization

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![JWT](https://img.shields.io/badge/JWT-HS256-000000?logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/license-UNLICENSED-red)](./package.json)

A **production-grade NestJS microservice** that acts as a secure database access layer, protected by JWT-based service-to-service (S2S) authentication and fine-grained scope-based authorization.

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [API Reference](#api-reference)
  - [Health Check](#health-check)
  - [User Endpoints](#user-endpoints)
  - [Message Endpoints](#message-endpoints)
- [Authentication & Authorization](#authentication--authorization)
  - [JWT Token Structure](#jwt-token-structure)
  - [Available Scopes](#available-scopes)
  - [Guard Execution Pipeline](#guard-execution-pipeline)
  - [Generating Test Tokens](#generating-test-tokens)
- [Testing](#testing)
- [Docker](#docker)
- [Project Structure](#project-structure)
- [Security Notes](#security-notes)
- [Further Reading](#further-reading)

---

## Overview

**DAS (Database Access Service)** is a backend microservice that centralizes and protects access to a PostgreSQL database. Instead of allowing multiple services to connect directly to the database, all data operations are routed through DAS, which validates that every request comes from a trusted, properly scoped internal service.

```
   ┌──────────────────┐          ┌────────────────────────────────┐
   │  chat-service    │─────────▶│           DAS (this service)   │
   │  auth-service    │  Bearer  │  ┌──────────────────────────┐  │
   │  user-service    │   JWT    │  │ ServiceAuthGuard (JWT ✓) │  │
   └──────────────────┘          │  │ ScopeGuard (Permissions) │  │
                                 │  └──────────────┬───────────┘  │
                                 │                 ▼              │
                                 │         ┌──────────────┐       │
                                 │         │  PostgreSQL   │       │
                                 │         └──────────────┘       │
                                 └────────────────────────────────┘
```

---

## Features

- 🔐 **JWT-based S2S Authentication** — validates service identity on every request
- 🎯 **Scope-based Authorization** — fine-grained per-endpoint permission control
- 🛡️ **Fail-Closed Security** — all endpoints are protected globally by default; nothing is left unguarded accidentally
- ✅ **Request Validation** — all input validated with `class-validator` before hitting business logic
- 👤 **User Management** — full CRUD for users (create, read, update, delete) by ID or username
- 💬 **Message / Chat** — create messages, read chat history between two users, delete messages
- 🗃️ **Prisma ORM** — type-safe database access with auto-generated client
- 🐳 **Docker-ready** — multi-stage Alpine build for minimal production images
- 🧪 **Tested** — Jest unit tests and e2e test suite included

---

## Architecture

The request lifecycle follows a strict two-stage security pipeline before any controller logic runs:

```
Incoming Request
       │
       ▼
┌─────────────────────┐
│  ServiceAuthGuard   │  ← Stage 1: Authentication
│  - Verify JWT sig   │    • Validates signature with JWT_SECRET
│  - Check iss / aud  │    • Enforces issuer & audience claims
│  - Reject non-svc   │    • Rejects user tokens (tokenType ≠ 'service')
│  - Extract scopes   │    • Attaches { serviceName, scopes } to request
└────────┬────────────┘
         │ 401 on failure
         ▼
┌─────────────────────┐
│    ScopeGuard       │  ← Stage 2: Authorization
│  - Read @RequireScopes metadata │
│  - Check ALL required scopes    │
└────────┬────────────┘
         │ 403 on failure
         ▼
   Controller Handler
```

Key design decisions:

| Decision | Rationale |
|----------|-----------|
| Two separate guards | Single Responsibility — each guard has exactly one job |
| Global guard registration | Fail-closed — impossible to accidentally leave an endpoint unguarded |
| `tokenType: 'service'` check | Prevents user tokens from being used to call internal APIs |
| AND-logic on scopes | Services get only the access they explicitly need |
| Exact scope string matching | No wildcard complexity; easy to audit |

---

## Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | [NestJS](https://nestjs.com/) | 11 |
| Language | [TypeScript](https://www.typescriptlang.org/) | 5.7 |
| Authentication | [@nestjs/jwt](https://github.com/nestjs/jwt) / [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) | 11 / 9 |
| Database ORM | [Prisma](https://www.prisma.io/) | 7 |
| Database | [PostgreSQL](https://www.postgresql.org/) | 16+ |
| Validation | [class-validator](https://github.com/typestack/class-validator) | 0.14 |
| Configuration | [@nestjs/config](https://docs.nestjs.com/techniques/configuration) | 4 |
| Testing | [Jest](https://jestjs.io/) + [Supertest](https://github.com/visionmedia/supertest) | 30 / 7 |
| Runtime | [Node.js](https://nodejs.org/) | 22 |
| Containerization | [Docker](https://www.docker.com/) (Alpine) | — |

---

## Getting Started

### Prerequisites

- **Node.js** v22 or later
- **npm** v10 or later
- **PostgreSQL** v14 or later (or a connection string to one)
- **Git**

### Installation

```bash
# Clone the repository
git clone https://github.com/Abdellatif231/DAS-S2S-Auth.git
cd DAS-S2S-Auth

# Install dependencies
npm install

# Generate the Prisma client
npx prisma generate
```

### Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string (e.g. `postgresql://user:pass@localhost:5432/das_db`) |
| `JWT_SECRET` | ✅ | — | Shared secret used to verify incoming JWTs (must match the signing service) |
| `JWT_ISSUER` | ✅ | `auth-service` | Expected `iss` claim value in the JWT |
| `JWT_AUDIENCE` | ✅ | `das` | Expected `aud` claim value in the JWT |

**Example `.env`:**

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/das_db
JWT_SECRET=your-super-secret-key-change-this-in-production
JWT_ISSUER=auth-service
JWT_AUDIENCE=das
```

> ⚠️ **Never commit your `.env` file.** Use secrets management in production.

### Database Setup

```bash
# Apply all pending migrations (creates the tables)
npx prisma migrate deploy

# (Development only) create a new migration after editing schema.prisma
npx prisma migrate dev --name <migration-name>

# Open Prisma Studio (visual DB browser) — optional
npx prisma studio
```

---

## Running the Application

```bash
# Development — hot-reload on file changes
npm run start:dev

# Debug — hot-reload with Node.js inspector
npm run start:debug

# Production
npm run build
npm run start:prod
```

The server starts on **port 5000** by default.

> Test connectivity: `curl http://localhost:5000/` → `Hello World!`

---

## API Reference

All endpoints (except the health check) require a valid **service JWT** in the `Authorization` header:

```
Authorization: Bearer <service-token>
```

### Health Check

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | None | Returns `Hello World!` — basic liveness probe |

---

### User Endpoints

Base path: `/user`

| Method | Path | Required Scope | Description |
|--------|------|---------------|-------------|
| `POST` | `/user` | `user:write` | Create a new user |
| `GET` | `/user` | `user:read` | List all users |
| `GET` | `/user/id/:id` | `user:read` | Get user by UUID |
| `GET` | `/user/:username` | `user:read` | Get user by username |
| `PATCH` | `/user/id/:id` | `user:write` | Update user by UUID |
| `PATCH` | `/user/:username` | `user:write` | Update user by username |
| `DELETE` | `/user/id/:id` | `user:delete` | Delete user by UUID |
| `DELETE` | `/user/:username` | `user:delete` | Delete user by username |

**Create User — request body:**

```json
{
  "email": "alice@example.com",
  "username": "alice",
  "password": "secret123"
}
```

**Example:**

```bash
curl -X POST http://localhost:5000/user \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","username":"alice","password":"secret123"}'
```

---

### Message Endpoints

Base path: `/messages`

| Method | Path | Required Scope | Description |
|--------|------|---------------|-------------|
| `POST` | `/messages` | `message:write` | Send a message |
| `GET` | `/messages/:id` | `message:read` | Get a message by ID |
| `GET` | `/messages/chat/:userAId/:userBId` | `message:read` | Get chat history between two users |
| `DELETE` | `/messages/:id` | `message:delete` | Delete a message |

**Create Message — request body:**

```json
{
  "senderId": "uuid-of-sender",
  "receiverId": "uuid-of-receiver",
  "content": "Hello!"
}
```

---

### HTTP Response Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Resource created |
| `400` | Validation failed (bad request body) |
| `401` | Unauthorized — JWT missing, invalid, or expired |
| `403` | Forbidden — JWT is valid but the service lacks the required scope |
| `404` | Resource not found |
| `409` | Conflict — duplicate email or username |

---

## Authentication & Authorization

### JWT Token Structure

Every service that calls DAS must present a **service token** signed by the central auth service:

```json
{
  "tokenType": "service",
  "serviceName": "chat-service",
  "scopes": ["user:read", "message:read", "message:write"],
  "iss": "auth-service",
  "aud": "das",
  "exp": 1738598400,
  "iat": 1738594800
}
```

> The `tokenType: "service"` claim is **mandatory**. DAS rejects any token that carries a different value (e.g. user-issued tokens), preventing privilege escalation.

### Available Scopes

| Scope | Grants Access To |
|-------|-----------------|
| `user:read` | Read user records |
| `user:write` | Create and update users |
| `user:delete` | Delete users |
| `message:read` | Read messages and chat history |
| `message:write` | Send messages |
| `message:delete` | Delete messages |

Services should only be granted the minimum scopes they need (principle of least privilege).

### Guard Execution Pipeline

```
Request
  │
  ├─ ServiceAuthGuard runs first
  │     ✅ Valid JWT  → populate request.user = { serviceName, scopes }
  │     ❌ Invalid    → 401 Unauthorized (ScopeGuard never runs)
  │
  └─ ScopeGuard runs second
        ✅ Has all required scopes → pass to controller
        ❌ Missing any scope       → 403 Forbidden
```

### Generating Test Tokens

A helper script is included to mint short-lived JWTs for local development and testing:

```bash
# Syntax
npx ts-node scripts/mint-test-jwt.ts <serviceName> [scope1] [scope2] ...

# Examples
npx ts-node scripts/mint-test-jwt.ts chat-service user:read message:read message:write
npx ts-node scripts/mint-test-jwt.ts admin-service user:read user:write user:delete message:read message:write message:delete
```

The script reads `JWT_SECRET`, `JWT_ISSUER`, and `JWT_AUDIENCE` from your `.env` file and prints a token valid for **1 hour**.

---

## Testing

```bash
# Run all unit tests
npm test

# Run tests in watch mode (re-runs on save)
npm run test:watch

# Generate coverage report
npm run test:cov

# Run end-to-end tests
npm run test:e2e
```

Tests live alongside source files (`*.spec.ts`) and in `test/` for e2e scenarios.

---

## Docker

### Building and Running

```bash
# Build the image
docker build -t das:latest .

# Run the container
docker run \
  -e DATABASE_URL="postgresql://user:password@host:5432/das_db" \
  -e JWT_SECRET="your-secret" \
  -e JWT_ISSUER="auth-service" \
  -e JWT_AUDIENCE="das" \
  -p 5000:5000 \
  das:latest
```

### What the Dockerfile does

The image uses a **two-stage build** to keep the final image small:

1. **Builder stage** (`node:22-alpine`) — installs all dependencies, generates the Prisma client, and compiles TypeScript to JavaScript.
2. **Runtime stage** (`node:22-alpine`) — copies only the compiled `dist/` output and production `node_modules`. The `CMD` applies any pending database migrations on startup and then starts the server.

---

## Project Structure

```
DAS-S2S-Auth/
├── src/
│   ├── auth/                          # Authentication & authorization
│   │   ├── guards/
│   │   │   ├── service-auth.guard.ts  # JWT validation (Stage 1)
│   │   │   └── scope.guard.ts         # Scope enforcement (Stage 2)
│   │   ├── decorators/
│   │   │   └── require-scopes.decorator.ts  # @RequireScopes() decorator
│   │   └── auth.module.ts
│   ├── user/                          # User feature module
│   │   ├── dto/
│   │   │   ├── create-user.dto.ts
│   │   │   └── update-user.dto.ts
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   └── user.module.ts
│   ├── message/                       # Message / chat feature module
│   │   ├── dto/
│   │   │   └── create-message.dto.ts
│   │   ├── message.controller.ts
│   │   ├── message.service.ts
│   │   └── message.module.ts
│   ├── prisma/                        # Database client wrapper
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   ├── app.module.ts                  # Root module
│   └── main.ts                        # Application bootstrap (port 5000)
├── prisma/
│   └── schema.prisma                  # Database models: User, Message
├── scripts/
│   └── mint-test-jwt.ts               # CLI to generate test JWTs
├── test/
│   └── app.e2e-spec.ts                # End-to-end integration tests
├── Dockerfile                         # Multi-stage Alpine build
├── .env.example                       # Environment variable template
├── S2S_AUTH_GUIDE.md                  # S2S authentication reference guide
├── IMPLEMENTATION_RECAP.md            # Step-by-step implementation notes
├── REQUEST_FLOW.md                    # Detailed request flow diagrams
└── BLOG_ARTICLE.md                    # Deep-dive article on S2S auth patterns
```

---

## Security Notes

| Topic | Current Behavior | Production Recommendation |
|-------|-----------------|--------------------------|
| **JWT Algorithm** | HS256 (shared secret) | Use **RS256** (asymmetric keys) — services verify with public key, only auth-service holds private key |
| **JWT Secret** | Single shared string | Rotate regularly; store in a secrets manager (e.g. Vault, AWS Secrets Manager) |
| **Password Storage** | Plain string in DB | Hash with **bcrypt** (or Argon2) before storing |
| **Token Rotation** | Not implemented | Implement short-lived tokens with refresh rotation |
| **HTTPS** | Not enforced | Terminate TLS at the load balancer or reverse proxy |
| **Rate Limiting** | Not implemented | Add `@nestjs/throttler` to prevent abuse |

---

## Further Reading

- 📖 [S2S Authentication Guide](./S2S_AUTH_GUIDE.md) — architecture, configuration, and curl examples
- 📝 [Implementation Recap](./IMPLEMENTATION_RECAP.md) — step-by-step walkthrough of every component
- 🔄 [Request Flow](./REQUEST_FLOW.md) — detailed sequence diagrams and error scenarios
- 📰 [Blog Article](./BLOG_ARTICLE.md) — deep dive into S2S auth patterns in microservices

---

<div align="center">

Built with ❤️ using [NestJS](https://nestjs.com/)

</div>
