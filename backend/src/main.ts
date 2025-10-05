import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // フロントエンドからの接続を許可
  await app.listen(3001);
  console.log('Backend server running on http://localhost:3001');
}
bootstrap();