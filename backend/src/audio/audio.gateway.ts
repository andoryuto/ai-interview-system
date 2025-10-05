import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { ChatService } from './chat.service';
import { EvaluationService } from './evaluation.service';

// 環境変数を読み込み
config();

/**
 * WebSocketゲートウェイ
 * クライアントからの音声データを受信し、Whisper APIでテキスト化
 */
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class AudioGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // OpenAI クライアントの初期化
  private openai: OpenAI;

  // 音声データの一時保存用バッファ（クライアントごと）
  private audioBuffers: Map<string, Buffer[]> = new Map();

  constructor(
    private chatService: ChatService,
    private evaluationService: EvaluationService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * クライアント接続時の処理
   */
  handleConnection(client: Socket) {
    console.log(`✅ Client connected: ${client.id}`);
    this.audioBuffers.set(client.id, []);
  }

  /**
   * クライアント切断時の処理
   * バッファをクリーンアップ
   */
  handleDisconnect(client: Socket) {
    console.log(`❌ Client disconnected: ${client.id}`);
    this.audioBuffers.delete(client.id);
  }

  /**
   * 音声データ受信時の処理
   * 複数のチャンクを結合して、Whisper APIでテキスト化
   */
  @SubscribeMessage('audio-data')
  async handleAudioData(client: Socket, payload: any) {
    console.log('🎤 Received audio chunk');

    // Blobデータをバッファに追加
    const buffer = this.audioBuffers.get(client.id);
    if (buffer) {
      buffer.push(Buffer.from(payload));
    }
  }

  /**
   * 録音完了時の処理
   * バッファに溜めた音声データをファイルに保存し、Whisper APIで文字起こし
   */
  @SubscribeMessage('audio-complete')
  async handleAudioComplete(client: Socket) {
    console.log('🔄 Processing audio...');

    const buffer = this.audioBuffers.get(client.id);
    if (!buffer || buffer.length === 0) {
      console.log('⚠️ No audio data to process');
      return;
    }

    try {
      // バッファを結合
      const audioData = Buffer.concat(buffer);

      // 一時ファイルに保存（Whisper APIはファイル入力が必要）
      const tempDir = path.join(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFilePath = path.join(tempDir, `audio-${client.id}-${Date.now()}.webm`);
      fs.writeFileSync(tempFilePath, audioData);
      console.log(`💾 Saved audio file: ${tempFilePath}`);

      // Whisper APIで文字起こし
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1',
        language: 'ja', // 日本語を指定（自動検出も可能）
      });

      console.log(`📝 Transcription: ${transcription.text}`);

      // クライアントに結果を送信
      client.emit('transcription', {
        text: transcription.text,
        timestamp: new Date().toISOString(),
      });

      // AI応答を生成
      const response = await this.chatService.chat(client.id, transcription.text);

      // テキスト応答を送信
      client.emit('ai-response', {
        message: response,
        timestamp: new Date().toISOString(),
      });

      // 音声も送信
      const audioBuffer = await this.textToSpeech(response);
      client.emit('ai-audio', {
        audio: audioBuffer.toString('base64'),
      });

      // 一時ファイルを削除
      fs.unlinkSync(tempFilePath);
      console.log('🗑️ Temp file deleted');

      // バッファをクリア
      this.audioBuffers.set(client.id, []);

    } catch (error) {
      console.log('Error processing audio:', error);
      client.emit('processing-error', {
        message: 'Failed to process audio',
        error: error.message,
      });
    }
  }

  /**
   * テキストメッセージ受信時の処理
   * GPT-4で応答を生成してクライアントに返す
   */
  @SubscribeMessage('text-message')
  async handleTextMessage(client: Socket, payload: { message: string }) {
    console.log(`💬 Received text message from ${client.id}: ${payload.message}`);

    try {
      // ChatServiceで応答を生成
      const response = await this.chatService.chat(client.id, payload.message);

      // クライアントに応答を送信
      client.emit('ai-response', {
        message: response,
        timestamp: new Date().toISOString(),
      });

      // 音声も送信
      const audioBuffer = await this.textToSpeech(response);
      client.emit('ai-audio', {
        audio: audioBuffer.toString('base64'),
      });

    } catch (error) {
      console.log('Error in text chat:', error);
      client.emit('processing-error', {
        message: 'Failed to generate response',
        error: error.message,
      });
    }
  }

  /**
   * 面接開始リクエストの処理
   * - AI面接官の挨拶をテキストと音声で返す
   * - 音声生成に失敗してもテキストは必ず返す（フォールバック）
   */
  @SubscribeMessage('start-interview')
  async handleStartInterview(client: Socket): Promise<void> {
    const clientId = client.id;
    console.log(`🎬 面接開始: クライアントID=${clientId}`);

    try {
      // AI面接官の挨拶文を生成
      const greeting = await this.chatService.startInterview(clientId);
      console.log(`✅ 挨拶文生成完了: ${greeting.substring(0, 30)}...`);

      // テキスト応答を送信（必ず実行）
      client.emit('ai-response', {
        message: greeting,
        timestamp: new Date().toISOString(),
      });

      // 音声も送信
      const audioBuffer = await this.textToSpeech(greeting);
      client.emit('ai-audio', {
        audio: audioBuffer.toString('base64'),
      });

    } catch (error) {
      console.error('❌ 面接開始エラー:', error.message);
      client.emit('processing-error', {
        message: 'Failed to start interview',
        error: error.message,
      });
    }
  }

  /**
   * 面接を終了して評価を実行
   */
  @SubscribeMessage('end-interview')
  async handleEndInterview(client: Socket): Promise<void> {
    const clientId = client.id;
    console.log('🏁 面接終了リクエスト:', clientId);

    try {
      // 会話履歴を取得
      const history = this.chatService.getHistory(clientId);

      if (history.length === 0) {
        console.log('⚠️ 会話履歴が空です');
        client.emit('evaluation-error', {
          error: '会話履歴がありません',
        });
        return;
      }

      console.log('📊 評価を開始...（会話数: ' + history.length + '）');

      // 評価を実行
      const evaluation = await this.evaluationService.evaluateCandidate(
        clientId,
        history,
      );

      console.log('✅ 評価完了:', evaluation.scores.overall, '点');

      // クライアントに評価結果を送信
      client.emit('evaluation-complete', evaluation);

      // 会話履歴をクリア（オプション）
      // this.chatService.clearHistory(clientId);

    } catch (error) {
      console.error('❌ 評価エラー:', error);
      client.emit('evaluation-error', {
        error: '評価の生成に失敗しました',
      });
    }
  }

  /**
   * 評価結果を取得
   */
  @SubscribeMessage('get-evaluation')
  handleGetEvaluation(client: Socket): void {
    const clientId = client.id;
    const evaluation = this.evaluationService.getEvaluation(clientId);

    if (evaluation) {
      client.emit('evaluation-result', evaluation);
    } else {
      client.emit('evaluation-error', {
        error: '評価結果が見つかりません',
      });
    }
  }

  /**
   * テキストを音声に変換（TTS）
   * @param text - 音声化するテキスト
   * @returns 音声データ（MP3形式のBuffer）
   */
  private async textToSpeech(text: string): Promise<Buffer> {
    try {
      console.log('🔊 TTS生成開始:', text.substring(0, 50) + '...');

      const mp3 = await this.openai.audio.speech.create({
        model: 'tts-1',        // 標準品質（速い・安い）
        voice: 'nova',         // 女性の声（親しみやすい）
        input: text,
        speed: 1.0,            // 通常速度
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      console.log('✅ TTS生成成功 サイズ:', buffer.length, 'bytes');
      return buffer;

    } catch (error) {
      console.error('❌ TTS生成エラー:', error.message);
      throw error;
    }
  }
}