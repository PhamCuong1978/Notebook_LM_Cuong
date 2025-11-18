import React, { useState, useEffect } from 'react';
import type { Source } from '../types';
import { BookOpenIcon, SpinnerIcon, XMarkIcon, RectangleGroupIcon } from './Icons';

interface SourceViewerProps {
  source: Source | null;
  mobileViewerVisible: boolean;
  setMobileViewerVisible: (visible: boolean) => void;
  onClose?: () => void;
  onSummarize: (source: Source) => void;
  isSummarizing: boolean;
}

export const SourceViewer: React.FC<SourceViewerProps> = ({ source, mobileViewerVisible, setMobileViewerVisible, onClose, onSummarize, isSummarizing }) => {
  const [zoom, setZoom] = useState(1);
  
  useEffect(() => {
    // Reset zoom when source changes
    setZoom(1);
  }, [source]);

  const renderContent = () => {
    if (!source) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <BookOpenIcon />
            <p className="mt-2 text-center">Select a source to view its content.</p>
        </div>
      );
    }
    
    if (source.status === 'processing') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <SpinnerIcon />
            <p className="mt-2 text-center">Processing source...</p>
        </div>
      );
    }
    
    if (source.status === 'error') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-red-500 p-4">
            <span className="text-2xl">!</span>
            <p className="mt-2 text-center font-semibold">Error processing source</p>
            <p className="mt-1 text-xs text-center">{source.error}</p>
        </div>
      );
    }

    if (!source.content) return null;

    switch (source.content.type) {
      case 'text':
        return (
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm leading-relaxed p-3">
            {source.content.value}
          </p>
        );
      case 'image':
        return (
          <div className="flex justify-center items-center p-4 overflow-hidden h-full">
            <img 
              src={`data:${source.content.mimeType};base64,${source.content.data}`} 
              alt={source.name}
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={{ transform: `scale(${zoom})` }}
            />
          </div>
        );
      case 'pdf':
        return (
          <div className="space-y-4 p-2">
            {source.content.pages.map((pageData, index) => (
              <img 
                key={index} 
                src={`data:image/jpeg;base64,${pageData}`} 
                alt={`${source.name} - Page ${index + 1}`}
                className="w-full object-contain transition-transform duration-200 origin-top-left"
                style={{ transform: `scale(${zoom})` }}
              />
            ))}
          </div>
        );
      case 'audio':
        return (
            <div className="flex justify-center items-center p-4 h-full">
                <audio controls className="w-full" src={`data:${source.content.mimeType};base64,${source.content.data}`}>
                    Your browser does not support the audio element.
                </audio>
            </div>
        );
       case 'video':
        return (
            <div className="flex justify-center items-center p-4 h-full">
                <video controls className="max-w-full max-h-full" src={`data:${source.content.mimeType};base64,${source.content.data}`}>
                    Your browser does not support the video tag.
                </video>
            </div>
        );
      case 'website':
        return (
            <div className="p-4 h-full flex flex-col bg-gray-50 dark:bg-gray-900">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 flex-shrink-0">
                    Viewing: <a href={source.content.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{source.content.url}</a>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mb-4 border border-dashed p-2 rounded-md flex-shrink-0">
                    Note: Some websites may not display correctly in this frame due to their security settings.
                </p>
                <div className="flex-1 w-full h-full">
                    <iframe 
                        src={source.content.url} 
                        title={source.name} 
                        className="w-full h-full border border-gray-300 dark:border-gray-600 rounded-md bg-white"
                        sandbox="allow-scripts allow-same-origin"
                    ></iframe>
                </div>
            </div>
        );
       case 'youtube':
        return (
            <div className="p-4 h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="w-full max-w-2xl aspect-video">
                    <iframe 
                        src={source.content.embedUrl}
                        title={source.name} 
                        frameBorder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen
                        className="w-full h-full rounded-lg"
                    ></iframe>
                 </div>
            </div>
        );
      default:
        return null;
    }
  };
  
  const canZoom = source?.status === 'ready' && source.content && (source.content.type === 'image' || source.content.type === 'pdf');

  const viewerContent = (isMobile: boolean = false) => (
    <>
      <div className={`p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0 ${!source && 'hidden'}`}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-0 truncate flex-1" title={source?.name}>{source?.name}</h2>
            <div className="flex items-center space-x-2 ml-4">
                {source?.status === 'ready' && source.groundingText && (
                    <button
                        onClick={() => source && onSummarize(source)}
                        disabled={isSummarizing}
                        className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Tóm tắt nguồn này"
                    >
                        {isSummarizing ? <SpinnerIcon /> : <RectangleGroupIcon />}
                        <span>Tóm tắt</span>
                    </button>
                )}
                {canZoom && (
                    <div className="flex items-center space-x-2">
                        <button onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} className="px-2 py-1 text-lg rounded bg-gray-200 dark:bg-gray-700">-</button>
                        <span className="text-sm w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
                        <button onClick={() => setZoom(z => Math.min(20, z + 0.2))} className="px-2 py-1 text-lg rounded bg-gray-200 dark:bg-gray-700">+</button>
                    </div>
                )}
                {isMobile && (
                  <button onClick={() => setMobileViewerVisible(false)} className="ml-4 p-1 text-gray-500 dark:text-gray-400">
                      <XMarkIcon />
                  </button>
                )}
                {!isMobile && onClose && (
                  <button onClick={onClose} className="ml-4 p-1 text-gray-500 dark:text-gray-400">
                      <XMarkIcon />
                  </button>
                )}
            </div>
        </div>
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
        {renderContent()}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop/Tablet Viewer */}
      <aside className="lg:flex w-2/5 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex-col">
        {viewerContent(false)}
      </aside>
      
      {/* Mobile Viewer (Modal) */}
      <div className={`fixed inset-0 z-50 bg-white dark:bg-gray-800 flex-col md:hidden ${mobileViewerVisible ? 'flex' : 'hidden'}`}>
        {viewerContent(true)}
      </div>
    </>
  );
};
