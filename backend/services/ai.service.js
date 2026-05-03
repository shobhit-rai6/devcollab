// backend/services/ai.service.js
// Ollama (local) first → Groq (free) fallback
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
{"type":"code","content":"Brief explanation","fileTree":{"src/index.js":"full code here","package.json":"{\"name\":\"app\",\"scripts\":{\"start\":\"node src/index.js\"},\"dependencies\":{}}"},"buildCommand":"npm install","startCommand":"npm start"}

STRICT RULES:
- Output ONLY raw JSON. No markdown fences. No text before or after the JSON.
- fileTree values must be complete working file contents, no placeholders
- For React/Node apps always include a valid package.json
- For plain questions use type "text"`;

const localAI = new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' });
const groqAI  = new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY || '' });

function normalise(raw) {
    const parsed = JSON.parse(raw);
    // Fix: Ollama/Groq sometimes returns {text:...} instead of {type,content}
    if (parsed.text && !parsed.type) {
        parsed.type    = parsed.fileTree ? 'code' : 'text';
        parsed.content = parsed.text;
        delete parsed.text;
    }
    if (!parsed.type) parsed.type = 'text';
    return parsed;
}

async function callOllama(prompt) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);
    try {
        const model = process.env.OLLAMA_MODEL || 'qwen2.5-coder:1.5b';
        const completion = await localAI.chat.completions.create({
            model,
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
            temperature: 0.2,
            max_tokens: 4096,
            response_format: { type: 'json_object' }
        }, { signal: controller.signal });

        const raw = completion?.choices?.[0]?.message?.content;
        if (!raw) throw new Error('Empty Ollama response');
        const result = normalise(raw);
        console.log('✅ Ollama answered');
        return JSON.stringify(result);
    } finally {
        clearTimeout(t);
    }
}

async function callGroq(prompt) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set in .env — get free key at console.groq.com');
    const completion = await groqAI.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 8000,
        response_format: { type: 'json_object' }
    });
    const raw = completion?.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Empty Groq response');
    const result = normalise(raw);
    result.content = `*[Local AI offline — answered by Groq (free)]*\n\n${result.content || ''}`;
    console.log('✅ Groq answered (fallback)');
    return JSON.stringify(result);
}

export const generateResult = async (prompt) => {
    try { return await callOllama(prompt); }
    catch (err) { console.warn('⚠️  Ollama failed:', err.message); }

    try { return await callGroq(prompt); }
    catch (err) {
        console.error('❌ Groq also failed:', err.message);
        return JSON.stringify({
            type: 'text',
            content: `❌ Both AI backends failed.\n\n- **Ollama:** run \`ollama serve\` — make sure model is pulled (\`ollama pull qwen2.5-coder:1.5b\`)\n- **Groq:** ${err.message}`
        });
    }
};