/**
 * JWT Test Minter
 * 
 * This script helps you generate test service JWTs for local development.
 * 
 * Usage:
 *   ts-node scripts/mint-test-jwt.ts <serviceName> <scope1> <scope2> ...
 * 
 * Example:
 *   ts-node scripts/mint-test-jwt.ts chat-service user:read user:write message:read
 * 
 * NOTE: This is for TESTING ONLY. In production, the auth-service mints all JWTs.
 */

import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production';
const JWT_ISSUER = process.env.JWT_ISSUER || 'auth-service';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'das';

interface ServiceTokenPayload {
  tokenType: 'service';
  serviceName: string;
  scopes: string[];
  iss: string;
  aud: string;
}

function mintServiceJWT(serviceName: string, scopes: string[]): string {
  const payload: ServiceTokenPayload = {
    tokenType: 'service',
    serviceName,
    scopes,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
  };

  // Sign JWT with 1 hour expiration
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

// Parse command line args
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: ts-node scripts/mint-test-jwt.ts <serviceName> <scope1> <scope2> ...');
  console.error('Example: ts-node scripts/mint-test-jwt.ts chat-service user:read message:write');
  process.exit(1);
}

const [serviceName, ...scopes] = args;

const token = mintServiceJWT(serviceName, scopes);

console.log('\n✅ Service JWT Generated!\n');
console.log('Service Name:', serviceName);
console.log('Scopes:', scopes.join(', '));
console.log('Issuer:', JWT_ISSUER);
console.log('Audience:', JWT_AUDIENCE);
console.log('Expires in: 1 hour\n');
console.log('JWT Token:');
console.log(token);
console.log('\nUse it in curl:');
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:5000/user\n`);
