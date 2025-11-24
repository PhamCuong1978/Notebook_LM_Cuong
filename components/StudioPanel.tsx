
import React, { useState, useEffect, useRef } from 'react';
import { 
    SpeakerWaveIcon, 
    VideoCameraIcon, 
    ShareIcon, 
    PresentationChartBarIcon, 
    RectangleGroupIcon, 
    QuestionMarkCircleIcon,
    SpinnerIcon,
    PlayIcon,
    PauseIcon,
    ArrowDownTrayIcon,
    ExclamationTriangleIcon,
    DocumentTextIcon
} from './Icons';
import type { Source, StudioHistoryItem } from '../types';

// --- Helper Functions ---

function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function pcmToWavBlob(base64Pcm: string, sampleRate: number = 24000, channels: number = 1): Blob {
    const pcmData = decode(base64Pcm);
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const pcmLength = pcmData.length;
    const totalLength = pcmLength + 36;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);

    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, totalLength, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, channels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, pcmLength, true);

    return new Blob([header, pcmData], { type: 'audio/wav' });
}


// --- Component Definitions ---

const StudioButton: React.FC<{
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
}> = ({ icon, label, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="flex flex-col items-center justify-center space-y-2 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg text-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <div className="w-8 h-8 flex items-center justify-center text-gray-500 dark:text-gray-400">{icon}</div>
    <span className="text-xs font-medium">{label}</span>
  </button>
);

const HistoryItemCard: React.FC<{
    item: StudioHistoryItem;
    onItemClick: (item: StudioHistoryItem) => void;
    onPlayPause: (item: StudioHistoryItem) => void;
    onDownload: (item: StudioHistoryItem) => void;
    isPlaying: boolean;
}> = ({ item, onItemClick, onPlayPause, onDownload, isPlaying }) => {
    let icon;
    if (item.type === 'audio') icon = <SpeakerWaveIcon />;
    else if (item.type === 'report') icon = <PresentationChartBarIcon />;
    else if (item.type === 'flashcards') icon = <RectangleGroupIcon />;
    else if (item.type === 'quiz') icon = <QuestionMarkCircleIcon />;
    else icon = <ShareIcon />;
    
    const renderContent = () => {
        switch (item.status) {
            case 'loading':
                return (
                    <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                        <SpinnerIcon />
                        <span>Đang tạo...</span>
                    </div>
                );
            case 'error':
                 return (
                    <div className="text-red-500 dark:text-red-400">
                        <p className="font-semibold">Lỗi!</p>
                        <p className="text-xs truncate" title={item.error}>{item.error}</p>
                    </div>
                );
            case 'completed':
                if (item.type === 'audio') {
                    return (
                        <div className="flex items-center space-x-2">
                           <button onClick={(e) => { e.stopPropagation(); onPlayPause(item); }} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600">
                                {isPlaying ? <PauseIcon /> : <PlayIcon />}
                           </button>
                           <button onClick={(e) => { e.stopPropagation(); onDownload(item); }} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600">
                                <ArrowDownTrayIcon />
                           </button>
                        </div>
                    );
                } else if (item.type === 'report' || item.type === 'mindmap' || item.type === 'flashcards' || item.type === 'quiz') {
                     return (
                        <div className="flex items-center space-x-2">
                             <button className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">
                                 Mở
                             </button>
                        </div>
                     )
                }
                return null;
        }
    };
    
    const isClickable = item.status === 'completed' && ['mindmap', 'report', 'flashcards', 'quiz'].includes(item.type);

    return (
        <div 
            onClick={() => isClickable && onItemClick(item)}
            className={`p-3 rounded-lg bg-gray-100 dark:bg-gray-700/50 ${isClickable ? 'cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700' : ''}`}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="flex-shrink-0 w-5 h-5 text-gray-500 dark:text-gray-400">
                      {item.status === 'error' ? <ExclamationTriangleIcon /> : icon}
                    </div>
                    <div className="flex-1 truncate">
                        <p className="text-sm font-semibold truncate">{item.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{item.sourceCount} nguồn &middot; {item.timestamp}</p>
                    </div>
                </div>
                <div className="flex-shrink-0 ml-2">{renderContent()}</div>
            </div>
        </div>
    );
};


// --- Main Panel Component ---

export const StudioPanel: React.FC<{ 
    sources: Source[];
    history: StudioHistoryItem[];
    onGenerateMindMap: () => void;
    onGenerateAudioSummary: () => void;
    onGenerateReport: () => void;
    onGenerateFlashcards: () => void;
    onGenerateQuiz: () => void;
    onOpenMindMap: (data: any) => void;
    onOpenReport: (htmlContent: string) => void;
    onOpenFlashcards: (data: any) => void;
    onOpenQuiz: (data: any) => void;
}> = ({ 
    sources, history, 
    onGenerateMindMap, onGenerateAudioSummary, onGenerateReport, onGenerateFlashcards, onGenerateQuiz,
    onOpenMindMap, onOpenReport, onOpenFlashcards, onOpenQuiz
}) => {
    const [playingHistoryId, setPlayingHistoryId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    const isGenerating = Array.isArray(history) && history.some(item => item.status === 'loading');
    const hasReadySources = sources.some(s => s.status === 'ready');
    const hasSources = sources.length > 0;
    
    const handlePlayPauseAudio = (item: StudioHistoryItem) => {
        if (!audioRef.current || !item.data) return;

        if (playingHistoryId === item.id) {
            audioRef.current.pause();
            setPlayingHistoryId(null);
        } else {
            const wavBlob = pcmToWavBlob(item.data);
            const audioUrl = URL.createObjectURL(wavBlob);
            audioRef.current.src = audioUrl;
            audioRef.current.play();
            setPlayingHistoryId(item.id);
        }
    };

    const handleDownloadAudio = (item: StudioHistoryItem) => {
        if (!item.data) return;
        const wavBlob = pcmToWavBlob(item.data);
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'audio-summary.wav';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    const handleItemClick = (item: StudioHistoryItem) => {
        if (item.status !== 'completed') return;
        
        switch (item.type) {
            case 'mindmap':
                onOpenMindMap(item.data);
                break;
            case 'report':
                onOpenReport(item.data);
                break;
            case 'flashcards':
                onOpenFlashcards(item.data);
                break;
            case 'quiz':
                onOpenQuiz(item.data);
                break;
        }
    };

    useEffect(() => {
        const audio = audioRef.current;
        const onEnded = () => setPlayingHistoryId(null);
        audio?.addEventListener('ended', onEnded);
        return () => audio?.removeEventListener('ended', onEnded);
    }, []);

  return (
    <aside className={`hidden md:flex w-80 flex-shrink-0 bg-white dark:bg-gray-800 p-4 border-l border-gray-200 dark:border-gray-700 flex-col ${!hasSources ? 'justify-center' : ''}`}>
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Studio</h2>
      </div>
      
      {!hasSources ? (
        <div className="text-center text-gray-500 dark:text-gray-400">
          <p>Thêm một nguồn để sử dụng các công cụ Studio.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StudioButton icon={<SpeakerWaveIcon />} label={"Tổng quan bằng âm thanh"} onClick={onGenerateAudioSummary} disabled={isGenerating || !hasReadySources} />
            <StudioButton icon={<VideoCameraIcon />} label="Tổng quan bằng video" disabled={true} />
            <StudioButton icon={<ShareIcon />} label={"Bản đồ tư duy"} onClick={onGenerateMindMap} disabled={isGenerating || !hasReadySources} />
            <StudioButton icon={<PresentationChartBarIcon />} label="Báo cáo" onClick={onGenerateReport} disabled={isGenerating || !hasReadySources}/>
            <StudioButton icon={<RectangleGroupIcon />} label="Thẻ ghi nhớ" onClick={onGenerateFlashcards} disabled={isGenerating || !hasReadySources}/>
            <StudioButton icon={<QuestionMarkCircleIcon />} label="Kiểm tra" onClick={onGenerateQuiz} disabled={isGenerating || !hasReadySources}/>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
            {(Array.isArray(history) ? history : []).map(item => (
                <HistoryItemCard 
                    key={item.id} 
                    item={item} 
                    onItemClick={handleItemClick}
                    onPlayPause={handlePlayPauseAudio} 
                    onDownload={handleDownloadAudio} 
                    isPlaying={playingHistoryId === item.id} 
                />
            ))}
          </div>
        </>
      )}
      <audio ref={audioRef} className="hidden" />
    </aside>
  );
};
