// backend/services/ai.service.js
// Dual AI: Ollama (local, free) → Groq (free cloud fallback)
// Get free Groq key at: console.groq.com

import dotenv from 'dotenv';
import OpenAI from 'openai';
dotenv.config();

const OLLAMA_TIMEOUT = 8000;

const SYSTEM_PROMPT = `You are an expert full-stack developer AI assistant in DevCollab.

ALWAYS respond with valid JSON in ONE of these formats:

For conversation or questions:
{"type":"text","content":"Your markdown response here"}

For code generation:
{"type":"code","content":"Brief explanation","fileTree":{"src/index.js":"full code here","package.json":"{...}"},"buildCommand":"npm install","startCommand":"npm start"}

STRICT RULES:
- Output ONLY raw JSON — no markdown fences, no text before or after
- fileTree keys = relative paths like "src/server.js"
- All file contents must be complete and working — no placeholders
- React apps always include package.json with correct dependencies
- For plain questions use type "text"`;

// ── Clients ───────────────────────────────────────────────────────────────────
const localAI = new OpenAI({
    baseURL: 'http://localhost:11434/v1',
    apiKey:  'ollama'
});

const groqAI = new OpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey:  process.env.GROQ_API_KEY || ''
});

// ── Safe JSON parser ──────────────────────────────────────────────────────────
// BUG FIX: AI sometimes wraps JSON in markdown fences or adds trailing text.
// Strip fences and extract the first valid JSON object.
function normalise(raw) {
    if (typeof raw === 'object' && raw !== null) return raw;

    // Strip ```json ... ``` fences
    const stripped = String(raw).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    // Try parsing the whole string first
    try { return JSON.parse(stripped); } catch { /* fall through */ }

    // Extract first {...} block as a last resort
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
        try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }

    // Return as plain text object
    return { type: 'text', content: stripped };
}

// ── Ollama (local) ────────────────────────────────────────────────────────────
async function callOllama(prompt) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);
    try {
        const model = process.env.OLLAMA_MODEL || 'qwen2.5-coder:1.5b';
        const completion = await localAI.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user',   content: prompt }
            ],
            temperature: 0.3,
            max_tokens:  4096,
            response_format: { type: 'json_object' }
        }, { signal: controller.signal });

        const raw = completion?.choices?.[0]?.message?.content;
        // BUG FIX: original threw "Empty Ollama response" even when the model
        // returned whitespace. Now we trim and check properly.
        if (!raw?.trim()) throw new Error('Empty Ollama response');
        return normalise(raw);
    } finally {
        clearTimeout(timer);
    }
}

// ── Groq (cloud fallback) ─────────────────────────────────────────────────────
async function callGroq(prompt) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set in .env');

    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    const completion = await groqAI.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: prompt }
        ],
        temperature:      0.3,
        max_tokens:       8000,
        response_format:  { type: 'json_object' }
    });

    const raw = completion?.choices?.[0]?.message?.content;
    if (!raw?.trim()) throw new Error('Empty Groq response');
    return normalise(raw);
}

// ── Exported entry point ──────────────────────────────────────────────────────
export const generateResult = async (prompt) => {
    // 1. Try local Ollama first (free, private, fast when running)
    try {
        const result = await callOllama(prompt);
        console.log('✅ Ollama answered');
        return JSON.stringify(result);
    } catch (ollamaErr) {
        console.warn('⚠️  Ollama unavailable:', ollamaErr.message);
    }

    // 2. Fallback to Groq (free cloud, needs API key)
    try {
        const result = await callGroq(prompt);
        console.log('✅ Groq answered (fallback)');
        return JSON.stringify(result);
    } catch (groqErr) {
        console.error('❌ Groq also failed:', groqErr.message);
        // Return a structured error so the client can display it gracefully
        return JSON.stringify({
            type:    'text',
            content: `⚠️ Both AI backends are unavailable.\n\n**Ollama:** Make sure Ollama is running locally (\`ollama serve\`)\n**Groq:** Set \`GROQ_API_KEY\` in your .env file (free at console.groq.com)\n\nError: ${groqErr.message}`
        });
    }
};
