
import dotenv from 'dotenv';
import OpenAI from 'openai'; 
dotenv.config();


const localAI = new OpenAI({
    baseURL: 'http://localhost:11434/v1', 
    apiKey: 'ollama', 
});

export const generateResult = async (prompt) => {
    try {
        console.log('========== LOCAL AI GENERATION ==========');
        console.log('📝 Prompt:', prompt.substring(0, 100) + '...');
        
        const completion = await localAI.chat.completions.create({
        
            model: "llama3.1:8b", 
            
            messages: [
                {
                    role: "system",
                    content: `You are an expert MERN stack developer. 
                             You MUST respond with VALID JSON only.
                             
                             Required format:
                             {
                               "text": "Clear explanation of what you're building",
                               "fileTree": {
                                 "server.js": "Express server code",
                                 "package.json": "{\\"name\\":\\"app\\",\\"scripts\\":{\\"start\\":\\"node server.js\\"}}",
                                 "App.js": "React component code"
                               },
                               "buildCommand": "npm install",
                               "startCommand": "npm start"
                             }
                             
                             RULES:
                             - ONLY output JSON, nothing else
                             - No markdown, no backticks
                             - All file paths must be relative
                             - Package.json must be valid JSON string`
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.2,
            max_tokens: 4096,
            response_format: { type: "json_object" }
        });

        const result = completion.choices[0].message.content;
        console.log('✅ Local AI response received');
        
        // Validate and return
        JSON.parse(result);
        return result;

    } catch (error) {
        console.error('❌ Local AI generation error:', error);
        
        return JSON.stringify({
            text: `Error: ${error.message}`,
            fileTree: null,
            buildCommand: null,
            startCommand: null
        });
    }
};