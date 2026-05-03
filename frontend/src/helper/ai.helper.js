// ai.helper.js — Dual AI: Ollama (local) first → Claude via backend proxy
// Drop this into: frontend/src/helper/ai.helper.js

import OpenAI from 'openai';
import axios from '../config/axios';   // your existing axios instance (has auth token)

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const OLLAMA_BASE_URL = 'http://localhost:11434/v1';
const OLLAMA_MODEL    = 'qwen2.5-coder:1.5b';
const OLLAMA_TIMEOUT  = 8000; // ms — if local AI is slow/offline, fall back to backend

function buildSystemPrompt(fileTree = {}) {
    const files = Object.keys(fileTree);
    return `You are an expert full-stack developer AI assistant in DevCollab, a collaborative code editor.

Current project files: ${files.length > 0 ? files.join(', ') : 'none yet'}

## ALWAYS respond with valid JSON in ONE of these formats:

### For conversation/questions:
{"type":"text","content":"Your response in markdown. Use **bold**, \`code\`, \`\`\`lang blocks\`\`\`."}

### For code generation:
{"type":"code","content":"Explanation of what was built.","fileTree":{"src/index.js":"full code here","package.json":"{...}"},"buildCommand":"npm install","startCommand":"npm start"}

## Rules:
- fileTree keys = relative paths like "src/server.js", "components/Button.jsx"
- All file contents must be COMPLETE and working — no placeholders
- React apps: always include package.json with correct dependencies
- Output ONLY raw JSON — no markdown fences, no extra text outside JSON
- Normal questions (not code): use type "text"`;
}

// ─── MAIN AI ASSISTANT ────────────────────────────────────────────────────────
export class AIAssistant {
    constructor(projectId, webContainer, fileTree, setFileTree, saveFileTree, addMessage, setCurrentFile, setOpenFiles, removeMessage) {
        this.projectId       = projectId;
        this.webContainer    = webContainer;
        this.fileTree        = fileTree || {};
        this.setFileTree     = setFileTree;
        this.saveFileTree    = saveFileTree;
        this.addMessage      = addMessage;
        this.setCurrentFile  = setCurrentFile;
        this.setOpenFiles    = setOpenFiles;
        this.removeMessage   = removeMessage;
        this.isProcessing    = false;
        this.conversationHistory = [];

        // Local Ollama client (browser → localhost, no CORS issue)
        this.ollama = new OpenAI({
            baseURL: OLLAMA_BASE_URL,
            apiKey: 'ollama',
            dangerouslyAllowBrowser: true
        });
    }

    // ── ENTRY POINT ───────────────────────────────────────────────────────────
    async processCommand(userMessage) {
        if (!userMessage?.trim()) return;

        if (this.isProcessing) {
            this.addMessage(this._msg({ type: 'text', content: '⏳ Still working on your previous request…' }));
            return;
        }

        this.isProcessing = true;
        this.conversationHistory.push({ role: 'user', content: userMessage });

        this.addMessage(this._msg({ type: 'text', content: '🤔 Thinking…' }));

        let parsed = null;
        let usedFallback = false;

        try {
            // ── 1. Try local Ollama (browser → localhost:11434) ───────────
            try {
                parsed = await this._callOllama(userMessage);
                console.log('✅ Ollama answered');
            } catch (ollamaErr) {
                console.warn('⚠️ Ollama unavailable, trying backend proxy…', ollamaErr.message);
                usedFallback = true;

                // ── 2. Fallback: call YOUR backend → backend calls Claude ─
                //    This avoids CORS + keeps API key secret on the server
                parsed = await this._callBackendAI(userMessage);
                console.log('✅ Backend AI (Claude) answered');
            }

            if (this.removeMessage) this.removeMessage();

            const payload = this._normalize(parsed);
            this.conversationHistory.push({ role: 'assistant', content: JSON.stringify(parsed) });
            this.addMessage(this._msg(payload));

            if (payload.fileTree && Object.keys(payload.fileTree).length > 0) {
                await this.handleFileMounting({ fileTree: payload.fileTree });
            }

        } catch (err) {
            if (this.removeMessage) this.removeMessage();
            this.addMessage(this._msg({ type: 'text', content: this._errMsg(err, usedFallback) }));
            console.error('AI error:', err);
        } finally {
            this.isProcessing = false;
        }
    }

    // ── LOCAL OLLAMA (direct browser → localhost, works fine) ────────────────
    async _callOllama(userMessage) {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);
        try {
            const completion = await this.ollama.chat.completions.create({
                model: OLLAMA_MODEL,
                messages: [
                    { role: 'system', content: buildSystemPrompt(this.fileTree) },
                    ...this._history(5),
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.7,
                max_tokens: 4096,
                response_format: { type: 'json_object' }
            }, { signal: controller.signal });

            const raw = completion?.choices?.[0]?.message?.content;
            if (!raw) throw new Error('Empty Ollama response');
            return JSON.parse(raw);
        } finally {
            clearTimeout(t);
        }
    }

    // ── BACKEND PROXY (browser → your Express server → Claude API) ───────────
    // This is the correct way — API key lives in backend .env, never in browser
    async _callBackendAI(userMessage) {
        // Build a full prompt including conversation context
        const contextPrompt = this._history(8)
            .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
            .join('\n');

        const fullPrompt = contextPrompt
            ? `${contextPrompt}\nUser: ${userMessage}`
            : userMessage;

        // Calls GET /ai/get-result?prompt=... — your existing backend endpoint
        const res = await axios.get('/ai/get-result', {
            params: { prompt: fullPrompt },
            timeout: 30000  // 30s timeout for AI response
        });

        // Backend returns parsed JSON already (res.data is the object)
        if (!res.data) throw new Error('Empty response from backend AI');
        return res.data;
    }

    // ── FILE MOUNTING ─────────────────────────────────────────────────────────
    async handleFileMounting({ fileTree }) {
        if (!this.webContainer || !fileTree || !Object.keys(fileTree).length) return;

        try {
            const formatted = {};
            for (const [path, data] of Object.entries(fileTree)) {
                const content = typeof data === 'string'
                    ? data
                    : (data?.file?.contents ?? data?.contents ?? JSON.stringify(data, null, 2));
                formatted[path] = { file: { contents: String(content) } };
            }

            await this.webContainer.mount(formatted);
            if (this.setFileTree)  this.setFileTree(prev => ({ ...(prev || {}), ...formatted }));
            if (this.saveFileTree) await this.saveFileTree(formatted);

            const first = Object.keys(formatted)[0];
            if (first) {
                setTimeout(() => {
                    this.setCurrentFile?.(first);
                    this.setOpenFiles?.(prev => {
                        const cur = Array.isArray(prev) ? prev : [];
                        return cur.includes(first) ? cur : [...cur, first];
                    });
                }, 100);
            }
        } catch (err) {
            console.error('Mount error:', err);
        }
    }

    // ── UTILS ─────────────────────────────────────────────────────────────────
    _normalize(raw) {
        if (!raw || typeof raw !== 'object') return { type: 'text', content: String(raw || 'No response') };
        const p = {
            type:    typeof raw.type === 'string' ? raw.type : 'text',
            content: raw.content != null ? String(raw.content) : 'Done!'
        };
        if (raw.fileTree && typeof raw.fileTree === 'object' && Object.keys(raw.fileTree).length > 0) {
            p.fileTree = raw.fileTree;
            if (raw.buildCommand) p.buildCommand = String(raw.buildCommand);
            if (raw.startCommand) p.startCommand = String(raw.startCommand);
        }
        return p;
    }

    _msg(payload) {
        return { sender: { _id: 'ai', email: 'AI Assistant' }, message: JSON.stringify(payload) };
    }

    _history(n = 10) {
        return this.conversationHistory.slice(-n).map(m => ({
            role: m.role || 'user',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        })).filter(m => m.content);
    }

    _errMsg(err, usedFallback) {
        const m = err?.message || '';
        if (m.includes('ANTHROPIC_API_KEY'))
            return '❌ Claude API key not configured. Add `ANTHROPIC_API_KEY=your_key` to backend `.env`';
        if (m.includes('401'))
            return '❌ Claude API key is invalid. Check `ANTHROPIC_API_KEY` in backend `.env`';
        if (m.includes('429'))
            return '⏳ Claude API rate limit hit. Wait a moment and try again.';
        if (m.includes('timeout') || m.includes('ECONNABORTED'))
            return '⌛ AI request timed out. Try a simpler prompt or check your connection.';
        if (m.includes('Network Error') || m.includes('ECONNREFUSED'))
            return '❌ Cannot reach the backend server. Is it running on port 3000?';
        if (usedFallback)
            return `❌ Local AI (Ollama) is offline AND the Claude fallback failed: ${m}`;
        return `❌ AI error: ${m}`;
    }

    buildContext() {
        return { currentFiles: Object.keys(this.fileTree || {}), fileCount: Object.keys(this.fileTree || {}).length };
    }
}


// ─── ZIP DOWNLOAD ─────────────────────────────────────────────────────────────
export async function downloadProjectAsZip(fileTree, projectName = 'project') {
    if (!fileTree || !Object.keys(fileTree).length) {
        alert('No files to download. Ask AI to generate code first!');
        return false;
    }

    try {
        const JSZip = (await import('jszip')).default;
        const zip   = new JSZip();
        const slug  = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const root  = zip.folder(slug);

        for (const [filePath, fileData] of Object.entries(fileTree)) {
            const path = filePath.replace(/^\//, '');
            let content = '';
            if (typeof fileData === 'string')           content = fileData;
            else if (fileData?.file?.contents != null)  content = String(fileData.file.contents);
            else if (fileData?.contents != null)        content = String(fileData.contents);
            else                                        content = JSON.stringify(fileData, null, 2);
            root.file(path, content);
        }

        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: `${slug}.zip` });
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    } catch (err) {
        console.error('Download failed:', err);
        alert(err.message?.includes('jszip') ? 'Run: cd frontend && npm install jszip' : `Download error: ${err.message}`);
        return false;
    }
}