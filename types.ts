
export type SourceStatus = 'ready' | 'processing' | 'error';

export type SourceContent =
  | { type: 'text'; value: string }
  | { type: 'image'; mimeType: string; data: string } // base64
  | { type: 'pdf'; data: string; pages: string[] } // pdf base64, page images base64
  | { type: 'audio'; mimeType: string; data: string } // base64
  | { type: 'video'; mimeType: string; data: string } // base64
  | { type: 'website'; url: string }
  | { type: 'youtube'; url: string; embedUrl: string };

export interface Source {
  id: string;
  name: string;
  originalType: string; // The original MIME type or a custom type like 'source/website'
  status: SourceStatus;
  progress?: number; // Optional progress percentage (0-100)
  content: SourceContent | null; // Null while processing
  groundingText: string | null; // Null while processing
  error?: string; // Optional error message
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
}

export interface Notebook {
  id: string;
  name: string;
  sources: Source[];
  chatHistory: ChatMessage[];
  studioHistory: StudioHistoryItem[];
}

export type StudioHistoryItem = {
  id: string;
  type: 'mindmap' | 'audio' | 'report' | 'flashcards' | 'quiz';
  status: 'loading' | 'completed' | 'error';
  name: string;
  timestamp: string;
  sourceCount: number;
  data?: any; // Mermaid code for mindmap, base64 audio data for audio, HTML string for report, JSON for flashcards/quiz
  error?: string;
};