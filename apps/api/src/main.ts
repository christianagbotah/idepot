import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  const port = Number(process.env.IDEPOT_API_PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  process.stdout.write(`idepot api listening on :${port} (prefix /api)\n`);
}

void bootstrap();
