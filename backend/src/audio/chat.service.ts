import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';

config();

/**
 * チャット機能を管理するサービス
 * Claude Haikuを使用して対話を生成
 */
@Injectable()
export class ChatService {
  private anthropic: Anthropic;

  // 会話履歴を保存（クライアントIDごと）
  private conversationHistory: Map<string, any[]> = new Map();

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * 面接官としてのシステムプロンプト
   */
  private getSystemPrompt(): string {
    return `あなたは採用面接官です。

【面接のルール】
- 1回の応答で質問は1つだけ
- 質問は簡潔に（1-2文）
- 候補者の経験・スキル・人柄を評価する
- フレンドリーだがプロフェッショナルに

悪い例:「素晴らしいですね！これまでの経験から培われた主体性と問題解決力は...（長文）」
良い例:「個人事業で最も苦労したことは何ですか？」`;
  }

  /**
 * Claude Haikuとの対話を実行
 */
  async chat(clientId: string, userMessage: string): Promise<string> {
    if (!this.conversationHistory.has(clientId)) {
      this.conversationHistory.set(clientId, []);
    }

    const history = this.conversationHistory.get(clientId);
    history.push({ role: 'user', content: userMessage });

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        system: this.getSystemPrompt(),
        messages: history,
      });

      const assistantMessage = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

      history.push({ role: 'assistant', content: assistantMessage });

      console.log(`💬 User: ${userMessage}`);
      console.log(`🤖 Claude: ${assistantMessage}`);

      return assistantMessage;

    } catch (error) {
      console.log('Error in chat:', error);
      throw error;
    }
  }

  /**
   * 面接を開始
   */
  async startInterview(clientId: string): Promise<string> {
    if (!this.conversationHistory.has(clientId)) {
      this.conversationHistory.set(clientId, []);
    }

    const history = this.conversationHistory.get(clientId);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        system: this.getSystemPrompt(),
        messages: [{ role: 'user', content: '面接を開始してください。' }],
      });

      const assistantMessage = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

      history.push({ role: 'user', content: '面接を開始してください。' });
      history.push({ role: 'assistant', content: assistantMessage });

      console.log(`🎬 Interview started: ${assistantMessage}`);

      return assistantMessage;

    } catch (error) {
      console.log('Error starting interview:', error);
      throw error;
    }
  }

  /**
   * 会話履歴をクリア
   */
  clearHistory(clientId: string): void {
    this.conversationHistory.delete(clientId);
    console.log(`🗑️ Cleared history for client: ${clientId}`);
  }

  /**
   * 会話履歴を取得
   */
  getHistory(clientId: string): any[] {
    return this.conversationHistory.get(clientId) || [];
  }
}