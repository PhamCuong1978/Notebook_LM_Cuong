
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { Source, SourceContent } from '../types';

declare const pdfjsLib: any;
declare const XLSX: any;

// Log warning if API key is missing (helps debugging in Vercel logs)
if (!process.env.API_KEY) {
    console.error("CRITICAL ERROR: process.env.API_KEY is missing or empty. Please check your Vercel Environment Variables (VITE_API_KEY) and redeploy.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
// Switching to flash for better stability and availability on standard tiers
const model = 'gemini-2.5-flash'; 

// --- Helper Functions ---

function base64ToUtf8(base64: string): string {
    try {
        // Use TextDecoder for robust UTF-8 decoding
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
        console.error("Failed to decode base64 to UTF-8, falling back to simple atob:", e);
        // Fallback for simple cases, though it might be incorrect for multi-byte characters
        return atob(base64);
    }
}

function fileToGenerativePart(base64: string, mimeType: string) {
    return {
        inlineData: {
            data: base64,
            mimeType
        },
    };
}

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}


// --- Core API Functions ---

async function processMultimodalPrompt(parts: any[]): Promise<string> {
    const prompt = "Your task is to extract all readable text from the provided file. If it's an audio or video file, transcribe the speech. If it's an image with no text, provide a detailed description of the image(s). Respond with only the extracted text, transcription, or description.";
    
    try {
        const result = await ai.models.generateContent({
            model: model,
            contents: { parts: [{text: prompt}, ...parts] },
        });
        return result.text;
    } catch (error) {
        console.error("Error processing multimodal prompt:", error);
        throw new Error("The AI model failed to process the file.");
    }
}

export async function extractContentFromUrl(url: string, onProgress: (progress: number) => void): Promise<{ name: string; groundingText: string; }> {
    onProgress(10);
    const isYoutube = /^(https|http):\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/.test(url);
    const promptType = isYoutube ? "YouTube video" : "webpage";
    const action = isYoutube ? "provide a detailed transcript" : "extract the main textual content";
    const fallback = isYoutube ? "provide a detailed summary of the video's content" : "summarize the page";

    const prompt = `Your task is to process the content at the following URL. Respond ONLY with a JSON object containing two keys: "title" and "content".
- For "title", provide the ${promptType} title.
- For "content", ${action}. If that's not possible, ${fallback}. For webpages, ignore navigation bars, footers, and advertisements.

URL: ${url}`;

    onProgress(20);

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: `The title of the ${promptType}.`,
          },
          content: {
            type: Type.STRING,
            description: "The extracted main text content or video transcript/summary.",
          },
        },
        required: ["title", "content"],
      };

    try {
        const result = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            }
        });
        onProgress(90);

        const jsonText = result.text.trim();
        const parsed = JSON.parse(jsonText);
        
        if (typeof parsed.title !== 'string' || typeof parsed.content !== 'string') {
            throw new Error("AI returned invalid JSON structure.");
        }

        onProgress(100);
        return { name: parsed.title, groundingText: parsed.content };

    } catch (error) {
        console.error("Error processing URL:", error);
        throw new Error("The AI model failed to process the URL. It might be inaccessible or invalid.");
    }
}


export async function extractTextAndContentFromFile(file: File, onProgress: (progress: number) => void): Promise<{ content: SourceContent, groundingText: string }> {
    onProgress(5);
    const mimeType = file.type;
    const base64 = await fileToBase64(file);
    onProgress(10);

    if (mimeType.startsWith('image/')) {
        const part = fileToGenerativePart(base64, mimeType);
        onProgress(20);
        const groundingText = await processMultimodalPrompt([part]);
        const content: SourceContent = { type: 'image', mimeType, data: base64 };
        onProgress(100);
        return { content, groundingText };
    }

    if (mimeType === 'application/pdf') {
        const pdf = await pdfjsLib.getDocument({ data: atob(base64) }).promise;
        const pageParts = [];
        const pageImages: string[] = [];
        onProgress(15);

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            
            const pageBase64 = canvas.toDataURL('image/jpeg').split(',')[1];
            pageImages.push(pageBase64);
            pageParts.push(fileToGenerativePart(pageBase64, 'image/jpeg'));

            const progress = 15 + Math.round((i / pdf.numPages) * 75);
            onProgress(progress);
        }
        
        onProgress(95);
        const groundingText = await processMultimodalPrompt(pageParts);
        const content: SourceContent = { type: 'pdf', data: base64, pages: pageImages };
        onProgress(100);
        return { content, groundingText };
    }

    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
        onProgress(20);
        const arrayBuffer = await fileToArrayBuffer(file);
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        onProgress(60);
        
        let fullText = '';
        workbook.SheetNames.forEach((sheetName: string) => {
            fullText += `--- Sheet: ${sheetName} ---\n\n`;
            const worksheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(worksheet);
            fullText += csv + '\n\n';
        });

        const groundingText = fullText.trim();
        const content: SourceContent = { type: 'text', value: groundingText };
        onProgress(100);
        return { content, groundingText };
    }

    if (mimeType.startsWith('text/')) {
        const groundingText = base64ToUtf8(base64);
        const content: SourceContent = { type: 'text', value: groundingText };
        onProgress(100);
        return { content, groundingText };
    }
    
    if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
        const part = fileToGenerativePart(base64, mimeType);
        onProgress(20);
        const groundingText = await processMultimodalPrompt([part]);

        let content: SourceContent;
        if (mimeType.startsWith('audio/')) {
            content = { type: 'audio', mimeType, data: base64 };
        } else { // Video
            content = { type: 'video', mimeType, data: base64 };
        }
        onProgress(100);
        return { content, groundingText };
    }

    throw new Error(`Unsupported file type: ${mimeType}`);
}


export async function generateGroundedResponse(sources: Source[], question: string): Promise<string> {
    const sourcePreamble = sources
        .filter(s => s.status === 'ready' && s.groundingText)
        .map((source, index) => {
            return `--- SOURCE ${index + 1}: ${source.name} ---\n${source.groundingText}`;
        }).join('\n\n');

    if (!sourcePreamble) {
        return "There are no valid sources to answer the question from. Please add and process some sources first.";
    }

    const prompt = `
You are an expert research assistant. Your task is to answer the user's question based ONLY on the provided sources. Do not use any external knowledge.

When you use information from a source, you must cite the source number in brackets, like this: [1]. A single sentence can have multiple citations if it draws from multiple sources, like this: [1][2].

Here are the sources:

${sourcePreamble}

--- END OF SOURCES ---

User's Question: ${question}
`;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
        });
        return response.text;
    } catch (error: any) {
        console.error("Error generating response from Gemini API:", error);
        // Provide clearer error to the UI
        if (error.message?.includes('API key')) {
             return "Lỗi: Không tìm thấy API Key. Vui lòng kiểm tra cài đặt Environment Variable trên Vercel.";
        }
        return `Xin lỗi, đã có lỗi xảy ra: ${error.message || 'Lỗi không xác định'}`;
    }
}

export async function generateMindMap(sources: Source[]): Promise<any> {
    const sourcePreamble = sources
        .filter(s => s.status === 'ready' && s.groundingText)
        .map((source, index) => `--- SOURCE ${index + 1}: ${source.name} ---\n${source.groundingText}`)
        .join('\n\n');

    if (!sourcePreamble) {
        throw new Error("No valid sources provided for mind map generation.");
    }

    const prompt = `
    Based on the following source documents, generate a mind map as a hierarchical JSON object.
    The root node should be a concise title summarizing all sources.
    Each node must have a 'label' property (a string) and a 'children' property (an array of child node objects).
    All content of the labels must be in Vietnamese.
    Respond with ONLY the valid JSON object.

    Here are the sources:
    
    ${sourcePreamble}
    
    --- END OF SOURCES ---
    `;
    
    try {
        const result = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            }
        });
        const jsonText = result.text.trim();
        return JSON.parse(jsonText);
    } catch (error: any) {
        console.error("Error generating mind map from Gemini API:", error);
        throw new Error(error.message || "The AI model failed to generate the mind map JSON.");
    }
}

export async function generateAudioSummary(sources: Source[]): Promise<string> {
    const sourcePreamble = sources
        .filter(s => s.status === 'ready' && s.groundingText)
        .map((source, index) => `--- SOURCE ${index + 1}: ${source.name} ---\n${source.groundingText}`)
        .join('\n\n');

    if (!sourcePreamble) {
        throw new Error("No valid sources provided for audio summary generation.");
    }

    // Step 1: Generate a text summary in Vietnamese
    const summaryPrompt = `
        Summarize the key information from the following sources into a concise, well-structured paragraph in Vietnamese.
        The summary should be suitable for being read aloud as an audio overview.
        Respond ONLY with the Vietnamese summary.

        Here are the sources:
        ${sourcePreamble}
        --- END OF SOURCES ---
    `;
    
    try {
        const summaryResponse = await ai.models.generateContent({
            model: model,
            contents: summaryPrompt,
        });
        const summaryText = summaryResponse.text;

        // Step 2: Convert the summary text to speech
        const ttsResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: summaryText }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });

        const audioData = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (!audioData) {
            throw new Error("The AI model failed to generate audio for the summary.");
        }

        return audioData;
    } catch (error: any) {
        console.error("Error generating audio summary:", error);
        throw new Error(error.message || "Failed to generate audio summary.");
    }
}

export async function generateFinancialReport(sources: Source[]): Promise<string> {
    const sourcePreamble = sources
        .filter(s => s.status === 'ready' && s.groundingText)
        .map((source, index) => `--- SOURCE ${index + 1}: ${source.name} ---\n${source.groundingText}`)
        .join('\n\n');

    if (!sourcePreamble) {
        throw new Error("No valid sources provided for financial report generation.");
    }

    const prompt = `
    You are a professional financial analyst. Your task is to compile a "Báo cáo Tổng hợp" (Financial Summary Report) in Vietnamese based on the provided source documents.
    
    The sources may include:
    - Financial Statements (Báo cáo tài chính)
    - Business Registration (Đăng ký kinh doanh)
    - VAT Declarations (Tờ khai thuế GTGT)
    - Other related documents.

    Your report must be a comprehensive HTML document with inline CSS for styling. It should look professional, like a real printed report.

    Structure the report with the following sections if data is available:
    1.  **Thông tin chung (General Information):** Extract Company Name, Tax Code (Mã số thuế), Address, Legal Representative, Charter Capital, etc. from Business Registration or other docs.
    2.  **Tình hình tài chính (Financial Status):** Summarize key figures from the Balance Sheet (Total Assets, Liabilities, Equity) across available years. Present this in a clean HTML table.
    3.  **Kết quả kinh doanh (Business Results):** Summarize Revenue, Costs, and Profit/Loss from the P&L statement. Present in a table comparing years.
    4.  **Thông tin về Thuế (Tax Information):** Summarize VAT, CIT details if available from tax declarations.
    5.  **Nhận xét chung (Summary/Observations):** A brief professional summary of the company's financial health based on the data.

    **Requirements:**
    - Output MUST be valid HTML code only. Do not wrap in markdown code blocks (like \`\`\`html).
    - Use a clean, modern design with a white background, readable fonts (Arial/sans-serif), and distinct section headers.
    - Use tables for numerical data.
    - If specific data is missing from the sources, state "Không có dữ liệu trong tài liệu nguồn" for that section or field.
    - Language: Vietnamese.

    Here are the sources:
    ${sourcePreamble}
    --- END OF SOURCES ---
    `;

    try {
        const result = await ai.models.generateContent({
            model: model,
            contents: prompt,
        });
        
        let htmlContent = result.text.trim();
        // Cleanup if the model wraps it in markdown despite instructions
        if (htmlContent.startsWith("```html")) {
            htmlContent = htmlContent.replace(/^```html/, "").replace(/```$/, "");
        } else if (htmlContent.startsWith("```")) {
            htmlContent = htmlContent.replace(/^```/, "").replace(/```$/, "");
        }

        return htmlContent;
    } catch (error: any) {
        console.error("Error generating financial report:", error);
        throw new Error(error.message || "The AI model failed to generate the financial report.");
    }
}

export async function generateNotebookName(groundingTexts: string[]): Promise<string> {
    if (groundingTexts.length === 0) {
        return "Sổ ghi chú mới";
    }

    const combinedText = groundingTexts.join('\n\n');

    const prompt = `
    Dựa trên nội dung sau, hãy đề xuất một tiêu đề ngắn gọn (từ 3 đến 8 từ) bằng tiếng Việt cho một sổ ghi chú.
    Chỉ trả lời bằng tiêu đề, không thêm bất kỳ lời giải thích hay dấu ngoặc kép nào.

    Nội dung:
    ${combinedText}
    `;

    try {
        const result = await ai.models.generateContent({
            model: model,
            contents: prompt,
        });
        return result.text.trim().replace(/"/g, ''); // Clean up potential quotes
    } catch (error) {
        console.error("Error generating notebook name:", error);
        return "Sổ ghi chú chưa có tên"; // Fallback name
    }
}

export async function summarizeSourceContent(groundingText: string): Promise<string> {
    if (!groundingText) {
        throw new Error("No content provided to summarize.");
    }

    const prompt = `
    Your task is to create a concise and comprehensive summary of the following text in Vietnamese.
    Focus on extracting the key points, main arguments, and important conclusions.
    The summary should be well-structured and easy to read.
    Respond ONLY with the summary.

    Text to summarize:
    ---
    ${groundingText}
    ---
    `;

    try {
        const result = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: null as any, // Explicitly null to avoid type issues if strict mode
            }
        });
        return result.text;
    } catch (error: any) {
        console.error("Error generating summary from Gemini API:", error);
        throw new Error(error.message || "The AI model failed to generate the summary.");
    }
}

export async function generateFlashcards(sources: Source[]): Promise<any> {
    const sourcePreamble = sources
        .filter(s => s.status === 'ready' && s.groundingText)
        .map((source, index) => `--- SOURCE ${index + 1}: ${source.name} ---\n${source.groundingText}`)
        .join('\n\n');

    if (!sourcePreamble) {
        throw new Error("No valid sources provided for flashcards generation.");
    }

    const prompt = `
    Create a set of 8-12 flashcards based on the key concepts from the provided sources.
    Each flashcard must have a 'front' (term or question) and a 'back' (definition or answer).
    Language: Vietnamese.
    Respond with a JSON object containing a "flashcards" array.

    Here are the sources:
    ${sourcePreamble}
    --- END OF SOURCES ---
    `;

    try {
        const result = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        flashcards: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    front: { type: Type.STRING },
                                    back: { type: Type.STRING }
                                },
                                required: ["front", "back"]
                            }
                        }
                    },
                    required: ["flashcards"]
                }
            }
        });
        const jsonText = result.text.trim();
        return JSON.parse(jsonText);
    } catch (error: any) {
        console.error("Error generating flashcards:", error);
        throw new Error(error.message || "Failed to generate flashcards.");
    }
}

export async function generateQuiz(sources: Source[]): Promise<any> {
    const sourcePreamble = sources
        .filter(s => s.status === 'ready' && s.groundingText)
        .map((source, index) => `--- SOURCE ${index + 1}: ${source.name} ---\n${source.groundingText}`)
        .join('\n\n');

    if (!sourcePreamble) {
        throw new Error("No valid sources provided for quiz generation.");
    }

    const prompt = `
    Create a multiple-choice quiz with 5-10 questions based on the provided sources.
    Each question should have 4 options and 1 correct answer.
    Provide an explanation for the correct answer.
    Language: Vietnamese.
    Respond with a JSON object containing a "questions" array.

    Here are the sources:
    ${sourcePreamble}
    --- END OF SOURCES ---
    `;

    try {
        const result = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        questions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    question: { type: Type.STRING },
                                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    correctAnswerIndex: { type: Type.INTEGER },
                                    explanation: { type: Type.STRING }
                                },
                                required: ["question", "options", "correctAnswerIndex", "explanation"]
                            }
                        }
                    },
                    required: ["questions"]
                }
            }
        });
        const jsonText = result.text.trim();
        return JSON.parse(jsonText);
    } catch (error: any) {
        console.error("Error generating quiz:", error);
        throw new Error(error.message || "Failed to generate quiz.");
    }
}
