// test-groq.js
import Groq from 'groq-sdk';
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const models = [
    "mixtral-8x7b-32768",
    "llama-3.1-8b-instant", 
    "gemma2-9b-it",
    "llama-3.3-70b-versatile",
    "llama-guard-3-8b",
    "whisper-large-v3"
];

for (const model of models) {
    try {
        console.log(`Testing ${model}...`);
        const response = await groq.chat.completions.create({
            model,
            messages: [{ role: "user", content: "Say 'working' in JSON" }],
            max_tokens: 10
        });
        console.log(`✅ ${model} works!`);
    } catch (e) {
        console.log(`❌ ${model} failed: ${e.message.slice(0, 50)}...`);
    }
}