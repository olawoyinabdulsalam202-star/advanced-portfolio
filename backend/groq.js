const DEFAULT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_FALLBACKS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-20b'];

export function groqConfig(env) {
  const key = env.GROQ_API_KEY || env.AI_API_KEY || '';
  const model = env.GROQ_MODEL || env.AI_MODEL || DEFAULT_MODEL;
  const fallbacks = (env.GROQ_MODEL_FALLBACKS ? env.GROQ_MODEL_FALLBACKS.split(',') : DEFAULT_FALLBACKS)
    .map(m => m.trim())
    .filter(m => m && m !== model);
  return {key, url: env.GROQ_API_URL || env.AI_API_URL || DEFAULT_URL, models: [model, ...fallbacks]};
}

function clean(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function attempt({key, url, model, messages, json, maxTokens, temperature, fetchImpl, timeout}) {
  const reasoning = /gpt-oss/i.test(model);
  const body = {
    model,
    messages,
    temperature,
    [reasoning ? 'max_completion_tokens' : 'max_tokens']: reasoning ? maxTokens + 1500 : maxTokens
  };
  if (reasoning) body.reasoning_effort = 'low';
  if (json) body.response_format = {type: 'json_object'};
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`},
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message || '';
    } catch {}
    throw Object.assign(new Error(detail || `Groq returned ${res.status}.`), {status: res.status});
  }
  const data = await res.json();
  const text = clean(data.choices?.[0]?.message?.content);
  if (!text) throw Object.assign(new Error('Groq returned an empty answer.'), {status: 502, empty: true});
  return text;
}

export async function groqChat(env, {messages, json = false, maxTokens = 400, temperature = 0.3, timeout = 25000, fetchImpl = fetch}) {
  const {key, url, models} = groqConfig(env);
  if (!key) throw Object.assign(new Error('GROQ_API_KEY is not set on the server.'), {status: 503, missingKey: true});
  let lastError;
  for (const model of models) {
    try {
      const text = await attempt({key, url, model, messages, json, maxTokens, temperature, fetchImpl, timeout});
      return {text, model};
    } catch (error) {
      lastError = error;
      if (error.status === 401 || error.status === 403 || error.name === 'TimeoutError') break;
    }
  }
  throw lastError;
}

export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }
  return null;
}

export async function groqStatus(env, fetchImpl = fetch) {
  const {key, models} = groqConfig(env);
  if (!key) return {ok: false, configured: false, model: models[0], error: 'GROQ_API_KEY is not set.'};
  try {
    const {model} = await groqChat(env, {messages: [{role: 'user', content: 'Reply with the single word: ready'}], maxTokens: 20, timeout: 12000, fetchImpl});
    return {ok: true, configured: true, model};
  } catch (error) {
    return {ok: false, configured: true, model: models[0], error: error.message};
  }
}
