'use client';

import { useEffect, useState, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import AvatarView from './components/AvatarView';

/**
 * 評価スコアの型定義
 */
interface EvaluationScores {
  communication: number;
  technical: number;
  motivation: number;
  problemSolving: number;
  overall: number;
}

/**
 * 評価コメントの型定義
 */
interface EvaluationComments {
  strengths: string[];
  improvements: string[];
  summary: string;
}

/**
 * 評価結果の型定義
 */
interface EvaluationResult {
  scores: EvaluationScores;
  comments: EvaluationComments;
  evaluatedAt: string;
}


/**
 * スコアバーコンポーネント
 */
function ScoreBar({ label, score, isOverall = false }: { label: string; score: number; isOverall?: boolean }) {
  const percentage = (score / 10) * 100;
  const color = isOverall ? 'bg-purple-500' : 'bg-blue-500';

  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className={`font-semibold ${isOverall ? 'text-lg' : 'text-sm'}`}>{label}</span>
        <span className={`font-bold ${isOverall ? 'text-xl text-purple-600' : 'text-sm text-gray-600'}`}>
          {score.toFixed(1)} / 10
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className={`${color} h-3 rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

/**
 * AIインタビューシステムのメインページ
 * 音声録音とWebSocket通信を管理
 */
export default function Home() {
  // WebSocket接続の状態管理
  const [socket, setSocket] = useState<Socket | null>(null);

  // 録音状態の管理
  const [isRecording, setIsRecording] = useState(false);

  // UIに表示するステータスメッセージ
  const [status, setStatus] = useState('Not connected');

  // MediaRecorderインスタンスへの参照（再レンダリング時も保持）
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // テキスト入力の状態管理
  const [textInput, setTextInput] = useState('');
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'ai', message: string, timestamp: string }>>([]);

  // タブ管理
  const [activeTab, setActiveTab] = useState<"interview" | "evaluation">("interview");

  // 評価結果
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);

  // 評価中フラグ
  const [isEvaluating, setIsEvaluating] = useState(false);

  /**
   * コンポーネントマウント時にWebSocket接続を確立
   * アンマウント時に接続をクリーンアップ
   */
  useEffect(() => {
    const newSocket = io('http://localhost:3001');

    // 接続成功時のハンドラー
    newSocket.on('connect', () => {
      setStatus('Connected to server');
      console.log('✅ Backend connected');
    });

    // 切断時のハンドラー
    newSocket.on('disconnect', () => {
      setStatus('Disconnected');
      console.log('❌ Backend disconnected');
    });

    // サーバーからの応答を受信
    newSocket.on('response', (data) => {
      console.log('📩 Server response:', data);
      setStatus(`Server: ${data.message}`);
    });

    // 文字起こし結果を受信
    newSocket.on('transcription', (data) => {
      console.log('📝 Transcription received:', data.text);
      setStatus(`📝 You said: "${data.text}"`);
      // 会話履歴に追加
      setConversationHistory(prev => [...prev, {
        role: 'user',
        message: data.text,
        timestamp: data.timestamp
      }]);
    });

    // エラー受信（イベント名を変更）
    newSocket.on('processing-error', (data) => {
      console.log('Error from server:', data);
      setStatus(`Error: ${data.message}`);
    });

    // AI応答を受信
    newSocket.on('ai-response', (data) => {
      console.log('🤖 AI response:', data.message);
      setConversationHistory(prev => [...prev, {
        role: 'ai',
        message: data.message,
        timestamp: data.timestamp
      }]);
      setStatus('💬 AI responded');
    });

    // 評価完了イベント
    newSocket.on("evaluation-complete", (data: EvaluationResult) => {
      console.log("✅ 評価完了:", data);
      setEvaluationResult(data);
      setIsEvaluating(false);
      setActiveTab("evaluation"); // 自動的に評価タブに切り替え
    });

    // 評価エラーイベント
    newSocket.on("evaluation-error", (data: { error: string }) => {
      console.error("❌ 評価エラー:", data.error);
      alert("評価に失敗しました: " + data.error);
      setIsEvaluating(false);
    });

    // AI音声を受信して再生
    newSocket.on('ai-audio', (data: { audio: string }) => {
      console.log('🔊 AI音声受信');

      try {
        // Base64をBlobに変換
        const byteCharacters = atob(data.audio);
        const byteNumbers = new Array(byteCharacters.length);

        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'audio/mpeg' });

        // 音声を再生
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);

        audio.play().then(() => {
          console.log('✅ 音声再生開始');
        }).catch((error) => {
          console.error('❌ 音声再生エラー:', error);
        });

        // メモリリーク防止
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
        };

      } catch (error) {
        console.error('❌ 音声データ変換エラー:', error);
      }
    });

    setSocket(newSocket);

    // クリーンアップ：コンポーネントアンマウント時に接続を閉じる
    return () => {
      newSocket.off('ai-audio');
      newSocket.close();
    };
  }, []);

  /**
   * マイクからの音声録音を開始
   * 1秒ごとに音声データをサーバーに送信
   */
  const startRecording = async () => {
    try {
      // ユーザーにマイクへのアクセス許可を要求
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      // 音声データが利用可能になった時の処理
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socket) {
          // WebSocketでサーバーに音声データを送信
          socket.emit('audio-data', event.data);
          console.log('🎤 Audio chunk sent:', event.data.size, 'bytes');
        }
      };

      // 1秒ごとにデータを生成して送信
      mediaRecorder.start(1000);
      setIsRecording(true);
      setStatus('🔴 Recording...');
    } catch (error) {
      console.error('❌ Microphone access error:', error);
      setStatus('Error: Microphone access denied');
    }
  };

  /**
 * 録音を停止し、マイクストリームをクリーンアップ
 * バックエンドに音声処理を開始するよう通知
 */
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      // 録音停止
      mediaRecorderRef.current.stop();

      // マイクストリームの全トラックを停止（リソース解放）
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());

      setIsRecording(false);
      setStatus('⏹️ Recording stopped. Processing...');
      console.log('⏹️ Recording stopped');

      // バックエンドに音声処理開始を通知
      if (socket) {
        socket.emit('audio-complete');
        console.log('📤 Sent audio-complete signal to server');
      }
    }
  };

  /**
   * テキストメッセージを送信
   */
  const sendTextMessage = () => {
    if (!textInput.trim() || !socket) return;

    console.log('📤 Sending message:', textInput);

    // 会話履歴に追加
    setConversationHistory(prev => [...prev, {
      role: 'user',
      message: textInput,
      timestamp: new Date().toISOString()
    }]);

    // サーバーに送信
    socket.emit('text-message', { message: textInput });

    // 入力欄をクリア
    setTextInput('');
    setStatus('⏳ Waiting for AI response...');
  };

  /**
   * 面接を開始
   */
  const startInterview = () => {
    if (!socket) return;

    console.log('🎬 Starting interview');
    socket.emit('start-interview');
    setStatus('🎬 Interview started...');
  };

  /**
 * 面接を終了して評価を実行
 */
  const handleEndInterview = () => {
    if (!socket) return;

    if (conversationHistory.length === 0) {
      alert("会話がありません。面接を開始してください。");
      return;
    }

    const confirmed = window.confirm("面接を終了して評価を開始しますか？");
    if (!confirmed) return;

    console.log("🏁 面接を終了します");
    setIsEvaluating(true);
    socket.emit("end-interview");
  };

  return (
    <>
      {/* ===== 通常モード ===== */}
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-4xl mx-auto">
          {/* ヘッダー */}
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
            AI Interview System
          </h1>

          {/* タブ切り替え */}
          <div className="bg-white rounded-t-lg shadow-lg">
            <div className="flex border-b">
              <button
                onClick={() => setActiveTab("interview")}
                className={`flex-1 py-4 px-6 font-semibold transition-colors ${activeTab === "interview"
                  ? "bg-blue-500 text-white border-b-2 border-blue-600"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
              >
                面接
              </button>
              <button
                onClick={() => setActiveTab("evaluation")}
                className={`flex-1 py-4 px-6 font-semibold transition-colors ${activeTab === "evaluation"
                  ? "bg-blue-500 text-white border-b-2 border-blue-600"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
              >
                評価・結果
              </button>
            </div>

            {/* タブコンテンツ */}
            <div className="p-8">
              {activeTab === "interview" ? (
                <div>
                  {/* ステータス表示 */}
                  <div className="mb-6">
                    <p className="text-sm text-gray-600 mb-2">Status:</p>
                    <p className="text-lg font-semibold text-blue-600">{status}</p>
                  </div>

                  {/* 3Dアバター表示（通常モード） */}
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold mb-2 text-gray-700">AI面接官</h2>
                    <AvatarView />
                  </div>

                  {/* 面接開始ボタン */}
                  <div className="mb-6">
                    <button
                      onClick={startInterview}
                      disabled={!socket || conversationHistory.length > 0}
                      className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${!socket || conversationHistory.length > 0
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-purple-500 text-white hover:bg-purple-600"
                        }`}
                    >
                      面接を開始
                    </button>
                  </div>

                  {/* 会話履歴 */}
                  <div className="mb-6 h-96 overflow-y-auto bg-gray-50 rounded-lg p-4">
                    {conversationHistory.length === 0 ? (
                      <p className="text-gray-400 text-center">
                        会話履歴がありません
                      </p>
                    ) : (
                      conversationHistory.map((msg, index) => (
                        <div
                          key={index}
                          className={`mb-3 ${msg.role === "user" ? "text-right" : "text-left"
                            }`}
                        >
                          <div
                            className={`inline-block px-4 py-2 rounded-lg max-w-md ${msg.role === "user"
                              ? "bg-blue-500 text-white"
                              : "bg-gray-200 text-gray-800"
                              }`}
                          >
                            <p className="text-sm font-semibold mb-1">
                              {msg.role === "user" ? "あなた" : "AI面接官"}
                            </p>
                            <p>{msg.message}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* 音声録音ボタン */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold mb-2 text-gray-700">音声で回答</h3>
                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={!socket}
                      className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${!socket
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : isRecording
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'bg-green-500 text-white hover:bg-green-600'
                        }`}
                    >
                      {isRecording ? '🔴 録音停止' : '🎤 音声で話す'}
                    </button>
                  </div>

                  {/* テキスト入力 */}
                  <div className="mb-6">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && sendTextMessage()}
                        placeholder="メッセージを入力..."
                        disabled={!socket}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={sendTextMessage}
                        disabled={!textInput.trim() || !socket}
                        className={`px-6 py-2 rounded-lg font-semibold transition-colors ${!textInput.trim() || !socket
                          ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                          : "bg-blue-500 text-white hover:bg-blue-600"
                          }`}
                      >
                        送信
                      </button>
                    </div>
                  </div>

                  {/* 面接を終了ボタン */}
                  <div className="flex gap-4">
                    <button
                      onClick={handleEndInterview}
                      disabled={!socket || conversationHistory.length === 0 || isEvaluating}
                      className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-colors ${!socket || conversationHistory.length === 0 || isEvaluating
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-red-500 text-white hover:bg-red-600"
                        }`}
                    >
                      {isEvaluating ? "評価中..." : "面接を終了"}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {evaluationResult ? (
                    <div>
                      <div className="mb-6 text-center">
                        <p className="text-sm text-gray-500">
                          評価日時: {new Date(evaluationResult.evaluatedAt).toLocaleString('ja-JP')}
                        </p>
                      </div>

                      <div className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-gray-800">評価スコア</h2>
                        <div className="space-y-3">
                          <ScoreBar label="コミュニケーション能力" score={evaluationResult.scores.communication} />
                          <ScoreBar label="技術スキル・専門知識" score={evaluationResult.scores.technical} />
                          <ScoreBar label="熱意・モチベーション" score={evaluationResult.scores.motivation} />
                          <ScoreBar label="問題解決能力" score={evaluationResult.scores.problemSolving} />
                          <ScoreBar label="総合評価" score={evaluationResult.scores.overall} isOverall />
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div>
                          <h3 className="text-xl font-bold mb-3 text-green-600">強み</h3>
                          <ul className="list-disc list-inside space-y-2">
                            {evaluationResult.comments.strengths.map((strength, index) => (
                              <li key={index} className="text-gray-700">{strength}</li>
                            ))}
                          </ul>
                        </div>

                        {evaluationResult.comments.improvements.length > 0 && (
                          <div>
                            <h3 className="text-xl font-bold mb-3 text-orange-600">改善点</h3>
                            <ul className="list-disc list-inside space-y-2">
                              {evaluationResult.comments.improvements.map((improvement, index) => (
                                <li key={index} className="text-gray-700">{improvement}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div>
                          <h3 className="text-xl font-bold mb-3 text-blue-600">総評</h3>
                          <p className="text-gray-700 leading-relaxed bg-blue-50 p-4 rounded-lg">
                            {evaluationResult.comments.summary}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-16">
                      <p className="text-gray-400 text-lg mb-4">
                        まだ評価結果がありません
                      </p>
                      <p className="text-gray-500 text-sm">
                        面接を終了すると、ここに評価結果が表示されます
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
