// ai.helper.js — Dual AI: Ollama (local) first → Claude via backend proxy
// Drop this into: frontend/src/helper/ai.helper.js

import OpenAI from 'openai';
import axios from '../config/axios'; // your existing axios instance (has auth token)

// ─── CONFIG ───────────────────────────────────────────────────────────────────
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

// ─── PATH UTILITIES ───────────────────────────────────────────────────────────

/**
 * Sanitize a raw file path from the AI into a clean relative path.
 * Returns null if the path is unsalvageable.
 */
function sanitizePath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return null;

    const clean = rawPath
        .replace(/\\/g, '/')           // normalize Windows backslashes
        .replace(/^\/+/, '')           // strip leading slashes
        .replace(/\/+/g, '/')          // collapse duplicate slashes
        .split('/')
        .filter(part => part && part !== '..' && part !== '.') // remove empty, '..' and '.'
        .join('/');

    return clean || null;
}

/**
 * Convert a flat { "path/to/file": content } fileTree into a nested
 * WebContainer-compatible directory structure.
 *
 * WebContainer rules:
 *  - Every key at every level MUST NOT contain a slash.
 *  - Files: { file: { contents: string } }
 *  - Directories: { directory: { ...children } }
 */
function buildDirectoryStructure(fileTree) {
    const root = {};

    for (const [rawPath, data] of Object.entries(fileTree)) {
        // Extract string content regardless of how AI returned it
        const content = typeof data === 'string'
            ? data
            : (data?.file?.contents ?? data?.contents ?? JSON.stringify(data, null, 2));

        const cleanPath = sanitizePath(rawPath);
        if (!cleanPath) {
            console.warn('[ai.helper] Skipping unsalvageable path:', rawPath);
            continue;
        }

        const parts = cleanPath.split('/');

        // Double-check: no part should contain a slash after our sanitization
        const hasBadPart = parts.some(p => p.includes('/') || p === '');
        if (hasBadPart) {
            console.warn('[ai.helper] Skipping path with invalid segments:', rawPath, '→', parts);
            continue;
        }

        let current = root;

        // Navigate / create intermediate directory nodes
        for (let i = 0; i < parts.length - 1; i++) {
            const dir = parts[i];

            if (!current[dir]) {
                current[dir] = { directory: {} };
            } else if (current[dir].file) {
                // AI gave us both "src" (as a file) and "src/foo.js" — promote to directory
                console.warn(`[ai.helper] Promoting file node "${dir}" to directory`);
                current[dir] = { directory: {} };
            } else if (!current[dir].directory) {
                current[dir].directory = {};
            }

            current = current[dir].directory;
        }

        // Place the file — final segment must not contain a slash
        const filename = parts[parts.length - 1];
        if (!filename || filename.includes('/')) {
            console.warn('[ai.helper] Skipping file with slash in final segment:', filename, '(raw:', rawPath, ')');
            continue;
        }

        if (current[filename]?.directory) {
            // AI returned both a directory "src" and a file "src" — skip the file
            console.warn(`[ai.helper] Skipping file "${filename}" — a directory with that name already exists`);
            continue;
        }

        current[filename] = { file: { contents: String(content) } };
    }

    return root;
}

/**
 * Recursively validate that no key in the nested tree contains a slash.
 * Throws a descriptive error on the first violation found.
 */
function validateDirectoryStructure(node, parentPath = '') {
    for (const [key, value] of Object.entries(node)) {
        if (key.includes('/')) {
            throw new Error(
                `[ai.helper] Invalid key "${key}" at path "${parentPath || '/'}" — ` +
                `WebContainer keys must not contain slashes`
            );
        }

        if (!key.trim()) {
            throw new Error(
                `[ai.helper] Empty key found at path "${parentPath || '/'}" — ` +
                `WebContainer keys must be non-empty strings`
            );
        }

        const fullPath = parentPath ? `${parentPath}/${key}` : key;

        if (value?.directory && typeof value.directory === 'object') {
            validateDirectoryStructure(value.directory, fullPath);
        } else if (!value?.file) {
            throw new Error(
                `[ai.helper] Node "${fullPath}" is neither a file nor a directory. ` +
                `Expected { file: { contents } } or { directory: {} }`
            );
        }
    }
}

// ─── MAIN AI ASSISTANT ────────────────────────────────────────────────────────
export class AIAssistant {
    constructor(
        projectId,
        webContainer,
        fileTreeRef,
        setFileTree,
        saveFileTree,
        addMessage,
        setCurrentFile,
        setOpenFiles,
        removeMessage,
        broadcastAIMessage
    ) {
        this.projectId           = projectId;
        this.webContainer        = webContainer;
        this.fileTreeRef         = fileTreeRef;
        this.setFileTree         = setFileTree;
        this.saveFileTree        = saveFileTree;
        this.addMessage          = addMessage;
        this.setCurrentFile      = setCurrentFile;
        this.setOpenFiles        = setOpenFiles;
        this.removeMessage       = removeMessage;
        this.broadcastAIMessage  = broadcastAIMessage;
        this.isProcessing        = false;
        this.conversationHistory = [];

        // Local Ollama client (browser → localhost, no CORS issue)
        this.ollama = new OpenAI({
            baseURL: OLLAMA_BASE_URL,
            apiKey: 'ollama',
            dangerouslyAllowBrowser: true,
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

        let parsed      = null;
        let usedFallback = false;

        try {
            // ── 1. Try local Ollama (browser → localhost:11434) ───────────
            try {
                parsed = await this._callOllama(userMessage);
                console.log('[ai.helper] ✅ Ollama answered');
            } catch (ollamaErr) {
                console.warn('[ai.helper] ⚠️ Ollama unavailable, trying backend proxy…', ollamaErr.message);
                usedFallback = true;

                // ── 2. Fallback: browser → Express server → Claude API ────
                parsed = await this._callBackendAI(userMessage);
                console.log('[ai.helper] ✅ Backend AI (Claude) answered');
            }

            if (this.removeMessage) this.removeMessage();

            const payload = this._normalize(parsed);
            this.conversationHistory.push({ role: 'assistant', content: JSON.stringify(parsed) });

            // Broadcast via socket so all users see it and it's persisted in DB.
            // Falls back to local-only addMessage if socket isn't available.
            if (this.broadcastAIMessage) {
                this.broadcastAIMessage(JSON.stringify(payload));
            } else {
                this.addMessage(this._msg(payload));
            }

            if (payload.fileTree && Object.keys(payload.fileTree).length > 0) {
                await this.handleFileMounting({ fileTree: payload.fileTree });
            }
        } catch (err) {
            if (this.removeMessage) this.removeMessage();
            this.addMessage(this._msg({ type: 'text', content: this._errMsg(err, usedFallback) }));
            console.error('[ai.helper] AI error:', err);
        } finally {
            this.isProcessing = false;
        }
    }

    // ── LOCAL OLLAMA (direct browser → localhost, works fine) ────────────────
    async _callOllama(userMessage) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

        try {
            const completion = await this.ollama.chat.completions.create(
                {
                    model: OLLAMA_MODEL,
                    messages: [
                        { role: 'system', content: buildSystemPrompt(this.fileTreeRef?.current || {}) },
                        ...this._history(5),
                        { role: 'user', content: userMessage },
                    ],
                    temperature:     0.7,
                    max_tokens:      4096,
                    response_format: { type: 'json_object' },
                },
                { signal: controller.signal }
            );

            const raw = completion?.choices?.[0]?.message?.content;
            if (!raw) throw new Error('Empty Ollama response');
            return JSON.parse(raw);
        } finally {
            clearTimeout(timer);
        }
    }

    // ── BACKEND PROXY (browser → Express server → Claude API) ────────────────
    // API key lives in backend .env — never exposed to the browser.
    async _callBackendAI(userMessage) {
        const contextPrompt = this._history(8)
            .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
            .join('\n');

        const fullPrompt = contextPrompt
            ? `${contextPrompt}\nUser: ${userMessage}`
            : userMessage;

        // Calls GET /ai/get-result?prompt=... — your existing backend endpoint
        const res = await axios.get('/ai/get-result', {
            params:  { prompt: fullPrompt },
            timeout: 30_000,
        });

        if (!res.data) throw new Error('Empty response from backend AI');
        return res.data;
    }

    // ── FILE MOUNTING ─────────────────────────────────────────────────────────
    async handleFileMounting({ fileTree }) {
        if (!this.webContainer || !fileTree || !Object.keys(fileTree).length) return;

        try {
            // 1. Build nested structure
            const nested = buildDirectoryStructure(fileTree);

            // 2. Validate before handing to WebContainer — surfaces bad data clearly
            try {
                validateDirectoryStructure(nested);
            } catch (validationErr) {
                console.error('[ai.helper] Tree validation failed:', validationErr.message);
                console.debug('[ai.helper] Problematic nested tree:', JSON.stringify(nested, null, 2));
                throw validationErr; // re-throw so the outer catch shows the user a clear message
            }

            // 3. Mount into WebContainer
            await this.webContainer.mount(nested);

            // 4. Build the flat UI representation (used by the editor / file tree UI)
            const formatted = {};
            for (const [rawPath, data] of Object.entries(fileTree)) {
                const cleanPath = sanitizePath(rawPath);
                if (!cleanPath) continue;

                const content = typeof data === 'string'
                    ? data
                    : (data?.file?.contents ?? data?.contents ?? JSON.stringify(data, null, 2));

                formatted[cleanPath] = { file: { contents: String(content) } };
            }

            if (this.setFileTree) {
                this.setFileTree(prev => ({ ...(prev || {}), ...formatted }));
            }
            if (this.saveFileTree) {
                await this.saveFileTree({ ...(this.fileTreeRef?.current || {}), ...formatted });
            }

            // 5. Open the first file in the editor
            const firstFile = Object.keys(formatted)[0];
            if (firstFile) {
                setTimeout(() => {
                    this.setCurrentFile?.(firstFile);
                    this.setOpenFiles?.(prev => {
                        const cur = Array.isArray(prev) ? prev : [];
                        return cur.includes(firstFile) ? cur : [...cur, firstFile];
                    });
                }, 100);
            }
        } catch (err) {
            console.error('[ai.helper] Mount error:', err);
            throw err; // bubble up so processCommand can show the user an error message
        }
    }

    // ── UTILS ─────────────────────────────────────────────────────────────────
    _normalize(raw) {
        if (!raw || typeof raw !== 'object') {
            return { type: 'text', content: String(raw || 'No response') };
        }

        const payload = {
            type:    typeof raw.type === 'string' ? raw.type : 'text',
            content: raw.content != null ? String(raw.content) : 'Done!',
        };

        if (raw.fileTree && typeof raw.fileTree === 'object' && Object.keys(raw.fileTree).length > 0) {
            payload.fileTree = raw.fileTree;
            if (raw.buildCommand) payload.buildCommand = String(raw.buildCommand);
            if (raw.startCommand) payload.startCommand = String(raw.startCommand);
        }

        return payload;
    }

    _msg(payload) {
        return {
            sender:  { _id: 'ai', email: 'AI Assistant' },
            message: JSON.stringify(payload),
        };
    }

    _history(n = 10) {
        return this.conversationHistory
            .slice(-n)
            .map(m => ({
                role:    m.role || 'user',
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            }))
            .filter(m => m.content);
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
        if (m.includes('invalid file name') || m.includes('Invalid key') || m.includes('EIO'))
            return `❌ AI returned an invalid file path that WebContainer rejected. Try rephrasing your request. (${m})`;
        if (usedFallback)
            return `❌ Local AI (Ollama) is offline AND the Claude fallback failed: ${m}`;
        return `❌ AI error: ${m}`;
    }

    buildContext() {
        const ft = this.fileTreeRef?.current || {};
        return { currentFiles: Object.keys(ft), fileCount: Object.keys(ft).length };
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

        for (const [rawPath, fileData] of Object.entries(fileTree)) {
            const cleanPath = sanitizePath(rawPath);
            if (!cleanPath) continue;

            let content = '';
            if (typeof fileData === 'string')                content = fileData;
            else if (fileData?.file?.contents != null)       content = String(fileData.file.contents);
            else if (fileData?.contents != null)             content = String(fileData.contents);
            else                                             content = JSON.stringify(fileData, null, 2);

            root.file(cleanPath, content);
        }

        const blob = await zip.generateAsync({
            type:               'blob',
            compression:        'DEFLATE',
            compressionOptions: { level: 6 },
        });

        const url = URL.createObjectURL(blob);
        const a   = Object.assign(document.createElement('a'), {
            href:     url,
            download: `${slug}.zip`,
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    } catch (err) {
        console.error('[ai.helper] Download failed:', err);
        alert(
            err.message?.includes('jszip')
                ? 'Run: cd frontend && npm install jszip'
                : `Download error: ${err.message}`
        );
        return false;
    }
}