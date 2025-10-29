// Client-side shim for Gemini calls: move server-only library usage to a backend and call it via /api/chat
// This file intentionally does NOT import @google/generative-ai or any Node-only package.

const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS || 30000);
const CLIENT_THROTTLE_MS = Number(import.meta.env.VITE_CLIENT_THROTTLE_MS || 1000);
const API_CHAT_PATH = import.meta.env.VITE_API_CHAT_PATH || '/api/chat';

let lastCallAt = 0;

function withTimeout(promise, ms = REQUEST_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), ms)
    ),
  ]);
}

function throttled() {
  if (!CLIENT_THROTTLE_MS) return false;
  const now = Date.now();
  const diff = now - lastCallAt;
  if (diff < CLIENT_THROTTLE_MS) {
    return Math.ceil((CLIENT_THROTTLE_MS - diff) / 1000); // seconds remaining
  }
  lastCallAt = now;
  return false;
}

// runChatStream: async generator that posts the prompt to a server endpoint and yields partial chunks
export async function* runChatStream(prompt) {
  try {
    if (!prompt || !prompt.trim()) {
      yield 'Please enter a prompt.';
      return;
    }

    const t = throttled();
    if (t) {
      yield `You're sending requests too fast. Please wait ~${t}s.`;
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    // Make the request (server should hold the real API key and call Google Generative API)
    const resp = await withTimeout(
      fetch(API_CHAT_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal,
      })
    );

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      yield `Server error: ${resp.status} ${resp.statusText}${txt ? ' - ' + txt : ''}`;
      return;
    }

    if (!resp.body) {
      // No streaming support; read the whole body
      const text = await resp.text();
      yield text;
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    while (!done) {
      const { value, done: d } = await reader.read();
      done = d;
      if (value && value.length) {
        const chunk = decoder.decode(value, { stream: true });
        yield chunk;
      }
    }
  } catch (err) {
    if (import.meta.env.DEV) console.error('runChatStream error:', err);
    yield 'An error occurred while contacting the backend chat API.';
  }
}