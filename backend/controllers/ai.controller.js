import * as aiService from '../services/ai.service.js';

export const getResult = async (req, res) => {
    try {
        const { prompt } = req.query;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt required' });
        }

        // ✅ Just swap this one line
        const result = await aiService.generateResult(prompt);
        
        res.json(JSON.parse(result));
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};