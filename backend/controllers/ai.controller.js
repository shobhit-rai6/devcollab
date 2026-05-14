import * as aiService from '../services/ai.service.js';

// BUG FIX: The original code did res.json(JSON.parse(result)) — but
// generateResult already returns a parsed object (or a stringified JSON).
// JSON.parse on a plain object throws "SyntaxError: Unexpected token o".
// We now safely handle both cases.
function safeParse(data) {
    if (typeof data === 'object' && data !== null) return data;
    try { return JSON.parse(data); }
    catch { return { type: 'text', content: String(data) }; }
}

export const getResult = async (req, res) => {
    try {
        const { prompt } = req.query;
        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        const result = await aiService.generateResult(prompt.trim());
        res.json(safeParse(result));
    } catch (error) {
        console.error('AI controller error:', error.message);
        res.status(500).json({ error: error.message });
    }
};
