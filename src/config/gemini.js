// node --version # Should be >= 18
// npm install @google/generative-ai

// Dynamic import keeps startup stable if the package isn't installed yet.
let GoogleGenerativeAI;

// Read from environment; do NOT hardcode secrets in client code.
const API_KEY = import.meta.env.VITE_API_KEY;
// Prefer a lighter default model to reduce quota consumption.
const MODEL_NAME = import.meta.env.VITE_MODEL_NAME || "gemini-1.5-flash";
const FALLBACK_MODEL_NAME = import.meta.env.VITE_FALLBACK_MODEL_NAME || "gemini-1.5-flash";

// Tunable knobs via env
const MAX_OUTPUT_TOKENS = Number(import.meta.env.VITE_MAX_OUTPUT_TOKENS || 512);
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS || 30000);
const CLIENT_THROTTLE_MS = Number(import.meta.env.VITE_CLIENT_THROTTLE_MS || 1000);
const ENABLE_AUTO_RETRY_429 = String(import.meta.env.VITE_AUTO_RETRY_429 || "false") === "true";

let genAI = null;
let hasLoggedMissingKey = false;
let hasLoggedMissingPkg = false;
let lastCallAt = 0;

function logOnce(type, ...args) {
  if (!import.meta.env.DEV) return;
  if (type === "missingKey") {
    if (hasLoggedMissingKey) return; hasLoggedMissingKey = true;
    console.error(...args);
  } else if (type === "missingPkg") {
    if (hasLoggedMissingPkg) return; hasLoggedMissingPkg = true;
    console.error(...args);
  } else {
    console.error(...args);
  }
}

async function ensureClient() {
  if (!API_KEY) {
    logOnce(
      "missingKey",
      "VITE_API_KEY is not set. Define it in a .env file at the project root, e.g., VITE_API_KEY=your_api_key"
    );
    return null;
  }

  if (!GoogleGenerativeAI) {
    try {
      ({ GoogleGenerativeAI } = await import("@google/generative-ai"));
    } catch (e) {
      logOnce(
        "missingPkg",
        "Failed to load '@google/generative-ai'. Run 'npm install @google/generative-ai'.",
        e
      );
      return null;
    }
  }

  if (!genAI) {
    genAI = new GoogleGenerativeAI(API_KEY);
  }

  return genAI;
}

// Warm up the client on module load for faster first response.
// This runs in the background and is safe if API key or dependency is missing.
// No await to avoid blocking module evaluation.
ensureClient();

function withTimeout(promise, ms = REQUEST_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out")), ms)
    ),
  ]);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterFromError(err) {
  if (!err) return null;
  const msg = String(err.message || err);
  const m = msg.match(/retry in\s+([0-9.]+)s/i);
  if (m && m[1]) {
    return Math.ceil(parseFloat(m[1]));
  }
  return null;
}

async function* sendWithModelStream(client, modelName, prompt) {
    const model = client.getGenerativeModel({ model: modelName });
    const generationConfig = {
        temperature: 0.9,
        topP: 1,
        topK: 1,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
    };
    const chat = model.startChat({ generationConfig, history: [] });
    const result = await withTimeout(chat.sendMessageStream(prompt));
    for await (const chunk of result.stream) {
        yield chunk.text();
    }
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

export async function* runChatStream(prompt) {
  try {
    if (!prompt || !prompt.trim()) {
      yield "Please enter a prompt.";
      return;
    }

    const throttledSeconds = throttled();
    if (throttledSeconds) {
      yield `You're sending requests too fast. Please wait ~${throttledSeconds}s.`;
      return;
    }

    const client = await ensureClient();
    if (!client) {
      yield "Gemini client is not initialized. Check API key and dependencies.";
      return;
    }

    try {
      yield* sendWithModelStream(client, MODEL_NAME, prompt);
    } catch (err) {
      // Handle quota/rate-limit errors (HTTP 429)
      const msg = String(err && err.message ? err.message : err);
      const is429 = /\b429\b/.test(msg) || /Too Many Requests/i.test(msg) || /quota/i.test(msg);
      if (is429) {
        const retrySec = parseRetryAfterFromError(err);

        if (ENABLE_AUTO_RETRY_429 && retrySec && retrySec <= 60) {
          // One-time auto-retry after suggested delay (cap at 60s)
          await delay(retrySec * 1000);
          try {
            yield* sendWithModelStream(client, MODEL_NAME, prompt);
            return;
          } catch (_) {
            // continue to fallback path
          }
        }

        if (FALLBACK_MODEL_NAME && FALLBACK_MODEL_NAME !== MODEL_NAME) {
          try {
            yield* sendWithModelStream(client, FALLBACK_MODEL_NAME, prompt);
            return;
          } catch (fbErr) {
            if (import.meta.env.DEV) console.error("Fallback model also failed:", fbErr);
          }
        }
        const retryMsg = retrySec ? ` Please retry in ~${retrySec}s.` : "";
        yield `Rate limit or quota exceeded.${retryMsg} Consider trying again later or updating your API plan.`;
        return;
      }
      throw err; // rethrow non-429
    }
  } catch (error) {
    if (import.meta.env.DEV) console.error("Gemini API Error:", error);
    yield "An error occurred while contacting Gemini API.";
  }
}