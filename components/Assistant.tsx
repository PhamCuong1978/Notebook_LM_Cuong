import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Chat, FunctionCall } from "@google/genai";
import { ChatBubbleIcon, XMarkIcon, SendIcon, MicrophoneIcon, UserIcon, SparklesIcon } from './Icons';
import { aiTools } from './AITools';
import type { Notebook } from '../types';

type AssistantMessage = {
    role: 'user' | 'model';
    content: string;
}

interface AssistantProps {
    notebooks: Notebook[];
    onOpenNotebook: (name: string) => string;
    onCreateMindMap: (name: string) => Promise<string>;
    onCreateAudioSummary: (name: string) => Promise<string>;
    onAnswerQuestion: (question: string, notebookName?: string) => Promise<string>;
}

const LoadingBubble: React.FC = () => (
    <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full p-1.5 bg-purple-600 text-white flex items-center justify-center">
            <SparklesIcon />
        </div>
        <div className="p-3 rounded-lg max-w-xs bg-gray-200 dark:bg-gray-700 flex items-center space-x-2">
            <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
            <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
            <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
        </div>
    </div>
);


export const Assistant: React.FC<AssistantProps> = ({
    notebooks,
    onOpenNotebook,
    onCreateMindMap,
    onCreateAudioSummary,
    onAnswerQuestion,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<AssistantMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    
    const chatRef = useRef<Chat | null>(null);
    const recognitionRef = useRef<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const assistantRef = useRef<HTMLDivElement>(null);
    const fabRef = useRef<HTMLButtonElement>(null);
    const [isSpeechSupported, setIsSpeechSupported] = useState(false);

    useEffect(() => {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        chatRef.current = ai.chats.create({
          model: 'gemini-2.5-pro',
          config: {
              tools: [{ functionDeclarations: aiTools }],
          },
        });

        setMessages([{ role: 'model', content: 'Xin chào, tôi là Trợ lý AI của Anh Cường. Tôi có thể giúp gì cho bạn?'}]);

        // --- Speech Recognition Setup ---
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          setIsSpeechSupported(true);
          const recognition = new SpeechRecognition();
          recognition.continuous = false;
          recognition.interimResults = false;
          recognition.lang = 'vi-VN';

          recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setInput(prev => (prev ? prev + ' ' : '') + transcript);
          };

          recognition.onerror = (event: any) => {
            if (event.error !== 'no-speech') console.error("Speech recognition error:", event.error);
            setIsListening(false);
          };

          recognition.onend = () => setIsListening(false);
          recognitionRef.current = recognition;
        } else {
            console.warn("Speech recognition not supported in this browser.");
            setIsSpeechSupported(false);
        }
    }, []);
    
    // Effect to handle clicks outside the assistant window
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                assistantRef.current &&
                !assistantRef.current.contains(event.target as Node) &&
                fabRef.current &&
                !fabRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [messages, isLoading]);

    const handleSendMessage = useCallback(async () => {
        if (!input.trim() || isLoading || !chatRef.current) return;

        const userMessage: AssistantMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        const chat = chatRef.current;

        try {
            let response = await chat.sendMessage({ message: userMessage.content });

            while (response.functionCalls && response.functionCalls.length > 0) {
                const functionCalls = response.functionCalls;
                
                const functionResponses = await Promise.all(
                    functionCalls.map(async (call: FunctionCall) => {
                        let result: any;
                        const args = call.args;
                        switch (call.name) {
                            case 'list_notebooks':
                                result = notebooks.length > 0 ? notebooks.map(n => n.name).join(', ') : "Không có sổ ghi chú nào.";
                                break;
                            case 'open_notebook':
                                result = onOpenNotebook(args.notebookName as string);
                                break;
                            case 'create_mind_map':
                                result = await onCreateMindMap(args.notebookName as string);
                                break;
                            case 'create_audio_summary':
                                result = await onCreateAudioSummary(args.notebookName as string);
                                break;
                            case 'answer_question_from_sources':
                                result = await onAnswerQuestion(args.question as string, args.notebookName as string | undefined);
                                break;
                            default:
                                result = "Không nhận dạng được chức năng.";
                        }
                        return {
                            id: call.id,
                            name: call.name,
                            response: { result: result },
                        };
                    })
                );
                
                response = await chat.sendMessage({
                  functionResponses: functionResponses
                });
            }

            const modelMessage: AssistantMessage = { role: 'model', content: response.text };
            setMessages(prev => [...prev, modelMessage]);

        } catch (error) {
            console.error("Error sending message to Gemini:", error);
            const errorMessage: AssistantMessage = { role: 'model', content: "Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại." };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }

    }, [input, isLoading, notebooks, onOpenNotebook, onCreateMindMap, onCreateAudioSummary, onAnswerQuestion]);

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleSendMessage();
    };

    const handleToggleListening = () => {
        if (!recognitionRef.current) return;
        if (isListening) {
          recognitionRef.current.stop();
        } else {
          recognitionRef.current.start();
          setIsListening(true);
        }
    };

    return (
        <>
            <div className={`fixed bottom-5 right-5 z-50 transition-transform duration-300 ease-in-out ${isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}>
                <button 
                    ref={fabRef}
                    onClick={() => setIsOpen(true)}
                    className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-purple-700 focus:outline-none focus:ring-4 focus:ring-purple-300"
                    aria-label="Mở Trợ lý AI"
                >
                    <ChatBubbleIcon />
                </button>
            </div>

            <div ref={assistantRef} className={`fixed bottom-5 right-5 z-50 w-[360px] h-[520px] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 ease-in-out origin-bottom-right ${isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <h2 className="font-bold text-lg text-gray-800 dark:text-gray-100">Trợ lý AI của Anh Cường</h2>
                    <button onClick={() => setIsOpen(false)} className="p-1 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700">
                        <XMarkIcon />
                    </button>
                </div>

                {/* Chat History */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                             {msg.role === 'model' && (
                                <div className="flex-shrink-0 w-8 h-8 rounded-full p-1.5 bg-purple-600 text-white flex items-center justify-center">
                                    <SparklesIcon />
                                </div>
                             )}
                            <div className={`p-3 rounded-lg max-w-xs ${msg.role === 'model' ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100' : 'bg-purple-600 text-white'}`}>
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            </div>
                             {msg.role === 'user' && (
                                <div className="flex-shrink-0 w-8 h-8 rounded-full p-1.5 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 flex items-center justify-center">
                                    <UserIcon />
                                </div>
                             )}
                        </div>
                    ))}
                    {isLoading && <LoadingBubble />}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="relative flex items-center">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder={isListening ? "Đang nghe..." : "Hỏi bất cứ điều gì..."}
                            className="w-full pl-4 pr-20 py-2.5 border border-gray-300 dark:border-gray-600 rounded-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            disabled={isLoading}
                        />
                         <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
                            {isSpeechSupported && (
                                <button
                                    onClick={handleToggleListening}
                                    disabled={isLoading}
                                    className={`p-2 rounded-full transition-colors ${
                                        isListening
                                        ? 'bg-red-500 text-white animate-pulse'
                                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                    title={isListening ? 'Dừng' : 'Nói'}
                                >
                                    <MicrophoneIcon />
                                </button>
                            )}
                             <button
                                onClick={handleSendMessage}
                                disabled={isLoading || !input.trim()}
                                className="p-2 rounded-full bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors ml-1"
                                >
                                <SendIcon />
                            </button>
                         </div>
                    </div>
                </div>
            </div>
        </>
    );
};