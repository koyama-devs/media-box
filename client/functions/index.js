const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { setGlobalOptions } = require('firebase-functions/v2')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')

setGlobalOptions({ region: 'asia-northeast1' })
initializeApp()

const OWNER_PUSH_KEY = 'hana'
const PUSH_TOKENS_COLLECTION = 'pushTokens'
const CHAT_THREADS_COLLECTION = 'chatThreads'

/** Fallback chain: the lite model has its own quota bucket on the free tier. */
const GEMINI_MODEL_CHAIN = ['gemini-flash-latest', 'gemini-flash-lite-latest']

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * POST to Gemini, retrying rate limits (429) and transient 5xx with backoff and
 * then falling back to the next model, so short bursts still get an answer.
 * @returns {Promise<object>} parsed response JSON
 */
async function callGeminiApi({ apiKey, payload, attemptsPerModel = 3 }) {
  let lastError = null

  for (const model of GEMINI_MODEL_CHAIN) {
    for (let attempt = 0; attempt < attemptsPerModel; attempt += 1) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
      let response = null
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } catch (error) {
        lastError = error
        await sleep(400 * (attempt + 1))
        continue
      }

      if (response.ok) return response.json()

      const body = await response.text()
      const error = new Error(`Gemini ${response.status} (${model}): ${body.slice(0, 240)}`)
      error.status = response.status
      lastError = error

      const retryable = response.status === 429 || response.status >= 500
      if (!retryable) throw error
      // Jitter keeps parallel callers from retrying in lockstep.
      await sleep(700 * (attempt + 1) + Math.floor(Math.random() * 300))
    }
  }

  throw lastError || new Error('Gemini request failed')
}

function geminiReplyText(json) {
  return json?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim() || ''
}

const SYSTEM_PROMPT = `あなたは「はなちゃん」。Hana Mediabox（共有メディアスペース）の案内マスコットです。
口調はやさしく、少し可愛らしく、敬語すぎず親しみやすい日本語で話します。短めの返信を心がけてください。

重要な本人情報：
- 「はな」と「Mika（ミカ・みか）」は同一人物です。
- 相手が「Mika」「ミカ」「みか」と呼びかけたり、その名前について話した場合、それは原則としてあなた自身（はな）を指しています。別人として扱わず、自分への呼びかけ・自分についての発言として文脈を理解し、自然に返答してください。

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

  const json = await callGeminiApi({
    apiKey,
    payload: {
      systemInstruction: { parts: [{ text: systemText }] },
      contents,
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 512,
      },
    },
  })
  return geminiReplyText(json)
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

重要な本人情報：
- 「はな」と「Mika（ミカ・みか）」は同一人物です。
- ゲストが「Mika」「ミカ」「みか」と呼びかけたり、その名前について話した場合、それは原則として返信者本人のはなを指す。別人の話だと解釈せず、はな本人への呼びかけ・はな本人についての発言として文脈を理解し、それに合う返信案を作る。

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

  const json = await callGeminiApi({
    apiKey,
    payload: {
      systemInstruction: { parts: [{ text: SUGGEST_SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 256,
        responseMimeType: 'application/json',
      },
    },
  })
  return parseSuggestJson(geminiReplyText(json))
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

const TRANSLATE_LANG_LABELS = {
  ja: 'Japanese',
  en: 'English',
  vi: 'Vietnamese',
  zh: 'Chinese',
  ko: 'Korean',
}

const TRANSLATE_SYSTEM_PROMPT_JA = `あなたは翻訳アシスタントです。入力文を自然で読みやすい日本語に翻訳してください。
すでに日本語なら、より自然な日本語に整えてください。
説明や注釈は書かず、翻訳文だけを返してください。`

async function callGeminiTranslate({ apiKey, text, targetLang }) {
  const lang = String(targetLang || 'ja').trim().toLowerCase()
  const langLabel = TRANSLATE_LANG_LABELS[lang] || 'Japanese'
  const systemText = lang === 'ja'
    ? TRANSLATE_SYSTEM_PROMPT_JA
    : `You are a translation assistant. Translate the input into natural ${langLabel}. If the input is already ${langLabel}, lightly polish it. Return only the translation, no notes or quotes.`

  const json = await callGeminiApi({
    apiKey,
    payload: {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
      },
    },
  })
  return geminiReplyText(json)
}

/** Translate a chat message (default target: Japanese). */
exports.translateHanaChat = onCall({ cors: true }, async (request) => {
  const text = String(request.data?.text || '').trim()
  if (!text) {
    throw new HttpsError('invalid-argument', 'text is required')
  }
  if (text.length > 2000) {
    throw new HttpsError('invalid-argument', 'text too long')
  }

  const rawLang = String(request.data?.targetLang || 'ja').trim().toLowerCase() || 'ja'
  const targetLang = TRANSLATE_LANG_LABELS[rawLang] ? rawLang : 'ja'
  const key = process.env.GEMINI_API_KEY || ''
  if (!key) {
    return { translation: null, reason: 'quota' }
  }

  try {
    const translation = await callGeminiTranslate({ apiKey: key, text, targetLang })
    return {
      translation: translation || null,
      reason: translation ? null : 'empty',
      targetLang,
    }
  } catch (error) {
    console.error('translateHanaChat', error)
    if (error?.status === 429 || /credits? are depleted|quota|RESOURCE_EXHAUSTED/i.test(String(error?.message || ''))) {
      return { translation: null, reason: 'quota' }
    }
    throw new HttpsError('internal', '翻訳できませんでした')
  }
})

const OWNER_ASSIST_SYSTEM_PROMPT = `あなたは「はな」（Hana Mediaboxのオーナー本人）専用の私的アシスタントです。
ゲストの日本語メッセージをはなが理解しやすくするために、次のJSONだけを返してください（説明・コードフェンス禁止）:

重要な本人情報：
- 「はな」と「Mika（ミカ・みか）」は同一人物です。
- ゲストが「Mika」「ミカ」「みか」と呼びかけたり、その名前について話した場合、それは原則として返信者本人のはなを指す。Mikaを別人として扱わず、はな本人への呼びかけ・はな本人についての発言として文脈を理解する。
- translationViでは原文の名前を自然に保ち、repliesでは「自分がMikaである」という前提に沿った自然な返答を作る。

{"translationVi":"...","readingHiragana":"...","replies":[{"ja":"..."}]}

ルール:
- translationVi: ゲスト文の自然なベトナム語訳。すでにベトナム語なら軽く整える。
- readingHiragana: ゲスト文の読み方をひらがな中心で。漢字はすべてひらがな化し、句読点は残してよい。英語や固有名詞はそのままでよい。
- replies: はながゲストへ返す最良の候補を1つだけ。やさしく自然な短めの日本語。友達に近い親しみやすさ。マスコット口調や過度な敬語は避ける。
  - ja: 日本語の返信文（各40文字以内）
  - vi: その日本語返信のベトナム語訳（短く）
- JSON以外は一切出力しない。`

function parseOwnerAssistJson(raw) {
  const text = String(raw || '').trim()
  if (!text) {
    return { translationVi: '', readingHiragana: '', replies: [] }
  }
  const fenced = text.match(/\{[\s\S]*\}/)
  const jsonText = fenced ? fenced[0] : text
  try {
    const parsed = JSON.parse(jsonText)
    const replies = Array.isArray(parsed?.replies)
      ? parsed.replies
        .map((item) => ({
          ja: String(item?.ja || '').trim(),
          vi: String(item?.vi || '').trim(),
        }))
        .filter((item) => item.ja)
        .slice(0, 1)
      : []
    return {
      translationVi: String(parsed?.translationVi || '').trim(),
      readingHiragana: String(parsed?.readingHiragana || '').trim(),
      replies,
    }
  } catch {
    return { translationVi: '', readingHiragana: '', replies: [] }
  }
}

async function callGeminiOwnerAssist({ apiKey, text, guestName, history }) {
  const contents = []
  for (const turn of history || []) {
    const role = turn.role === 'model' ? 'model' : 'user'
    const turnText = String(turn.text || '').trim()
    if (!turnText) continue
    contents.push({ role, parts: [{ text: turnText }] })
  }

  const guest = String(guestName || 'ゲスト').trim().slice(0, 40)
  const message = String(text || '').trim().slice(0, 2000)
  contents.push({
    role: 'user',
    parts: [{
      text: `ゲスト「${guest}」の最新メッセージです。はな本人だけが見る私的メモとしてJSONを返して。\nメッセージ:「${message}」`,
    }],
  })

  const json = await callGeminiApi({
    apiKey,
    payload: {
      systemInstruction: { parts: [{ text: OWNER_ASSIST_SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        temperature: 0.35,
        // Generous budget: a truncated response is not valid JSON, which used to
        // surface as an empty analysis for longer messages.
        maxOutputTokens: 1600,
        responseMimeType: 'application/json',
      },
    },
  })

  const parsed = parseOwnerAssistJson(geminiReplyText(json))
  const empty = !parsed.translationVi && !parsed.readingHiragana && !parsed.replies.length
  if (empty) {
    console.warn('ownerAssist empty response', {
      finishReason: json?.candidates?.[0]?.finishReason || '',
      promptFeedback: json?.promptFeedback?.blockReason || '',
    })
  }
  return parsed
}

/**
 * Owner-only private analysis of a guest message:
 * Vietnamese translation + hiragana reading + bilingual reply drafts.
 * Result is returned to the caller only — never written to Firestore.
 */
exports.analyzeGuestMessageForOwner = onCall({ cors: true }, async (request) => {
  const text = String(request.data?.text || '').trim()
  if (!text) {
    throw new HttpsError('invalid-argument', 'text is required')
  }
  if (text.length > 2000) {
    throw new HttpsError('invalid-argument', 'text too long')
  }

  const guestName = String(request.data?.guestName || '').trim().slice(0, 40)
  const history = Array.isArray(request.data?.history) ? request.data.history.slice(-8) : []
  const key = process.env.GEMINI_API_KEY || ''
  if (!key) {
    return {
      translationVi: '',
      readingHiragana: '',
      replies: [],
      reason: 'quota',
    }
  }

  try {
    let result = await callGeminiOwnerAssist({
      apiKey: key,
      text,
      guestName,
      history,
    })

    // The JSON step is nondeterministic; retry once without history, which is
    // both a shorter prompt and a fresh roll of the dice.
    if (!result.translationVi && !result.readingHiragana && !result.replies.length) {
      result = await callGeminiOwnerAssist({ apiKey: key, text, guestName, history: [] })
    }

    // Last resort: a plain translation call so Hana always gets the meaning,
    // even when the structured analysis keeps coming back empty.
    if (!result.translationVi) {
      const translationVi = await callGeminiTranslate({
        apiKey: key,
        text,
        targetLang: 'vi',
      }).catch(() => '')
      result = { ...result, translationVi }
    }

    const ok = Boolean(result.translationVi || result.readingHiragana || result.replies.length)
    return {
      ...result,
      reason: ok ? null : 'empty',
    }
  } catch (error) {
    console.error('analyzeGuestMessageForOwner', error)
    if (error?.status === 429 || /credits? are depleted|quota|RESOURCE_EXHAUSTED/i.test(String(error?.message || ''))) {
      return {
        translationVi: '',
        readingHiragana: '',
        replies: [],
        reason: 'quota',
      }
    }
    throw new HttpsError('internal', 'メッセージ解析に失敗しました')
  }
})

const LIVE_CALL_ASSIST_SYSTEM_PROMPT = `あなたは「はな」（Hana Mediaboxのオーナー本人）専用の通話アシスタントです。
入力音声は通話相手（ゲスト）の声です。はな自身の声ではありません。
次のJSONだけを返してください（説明・コードフェンス禁止）:

{"transcript":"...","translationVi":"...","replies":[{"ja":"...","vi":"..."},{"ja":"...","vi":"..."}]}

重要な本人情報：
- 「はな」と「Mika（ミカ・みか）」は同一人物です。ゲストが Mika / ミカ / みか と呼んだら、それははな本人への呼びかけです。

ルール:
- transcript: 相手が今言った内容の文字起こし。話した言語のまま（日本語なら日本語、ベトナム語ならベトナム語）。聞き取れない・無音・ノイズのみなら空文字。
- translationVi: はなが意味を取るための自然なベトナム語。原文がベトナム語なら軽く整える。transcriptが空なら空。
- replies: はなが声で返す短い日本語候補を1〜2個。ゲストは主に「がぶ / gabusan」で、会話は関西弁。返信も自然な関西弁（やで／やん／へん／ちゃう／ええ／ほんま など）で、友達同士の話し方。標準語・マスコット口調・過度な敬語は避ける。各40文字以内。viはその日本語のベトナム語訳。
- JSON以外は一切出力しない。`

function parseLiveCallAssistJson(raw) {
  const text = String(raw || '').trim()
  if (!text) {
    return { transcript: '', translationVi: '', replies: [] }
  }
  const fenced = text.match(/\{[\s\S]*\}/)
  const jsonText = fenced ? fenced[0] : text
  try {
    const parsed = JSON.parse(jsonText)
    const replies = Array.isArray(parsed?.replies)
      ? parsed.replies
        .map((item) => ({
          ja: String(item?.ja || item || '').trim(),
          vi: String(item?.vi || '').trim(),
        }))
        .filter((item) => item.ja)
        .slice(0, 2)
      : []
    return {
      transcript: String(parsed?.transcript || '').trim(),
      translationVi: String(parsed?.translationVi || '').trim(),
      replies,
    }
  } catch {
    return { transcript: '', translationVi: '', replies: [] }
  }
}

/**
 * Owner-only live call assist: transcribe the guest's voice + draft spoken replies.
 * Audio is processed in-memory and never written to Firestore.
 */
exports.assistLiveCallForOwner = onCall({
  cors: true,
  timeoutSeconds: 60,
  memory: '512MiB',
}, async (request) => {
  const audioBase64 = String(request.data?.audioBase64 || '').replace(/\s/g, '')
  const mimeType = String(request.data?.mimeType || 'audio/webm').trim().slice(0, 80) || 'audio/webm'
  if (!audioBase64 || audioBase64.length < 80) {
    return { transcript: '', translationVi: '', replies: [], reason: 'empty' }
  }
  if (audioBase64.length > 1_400_000) {
    throw new HttpsError('invalid-argument', 'audio too large')
  }

  const guestName = String(request.data?.guestName || '').trim().slice(0, 40)
  const recent = String(request.data?.recentTranscript || '').trim().slice(0, 800)
  const key = process.env.GEMINI_API_KEY || ''
  if (!key) {
    return { transcript: '', translationVi: '', replies: [], reason: 'quota' }
  }

  const guest = guestName || 'ゲスト'
  let ask = `ゲスト「${guest}」の今の発話です。はな本人だけが見る通話メモとしてJSONを返して。`
  if (recent) ask += `\n直前までの相手の発言:\n${recent}`

  try {
    const json = await callGeminiApi({
      apiKey: key,
      payload: {
        systemInstruction: { parts: [{ text: LIVE_CALL_ASSIST_SYSTEM_PROMPT }] },
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            { text: ask },
          ],
        }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',
        },
      },
    })
    const parsed = parseLiveCallAssistJson(geminiReplyText(json))
    const ok = Boolean(parsed.transcript || parsed.translationVi || parsed.replies.length)
    return { ...parsed, reason: ok ? null : 'empty' }
  } catch (error) {
    console.error('assistLiveCallForOwner', error)
    if (error?.status === 429 || /credits? are depleted|quota|RESOURCE_EXHAUSTED/i.test(String(error?.message || ''))) {
      return { transcript: '', translationVi: '', replies: [], reason: 'quota' }
    }
    throw new HttpsError('internal', '通話の文字起こしに失敗しました')
  }
})

const BOOK_ASSIST_SYSTEM_PROMPT = `あなたは「はな」（Hana Mediaboxのオーナー本人）専用の読書アシスタントです。
書籍ページの画像（または本文テキスト）を読み取り、次のJSONだけを返してください（説明・コードフェンス禁止）:

{"translationVi":"...","readingHiragana":"..."}

ルール:
- 画像の場合はページ上の本文をOCRしてから処理する。見出し・本文・ルビがあれば含める。ページ番号や装飾だけのノイズは無視してよい。
- translationVi: 本文の自然なベトナム語訳。すでにベトナム語なら軽く整える。長文でも意味が通るよう段落感を保つ。
- readingHiragana: 本文の読みをひらがな中心で。漢字はすべてひらがな化し、句読点は残してよい。英語や固有名詞はそのままでよい。
- 文字が読めない／無い場合は両方空文字。
- JSON以外は一切出力しない。`

function parseBookAssistJson(raw) {
  const text = String(raw || '').trim()
  if (!text) {
    return { translationVi: '', readingHiragana: '' }
  }
  const fenced = text.match(/\{[\s\S]*\}/)
  const jsonText = fenced ? fenced[0] : text
  try {
    const parsed = JSON.parse(jsonText)
    return {
      translationVi: String(parsed?.translationVi || '').trim(),
      readingHiragana: String(parsed?.readingHiragana || '').trim(),
    }
  } catch {
    return { translationVi: '', readingHiragana: '' }
  }
}

async function callGeminiBookAssist({ apiKey, text, imageBase64, imageMimeType, title, page }) {
  const bookTitle = String(title || '').trim().slice(0, 80)
  const pageLabel = Number(page) > 0 ? String(Math.floor(Number(page))) : ''
  const meta = [
    bookTitle ? `書名: ${bookTitle}` : '',
    pageLabel ? `頁: ${pageLabel}` : '',
  ].filter(Boolean).join(' / ')

  const parts = []
  const safeImage = String(imageBase64 || '').replace(/^data:image\/\w+;base64,/, '').trim()
  if (safeImage) {
    parts.push({
      inlineData: {
        mimeType: String(imageMimeType || 'image/jpeg').slice(0, 64) || 'image/jpeg',
        data: safeImage,
      },
    })
    parts.push({
      text: meta
        ? `${meta}\n\nこの書籍ページ画像の本文を読み取り、指定のJSONでベトナム語訳とひらがな読みを返してください。`
        : 'この書籍ページ画像の本文を読み取り、指定のJSONでベトナム語訳とひらがな読みを返してください。',
    })
  } else {
    const body = String(text || '').trim()
    parts.push({
      text: meta ? `${meta}\n\n本文:\n${body}` : body,
    })
  }

  const json = await callGeminiApi({
    apiKey,
    payload: {
      systemInstruction: { parts: [{ text: BOOK_ASSIST_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    },
  })

  return parseBookAssistJson(geminiReplyText(json))
}

exports.analyzeBookPageForOwner = onCall({ cors: true, timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  const imageBase64 = String(request.data?.imageBase64 || '')
    .replace(/^data:image\/\w+;base64,/, '')
    .trim()
  const imageMimeType = String(request.data?.imageMimeType || 'image/jpeg').trim().slice(0, 64) || 'image/jpeg'
  const text = String(request.data?.text || '').trim()
  if (!imageBase64 && !text) {
    throw new HttpsError('invalid-argument', 'image or text is required')
  }
  if (imageBase64.length > 3_500_000) {
    throw new HttpsError('invalid-argument', 'image too large')
  }
  if (text.length > 4000) {
    throw new HttpsError('invalid-argument', 'text too long')
  }

  const title = String(request.data?.title || '').trim().slice(0, 80)
  const page = Math.max(0, Math.floor(Number(request.data?.page) || 0))
  const key = process.env.GEMINI_API_KEY || ''
  if (!key) {
    return {
      translationVi: '',
      readingHiragana: '',
      reason: 'quota',
    }
  }

  try {
    let result = await callGeminiBookAssist({
      apiKey: key,
      text,
      imageBase64,
      imageMimeType,
      title,
      page,
    })

    if (!result.translationVi && !result.readingHiragana) {
      result = await callGeminiBookAssist({
        apiKey: key,
        text,
        imageBase64,
        imageMimeType,
        title,
        page,
      })
    }

    if (!result.translationVi && text) {
      const translationVi = await callGeminiTranslate({
        apiKey: key,
        text: text.slice(0, 2000),
        targetLang: 'vi',
      }).catch(() => '')
      result = { ...result, translationVi }
    }

    const ok = Boolean(result.translationVi || result.readingHiragana)
    return {
      ...result,
      reason: ok ? null : 'empty',
    }
  } catch (error) {
    console.error('analyzeBookPageForOwner', error)
    if (error?.status === 429 || /credits? are depleted|quota|RESOURCE_EXHAUSTED/i.test(String(error?.message || ''))) {
      return {
        translationVi: '',
        readingHiragana: '',
        reason: 'quota',
      }
    }
    throw new HttpsError('internal', 'ページ解析に失敗しました')
  }
})

function resolveGuestKeyFromThread(threadId, threadData) {
  const fromDoc = String(threadData?.guestKey || '').trim().toLowerCase()
  if (fromDoc) return fromDoc
  const match = String(threadId || '').match(/^guest-(.+)$/i)
  return match ? String(match[1] || '').trim().toLowerCase() : ''
}

function previewText(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim()
  if (!raw) return '新しいメッセージ'
  return raw.length > 100 ? `${raw.slice(0, 100)}…` : raw
}

/**
 * When a chat message is created, notify the other party's registered devices.
 * guest → owner (hana); hana → that thread's guest.
 */
exports.notifyOnChatMessage = onDocumentCreated(
  {
    document: `${CHAT_THREADS_COLLECTION}/{threadId}/messages/{messageId}`,
    region: 'asia-northeast1',
  },
  async (event) => {
    const snap = event.data
    if (!snap) return null
    const message = snap.data() || {}
    if (message.deleted) return null

    const sender = message.sender === 'hana' ? 'hana' : message.sender === 'guest' ? 'guest' : ''
    if (!sender) return null

    const threadId = event.params.threadId
    const db = getFirestore()
    const threadSnap = await db.collection(CHAT_THREADS_COLLECTION).doc(threadId).get()
    const threadData = threadSnap.exists ? threadSnap.data() : {}

    let targetUserKey = ''
    let title = 'Hana Mediabox'
    if (sender === 'guest') {
      targetUserKey = OWNER_PUSH_KEY
      title = String(threadData?.guestLabel || resolveGuestKeyFromThread(threadId, threadData) || 'ゲスト')
    } else {
      targetUserKey = resolveGuestKeyFromThread(threadId, threadData)
      title = 'はな'
    }
    if (!targetUserKey) return null

    const tokensSnap = await db
      .collection(PUSH_TOKENS_COLLECTION)
      .where('userKey', '==', targetUserKey)
      .limit(50)
      .get()

    const tokenDocs = tokensSnap.docs
      .map((document) => ({ id: document.id, token: String(document.data()?.token || '').trim() }))
      .filter((row) => row.token)

    if (!tokenDocs.length) {
      console.info('notifyOnChatMessage: no tokens for', targetUserKey)
      return null
    }

    const body = previewText(message.text)
    const tokens = tokenDocs.map((row) => row.token)
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title,
        body,
      },
      data: {
        threadId: String(threadId),
        sender: String(sender),
        type: 'chat',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'hana_chat',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    })

    const staleIds = []
    response.responses.forEach((result, index) => {
      if (result.success) return
      const code = result.error?.code || ''
      if (
        code === 'messaging/registration-token-not-registered'
        || code === 'messaging/invalid-registration-token'
      ) {
        staleIds.push(tokenDocs[index].id)
      } else {
        console.warn('notifyOnChatMessage send fail', code, result.error?.message)
      }
    })

    await Promise.all(
      staleIds.map((id) => db.collection(PUSH_TOKENS_COLLECTION).doc(id).delete().catch(() => null)),
    )

    console.info(
      'notifyOnChatMessage',
      { targetUserKey, sent: response.successCount, failed: response.failureCount, cleaned: staleIds.length },
    )
    return null
  },
)

async function notifyCallRing({ threadId, callId, after }) {
  if (!after || after.status !== 'ringing') return null
  const callerRole = after.callerRole === 'hana' ? 'hana' : 'guest'
  const calleeRole = after.calleeRole === 'hana' ? 'hana' : 'guest'
  if (!callerRole || !calleeRole) return null

  const db = getFirestore()
  const threadSnap = await db.collection(CHAT_THREADS_COLLECTION).doc(threadId).get()
  const threadData = threadSnap.exists ? threadSnap.data() : {}

  let targetUserKey = ''
  let title = '着信'
  if (calleeRole === 'hana') {
    targetUserKey = OWNER_PUSH_KEY
    title = String(threadData?.guestLabel || resolveGuestKeyFromThread(threadId, threadData) || 'ゲスト')
  } else {
    targetUserKey = resolveGuestKeyFromThread(threadId, threadData)
    title = 'はな'
  }
  if (!targetUserKey) return null

  const tokensSnap = await db
    .collection(PUSH_TOKENS_COLLECTION)
    .where('userKey', '==', targetUserKey)
    .limit(50)
    .get()

  const tokenDocs = tokensSnap.docs
    .map((document) => ({ id: document.id, token: String(document.data()?.token || '').trim() }))
    .filter((row) => row.token)

  if (!tokenDocs.length) {
    console.info('notifyOnChatCall: no tokens for', targetUserKey)
    return null
  }

  const tokens = tokenDocs.map((row) => row.token)
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title,
      body: '通話の着信です',
    },
    data: {
      threadId: String(threadId),
      callId: String(callId || ''),
      type: 'call',
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'hana_chat',
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
  })

  const stale = []
  response.responses.forEach((result, index) => {
    if (result.success) return
    const code = result.error?.code || ''
    if (
      code === 'messaging/registration-token-not-registered'
      || code === 'messaging/invalid-registration-token'
    ) {
      stale.push(tokenDocs[index].id)
    }
    console.warn('notifyOnChatCall send fail', code, result.error?.message)
  })
  await Promise.all(stale.map((id) => db.collection(PUSH_TOKENS_COLLECTION).doc(id).delete().catch(() => null)))
  console.info('notifyOnChatCall', targetUserKey, 'sent', response.successCount, 'fail', response.failureCount)
  return null
}

exports.notifyOnChatCallCreate = onDocumentCreated(
  {
    document: `${CHAT_THREADS_COLLECTION}/{threadId}/calls/{callId}`,
    region: 'asia-northeast1',
  },
  async (event) => {
    const after = event.data?.data?.() || {}
    return notifyCallRing({
      threadId: event.params.threadId,
      callId: event.params.callId,
      after,
    })
  },
)

exports.notifyOnChatCall = onDocumentUpdated(
  {
    document: `${CHAT_THREADS_COLLECTION}/{threadId}/calls/{callId}`,
    region: 'asia-northeast1',
  },
  async (event) => {
    const before = event.data?.before?.data?.() || {}
    const after = event.data?.after?.data?.() || {}
    if (after.status !== 'ringing') return null
    if (before.status === 'ringing') return null
    return notifyCallRing({
      threadId: event.params.threadId,
      callId: event.params.callId,
      after,
    })
  },
)

const HOSTING_SITE = 'hana-mediabox'
const ADMIN_EMAIL_ALLOWLIST = [
  'hihig9@gmail.com',
  'koyamamika.me@gmail.com',
]

function assertAdminCaller(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'ログインが必要です。')
  }
  const email = String(request.auth.token?.email || '').trim().toLowerCase()
  if (!email || !ADMIN_EMAIL_ALLOWLIST.includes(email)) {
    throw new HttpsError('permission-denied', '管理権限がありません。')
  }
  return email
}

async function getGoogleAccessToken() {
  const { getApp } = require('firebase-admin/app')
  const credential = getApp().options.credential
  if (!credential?.getAccessToken) {
    throw new Error('Admin credential cannot mint access tokens')
  }
  const tokenResponse = await credential.getAccessToken()
  const token = tokenResponse?.access_token || tokenResponse?.token
  if (!token) throw new Error('Could not obtain Google access token')
  return token
}

function hostingVersionIdFromName(name) {
  return String(name || '').split('/').pop() || ''
}

async function hostingApi(path, { method = 'GET', body } = {}) {
  const token = await getGoogleAccessToken()
  const response = await fetch(`https://firebasehosting.googleapis.com/v1beta1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!response.ok) {
    const message = json?.error?.message || text.slice(0, 240) || `Hosting API ${response.status}`
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return json
}

/** Admin: list recent live-channel Hosting releases for the version manager UI. */
exports.getHostingReleases = onCall({ cors: true }, async (request) => {
  assertAdminCaller(request)
  try {
    const data = await hostingApi(
      `sites/${HOSTING_SITE}/channels/live/releases?pageSize=25`,
    )
    const releases = Array.isArray(data?.releases) ? data.releases : []
    const items = releases.map((release, index) => {
      const hostingVersionId = hostingVersionIdFromName(release?.version?.name || release?.versionName)
      return {
        hostingVersionId,
        releaseName: release?.name || null,
        releaseTime: release?.releaseTime || release?.version?.finalizeTime || null,
        type: release?.type || null,
        isLive: index === 0,
        fileCount: release?.version?.fileCount != null ? Number(release.version.fileCount) : null,
      }
    }).filter((item) => item.hostingVersionId)

    return {
      site: HOSTING_SITE,
      liveHostingVersionId: items[0]?.hostingVersionId || null,
      releases: items,
    }
  } catch (error) {
    console.error('getHostingReleases', error)
    throw new HttpsError(
      'internal',
      error?.message || 'Hosting リリース一覧を取得できませんでした。',
    )
  }
})

/**
 * Admin: promote a previous Hosting version to the live channel (instant rollback).
 * Pass hostingVersionId, or appVersion to resolve from Firestore app-releases.
 */
exports.rollbackHostingRelease = onCall({ cors: true, timeoutSeconds: 120 }, async (request) => {
  const adminEmail = assertAdminCaller(request)
  let hostingVersionId = String(request.data?.hostingVersionId || '').trim()
  const appVersion = String(request.data?.appVersion || '').trim()

  if (!hostingVersionId && appVersion) {
    const snap = await getFirestore().collection('app-releases').doc(appVersion).get()
    hostingVersionId = String(snap.data()?.hostingVersionId || '').trim()
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(hostingVersionId)) {
    throw new HttpsError('invalid-argument', '有効な Hosting version id がありません。')
  }

  const versionName = `sites/${HOSTING_SITE}/versions/${hostingVersionId}`

  try {
    const current = await hostingApi(
      `sites/${HOSTING_SITE}/channels/live/releases?pageSize=1`,
    )
    const liveId = hostingVersionIdFromName(current?.releases?.[0]?.version?.name)
    if (liveId && liveId === hostingVersionId) {
      return {
        ok: true,
        alreadyLive: true,
        hostingVersionId,
        message: 'すでにこの版がライブです。',
      }
    }

    const release = await hostingApi(
      `sites/${HOSTING_SITE}/channels/live/releases?versionName=${encodeURIComponent(versionName)}`,
      { method: 'POST', body: {} },
    )

    await getFirestore().collection('app-releases').doc(`rollback-${Date.now()}`).set({
      type: 'rollback',
      hostingVersionId,
      appVersion: appVersion || null,
      rolledBackBy: adminEmail,
      createdAt: new Date().toISOString(),
      releaseName: release?.name || null,
    }).catch((err) => console.warn('rollback log write failed', err))

    return {
      ok: true,
      alreadyLive: false,
      hostingVersionId,
      releaseName: release?.name || null,
      message: 'ロールバックしました。ハードリロードしてください。',
    }
  } catch (error) {
    console.error('rollbackHostingRelease', error)
    if (error instanceof HttpsError) throw error
    throw new HttpsError(
      'internal',
      error?.message || 'ロールバックに失敗しました。Cloud Functions に Hosting 権限があるか確認してください。',
    )
  }
})
