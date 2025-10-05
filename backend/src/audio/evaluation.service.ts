// backend/src/audio/evaluation.service.ts

import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

/**
 * 評価スコアの型定義
 * 各項目は1-10点で評価
 */
interface EvaluationScores {
    communication: number;      // コミュニケーション能力
    technical: number;          // 技術スキル・専門知識
    motivation: number;         // 熱意・モチベーション
    problemSolving: number;     // 問題解決能力
    overall: number;            // 総合評価
}

/**
 * 評価コメントの型定義
 */
interface EvaluationComments {
    strengths: string[];        // 強み（複数）
    improvements: string[];     // 改善点（複数）
    summary: string;            // 総評（1-2文）
}

/**
 * 評価結果全体の型定義
 */
interface EvaluationResult {
    scores: EvaluationScores;
    comments: EvaluationComments;
    evaluatedAt: string;        // 評価日時
}

/**
 * 会話履歴の型定義（chat.service.tsと同じ）
 */
interface Message {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * 候補者評価サービス
 * 
 * 【責務】
 * - 会話履歴をClaude APIで分析
 * - 評価スコアとコメントを生成
 * - 評価結果の保存と取得
 * 
 * 【使い方】
 * const result = await evaluationService.evaluateCandidate(clientId, conversationHistory);
 */
@Injectable()
export class EvaluationService {
    private anthropic: Anthropic;

    // 評価結果を保存するMap（本番ではDBを使う）
    // clientId → EvaluationResult
    private evaluations: Map<string, EvaluationResult> = new Map();

    constructor() {
        // Claude APIクライアントの初期化
        this.anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
    }

    /**
     * 候補者を評価する
     * 
     * @param clientId - クライアントID（WebSocketのID）
     * @param conversationHistory - 会話履歴
     * @returns 評価結果
     * 
     * @example
     * const result = await evaluationService.evaluateCandidate(
     *   'client-123',
     *   [
     *     { role: 'assistant', content: '自己紹介をお願いします' },
     *     { role: 'user', content: '田中太郎と申します...' }
     *   ]
     * );
     */
    async evaluateCandidate(
        clientId: string,
        conversationHistory: Message[],
    ): Promise<EvaluationResult> {
        console.log('🔍 評価開始:', clientId);

        try {
            // Step 1: Claude APIで評価を生成
            const evaluationText = await this.generateEvaluation(conversationHistory);

            // Step 2: Claude APIの応答をパース（JSON形式に変換）
            const evaluation = this.parseEvaluation(evaluationText);

            // Step 3: 評価日時を追加
            const result: EvaluationResult = {
                ...evaluation,
                evaluatedAt: new Date().toISOString(),
            };

            // Step 4: 保存
            this.evaluations.set(clientId, result);

            console.log('✅ 評価完了:', result.scores.overall, '点');
            return result;

        } catch (error) {
            console.error('❌ 評価エラー:', error);
            throw new Error('評価の生成に失敗しました');
        }
    }

    /**
   * Claude APIで評価を生成
   * 
   * @private（外部から呼ばない）
   * @param conversationHistory - 会話履歴
   * @returns Claude APIからの評価テキスト（JSON形式）
   */
    private async generateEvaluation(
        conversationHistory: Message[],
    ): Promise<string> {
        // 会話履歴をテキスト形式に変換
        const conversationText = conversationHistory
            .map((msg) => {
                const role = msg.role === 'assistant' ? '面接官' : '候補者';
                return `${role}: ${msg.content}`;
            })
            .join('\n\n');

        // Claude APIへのプロンプト
        const prompt = `
以下は面接の会話履歴です。この候補者を以下の5項目で評価してください。

【会話履歴】
${conversationText}

【評価項目】（各1-10点）
1. コミュニケーション能力: 質問への的確な回答、論理的な説明、聞き取りやすさ
2. 技術スキル・専門知識: 業界知識の深さ、具体例の豊富さ
3. 熱意・モチベーション: 志望動機の明確さ、キャリアビジョン
4. 問題解決能力: 論理的思考、状況対応力
5. 総合評価: 全体的な印象

【評価結果の形式】
必ず以下のJSON形式で出力してください。他の文章は不要です。

{
  "scores": {
    "communication": 8,
    "technical": 7,
    "motivation": 9,
    "problemSolving": 6,
    "overall": 7.5
  },
  "comments": {
    "strengths": ["明確なキャリアビジョンがある", "具体的な経験を話せる"],
    "improvements": ["技術的な深掘りが浅い"],
    "summary": "コミュニケーション能力が高く、熱意も感じられる。技術面での経験をもう少し具体的に話せるとより良い。"
  }
}
`;

        // Claude API呼び出し
        const message = await this.anthropic.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        });

        // 応答テキストを取得
        const responseText = message.content[0].type === 'text'
            ? message.content[0].text
            : '';

        console.log('📄 Claude APIの応答:', responseText);
        return responseText;
    }

    /**
     * Claude APIの応答をパース
     * 
     * @private
     * @param evaluationText - Claude APIからのテキスト
     * @returns パースされた評価結果
     */
    private parseEvaluation(evaluationText: string): {
        scores: EvaluationScores;
        comments: EvaluationComments;
    } {
        try {
            // JSON部分だけを抽出（前後の説明文を除去）
            const jsonMatch = evaluationText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('JSON形式の評価が見つかりません');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // データ検証（必須フィールドがあるかチェック）
            if (!parsed.scores || !parsed.comments) {
                throw new Error('評価データが不完全です');
            }

            return parsed;

        } catch (error) {
            console.error('❌ JSON解析エラー:', error);

            // フォールバック: デフォルト値を返す
            return {
                scores: {
                    communication: 5,
                    technical: 5,
                    motivation: 5,
                    problemSolving: 5,
                    overall: 5,
                },
                comments: {
                    strengths: ['評価データの生成に失敗しました'],
                    improvements: [],
                    summary: '評価を再試行してください',
                },
            };
        }
    }

    /**
   * 保存済みの評価結果を取得
   * 
   * @param clientId - クライアントID
   * @returns 評価結果（存在しない場合はnull）
   */
    getEvaluation(clientId: string): EvaluationResult | null {
        return this.evaluations.get(clientId) || null;
    }

    /**
     * 全ての評価結果を取得
     * 
     * @returns 全評価結果（clientIdをキーとするオブジェクト）
     */
    getAllEvaluations(): Record<string, EvaluationResult> {
        const result: Record<string, EvaluationResult> = {};

        this.evaluations.forEach((evaluation, clientId) => {
            result[clientId] = evaluation;
        });

        return result;
    }

    /**
     * 評価結果を削除
     * 
     * @param clientId - クライアントID
     */
    clearEvaluation(clientId: string): void {
        this.evaluations.delete(clientId);
        console.log('🗑️ 評価を削除:', clientId);
    }
}