'use strict';

// ИИ-классификация категории расхода по описанию (Groq, LLaMA 3.3 70B).
// Без GROQ_API_KEY функция просто возвращает null — бот откатывается на
// ручной выбор категории кнопками.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const TIMEOUT_MS = 8000;

/**
 * Определяет категорию расхода по описанию.
 * @param {string} desc — описание расхода («бензин до Южного»)
 * @param {Array<{id: string, title: string}>} categories — допустимые категории
 * @returns {Promise<string|null>} id категории либо null (нет ключа/ошибка/не уверен)
 */
export async function classifyCategory(desc, categories) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !desc || !categories?.length) return null;

  const list = categories.map((c) => `${c.id} — ${c.title}`).join('\n');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 60,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Ты классифицируешь расходы рыболовной поездки по категориям. ' +
              'Доступные категории (id — название):\n' + list + '\n\n' +
              'Ответь строго JSON: {"category": "<id>"}. ' +
              'Если ни одна категория явно не подходит, используй "other".',
          },
          { role: 'user', content: String(desc).slice(0, 300) },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`Groq HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    const id = parsed?.category;
    return categories.some((c) => c.id === id) ? id : null;
  } catch (err) {
    console.error('Groq classify error:', err?.message || err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
