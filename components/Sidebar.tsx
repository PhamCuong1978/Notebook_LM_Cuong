import React, { useState, useRef } from 'react';
import type { Source, Notebook } from '../types';
import { BookOpenIcon, PencilIcon, DocumentArrowUpIcon, SpinnerIcon, PhotoIcon, DocumentTextIcon, DocumentIcon, TableCellsIcon, SpeakerWaveIcon, VideoCameraIcon, XMarkIcon, GlobeAltIcon, YoutubeIcon, TrashIcon, ArrowPathIcon, ChevronDownIcon, PlusCircleIcon, NotebookIcon } from './Icons';

interface SidebarProps {
  notebooks: Notebook[];
  activeNotebookId: string | null;
  onSelectNotebook: (id: string) => void;
  onNewNotebook: (files: FileList) => void;
  onDeleteNotebook: (id: string) => void;
  
  sources: Source[]; // Sources of the active notebook
  onUpdateSource: (id: string, name: string) => void;
  onSelectSource: (source: Source) => void;
  selectedSource: Source | null;
  onAddFiles: (files: FileList) => void;
  onAddWebSource: (url: string) => void;
  onDeleteSource: (id: string) => void;
  
  mobileSourcesVisible: boolean;
  setMobileSourcesVisible: (visible: boolean) => void;
}

const AddWebSourceModal: React.FC<{
  onClose: () => void;
  onAdd: (url: string) => void;
}> = ({ onClose, onAdd }) => {
  const [url, setUrl] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    const trimmedUrl = newUrl.trim();

    if (!trimmedUrl) {
      setError(null);
      setIsValid(false);
      return;
    }

    try {
      const urlObject = new URL(trimmedUrl);
      
      if (urlObject.protocol !== 'http:' && urlObject.protocol !== 'https:') {
        setError('URL must start with http:// or https://');
        setIsValid(false);
      } else if (!urlObject.hostname || (!urlObject.hostname.includes('.') && urlObject.hostname !== 'localhost')) {
        setError('Please enter a valid domain name.');
        setIsValid(false);
      } else {
        setError(null);
        setIsValid(true);
      }
    } catch (_) {
      if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://') && trimmedUrl.includes('.')) {
          setError('A full URL is required (e.g., https://example.com)');
      } else {
          setError('Please enter a valid URL format.');
      }
      setIsValid(false);
    }
  };

  const handleAdd = () => {
    if (isValid) {
      onAdd(url.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Thêm Nguồn từ Web</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Nhập URL của một trang web hoặc video YouTube.</p>
        <input
          type="url"
          value={url}
          onChange={handleUrlChange}
          placeholder="https://example.com"
          className={`w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
          aria-invalid={!!error}
          aria-describedby="url-error"
        />
        {error && <p id="url-error" className="text-red-500 text-xs mt-1">{error}</p>}
        <div className="flex justify-end space-x-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">Hủy</button>
          <button onClick={handleAdd} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed" disabled={!isValid}>Thêm Nguồn</button>
        </div>
      </div>
    </div>
  );
};

const EditSourceModal: React.FC<{
  source: Source;
  onClose: () => void;
  onUpdateSource: (id: string, name: string) => void;
}> = ({ source, onClose, onUpdateSource }) => {
  const [name, setName] = useState(source.name);

  const handleUpdate = () => {
    if (name.trim()) {
      onUpdateSource(source.id, name);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Chỉnh sửa Tên Nguồn</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md mb-4 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
        />
        <div className="flex justify-end space-x-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">Hủy</button>
          <button onClick={handleUpdate} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300" disabled={!name.trim()}>Lưu thay đổi</button>
        </div>
      </div>
    </div>
  );
};

const SourceIcon: React.FC<{source: Source}> = ({source}) => {
    const type = source.originalType;
    if (type.startsWith('image/')) return <PhotoIcon />;
    if (type === 'application/pdf') return <DocumentTextIcon />;
    if (type.startsWith('audio/')) return <SpeakerWaveIcon />;
    if (type.startsWith('video/')) return <VideoCameraIcon />;
    if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return <DocumentIcon />;
    if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return <TableCellsIcon />;
    if (type === 'source/website') return <GlobeAltIcon />;
    if (type === 'source/youtube') return <YoutubeIcon />;
    return <BookOpenIcon />;
}

const NotebookSelector: React.FC<{
    notebooks: Notebook[];
    activeNotebookId: string | null;
    onSelectNotebook: (id: string) => void;
    onDeleteNotebook: (id: string) => void;
}> = ({ notebooks, activeNotebookId, onSelectNotebook, onDeleteNotebook }) => {
    const [isOpen, setIsOpen] = useState(false);
    const activeNotebook = notebooks.find(n => n.id === activeNotebookId);

    if (notebooks.length === 0) {
        return <div className="p-2 text-center text-sm text-gray-500 dark:text-gray-400">Chưa có sổ ghi chú nào.</div>;
    }

    return (
        <div className="relative">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600">
                <span className="truncate font-semibold">{activeNotebook?.name || 'Chọn sổ ghi chú'}</span>
                <ChevronDownIcon />
            </button>
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg z-20 border border-gray-200 dark:border-gray-700">
                    <ul className="max-h-60 overflow-y-auto">
                        {notebooks.map(notebook => (
                            <li key={notebook.id}>
                                <button onClick={() => { onSelectNotebook(notebook.id); setIsOpen(false); }} className={`w-full text-left px-3 py-2 text-sm truncate ${activeNotebookId === notebook.id ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                                    {notebook.name}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export const Sidebar: React.FC<SidebarProps> = (props) => {
  const { 
      notebooks, activeNotebookId, onSelectNotebook, onNewNotebook, onDeleteNotebook,
      sources, onUpdateSource, onSelectSource, selectedSource, onAddFiles, onAddWebSource, 
      onDeleteSource, mobileSourcesVisible, setMobileSourcesVisible
  } = props;
  
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [isWebSourceModalOpen, setIsWebSourceModalOpen] = useState(false);
  
  const newNotebookFileInputRef = useRef<HTMLInputElement>(null);
  const addSourceFileInputRef = useRef<HTMLInputElement>(null);

  const handleNewNotebookClick = () => newNotebookFileInputRef.current?.click();
  const handleAddSourceClick = () => addSourceFileInputRef.current?.click();

  const handleNewNotebookFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) onNewNotebook(event.target.files);
    if (event.target) event.target.value = '';
  };
  
  const handleAddSourceFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) onAddFiles(event.target.files);
    if (event.target) event.target.value = '';
  };
  
  const handleDeleteActiveNotebook = () => {
      if (activeNotebookId && window.confirm("Bạn có chắc chắn muốn xóa sổ ghi chú này không? Hành động này không thể hoàn tác.")) {
          onDeleteNotebook(activeNotebookId);
      }
  };

  const acceptedFileTypes = ".json, .pdf, .png, .jpg, .jpeg, .txt, .doc, .docx, .xls, .xlsx, .mp3, .wav, .m4a, audio/*, .mp4, .mov, video/*";

  return (
    <>
      <aside className={`w-full md:w-80 flex-shrink-0 bg-white dark:bg-gray-800 p-4 border-r border-gray-200 dark:border-gray-700 flex flex-col absolute inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${mobileSourcesVisible ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div className="flex items-center space-x-2 text-lg font-semibold text-gray-900 dark:text-white">
                <NotebookIcon />
                <h1>Sổ ghi chú</h1>
            </div>
            <button onClick={() => setMobileSourcesVisible(false)} className="md:hidden p-1 text-gray-500 dark:text-gray-400">
                <XMarkIcon />
            </button>
        </div>
        
        {/* Notebook Management */}
        <div className="space-y-2 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <button onClick={handleNewNotebookClick} className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                <PlusCircleIcon />
                <span>Sổ ghi chú mới</span>
            </button>
            <input type="file" ref={newNotebookFileInputRef} onChange={handleNewNotebookFileChange} className="hidden" multiple accept={acceptedFileTypes} />
            
            <div className="flex items-center space-x-2">
                <div className="flex-1">
                   <NotebookSelector notebooks={notebooks} activeNotebookId={activeNotebookId} onSelectNotebook={onSelectNotebook} onDeleteNotebook={onDeleteNotebook} />
                </div>
                <button onClick={handleDeleteActiveNotebook} disabled={!activeNotebookId} title="Xóa sổ ghi chú hiện tại" className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md disabled:opacity-30 disabled:cursor-not-allowed">
                    <TrashIcon />
                </button>
            </div>
        </div>

        {/* Source Management */}
        <div className={`flex-1 flex flex-col overflow-y-hidden ${!activeNotebookId ? 'opacity-40' : ''}`}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Nguồn</h2>
            <div className="space-y-2 mb-4">
                <button onClick={handleAddSourceClick} disabled={!activeNotebookId} className="w-full flex items-center justify-center space-x-2 px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-green-500 hover:text-green-500 transition-colors disabled:cursor-not-allowed">
                    <DocumentArrowUpIcon />
                    <span>Thêm Tệp</span>
                </button>
                <button onClick={() => setIsWebSourceModalOpen(true)} disabled={!activeNotebookId} className="w-full flex items-center justify-center space-x-2 px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-blue-500 hover:text-blue-500 transition-colors disabled:cursor-not-allowed">
                    <GlobeAltIcon />
                    <span>Thêm từ Web</span>
                </button>
                <input type="file" ref={addSourceFileInputRef} onChange={handleAddSourceFileChange} className="hidden" multiple accept={acceptedFileTypes} />
            </div>
            <ul className="space-y-2 overflow-y-auto">
                {sources.map((source, index) => (
                    <li key={source.id} className="group" title={source.name}>
                        {source.status === 'processing' ? (
                            <div className="p-2 text-gray-700 dark:text-gray-300 space-y-1">
                                <div className="flex items-center space-x-3">
                                <SpinnerIcon />
                                <span className="truncate flex-1 text-sm">{source.name}</span>
                                <button onClick={() => onDeleteSource(source.id)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"><TrashIcon /></button>
                                <span className="text-xs font-mono font-semibold">{source.progress || 0}%</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5"><div className="bg-blue-600 h-1.5 rounded-full transition-width duration-300 ease-linear" style={{ width: `${source.progress || 0}%` }}></div></div>
                            </div>
                        ) : source.status === 'error' ? (
                            <div className="p-2 rounded-md bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-500/30">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
                                        <span className="font-bold text-lg leading-none">!</span>
                                        <span className="truncate flex-1 text-sm font-semibold">{source.name}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button onClick={() => onDeleteSource(source.id)} title="Xóa" className="p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30"><TrashIcon /></button>
                                    </div>
                                </div>
                                <p className="text-xs text-red-500 dark:text-red-400/80 mt-1 ml-7 truncate" title={source.error}>{source.error}</p>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between">
                                <button onClick={() => { onSelectSource(source); setMobileSourcesVisible(false); }} className={`flex-grow text-left flex items-center space-x-3 p-2 rounded-md transition-colors w-full ${selectedSource?.id === source.id ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                                <span className="font-semibold text-gray-500 dark:text-gray-400 w-5 text-center flex-shrink-0">{index + 1}</span>
                                <SourceIcon source={source} />
                                <span className="truncate flex-1">{source.name}</span>
                                </button>
                                <div className="flex items-center ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                    <button onClick={() => setEditingSource(source)} className="p-1 rounded-md text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200" title="Chỉnh sửa tên nguồn"><PencilIcon/></button>
                                    <button onClick={() => onDeleteSource(source.id)} className="p-1 rounded-md text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200" title="Xóa nguồn"><TrashIcon/></button>
                                </div>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-4 flex-shrink-0">
          <p>&copy; {new Date().getFullYear()} NotebookLM Clone</p>
        </div>
      </aside>
      {editingSource && <EditSourceModal source={editingSource} onClose={() => setEditingSource(null)} onUpdateSource={onUpdateSource} />}
      {isWebSourceModalOpen && <AddWebSourceModal onClose={() => setIsWebSourceModalOpen(false)} onAdd={onAddWebSource} />}
    </>
  );
};