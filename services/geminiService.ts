import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { Source, SourceContent } from '../types';

declare const pdfjsLib: any;
declare const XLSX: any;

// Use process.env.API_KEY exclusively as per guidelines.
const apiKey = process.env.API_KEY;

if (!apiKey) {
  console.error("API Key is missing. Please check your .env file.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });
const model = 'gemini-2.5-pro';
const flashModel = 'gemini-2.5-flash';

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
    } catch (error) {
        console.error("Error generating response from Gemini API:", error);
        return "Sorry, I encountered an error while processing your request. Please check the console for details.";
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
    } catch (error) {
        console.error("Error generating mind map from Gemini API:", error);
        throw new Error("The AI model failed to generate the mind map JSON.");
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
    } catch (error) {
        console.error("Error generating summary from Gemini API:", error);
        throw new Error("The AI model failed to generate the summary.");
    }
}