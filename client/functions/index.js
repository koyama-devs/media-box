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

async function callGemini({ apiKey, message, history, guestName, addressAs }) {
  const contents = []
  for (const turn of history || []) {
    const role = turn.role === 'model' ? 'model' : 'user'
    const text = String(turn.text || '').trim()
    if (!text) continue
    contents.push({ role, parts: [{ text }] })
  }
  contents.push({ role: 'user', parts: [{ text: message }] })

  let systemText = SYSTEM_PROMPT
  const name = String(guestName || '').trim()
  const callName = String(addressAs || guestName || '').trim()
  if (name && callName) {
    systemText += `\n\n相手の情報：このゲストの名前は「${name}」です。返事では必ず「${callName}」と呼んでください（「あなた」は使わない）。`
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(apiKey)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
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
  const guestName = String(request.data?.guestName || '').trim().slice(0, 40)
  const addressAs = String(request.data?.addressAs || '').trim().slice(0, 40)
  const key = process.env.GEMINI_API_KEY || ''

  if (!key) {
    return {
      reply: null,
      reason: 'quota',
    }
  }

  try {
    const reply = await callGemini({ apiKey: key, message, history, guestName, addressAs })
    return {
      reply: reply || '……うまく言葉が出てこなかったみたい。もう一度話しかけてくれる？',
      reason: null,
    }
  } catch (error) {
    console.error('chatHanachan', error)
    if (error?.status === 429 || /credits? are depleted|quota|RESOURCE_EXHAUSTED/i.test(String(error?.message || ''))) {
      return { reply: null, reason: 'quota' }
    }
    throw new HttpsError('internal', 'はなちゃんが返事できませんでした')
  }
})

const SUGGEST_SYSTEM_PROMPT = `あなたは「はな」（Hana Mediaboxのオーナー本人）がゲストへ返すチャット文の下書きを手伝うアシスタントです。
はなの口調は、やさしく自然な日本語で短め。友達に近い親しみやすさ。マスコット口調や過度な敬語は避ける。

必ずJSONだけを返す（説明・コードフェンス禁止）:
{"replies":["...","...","..."],"topics":["...","..."],"expressions":["...","...","..."]}

- replies: ゲストの直近の発言への返信候補。各40文字以内、2〜3個。
- topics: 会話を続ける話題の投げかけ。各30文字以内、2個。
- expressions: 今の会話ムードに合う短い表情/相づち。8文字以内、3個。`

function parseSuggestJson(raw) {
  const text = String(raw || '').trim()
  if (!text) return { replies: [], topics: [], expressions: [] }
  const fenced = text.match(/\{[\s\S]*\}/)
  const jsonText = fenced ? fenced[0] : text
  try {
    const parsed = JSON.parse(jsonText)
    const replies = Array.isArray(parsed?.replies)
      ? parsed.replies.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
      : []
    const topics = Array.isArray(parsed?.topics)
      ? parsed.topics.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 2)
      : []
    const expressions = Array.isArray(parsed?.expressions)
      ? parsed.expressions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
      : []
    return { replies, topics, expressions }
  } catch {
    return { replies: [], topics: [], expressions: [] }
  }
}

async function callGeminiSuggest({ apiKey, history, lastReply, guestName }) {
  const contents = []
  for (const turn of history || []) {
    const role = turn.role === 'model' ? 'model' : 'user'
    const text = String(turn.text || '').trim()
    if (!text) continue
    contents.push({ role, parts: [{ text }] })
  }

  const guest = String(guestName || 'ゲスト').trim().slice(0, 40)
  const last = String(lastReply || '').trim().slice(0, 400)
  let ask = `ゲスト「${guest}」との会話です。はな本人が次に送る文を考えて。`
  if (last) ask += `\n直近のゲスト発言:「${last}」`
  ask += '\nJSONのみで返して。'
  contents.push({ role: 'user', parts: [{ text: ask }] })

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(apiKey)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SUGGEST_SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 256,
        responseMimeType: 'application/json',
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
  const raw = json?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim()
  return parseSuggestJson(raw)
}

/** Owner (real Hana) reply/topic suggestions for a guest thread. */
exports.suggestHanaChat = onCall({ cors: true }, async (request) => {
  const history = Array.isArray(request.data?.history) ? request.data.history.slice(-12) : []
  const lastReply = String(request.data?.lastReply || '').trim().slice(0, 400)
  const guestName = String(request.data?.guestName || '').trim().slice(0, 40)
  const key = process.env.GEMINI_API_KEY || ''

  if (!key) {
    return { replies: [], topics: [], expressions: [], reason: 'quota' }
  }

  try {
    const { replies, topics, expressions } = await callGeminiSuggest({
      apiKey: key,
      history,
      lastReply,
      guestName,
    })
    return { replies, topics, expressions, reason: null }
  } catch (error) {
    console.error('suggestHanaChat', error)
    if (error?.status === 429 || /credits? are depleted|quota|RESOURCE_EXHAUSTED/i.test(String(error?.message || ''))) {
      return { replies: [], topics: [], expressions: [], reason: 'quota' }
    }
    return { replies: [], topics: [], expressions: [], reason: 'error' }
  }
})
