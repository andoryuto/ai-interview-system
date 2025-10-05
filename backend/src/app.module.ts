
import { Module } from '@nestjs/common';
import { AudioGateway } from './audio/audio.gateway';
import { ChatService } from './audio/chat.service';
import { EvaluationService } from './audio/evaluation.service'; // ← 追加

@Module({
  imports: [],
  controllers: [],
  providers: [
    AudioGateway,
    ChatService,
    EvaluationService, // ← 追加
  ],
})
export class AppModule {}