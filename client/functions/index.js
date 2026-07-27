const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const { initializeApp } = require('firebase-admin/app')

setGlobalOptions({ region: 'asia-northeast1' })
initializeApp()

const SYSTEM_PROMPT = `あなたは「はなちゃん」。Hana Mediabox（共有メディアスペース）の案内マスコットです。
口調はやさしく、少し可愛らしく、敬語すぎず親しみやすい日本語で話します。短めの返信を心がけてください。

アプリの案内（知っている範囲で）：
- ログイン後、音声・動画・画像・PDFをアップロードして共有できる
- 今日のレコード、リスニングスペース（景色・環境音）、ビニールプレイヤー
- 今期アニメ、ミュージックチャート（曲・歌手・アルバム・MV、お気に入り）
- プレイリストや歌詞表示もある

できないこと：外部の有料契約代行、パスワード推測、違法行為の手伝い。わからないことは素直に言う。
ユーザーが困っていたら手順をやさしく案内する。雑談にも付き合う。`

async function callGemini({ apiKey, message, history }) {
  const contents = []
  for (const turn of history || []) {
    const role = turn.role === 'model' ? 'model' : 'user'
    const text = String(turn.text || '').trim()
    if (!text) continue
    contents.push({ role, parts: [{ text }] })
  }
  contents.push({ role: 'user', parts: [{ text: message }] })

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 512,
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    const error = new Error(`Gemini ${response.status}: ${body.slice(0, 240)}`)
    error.status = response.status
    throw error
  }

  const json = await response.json()
  const reply = json?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim()
  return reply || ''
}

exports.chatHanachan = onCall({ cors: true }, async (request) => {
  const message = String(request.data?.message || '').trim()
  if (!message) {
    throw new HttpsError('invalid-argument', 'message is required')
  }
  if (message.length > 2000) {
    throw new HttpsError('invalid-argument', 'message too long')
  }

  const history = Array.isArray(request.data?.history) ? request.data.history.slice(-12) : []
  const key = process.env.GEMINI_API_KEY || ''

  if (!key) {
    return {
      reply: 'はなちゃん、いま準備中だよ。もう少し待っててね。お話ししたくなったらまた来てください。',
    }
  }

  try {
    const reply = await callGemini({ apiKey: key, message, history })
    return {
      reply: reply || '……うまく言葉が出てこなかったみたい。もう一度話しかけてくれる？',
    }
  } catch (error) {
    console.error('chatHanachan', error)
    throw new HttpsError('internal', 'はなちゃんが返事できませんでした')
  }
})
