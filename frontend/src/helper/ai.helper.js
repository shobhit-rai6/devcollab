// ai.helper.js - ULTRA DEFENSIVE VERSION
import OpenAI from 'openai';

export class AIAssistant {
    constructor(projectId, webContainer, fileTree, setFileTree, saveFileTree, addMessage, setCurrentFile, setOpenFiles, removeMessage) {
        this.projectId = projectId;
        this.webContainer = webContainer;
        this.fileTree = fileTree || {};
        this.setFileTree = setFileTree;
        this.saveFileTree = saveFileTree;
        this.addMessage = addMessage;
        this.setCurrentFile = setCurrentFile;
        this.setOpenFiles = setOpenFiles;
        this.removeMessage = removeMessage;
        this.isProcessing = false;
        this.conversationHistory = [];
        
        this.ollama = new OpenAI({
            baseURL: 'http://localhost:11434/v1',
            apiKey: 'ollama',
            dangerouslyAllowBrowser: true
        });
    }

    async processCommand(userMessage) {
        console.log('🚀 processCommand started', { userMessage });
        
        if (!userMessage || userMessage.trim() === '') {
            console.log('⚠️ Empty message');
            return;
        }

        if (this.isProcessing) {
            console.log('⚠️ Already processing');
            this.addMessage({
                sender: { _id: 'ai', email: 'AI Assistant' },
                message: JSON.stringify({
                    type: 'text',
                    content: "⏳ Give me a moment, still thinking..."
                })
            });
            return;
        }

        this.isProcessing = true;
        
        try {
            this.conversationHistory.push({
                role: 'user',
                content: userMessage
            });

            const thinkingMsg = {
                sender: { _id: 'ai', email: 'AI Assistant' },
                message: JSON.stringify({
                    type: 'text',
                    content: "🤔 ..."
                })
            };
            this.addMessage(thinkingMsg);

            const context = this.buildContext();
            console.log('📊 Context built', context);
            
            console.log('🚀 Sending to Qwen2.5-Coder...');
            const startTime = Date.now();
            
            const completion = await this.ollama.chat.completions.create({
                model: "qwen2.5-coder:1.5b",
                messages: [
                    {
                        role: "system",
                        content: `You are a friendly AI assistant. Respond with valid JSON in one of these formats:

1. For conversation: { "type": "text", "content": "your response" }
2. For code: { "type": "code", "content": "explanation", "fileTree": { "file.js": "code" } }`
                    },
                    ...this.getRecentHistory(5),
                    {
                        role: "user",
                        content: userMessage
                    }
                ],
                temperature: 0.7,
                max_tokens: 4096,
                response_format: { type: "json_object" }
            });

            const endTime = Date.now();
            console.log(`✅ Response received in ${(endTime - startTime) / 1000}s`);

            // Debug: Log the raw completion
            console.log('📦 Raw completion:', {
                hasChoices: !!completion?.choices,
                choicesLength: completion?.choices?.length,
                hasMessage: !!completion?.choices?.[0]?.message,
                hasContent: !!completion?.choices?.[0]?.message?.content
            });

            const result = completion?.choices?.[0]?.message?.content;
            if (!result) {
                throw new Error('No response from AI');
            }

            console.log('📝 Raw result (first 100 chars):', result.substring(0, 100));

            let aiResponse;
            try {
                aiResponse = JSON.parse(result);
                console.log('✅ Parsed AI response:', {
                    type: aiResponse?.type,
                    hasContent: !!aiResponse?.content,
                    hasFileTree: !!aiResponse?.fileTree,
                    fileTreeKeys: aiResponse?.fileTree ? Object.keys(aiResponse.fileTree) : []
                });
            } catch (e) {
                console.log('⚠️ Failed to parse JSON:', e.message);
                aiResponse = {
                    type: 'text',
                    content: result.substring(0, 500)
                };
            }

            // Remove thinking message
            if (this.removeMessage) {
                console.log('🗑️ Removing thinking message');
                this.removeMessage();
            }

            // ===== ULTRA SAFE MESSAGE CONSTRUCTION =====
            console.log('🔍 DEBUG - Building message payload');
            
            // Create base payload with safe defaults
            const messagePayload = {
                type: 'text',
                content: 'No response content'
            };

            // Safely add type if it exists
            if (aiResponse && typeof aiResponse === 'object') {
                if (aiResponse.type && typeof aiResponse.type === 'string') {
                    messagePayload.type = aiResponse.type;
                }
                
                if (aiResponse.content && typeof aiResponse.content === 'string') {
                    messagePayload.content = aiResponse.content;
                } else if (aiResponse.content) {
                    // If content exists but isn't a string, convert it
                    messagePayload.content = String(aiResponse.content);
                }

                // ✅ CRITICAL: Check fileTree with extreme caution
                let hasValidFileTree = false;
                try {
                    if (aiResponse.fileTree) {
                        console.log('📁 fileTree exists, type:', typeof aiResponse.fileTree);
                        
                        // Check if it's an object
                        if (typeof aiResponse.fileTree === 'object' && aiResponse.fileTree !== null) {
                            // Get keys safely
                            const keys = Object.keys(aiResponse.fileTree);
                            console.log('📁 fileTree keys:', keys);
                            
                            if (keys.length > 0) {
                                hasValidFileTree = true;
                                messagePayload.fileTree = aiResponse.fileTree;
                                console.log('✅ Valid fileTree with', keys.length, 'files');
                            } else {
                                console.log('⚠️ fileTree has no keys');
                            }
                        } else {
                            console.log('⚠️ fileTree is not an object:', typeof aiResponse.fileTree);
                        }
                    } else {
                        console.log('ℹ️ No fileTree in response');
                    }
                } catch (fileTreeError) {
                    console.error('❌ Error checking fileTree:', fileTreeError);
                    // Continue without fileTree
                }

                // Safely add commands
                if (aiResponse.buildCommand) {
                    messagePayload.buildCommand = String(aiResponse.buildCommand);
                }
                if (aiResponse.startCommand) {
                    messagePayload.startCommand = String(aiResponse.startCommand);
                }
            }

            const messageToSend = {
                sender: { _id: 'ai', email: 'AI Assistant' },
                message: JSON.stringify(messagePayload)
            };
            
            console.log('📨 Adding message to chat with payload:', messagePayload);
            this.addMessage(messageToSend);

            // Add to conversation history
            this.conversationHistory.push({
                role: 'assistant',
                content: aiResponse || { type: 'text', content: 'No response' }
            });

            // ===== SAFE FILE MOUNTING CHECK =====
            let shouldMountFiles = false;
            try {
                // Check if we have a valid fileTree in the messagePayload
                if (messagePayload.fileTree && 
                    typeof messagePayload.fileTree === 'object' && 
                    messagePayload.fileTree !== null) {
                    
                    const fileCount = Object.keys(messagePayload.fileTree).length;
                    if (fileCount > 0) {
                        shouldMountFiles = true;
                        console.log('📁 Will attempt to mount', fileCount, 'files');
                    }
                }
            } catch (mountCheckError) {
                console.error('❌ Error in mount check:', mountCheckError);
                shouldMountFiles = false;
            }

            if (shouldMountFiles) {
                console.log('📁 Attempting to mount files...');
                // Create a safe response object for mounting
                const mountResponse = {
                    fileTree: messagePayload.fileTree
                };
                await this.handleFileMounting(mountResponse);
            } else {
                console.log('💬 No files to mount (normal conversation)');
            }

        } catch (error) {
            console.error('❌ AI error:', error);
            console.error('Error stack:', error.stack);
            
            if (this.removeMessage) {
                this.removeMessage();
            }
            
            let errorMessage = "I ran into an issue. ";
            if (error.message?.includes('ECONNREFUSED')) {
                errorMessage = "Cannot connect to Ollama. Make sure it's running (run 'ollama serve' in terminal)";
            } else if (error.message?.includes('model')) {
                errorMessage = "Model not found. Run 'ollama pull qwen2.5-coder:1.5b' in terminal";
            } else {
                errorMessage += error.message;
            }
            
            this.addMessage({
                sender: { _id: 'ai', email: 'AI Assistant' },
                message: JSON.stringify({
                    type: 'text',
                    content: `😅 ${errorMessage}`
                })
            });
        } finally {
            this.isProcessing = false;
            console.log('🏁 processCommand finished');
        }
    }

    async handleFileMounting(aiResponse) {
        console.log('📂 handleFileMounting called');
        
        // ULTRA defensive checks
        if (!this.webContainer) {
            console.log('⚠️ WebContainer not available');
            return;
        }

        if (!aiResponse) {
            console.log('⚠️ No aiResponse provided');
            return;
        }

        if (!aiResponse.fileTree) {
            console.log('⚠️ No fileTree in response');
            return;
        }

        // Check fileTree type
        if (typeof aiResponse.fileTree !== 'object' || aiResponse.fileTree === null) {
            console.log('⚠️ fileTree is not a valid object:', typeof aiResponse.fileTree);
            return;
        }

        try {
            const fileNames = Object.keys(aiResponse.fileTree);
            console.log('📁 Mounting files:', fileNames);
            
            if (fileNames.length === 0) {
                console.log('⚠️ No files to mount');
                return;
            }
            
            const formattedFileTree = {};
            let fileCount = 0;
            
            for (const filename of fileNames) {
                try {
                    const content = aiResponse.fileTree[filename];
                    if (content) {
                        formattedFileTree[filename] = {
                            file: {
                                contents: String(content)
                            }
                        };
                        fileCount++;
                        console.log(`  📄 ${filename} (${String(content).length} chars)`);
                    } else {
                        console.log(`  ⚠️ ${filename} has no content`);
                    }
                } catch (fileError) {
                    console.error(`❌ Error processing file ${filename}:`, fileError);
                }
            }

            if (fileCount === 0) {
                console.log('⚠️ No valid files to mount');
                return;
            }

            await this.webContainer.mount(formattedFileTree);
            console.log('✅ Files mounted successfully');

            if (this.setFileTree) {
                this.setFileTree(prev => ({
                    ...(prev || {}),
                    ...formattedFileTree
                }));
            }

            if (this.saveFileTree) {
                await this.saveFileTree(formattedFileTree);
            }

            const firstFile = Object.keys(formattedFileTree)[0];
            if (firstFile) {
                setTimeout(() => {
                    try {
                        if (this.setCurrentFile) {
                            this.setCurrentFile(firstFile);
                        }
                        if (this.setOpenFiles) {
                            this.setOpenFiles(prev => {
                                const current = Array.isArray(prev) ? prev : [];
                                return current.includes(firstFile) ? current : [...current, firstFile];
                            });
                        }
                    } catch (openError) {
                        console.error('❌ Error opening first file:', openError);
                    }
                }, 100);
            }

        } catch (error) {
            console.error('❌ Mount error:', error);
        }
    }

    getRecentHistory(count = 5) {
        if (!Array.isArray(this.conversationHistory)) {
            return [];
        }
        
        return this.conversationHistory.slice(-count).map(msg => {
            try {
                return {
                    role: msg?.role || 'user',
                    content: msg?.content ? 
                        (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)) 
                        : ''
                };
            } catch (e) {
                console.log('⚠️ Error processing history message:', e);
                return { role: 'user', content: '' };
            }
        }).filter(msg => msg.content);
    }

    buildContext() {
        try {
            return {
                currentFiles: Object.keys(this.fileTree || {}),
                hasPackageJson: !!(this.fileTree?.['package.json']),
                fileCount: Object.keys(this.fileTree || {}).length
            };
        } catch (e) {
            console.log('⚠️ Error building context:', e);
            return {
                currentFiles: [],
                hasPackageJson: false,
                fileCount: 0
            };
        }
    }
}