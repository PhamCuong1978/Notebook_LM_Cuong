
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { Source, SourceContent, ChatMessage } from '../types';

declare const pdfjsLib: any;
declare const XLSX: any;

// Log warning if API key is missing (helps debugging in Vercel logs)
if (!process.env.API_KEY) {
    console.error("CRITICAL ERROR: process.env.API_KEY is missing. Please check Vercel Env Vars.");
}

// Use a getter to always use the latest API key from process.env
const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
// Switching to flash for better stability and availability on standard tiers
const model = 'gemini-2.5-flash'; 

// --- DeepSeek Integration ---

async function callDeepSeek(messages: { role: string; content: string }[], jsonMode: boolean = false): Promise<string> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        throw new Error("DeepSeek API Key not configured.");
    }

    try {
        console.log("Falling back to DeepSeek API...");
        const response = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: messages,
                stream: false,
                response_format: jsonMode ? { type: "json_object" } : { type: "text" }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DeepSeek API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error("DeepSeek Call Failed:", error);
        throw error;
    }
}

// --- Helper Functions ---

async function callWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        const msg = error.message || '';
        const isQuotaError = error.status === 429 || error.code === 429 || 
                             msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
        
        if (retries > 0 && isQuotaError) {
            console.warn(`Gemini API quota exceeded, retrying in ${delay}ms... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return callWithRetry(fn, retries - 1, delay * 2); // Exponential backoff
        }
        throw error;
    }
}

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
        const result = await callWithRetry(() => getAi().models.generateContent({
            model: model,
            contents: { parts: [{text: prompt}, ...parts] },
        }));
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
        const result = await callWithRetry(() => getAi().models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            }
        }));
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
        
        // Handle DOCX/XLSX text extraction logic
        let groundingText = '';
        try {
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            onProgress(60);
            
            workbook.SheetNames.forEach((sheetName: string) => {
                groundingText += `--- Sheet: ${sheetName} ---\n\n`;
                const worksheet = workbook.Sheets[sheetName];
                const csv = XLSX.utils.sheet_to_csv(worksheet);
                groundingText += csv + '\n\n';
            });
            groundingText = groundingText.trim();
        } catch (e) {
             console.warn("XLSX read failed, attempting naive extraction or empty", e);
             groundingText = "Could not extract structured text from this document. Please refer to original file.";
        }

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


export async function generateGroundedResponse(sources: Source[], question: string, chatHistory: ChatMessage[] = []): Promise<string> {
    const sourcePreamble = sources
        .filter(s => s.status === 'ready' && s.groundingText)
        .map((source, index) => {
            return `--- SOURCE ${index + 1}: ${source.name} ---\n${source.groundingText}`;
        }).join('\n\n');

    if (!sourcePreamble) {
        return "There are no valid sources to answer the question from. Please add and process some sources first.";
    }

    // Include recent chat context (last 5 messages) for conversational awareness
    const recentContext = chatHistory.slice(-5)
        .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join('\n');

    const systemPrompt = `You are an expert research assistant. You have access to ${sources.length} source file(s).
Your task is to answer the user's question based ONLY on the provided sources. Do not use any external knowledge.

INSTRUCTIONS:
1. Read ALL sources carefully.
2. If the user is asking to adjust or clarify a previous answer, use the Conversation Context.
3. Cite your sources using brackets like [1].`;

    const fullPrompt = `
Conversation Context:
${recentContext}

Here are the sources:

${sourcePreamble}

--- END OF SOURCES ---

User's Question: ${question}
`;

    try {
        const response = await callWithRetry(() => getAi().models.generateContent({
            model: model,
            contents: systemPrompt + "\n" + fullPrompt,
        }));
        return response.text;
    } catch (error: any) {
        console.error("Gemini failed:", error);
        // Fallback to DeepSeek if configured and error is Quota related or general failure
        if (process.env.DEEPSEEK_API_KEY) {
            try {
                return await callDeepSeek([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: fullPrompt }
                ]);
            } catch (dsError) {
                 console.error("DeepSeek also failed:", dsError);
            }
        }
        
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
        const result = await callWithRetry(() => getAi().models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            }
        }));
        const jsonText = result.text.trim();
        return JSON.parse(jsonText);
    } catch (error: any) {
        console.error("Gemini Mindmap failed:", error);
        // Fallback to DeepSeek
         if (process.env.DEEPSEEK_API_KEY) {
            try {
                const dsResult = await callDeepSeek([
                    { role: 'system', content: "You are a JSON generator." },
                    { role: 'user', content: prompt + "\nEnsure output is pure JSON." }
                ], true);
                
                // DeepSeek might return markdown json block
                const cleaned = dsResult.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '');
                return JSON.parse(cleaned);
            } catch (dsError) {
                 console.error("DeepSeek Mindmap failed:", dsError);
            }
        }
        throw new Error(error.message || "The AI model failed to generate the mind map JSON.");
    }
}

export async function generateAudioSummary(sources: Source[]): Promise<string> {
    // ... Existing implementation (DeepSeek cannot do TTS) ...
    // Using simple retry logic inside extract logic, but TTS requires Gemini
    const sourcePreamble = sources
        .filter(s => s.status === 'ready' && s.groundingText)
        .map((source, index) => `--- SOURCE ${index + 1}: ${source.name} ---\n${source.groundingText}`)
        .join('\n\n');

    if (!sourcePreamble) {
        throw new Error("No valid sources provided for audio summary generation.");
    }

    const summaryPrompt = `
        Summarize the key information from the following sources into a concise, well-structured paragraph in Vietnamese.
        The summary should be suitable for being read aloud as an audio overview.
        Respond ONLY with the Vietnamese summary.

        Here are the sources:
        ${sourcePreamble}
        --- END OF SOURCES ---
    `;
    
    let summaryText = "";
    try {
        const summaryResponse = await callWithRetry(() => getAi().models.generateContent({
            model: model,
            contents: summaryPrompt,
        }));
        summaryText = summaryResponse.text;
    } catch (error) {
        // Fallback to DeepSeek for the TEXT summary part
        if (process.env.DEEPSEEK_API_KEY) {
             summaryText = await callDeepSeek([
                { role: 'user', content: summaryPrompt }
            ]);
        } else {
            throw error;
        }
    }

    try {
        // TTS Step (Gemini Exclusive)
        const ttsResponse = await callWithRetry(() => getAi().models.generateContent({
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
        }));

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

export async function generateFinancialReport(sources: Source[], chatHistory: ChatMessage[] = []): Promise<string> {
    const sourcePreamble = sources
        .filter(s => s.status === 'ready' && s.groundingText)
        .map((source, index) => `--- SOURCE ${index + 1}: ${source.name} ---\n${source.groundingText}`)
        .join('\n\n');

    if (!sourcePreamble) {
        throw new Error("No valid sources provided for financial report generation.");
    }

    const chatContext = chatHistory
        .map(msg => `${msg.role === 'user' ? 'USER' : 'AI'}: ${msg.content}`)
        .join('\n');

    const systemPrompt = `You are a professional financial analyst. Your task is to compile a "BC_SmeFund" (Financial Summary Report) in Vietnamese based on the provided source documents.`;
    
    const prompt = `
    ${systemPrompt}
    
    **INPUT CONTEXT:**
    - **Total Source Files:** ${sources.length} files. You MUST review EVERY file provided below.
    - **Chat History:** Contains user instructions. You MUST obey these instructions.

    **USER ADJUSTMENT INSTRUCTIONS (HIGHEST PRIORITY):**
    The "USER CHAT NOTES" section below contains specific adjustments or corrections requested by the user.
    **RULE:** If the User Chat Notes contradict the Source Files, the User Chat Notes WIN.

    **DATA EXTRACTION RULES:**
    1. **Company Info**: Extract from the header/legal info.
    2. **Balance Sheet**: Identify Reporting Year (X). "Số đầu năm" = [X-1], "Số cuối năm" = [X].
    3. **Income Statement**: "Năm trước" = [X-1], "Năm nay" = [X]. **Create a "Tổng cộng" column summing all years.**
    4. **Quarterly Revenue**: Look for VAT Declarations.
    5. **Bank Loans**: Search for loan contracts.
    6. **Additional Info**: Incorporate points from "USER CHAT NOTES".

    FORMATTING:
    - Use the HTML/CSS template below EXACTLY.
    - Do not markdown format the output (no \`\`\`html wrapper).
    - Use Vietnamese for all content.

    TEMPLATE:
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BC_SmeFund</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; color: #333; }
            h1, h2 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 10px; }
            th { background-color: #f2f2f2; text-align: center; }
            td { text-align: right; }
            .text-left { text-align: left; }
            .company-info { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .highlight { background-color: #e8f4fc; font-weight: bold; }
            .section { margin-bottom: 40px; }
            .total-column { background-color: #f0f8ff; font-weight: bold; }
            .year-2025 { background-color: #fff8e1; }
            .company-details { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px; }
            .company-details div { margin-bottom: 8px; }
            .bank-loans { background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .additional-info { background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .additional-info ul { margin: 0; padding-left: 20px; }
            .additional-info li { margin-bottom: 8px; }
        </style>
    </head>
    <body>
        <h1>BC_SmeFund - Tổng Hợp Báo Cáo Tài Chính</h1>
        
        <div class="company-info">
            <h2>Thông tin Doanh nghiệp</h2>
            <div class="company-details">
                <!-- Fill details -->
            </div>
        </div>

        <div class="section">
            <h2>Bảng Cân Đối Kế Toán (Đơn vị: VNĐ)</h2>
            <table>
                <thead>
                    <tr>
                        <th class="text-left">Chỉ tiêu</th>
                        <!-- Generate YEAR columns -->
                    </tr>
                </thead>
                <tbody>
                    <!-- Fill Balance Sheet Data -->
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>Báo Cáo Kết Quả Hoạt Động Kinh Doanh (Đơn vị: VNĐ)</h2>
            <table>
                <thead>
                    <tr>
                        <th class="text-left">Chỉ tiêu</th>
                        <!-- Generate YEAR columns -->
                        <th class="total-column">Tổng cộng</th>
                    </tr>
                </thead>
                <tbody>
                     <!-- Fill Income Statement Data -->
                </tbody>
            </table>
        </div>

         <div class="section">
            <h2>Phân Tích Doanh Thu Theo Quý (Năm gần nhất/Tờ khai thuế)</h2>
            <table>
                <thead>
                    <tr>
                        <th class="text-left">Quý</th>
                        <th>Doanh thu (VNĐ)</th>
                        <th>Tỷ trọng (%)</th>
                    </tr>
                </thead>
                <tbody>
                    <!-- Fill VAT Data -->
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>Dư Nợ Ngân Hàng Đến Thời Điểm Hiện Tại</h2>
            <div class="bank-loans">
                <table>
                    <thead>
                        <tr>
                            <th>STT</th>
                            <th class="text-left">Tên ngân hàng</th>
                            <th>Số tiền (VNĐ)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Fill Loan Data -->
                    </tbody>
                </table>
            </div>
        </div>

        <div class="section">
            <h2>Thông Tin Bổ Sung</h2>
            <div class="additional-info">
                <ul>
                    <!-- User notes -->
                </ul>
            </div>
        </div>
    </body>
    </html>

    Respond with the valid HTML code only.

    USER CHAT NOTES:
    ${chatContext}

    Here are the ${sources.length} sources:
    ${sourcePreamble}
    --- END OF SOURCES ---
    `;

    try {
        const result = await callWithRetry(() => getAi().models.generateContent({
            model: model,
            contents: prompt,
            config: {
                thinkingConfig: { thinkingBudget: 4096 }, 
            }
        }));
        
        let htmlContent = result.text.trim();
        if (htmlContent.startsWith("```html")) {
            htmlContent = htmlContent.replace(/^```html/, "").replace(/```$/, "");
        } else if (htmlContent.startsWith("```")) {
            htmlContent = htmlContent.replace(/^```/, "").replace(/```$/, "");
        }
        return htmlContent;
    } catch (error: any) {
        console.error("Gemini Report failed:", error);
         // Fallback to DeepSeek
         if (process.env.DEEPSEEK_API_KEY) {
            try {
                const dsResult = await callDeepSeek([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ]);
                let cleaned = dsResult.trim();
                if (cleaned.startsWith("```html")) {
                    cleaned = cleaned.replace(/^```html/, "").replace(/```$/, "");
                } else if (cleaned.startsWith("```")) {
                    cleaned = cleaned.replace(/^```/, "").replace(/```$/, "");
                }
                return cleaned;
            } catch (dsError) {
                 console.error("DeepSeek Report failed:", dsError);
            }
        }
        throw new Error(error.message || "The AI model failed to generate the financial report.");
    }
}

export async function generateNotebookName(groundingTexts: string[]): Promise<string> {
    if (groundingTexts.length === 0) {
        return "Sổ ghi chú mới";
    }

    const combinedText = groundingTexts.join('\n\n').substring(0, 15000);

    const prompt = `
    Dựa trên nội dung sau, hãy đề xuất một tiêu đề ngắn gọn (từ 3 đến 8 từ) bằng tiếng Việt cho một sổ ghi chú.
    Chỉ trả lời bằng tiêu đề, không thêm bất kỳ lời giải thích hay dấu ngoặc kép nào.

    Nội dung:
    ${combinedText}
    `;

    try {
        const result = await callWithRetry(() => getAi().models.generateContent({
            model: model,
            contents: prompt,
        }));
        return result.text.trim().replace(/"/g, ''); 
    } catch (error) {
         // Fallback to DeepSeek
         if (process.env.DEEPSEEK_API_KEY) {
            try {
                const dsResult = await callDeepSeek([{ role: 'user', content: prompt }]);
                return dsResult.trim().replace(/"/g, '');
            } catch (e) {
                 console.error(e);
            }
        }
        return "Sổ ghi chú chưa có tên"; 
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
        const result = await callWithRetry(() => getAi().models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: null as any, 
            }
        }));
        return result.text;
    } catch (error: any) {
        console.error("Gemini Summary failed:", error);
         // Fallback to DeepSeek
         if (process.env.DEEPSEEK_API_KEY) {
            try {
                return await callDeepSeek([{ role: 'user', content: prompt }]);
            } catch (e) { console.error(e); }
        }
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
        const result = await callWithRetry(() => getAi().models.generateContent({
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
        }));
        const jsonText = result.text.trim();
        return JSON.parse(jsonText);
    } catch (error: any) {
        console.error("Gemini Flashcards failed:", error);
        // Fallback to DeepSeek
         if (process.env.DEEPSEEK_API_KEY) {
            try {
                 const dsResult = await callDeepSeek([
                    { role: 'system', content: "You are a JSON generator." },
                    { role: 'user', content: prompt + "\nRespond with valid JSON only." }
                ], true);
                
                let cleaned = dsResult.trim();
                // Clean markdown code blocks if present
                if (cleaned.startsWith('```json')) {
                    cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '');
                } else if (cleaned.startsWith('```')) {
                     cleaned = cleaned.replace(/^```/, '').replace(/```$/, '');
                }
                return JSON.parse(cleaned);
            } catch (e) { console.error(e); }
        }
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
        const result = await callWithRetry(() => getAi().models.generateContent({
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
        }));
        const jsonText = result.text.trim();
        return JSON.parse(jsonText);
    } catch (error: any) {
        console.error("Gemini Quiz failed:", error);
         // Fallback to DeepSeek
         if (process.env.DEEPSEEK_API_KEY) {
            try {
                 const dsResult = await callDeepSeek([
                    { role: 'system', content: "You are a JSON generator." },
                    { role: 'user', content: prompt + "\nRespond with valid JSON only." }
                ], true);
                
                let cleaned = dsResult.trim();
                 if (cleaned.startsWith('```json')) {
                    cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '');
                } else if (cleaned.startsWith('```')) {
                     cleaned = cleaned.replace(/^```/, '').replace(/```$/, '');
                }
                return JSON.parse(cleaned);
            } catch (e) { console.error(e); }
        }
        throw new Error(error.message || "Failed to generate quiz.");
    }
}

export async function generateVideoScript(sources: Source[]): Promise<string> {
    // ... video script logic ...
     const sourcePreamble = sources
        .filter(s => s.status === 'ready' && s.groundingText)
        .map((source, index) => `--- SOURCE ${index + 1}: ${source.name} ---\n${source.groundingText}`)
        .join('\n\n');

    if (!sourcePreamble) {
        throw new Error("No valid sources provided for video script generation.");
    }

    const prompt = `
    Create a prompt for a video generation model (like Veo) based on the key themes of these sources.
    The goal is to generate a short, engaging video summary or visual representation of the content.
    
    Describe the visual style, the key scene to be generated, the mood, and lighting.
    Use terms like "photorealistic", "8k", "cinematic lighting", "high details".
    Keep the prompt under 100 words.
    Language: English.

    Here are the sources:
    ${sourcePreamble}
    --- END OF SOURCES ---
    `;

    try {
        const result = await callWithRetry(() => getAi().models.generateContent({
            model: model,
            contents: prompt,
        }));
        return result.text.trim();
    } catch (error: any) {
        console.error("Error generating video script:", error);
         // Fallback to DeepSeek
         if (process.env.DEEPSEEK_API_KEY) {
            try {
                return await callDeepSeek([{ role: 'user', content: prompt }]);
            } catch (e) { console.error(e); }
        }
        throw new Error(error.message || "Failed to generate video script.");
    }
}

export async function generateVideo(prompt: string): Promise<string> {
    // Always use getAi() to ensure we use the latest API key
    // Note: Video Generation is Gemini/Veo exclusive. DeepSeek cannot do this.
    const localAi = getAi();

    try {
        let operation = await localAi.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: {
                numberOfVideos: 1,
                resolution: '1080p',
                aspectRatio: '16:9'
            }
        });

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5s polling
            operation = await localAi.operations.getVideosOperation({ operation: operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) throw new Error("No video URI returned from Veo.");

        // Fetch the video bytes securely
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        if (!response.ok) throw new Error("Failed to download generated video.");
        
        const blob = await response.blob();
        // Reuse the fileToBase64 logic by creating a File object
        const file = new File([blob], "generated_video.mp4", { type: "video/mp4" });
        return await fileToBase64(file);

    } catch (error: any) {
        console.error("Error generating video with Veo:", error);
        throw new Error(error.message || "Failed to generate video.");
    }
}
