import 'dotenv/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ServiceAuthGuard } from './auth/guards/service-auth.guard';
import { ScopeGuard } from './auth/guards/scope.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe());

  // Apply guards GLOBALLY in order:
  // 1. ServiceAuthGuard - validates JWT, extracts service identity
  // 2. ScopeGuard - enforces scope requirements
  // Guards run sequentially in the order they're registered
  const reflector = app.get(Reflector);
  app.useGlobalGuards(
    app.get(ServiceAuthGuard),
    new ScopeGuard(reflector),
  );

  await app.listen(5000);
}
bootstrap();
