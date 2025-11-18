import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, Source, Notebook } from '../types';
import { SendIcon, UserIcon, SparklesIcon, Bars3Icon, BookOpenIcon, MicrophoneIcon, NotebookIcon } from './Icons';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  onSelectSource: (source: Source) => void;
  sources: Source[];
  activeNotebook: Notebook | null;
  setMobileSourcesVisible: (visible: boolean) => void;
  setMobileViewerVisible: (visible: boolean) => void;
  selectedSource: Source | null;
}

const ChatBubble: React.FC<{ message: ChatMessage; onSelectSource: (source: Source) => void; sources: Source[] }> = ({ message, onSelectSource, sources }) => {
  const isModel = message.role === 'model';
  const readySources = sources.filter(s => s.status === 'ready');

  const renderContent = () => {
    const parts = message.content.split(/(\[\d+\])/g);
    return parts.map((part, index) => {
      const match = part.match(/\[(\d+)\]/);
      if (match) {
        const sourceIndex = parseInt(match[1], 10) - 1;
        if (sourceIndex >= 0 && sourceIndex < readySources.length) {
          return (
            <button
              key={index}
              onClick={() => onSelectSource(readySources[sourceIndex])}
              className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 font-bold w-6 h-6 rounded-full text-xs mx-1 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500"
              title={`View Source: ${readySources[sourceIndex].name}`}
            >
              {sourceIndex + 1}
            </button>
          );
        }
      }
      return <span key={index}>{part}</span>;
    });
  };
  
  return (
    <div className={`flex items-start gap-4 ${isModel ? '' : 'flex-row-reverse'}`}>
      <div className={`rounded-full p-2 ${isModel ? 'bg-blue-500 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200'}`}>
        {isModel ? <SparklesIcon /> : <UserIcon />}
      </div>
      <div className={`p-4 rounded-lg max-w-xl ${isModel ? 'bg-white dark:bg-gray-800' : 'bg-blue-500 text-white'}`}>
        <div className="whitespace-pre-wrap leading-relaxed">{renderContent()}</div>
      </div>
    </div>
  );
};

const LoadingBubble: React.FC = () => (
    <div className="flex items-start gap-4">
        <div className="rounded-full p-2 bg-blue-500 text-white">
            <SparklesIcon />
        </div>
        <div className="p-4 rounded-lg max-w-xl bg-white dark:bg-gray-800 flex items-center space-x-2">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
        </div>
    </div>
);

const MobileChatHeader: React.FC<{
    setMobileSourcesVisible: (visible: boolean) => void;
    setMobileViewerVisible: (visible: boolean) => void;
    selectedSource: Source | null;
    activeNotebook: Notebook | null;
}> = ({ setMobileSourcesVisible, setMobileViewerVisible, selectedSource, activeNotebook }) => {
    return (
        <header className="md:hidden flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-10">
            <button onClick={() => setMobileSourcesVisible(true)} className="p-2 text-gray-600 dark:text-gray-300">
                <Bars3Icon />
            </button>
            <h1 className="text-md font-semibold truncate px-2">
                {activeNotebook ? activeNotebook.name : "NotebookLM Clone"}
            </h1>
            <button
                onClick={() => setMobileViewerVisible(true)}
                disabled={!selectedSource}
                className="p-2 text-gray-600 dark:text-gray-300 disabled:opacity-25 disabled:cursor-not-allowed"
                title="View selected source"
            >
                <BookOpenIcon />
            </button>
        </header>
    );
};

const WelcomePanel: React.FC = () => (
    <div className="m-auto flex flex-col items-center justify-center text-center p-8">
        <NotebookIcon />
        <h2 className="mt-4 text-2xl font-semibold text-gray-800 dark:text-gray-200">Chào mừng bạn đến với Sổ ghi chú</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
            Tạo một sổ ghi chú mới từ các tệp của bạn hoặc chọn một sổ đã có để bắt đầu.
        </p>
    </div>
);


export const ChatPanel: React.FC<ChatPanelProps> = ({ messages, onSendMessage, isLoading, onSelectSource, sources, activeNotebook, setMobileSourcesVisible, setMobileViewerVisible, selectedSource }) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);

  const hasSources = sources.some(s => s.status === 'ready');

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsSpeechSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'vi-VN'; // Set to Vietnamese

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages, isLoading]);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend();
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
    <main className="flex-1 flex flex-col bg-gray-100 dark:bg-gray-900 overflow-hidden">
      <MobileChatHeader
          setMobileSourcesVisible={setMobileSourcesVisible}
          setMobileViewerVisible={setMobileViewerVisible}
          selectedSource={selectedSource}
          activeNotebook={activeNotebook}
      />
      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        {!activeNotebook ? (
            <WelcomePanel />
        ) : (
            <>
                {messages.map((msg) => (
                    <ChatBubble key={msg.id} message={msg} onSelectSource={onSelectSource} sources={sources} />
                ))}
                {isLoading && <LoadingBubble />}
            </>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 px-4 pb-4 bg-gray-100 dark:bg-gray-900">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={!activeNotebook ? "Vui lòng tạo hoặc chọn một sổ ghi chú" : (isListening ? "Đang nghe..." : (hasSources ? "Hỏi một câu về các nguồn của bạn..." : "Vui lòng thêm một nguồn để bắt đầu"))}
            className="w-full pl-4 pr-24 py-3 border border-gray-300 dark:border-gray-600 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading || !hasSources || !activeNotebook}
          />
           {isSpeechSupported && (
            <button
              onClick={handleToggleListening}
              disabled={isLoading || !hasSources || !activeNotebook}
              className={`absolute right-12 top-1/2 -translate-y-1/2 p-2 rounded-full transition-colors ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              title={isListening ? 'Dừng nghe' : 'Sử dụng micro'}
            >
              <MicrophoneIcon />
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim() || !hasSources || !activeNotebook}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </main>
  );
};
