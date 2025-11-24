
import React, { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { SourceViewer } from './components/SourceViewer';
import { StudioPanel } from './components/StudioPanel';
import { Assistant } from './components/Assistant';
import { 
    generateGroundedResponse, 
    extractTextAndContentFromFile, 
    extractContentFromUrl, 
    generateNotebookName, 
    generateMindMap, 
    generateAudioSummary, 
    summarizeSourceContent, 
    generateFinancialReport,
    generateFlashcards,
    generateQuiz,
    generateVideoScript,
    generateVideo
} from './services/geminiService';
import type { Source, ChatMessage, SourceContent, Notebook, StudioHistoryItem } from './types';
import { XMarkIcon, SpinnerIcon } from './components/Icons';

const APP_STORAGE_KEY = 'notebooklm-clone-state';

const getSanitizedNotebooksForStorage = (notebooksToSave: Notebook[]): Notebook[] => {
  return notebooksToSave.map(notebook => ({
    ...notebook,
    sources: notebook.sources.map(source => {
      if (source.content && (
        source.content.type === 'image' ||
        source.content.type === 'pdf' ||
        source.content.type === 'audio' ||
        source.content.type === 'video'
      )) {
        return { ...source, content: null };
      }
      return source;
    }),
    studioHistory: notebook.studioHistory.map(item => {
        // Clear data for large items to save storage space in localStorage
        if (item.status === 'completed' && (item.type === 'audio' || item.type === 'video')) {
            return { ...item, data: undefined };
        }
        return item;
    })
  }));
};

const openMindMapInNewTab = (mindMapData: any) => {
    const jsonString = JSON.stringify(mindMapData);
    const title = (mindMapData.label || 'Bản đồ tư duy').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
          <meta charset="UTF-8">
          <title>Bản đồ tư duy: ${title}</title>
          <style>
              body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; }
              #scene { width: 100%; height: 100%; cursor: grab; position: relative; }
              #scene:active { cursor: grabbing; }
              #mindmap-svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: visible; z-index: 1; pointer-events: none; }
              .connector { stroke-width: 2px; fill: none; }
              #mindmap-container { display: inline-block; padding: 50px; position: absolute; left: 50px; top: 50%; transform: translateY(-50%); z-index: 2;}
              .mindmap-list { list-style: none; padding-left: 40px; position: relative; }
              .mindmap-list li { position: relative; margin: 20px 0; }
              .node {
                  display: inline-block;
                  padding: 8px 16px;
                  border-radius: 9999px;
                  border: 2px solid;
                  font-size: 14px;
                  font-weight: 500;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                  white-space: nowrap;
                  background-color: var(--bg-color, #fff);
                  color: var(--text-color, #000);
                  border-color: var(--border-color, #ccc);
                  cursor: default;
              }
              .node.root {
                  font-weight: bold; font-size: 18px; padding: 12px 24px;
                  background-color: #4f46e5; color: white; border-color: #312e81;
              }
              .toggle {
                  position: absolute; left: -25px; top: 50%; transform: translateY(-50%);
                  width: 18px; height: 18px; border-radius: 50%;
                  background-color: #cbd5e1; color: #475569;
                  display: flex; align-items: center; justify-content: center;
                  font-family: monospace; font-size: 14px; font-weight: bold;
                  cursor: pointer; user-select: none;
                  border: 1px solid #94a3b8;
              }
              .toggle:hover { background-color: #94a3b8; color: white; }
              li.collapsed > .mindmap-list { display: none; }
          </style>
      </head>
      <body>
          <div id="scene">
              <svg id="mindmap-svg"></svg>
              <div id="mindmap-container"></div>
          </div>
          <script src="https://unpkg.com/panzoom@9.4.0/dist/panzoom.min.js"></script>
          <script>
              document.addEventListener('DOMContentLoaded', () => {
                  const data = ${jsonString};
                  const container = document.getElementById('mindmap-container');
                  const svg = document.getElementById('mindmap-svg');
                  
                  const colorPalette = [
                      { bg: '#e0f2fe', text: '#075985', border: '#7dd3fc' }, // Sky
                      { bg: '#dcfce7', text: '#166534', border: '#86efac' }, // Green
                      { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' }, // Amber
                      { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' }, // Red
                      { bg: '#ede9fe', text: '#5b21b6', border: '#a78bfa' }, // Violet
                      { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' }, // Orange
                      { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' }, // Pink
                  ];

                  function createBranch(nodeData, parentUl, level, color) {
                      if (!nodeData || !nodeData.label) return;

                      const li = document.createElement('li');
                      li.dataset.id = 'node-' + Math.random().toString(36).substr(2, 9);

                      const nodeEl = document.createElement('div');
                      nodeEl.className = 'node' + (level === 0 ? ' root' : '');
                      nodeEl.textContent = nodeData.label.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                      nodeEl.style.setProperty('--bg-color', color.bg);
                      nodeEl.style.setProperty('--text-color', color.text);
                      nodeEl.style.setProperty('--border-color', color.border);
                      
                      li.appendChild(nodeEl);
                      parentUl.appendChild(li);

                      const hasChildren = nodeData.children && nodeData.children.length > 0;
                      if (hasChildren) {
                          const toggle = document.createElement('span');
                          toggle.className = 'toggle';
                          toggle.textContent = '<';
                          li.insertBefore(toggle, nodeEl);

                          toggle.addEventListener('click', (e) => {
                              e.stopPropagation();
                              li.classList.toggle('collapsed');
                              toggle.textContent = li.classList.contains('collapsed') ? '>' : '<';
                              // Use a timeout to allow the DOM to update before redrawing
                              setTimeout(drawAllConnectors, 50);
                          });

                          const childUl = document.createElement('ul');
                          childUl.className = 'mindmap-list';
                          li.appendChild(childUl);

                          nodeData.children.forEach(child => {
                              createBranch(child, childUl, level + 1, color);
                          });
                      }
                  }
                  
                  function drawAllConnectors() {
                      svg.innerHTML = '';
                      const allNodes = Array.from(document.querySelectorAll('.node'));
                      allNodes.forEach(childNodeEl => {
                          const parentLi = childNodeEl.parentElement.parentElement.parentElement;
                          if (parentLi && parentLi.tagName === 'LI') {
                              const parentNodeEl = parentLi.querySelector(':scope > .node');
                              if(parentNodeEl && childNodeEl.offsetParent !== null) { // Check if visible
                                  drawConnector(parentNodeEl, childNodeEl);
                              }
                          }
                      });
                  }

                  function drawConnector(parentEl, childEl) {
                      const containerRect = container.getBoundingClientRect();
                      
                      const parentRect = parentEl.getBoundingClientRect();
                      const childRect = childEl.getBoundingClientRect();
                      
                      const startX = parentRect.right - containerRect.left;
                      const startY = parentRect.top + parentRect.height / 2 - containerRect.top;
                      const endX = childRect.left - containerRect.left;
                      const endY = childRect.top + childRect.height / 2 - containerRect.top;

                      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                      const controlX1 = startX + (endX - startX) * 0.5;
                      const controlX2 = endX - (endX - startX) * 0.5;
                      path.setAttribute('d', \`M\${startX},\${startY} C\${controlX1},\${startY} \${controlX2},\${endY} \${endX},\${endY}\`);
                      path.setAttribute('class', 'connector');
                      path.style.stroke = parentEl.style.getPropertyValue('--border-color');
                      svg.appendChild(path);
                  }

                  // Build the mind map structure
                  const rootUl = document.createElement('ul');
                  rootUl.className = 'mindmap-list';
                  rootUl.style.paddingLeft = '0';
                  
                  const rootLi = document.createElement('li');
                  const rootNodeEl = document.createElement('div');
                  rootNodeEl.className = 'node root';
                  rootNodeEl.textContent = data.label.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                  rootLi.appendChild(rootNodeEl);
                  rootUl.appendChild(rootLi);

                  if (data.children && data.children.length > 0) {
                      const childUl = document.createElement('ul');
                      childUl.className = 'mindmap-list';
                      rootLi.appendChild(childUl);
                      data.children.forEach((child, index) => {
                          const color = colorPalette[index % colorPalette.length];
                          createBranch(child, childUl, 1, color);
                      });
                  }
                  container.appendChild(rootUl);
                  
                  // Initial drawing and panzoom setup
                  setTimeout(() => {
                      drawAllConnectors();
                      const scene = document.getElementById('scene');
                      const panzoomInstance = panzoom(scene, {
                          maxZoom: 2,
                          minZoom: 0.2,
                          bounds: true,
                          boundsPadding: 0.1,
                      });
                  }, 50);

              });
          </script>
      </body>
      </html>
    `;
    const newWindow = window.open();
    if (newWindow) {
        newWindow.document.write(htmlContent);
        newWindow.document.close();
    }
};

const openReportInNewTab = (htmlContent: string) => {
    const newWindow = window.open();
    if (newWindow) {
        // AI now returns a full HTML document including DOCTYPE and styled HEAD/BODY.
        // We write it directly to the new window.
        newWindow.document.write(htmlContent);
        newWindow.document.close();
    }
};

const openFlashcardsInNewTab = (data: any) => {
    const jsonString = JSON.stringify(data.flashcards);
    const htmlContent = `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Thẻ ghi nhớ</title>
            <style>
                body { font-family: sans-serif; background-color: #f0fdf4; display: flex; flex-direction: column; align-items: center; min-height: 100vh; padding: 20px; }
                h1 { color: #166534; margin-bottom: 30px; }
                .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; width: 100%; max-width: 1000px; }
                .card-container { perspective: 1000px; height: 200px; cursor: pointer; }
                .card { width: 100%; height: 100%; position: relative; transition: transform 0.6s; transform-style: preserve-3d; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .card.flipped { transform: rotateY(180deg); }
                .front, .back { position: absolute; width: 100%; height: 100%; backface-visibility: hidden; display: flex; align-items: center; justify-content: center; padding: 20px; text-align: center; border-radius: 12px; font-size: 18px; font-weight: 500; }
                .front { background-color: white; color: #333; }
                .back { background-color: #22c55e; color: white; transform: rotateY(180deg); }
            </style>
        </head>
        <body>
            <h1>Thẻ ghi nhớ</h1>
            <div id="grid" class="grid"></div>
            <script>
                const cards = ${jsonString};
                const grid = document.getElementById('grid');
                cards.forEach(card => {
                    const container = document.createElement('div');
                    container.className = 'card-container';
                    container.onclick = () => container.querySelector('.card').classList.toggle('flipped');
                    
                    const cardDiv = document.createElement('div');
                    cardDiv.className = 'card';
                    
                    const front = document.createElement('div');
                    front.className = 'front';
                    front.textContent = card.front;
                    
                    const back = document.createElement('div');
                    back.className = 'back';
                    back.textContent = card.back;
                    
                    cardDiv.appendChild(front);
                    cardDiv.appendChild(back);
                    container.appendChild(cardDiv);
                    grid.appendChild(container);
                });
            </script>
        </body>
        </html>
    `;
    const newWindow = window.open();
    if (newWindow) {
        newWindow.document.write(htmlContent);
        newWindow.document.close();
    }
};

const openQuizInNewTab = (data: any) => {
    const jsonString = JSON.stringify(data.questions);
    const htmlContent = `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Kiểm tra kiến thức</title>
            <style>
                body { font-family: sans-serif; background-color: #fefce8; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
                h1 { color: #854d0e; text-align: center; margin-bottom: 40px; }
                .question-card { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom: 20px; border: 1px solid #fde047; }
                .question-text { font-size: 18px; font-weight: 600; margin-bottom: 15px; color: #333; }
                .options { list-style: none; padding: 0; }
                .option { margin-bottom: 10px; cursor: pointer; padding: 10px; border-radius: 6px; border: 1px solid #eee; transition: all 0.2s; display: flex; align-items: center; }
                .option:hover { background-color: #fef08a; }
                .option input { margin-right: 10px; }
                .btn { display: block; width: 100%; padding: 15px; background-color: #ca8a04; color: white; border: none; border-radius: 8px; font-size: 18px; font-weight: bold; cursor: pointer; margin-top: 20px; }
                .btn:hover { background-color: #a16207; }
                .feedback { margin-top: 15px; padding: 15px; background-color: #f3f4f6; border-radius: 8px; display: none; }
                .correct { color: #15803d; font-weight: bold; }
                .incorrect { color: #b91c1c; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>Kiểm tra kiến thức</h1>
            <div id="quiz-container"></div>
            <button class="btn" onclick="checkAnswers()">Nộp bài</button>
            <script>
                const questions = ${jsonString};
                const container = document.getElementById('quiz-container');
                
                questions.forEach((q, index) => {
                    const card = document.createElement('div');
                    card.className = 'question-card';
                    card.innerHTML = \`
                        <div class="question-text">\${index + 1}. \${q.question}</div>
                        <ul class="options">
                            \${q.options.map((opt, i) => \`
                                <li class="option" onclick="selectOption(\${index}, \${i})">
                                    <input type="radio" name="q\${index}" value="\${i}" id="q\${index}o\${i}">
                                    <label for="q\${index}o\${i}" style="cursor:pointer; flex:1">\${opt}</label>
                                </li>
                            \`).join('')}
                        </ul>
                        <div class="feedback" id="feedback-\${index}"></div>
                    \`;
                    container.appendChild(card);
                });

                function selectOption(qIndex, oIndex) {
                    document.getElementById(\`q\${qIndex}o\${oIndex}\`).checked = true;
                }

                function checkAnswers() {
                    let score = 0;
                    questions.forEach((q, index) => {
                        const feedbackEl = document.getElementById(\`feedback-\${index}\`);
                        const selected = document.querySelector(\`input[name="q\${index}"]:checked\`);
                        feedbackEl.style.display = 'block';
                        
                        if (selected) {
                            const val = parseInt(selected.value);
                            if (val === q.correctAnswerIndex) {
                                score++;
                                feedbackEl.innerHTML = '<span class="correct">Chính xác!</span> ' + q.explanation;
                                feedbackEl.style.backgroundColor = '#dcfce7';
                            } else {
                                feedbackEl.innerHTML = '<span class="incorrect">Sai rồi.</span> Đáp án đúng là: ' + q.options[q.correctAnswerIndex] + '.<br>' + q.explanation;
                                feedbackEl.style.backgroundColor = '#fee2e2';
                            }
                        } else {
                            feedbackEl.innerHTML = '<span class="incorrect">Chưa trả lời.</span>';
                             feedbackEl.style.backgroundColor = '#fee2e2';
                        }
                    });
                    alert(\`Bạn trả lời đúng \${score}/\${questions.length} câu!\`);
                }
            </script>
        </body>
        </html>
    `;
    const newWindow = window.open();
    if (newWindow) {
        newWindow.document.write(htmlContent);
        newWindow.document.close();
    }
};

const openVideoInNewTab = (base64Video: string) => {
    const newWindow = window.open();
    if (newWindow) {
        newWindow.document.write(`
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <title>Video Tổng quan</title>
                <style>
                    body { margin: 0; background: black; display: flex; align-items: center; justify-content: center; height: 100vh; }
                    video { max-width: 100%; max-height: 100%; }
                </style>
            </head>
            <body>
                <video controls autoplay>
                    <source src="data:video/mp4;base64,${base64Video}" type="video/mp4">
                    Trình duyệt của bạn không hỗ trợ thẻ video.
                </video>
            </body>
            </html>
        `);
        newWindow.document.close();
    }
}


const SummaryModal: React.FC<{
    isOpen: boolean;
    isLoading: boolean;
    content: string;
    sourceName: string;
    onClose: () => void;
}> = ({ isOpen, isLoading, content, sourceName, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                        Tóm tắt của "{sourceName}"
                    </h2>
                    <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700">
                        <XMarkIcon />
                    </button>
                </div>
                <div className="overflow-y-auto pr-2">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                            <SpinnerIcon />
                            <p className="mt-3">Đang tạo tóm tắt...</p>
                        </div>
                    ) : (
                        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                            {content}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};


function App() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileSourcesVisible, setMobileSourcesVisible] = useState(false);
  const [mobileViewerVisible, setMobileViewerVisible] = useState(false);
  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const [summaryState, setSummaryState] = useState<{
        isOpen: boolean;
        isLoading: boolean;
        content: string;
        sourceName: string;
    }>({
        isOpen: false,
        isLoading: false,
        content: '',
        sourceName: '',
    });

  // --- State Persistence ---
  useEffect(() => {
    try {
      const savedState = localStorage.getItem(APP_STORAGE_KEY);
      if (savedState) {
        const { notebooks: savedNotebooks, activeNotebookId: savedActiveId } = JSON.parse(savedState);
        setNotebooks(savedNotebooks || []);
        setActiveNotebookId(savedActiveId || null);
      }
    } catch (e) {
      console.error("Failed to load state from localStorage", e);
    }
  }, []);

  useEffect(() => {
    try {
      const sanitizedNotebooks = getSanitizedNotebooksForStorage(notebooks);
      const stateToSave = JSON.stringify({ notebooks: sanitizedNotebooks, activeNotebookId });
      localStorage.setItem(APP_STORAGE_KEY, stateToSave);
    } catch (e) {
      console.error("Failed to save state to localStorage", e);
    }
  }, [notebooks, activeNotebookId]);

  // --- Derived State ---
  const activeNotebook = notebooks.find(n => n.id === activeNotebookId) || null;
  const sources = activeNotebook?.sources || [];
  const chatHistory = activeNotebook?.chatHistory || [];
  const selectedSource = sources.find(s => s.id === selectedSourceId) || null;

  // Use useCallback to create a stable update function.
  // We capture activeNotebookId in the closure but handle the state update functionally.
  const updateActiveNotebook = useCallback((updater: (notebook: Notebook) => Notebook) => {
    setNotebooks(prev => {
        // If no active notebook, don't update
        if (!activeNotebookId) return prev;
        return prev.map(n => n.id === activeNotebookId ? updater(n) : n);
    });
  }, [activeNotebookId]);


  // --- Notebook Management ---
  const handleNewNotebook = useCallback(async (files: FileList) => {
    const tempNotebookId = `notebook-${Date.now()}`;
    const filesArray = Array.from(files);
    
    const newSources: Source[] = filesArray.map(file => ({
        id: `source-${Date.now()}-${file.name}`,
        name: file.name,
        originalType: file.type || 'unknown',
        status: 'processing',
        progress: 0,
        content: null,
        groundingText: null
    }));

    const tempNotebook: Notebook = {
      id: tempNotebookId,
      name: 'Đang đặt tên sổ ghi chú...',
      sources: newSources,
      chatHistory: [],
      studioHistory: [],
    };

    setNotebooks(prev => [tempNotebook, ...prev]);
    setActiveNotebookId(tempNotebookId);
    
    // Process sources SEQUENTIALLY to avoid rate limits
    const processedSources: Source[] = [];
    for (const source of newSources) {
        const file = filesArray.find(f => f.name === source.name)!;
        try {
            const { content, groundingText } = await extractTextAndContentFromFile(file, (progress) => {
                 setNotebooks(prev => prev.map(n => n.id === tempNotebookId ? { ...n, sources: n.sources.map(s => s.id === source.id ? { ...s, progress } : s) } : n));
            });
            processedSources.push({ ...source, status: 'ready', content, groundingText, progress: 100 });
        } catch (e: any) {
             processedSources.push({ ...source, status: 'error', error: e.message, progress: 100 });
        }
    }

    const finalSources = processedSources.filter(s => s.status === 'ready');
    const groundingTexts = finalSources.map(s => s.groundingText || '');
    const notebookName = await generateNotebookName(groundingTexts);
    
    setNotebooks(prev => prev.map(n => {
        if (n.id !== tempNotebookId) return n;

        // Create a map of the processed sources for easy lookup
        const processedMap = new Map(processedSources.map(s => [s.id, s]));
        
        // Map over the current sources in the state.
        const mergedSources = n.sources.map(s => processedMap.get(s.id) || s);

        return {
            ...n,
            name: notebookName,
            sources: mergedSources,
            chatHistory: n.chatHistory.length === 0 
                ? [{ id: 'welcome', role: 'model', content: `Chào mừng đến với sổ ghi chú "${notebookName}"! Hãy bắt đầu bằng cách đặt câu hỏi về các nguồn của bạn.` }] 
                : n.chatHistory
        };
    }));

    if (finalSources.length > 0) {
      setSelectedSourceId(finalSources[0].id);
      setIsViewerVisible(true);
    }
  }, []);

  const handleSelectNotebook = useCallback((id: string) => {
    setActiveNotebookId(id);
    setSelectedSourceId(null);
    setIsViewerVisible(false);
  }, []);

  const handleDeleteNotebook = useCallback((id: string) => {
    setNotebooks(prev => prev.filter(n => n.id !== id));
    if (activeNotebookId === id) {
      setActiveNotebookId(notebooks.length > 1 ? notebooks.filter(n => n.id !== id)[0].id : null);
      setSelectedSourceId(null);
      setIsViewerVisible(false);
    }
  }, [activeNotebookId, notebooks]);

  const handleRenameNotebook = useCallback((id: string, newName: string) => {
    setNotebooks(prev => prev.map(n => n.id === id ? { ...n, name: newName } : n));
  }, []);


  // --- Source Management ---
  const handleAddSources = useCallback(async (files: FileList) => {
    if (!activeNotebookId) return;
    
    const filesArray = Array.from(files);
    // Use a more unique ID generation strategy to prevent collision if multiple files are added quickly
    const newSources: Source[] = filesArray.map((file, index) => ({
        id: `source-${Date.now()}-${index}-${file.name}`, 
        name: file.name, 
        originalType: file.type,
        status: 'processing', 
        progress: 0, 
        content: null, 
        groundingText: null
    }));
    
    // Optimistic update: Add placeholder sources immediately
    updateActiveNotebook(n => ({ ...n, sources: [...n.sources, ...newSources] }));

    // Process sources SEQUENTIALLY to avoid rate limits
    for (const source of newSources) {
        const file = filesArray.find(f => f.name === source.name)!;
        try {
            const { content, groundingText } = await extractTextAndContentFromFile(file, p => {
                 updateActiveNotebook(n => ({ ...n, sources: n.sources.map(s => s.id === source.id ? { ...s, progress: p } : s) }));
            });
            updateActiveNotebook(n => ({...n, sources: n.sources.map(s => s.id === source.id ? {...s, status: 'ready', content, groundingText, progress: 100} : s)}));
        } catch (e: any) {
            updateActiveNotebook(n => ({ ...n, sources: n.sources.map(s => s.id === source.id ? {...s, status: 'error', error: e.message, progress: 100 } : s) }));
        }
    }
  }, [activeNotebookId, updateActiveNotebook]);

  const handleAddWebSource = useCallback(async (url: string) => {
    if (!activeNotebookId) return;
    
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    const newSource: Source = {
        id: `source-${Date.now()}-web`,
        name: url,
        originalType: isYoutube ? 'source/youtube' : 'source/website',
        status: 'processing',
        progress: 0,
        content: null,
        groundingText: null
    };

    updateActiveNotebook(n => ({ ...n, sources: [...n.sources, newSource] }));

    try {
        const { name, groundingText } = await extractContentFromUrl(url, (progress) => {
             updateActiveNotebook(n => ({ ...n, sources: n.sources.map(s => s.id === newSource.id ? { ...s, progress } : s) }));
        });
        
         let content: SourceContent;
         if (isYoutube) {
             let videoId = '';
             if (url.includes('v=')) videoId = url.split('v=')[1]?.split('&')[0];
             else if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1]?.split('?')[0];
             
             content = { 
                 type: 'youtube', 
                 url, 
                 embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}` : url 
             };
         } else {
             content = { type: 'website', url };
         }

        updateActiveNotebook(n => ({
            ...n, 
            sources: n.sources.map(s => s.id === newSource.id ? { ...s, name: name || s.name, status: 'ready', content, groundingText, progress: 100 } : s)
        }));

    } catch (e: any) {
        updateActiveNotebook(n => ({ ...n, sources: n.sources.map(s => s.id === newSource.id ? { ...s, status: 'error', error: e.message, progress: 100 } : s) }));
    }
  }, [activeNotebookId, updateActiveNotebook]);
  
  const handleDeleteSource = useCallback((id: string) => {
    updateActiveNotebook(n => ({ ...n, sources: n.sources.filter(s => s.id !== id) }));
    if (selectedSourceId === id) {
      setSelectedSourceId(null);
      setIsViewerVisible(false);
    }
  }, [selectedSourceId, activeNotebookId, updateActiveNotebook]);

  const handleUpdateSource = useCallback((id: string, newName: string) => {
    updateActiveNotebook(n => ({ ...n, sources: n.sources.map(s => s.id === id ? { ...s, name: newName } : s) }));
  }, [activeNotebookId, updateActiveNotebook]);

  // --- Other Handlers ---
  const handleSelectSource = useCallback((source: Source) => {
    setSelectedSourceId(source.id);
    setIsViewerVisible(true);
    if (window.innerWidth < 768) setMobileViewerVisible(true);
  }, []);

  const handleSendMessage = useCallback(async (message: string) => {
    if (!activeNotebook || !sources.some(s => s.status === 'ready')) return;

    const userMessage: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', content: message };
    updateActiveNotebook(n => ({ ...n, chatHistory: [...n.chatHistory, userMessage] }));
    setIsLoading(true);
    
    try {
      // Pass the updated chat history including the new message to the AI
      // Note: We reconstruct it here because state update is async
      const updatedHistory = [...activeNotebook.chatHistory, userMessage];
      const responseText = await generateGroundedResponse(sources, message, updatedHistory);
      const modelMessage: ChatMessage = { id: `msg-${Date.now() + 1}`, role: 'model', content: responseText };
      updateActiveNotebook(n => ({...n, chatHistory: [...n.chatHistory, modelMessage]}));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      const errorResponseMessage: ChatMessage = { id: `msg-err-${Date.now()}`, role: 'model', content: `Error: ${errorMessage}` };
      updateActiveNotebook(n => ({...n, chatHistory: [...n.chatHistory, errorResponseMessage]}));
    } finally {
      setIsLoading(false);
    }
  }, [activeNotebook, sources, updateActiveNotebook]);
  
  const handleSummarizeSource = useCallback(async (source: Source) => {
    if (!source.groundingText) {
        alert("Nguồn này không có nội dung văn bản để tóm tắt.");
        return;
    }

    setSummaryState({
        isOpen: true,
        isLoading: true,
        content: '',
        sourceName: source.name,
    });

    try {
        const summary = await summarizeSourceContent(source.groundingText);
        setSummaryState(prev => ({ ...prev, isLoading: false, content: summary }));
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        setSummaryState(prev => ({ ...prev, isLoading: false, content: `Lỗi khi tạo tóm tắt: ${errorMessage}` }));
    }
  }, []);

  // --- Studio Handlers ---
  const handleGenerateMindMap = useCallback(async (notebookId: string): Promise<string> => {
    const notebook = notebooks.find(n => n.id === notebookId);
    if (!notebook) return "Không tìm thấy sổ ghi chú.";
    
    const readySources = notebook.sources.filter(s => s.status === 'ready' && s.groundingText);
    if (readySources.length === 0) {
        alert("Không thể tạo bản đồ tư duy: Không có nguồn nào sẵn sàng hoặc các nguồn không có nội dung văn bản.");
        return `Sổ ghi chú "${notebook.name}" không có nguồn nào sẵn sàng.`;
    }

    const id = `hist-mindmap-${Date.now()}`;
    const newItem: StudioHistoryItem = {
        id, type: 'mindmap', status: 'loading', name: 'Bản đồ tư duy',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sourceCount: readySources.length,
    };
    
    setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: [newItem, ...(n.studioHistory || [])] } : n));

    try {
        const mindMapJson = await generateMindMap(readySources);
        openMindMapInNewTab(mindMapJson);
        setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: n.studioHistory.map(item => item.id === id ? { ...item, status: 'completed', data: mindMapJson, name: mindMapJson.label || item.name } : item) } : n));
        return `Đã tạo và mở bản đồ tư duy cho sổ ghi chú "${notebook.name}".`;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: n.studioHistory.map(item => item.id === id ? { ...item, status: 'error', error: errorMessage } : item) } : n));
        return `Không thể tạo bản đồ tư duy: ${errorMessage}`;
    }
  }, [notebooks]);

  const handleGenerateAudioSummary = useCallback(async (notebookId: string): Promise<string> => {
    const notebook = notebooks.find(n => n.id === notebookId);
    if (!notebook) return "Không tìm thấy sổ ghi chú.";
    const readySources = notebook.sources.filter(s => s.status === 'ready' && s.groundingText);
    if (readySources.length === 0) {
        alert("Không thể tạo tóm tắt âm thanh: Không có nguồn nào sẵn sàng hoặc các nguồn không có nội dung văn bản.");
        return `Sổ ghi chú "${notebook.name}" không có nguồn nào sẵn sàng.`;
    }

    const id = `hist-audio-${Date.now()}`;
    const newItem: StudioHistoryItem = {
        id, type: 'audio', status: 'loading', name: 'Tổng quan bằng âm thanh',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sourceCount: readySources.length,
    };
    setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: [newItem, ...(n.studioHistory || [])] } : n));

    try {
        const base64Audio = await generateAudioSummary(readySources);
        setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: n.studioHistory.map(item => item.id === id ? { ...item, status: 'completed', data: base64Audio } : item) } : n));
        return `Đã tạo tóm tắt âm thanh cho sổ ghi chú "${notebook.name}". Bạn có thể tìm thấy nó trong bảng Studio.`;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: n.studioHistory.map(item => item.id === id ? { ...item, status: 'error', error: errorMessage } : item) } : n));
        return `Không thể tạo tóm tắt âm thanh: ${errorMessage}`;
    }
  }, [notebooks]);

    const handleGenerateReport = useCallback(async (notebookId: string): Promise<string> => {
    const notebook = notebooks.find(n => n.id === notebookId);
    if (!notebook) return "Không tìm thấy sổ ghi chú.";
    
    const readySources = notebook.sources.filter(s => s.status === 'ready' && s.groundingText);
    if (readySources.length === 0) {
        alert("Không thể tạo báo cáo: Không có nguồn nào sẵn sàng hoặc các nguồn không có nội dung văn bản.");
        return `Sổ ghi chú "${notebook.name}" không có nguồn nào sẵn sàng.`;
    }

    const id = `hist-report-${Date.now()}`;
    const newItem: StudioHistoryItem = {
        id, type: 'report', status: 'loading', name: 'BC_SmeFund',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sourceCount: readySources.length,
    };
    
    setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: [newItem, ...(n.studioHistory || [])] } : n));

    try {
        // Pass chat history to the report generator so it can include user notes
        const htmlReport = await generateFinancialReport(readySources, notebook.chatHistory);
        openReportInNewTab(htmlReport);
        setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: n.studioHistory.map(item => item.id === id ? { ...item, status: 'completed', data: htmlReport } : item) } : n));
        return `Đã tạo và mở BC_SmeFund cho sổ ghi chú "${notebook.name}".`;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: n.studioHistory.map(item => item.id === id ? { ...item, status: 'error', error: errorMessage } : item) } : n));
        return `Không thể tạo báo cáo: ${errorMessage}`;
    }
  }, [notebooks]);

  const handleGenerateFlashcards = useCallback(async (notebookId: string): Promise<string> => {
    const notebook = notebooks.find(n => n.id === notebookId);
    if (!notebook) return "Không tìm thấy sổ ghi chú.";
    
    const readySources = notebook.sources.filter(s => s.status === 'ready' && s.groundingText);
    if (readySources.length === 0) {
        alert("Không thể tạo thẻ ghi nhớ: Không có nguồn nào sẵn sàng hoặc các nguồn không có nội dung văn bản.");
        return `Sổ ghi chú "${notebook.name}" không có nguồn nào sẵn sàng.`;
    }

    const id = `hist-flashcards-${Date.now()}`;
    const newItem: StudioHistoryItem = {
        id, type: 'flashcards', status: 'loading', name: 'Thẻ ghi nhớ',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sourceCount: readySources.length,
    };
    
    setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: [newItem, ...(n.studioHistory || [])] } : n));

    try {
        const flashcardsData = await generateFlashcards(readySources);
        openFlashcardsInNewTab(flashcardsData);
        setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: n.studioHistory.map(item => item.id === id ? { ...item, status: 'completed', data: flashcardsData } : item) } : n));
        return `Đã tạo và mở thẻ ghi nhớ cho sổ ghi chú "${notebook.name}".`;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: n.studioHistory.map(item => item.id === id ? { ...item, status: 'error', error: errorMessage } : item) } : n));
        return `Không thể tạo thẻ ghi nhớ: ${errorMessage}`;
    }
  }, [notebooks]);

  const handleGenerateQuiz = useCallback(async (notebookId: string): Promise<string> => {
    const notebook = notebooks.find(n => n.id === notebookId);
    if (!notebook) return "Không tìm thấy sổ ghi chú.";
    
    const readySources = notebook.sources.filter(s => s.status === 'ready' && s.groundingText);
    if (readySources.length === 0) {
        alert("Không thể tạo bài kiểm tra: Không có nguồn nào sẵn sàng hoặc các nguồn không có nội dung văn bản.");
        return `Sổ ghi chú "${notebook.name}" không có nguồn nào sẵn sàng.`;
    }

    const id = `hist-quiz-${Date.now()}`;
    const newItem: StudioHistoryItem = {
        id, type: 'quiz', status: 'loading', name: 'Kiểm tra kiến thức',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sourceCount: readySources.length,
    };
    
    setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: [newItem, ...(n.studioHistory || [])] } : n));

    try {
        const quizData = await generateQuiz(readySources);
        openQuizInNewTab(quizData);
        setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: n.studioHistory.map(item => item.id === id ? { ...item, status: 'completed', data: quizData } : item) } : n));
        return `Đã tạo và mở bài kiểm tra cho sổ ghi chú "${notebook.name}".`;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: n.studioHistory.map(item => item.id === id ? { ...item, status: 'error', error: errorMessage } : item) } : n));
        return `Không thể tạo bài kiểm tra: ${errorMessage}`;
    }
  }, [notebooks]);

  const handleGenerateVideo = useCallback(async (notebookId: string): Promise<string> => {
    const notebook = notebooks.find(n => n.id === notebookId);
    if (!notebook) return "Không tìm thấy sổ ghi chú.";

    const readySources = notebook.sources.filter(s => s.status === 'ready' && s.groundingText);
    if (readySources.length === 0) {
        alert("Không thể tạo video: Không có nguồn nào sẵn sàng hoặc các nguồn không có nội dung văn bản.");
        return `Sổ ghi chú "${notebook.name}" không có nguồn nào sẵn sàng.`;
    }

    // Ensure we have a valid API Key for Veo
    if (window.aistudio) {
        try {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            if (!hasKey) {
                await window.aistudio.openSelectKey();
            }
        } catch (e) {
            console.warn("AI Studio key selection failed or not available", e);
        }
    }

    const id = `hist-video-${Date.now()}`;
    const newItem: StudioHistoryItem = {
        id, type: 'video', status: 'loading', name: 'Tổng quan bằng Video',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sourceCount: readySources.length,
    };

    setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: [newItem, ...(n.studioHistory || [])] } : n));

    try {
        const script = await generateVideoScript(readySources);
        const videoBase64 = await generateVideo(script);
        
        setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: n.studioHistory.map(item => item.id === id ? { ...item, status: 'completed', data: videoBase64 } : item) } : n));
        return `Đã tạo video tổng quan cho sổ ghi chú "${notebook.name}".`;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setNotebooks(prev => prev.map(n => n.id === notebookId ? { ...n, studioHistory: n.studioHistory.map(item => item.id === id ? { ...item, status: 'error', error: errorMessage } : item) } : n));
        return `Không thể tạo video: ${errorMessage}`;
    }
  }, [notebooks]);


  // --- AI Assistant Handlers ---
  const handleAIOpenNotebook = useCallback((notebookName: string): string => {
      const notebook = notebooks.find(n => n.name.toLowerCase().trim() === notebookName.toLowerCase().trim());
      if (notebook) {
          handleSelectNotebook(notebook.id);
          return `Đã mở sổ ghi chú "${notebook.name}".`;
      }
      return `Không tìm thấy sổ ghi chú nào có tên "${notebookName}".`;
  }, [notebooks, handleSelectNotebook]);

  const handleAICreateMindMap = useCallback((notebookName: string): Promise<string> => {
      const notebook = notebooks.find(n => n.name.toLowerCase().trim() === notebookName.toLowerCase().trim());
      if (notebook) {
          return handleGenerateMindMap(notebook.id);
      }
      return Promise.resolve(`Không tìm thấy sổ ghi chú nào có tên "${notebookName}" để tạo bản đồ tư duy.`);
  }, [notebooks, handleGenerateMindMap]);

  const handleAICreateAudioSummary = useCallback((notebookName: string): Promise<string> => {
      const notebook = notebooks.find(n => n.name.toLowerCase().trim() === notebookName.toLowerCase().trim());
      if (notebook) {
          return handleGenerateAudioSummary(notebook.id);
      }
      return Promise.resolve(`Không tìm thấy sổ ghi chú nào có tên "${notebookName}" để tạo tóm tắt âm thanh.`);
  }, [notebooks, handleGenerateAudioSummary]);
  
  const handleAIAnswerFromSources = useCallback(async (question: string, notebookName?: string): Promise<string> => {
      let sourcesToSearch: Source[] = [];
      if (notebookName) {
          const notebook = notebooks.find(n => n.name.toLowerCase().trim() === notebookName.toLowerCase().trim());
          if (!notebook) {
              return `Không tìm thấy sổ ghi chú nào có tên "${notebookName}".`;
          }
          sourcesToSearch = notebook.sources;
      } else {
          sourcesToSearch = notebooks.flatMap(n => n.sources);
      }

      const readySources = sourcesToSearch.filter(s => s.status === 'ready' && s.groundingText);
      if (readySources.length === 0) {
          return "Không có nguồn nào sẵn sàng để tìm kiếm thông tin.";
      }
      return await generateGroundedResponse(readySources, question);
  }, [notebooks]);


  const thirdColumn = () => {
    if (isViewerVisible) {
      return <SourceViewer 
        source={selectedSource} 
        onClose={() => setIsViewerVisible(false)} 
        mobileViewerVisible={mobileViewerVisible} 
        setMobileViewerVisible={setMobileViewerVisible}
        onSummarize={handleSummarizeSource}
        isSummarizing={summaryState.isLoading && summaryState.sourceName === selectedSource?.name}
      />;
    }
    return <StudioPanel 
      sources={sources} 
      history={activeNotebook?.studioHistory || []}
      onGenerateMindMap={() => activeNotebookId && handleGenerateMindMap(activeNotebookId)}
      onGenerateAudioSummary={() => activeNotebookId && handleGenerateAudioSummary(activeNotebookId)}
      onGenerateReport={() => activeNotebookId && handleGenerateReport(activeNotebookId)}
      onGenerateFlashcards={() => activeNotebookId && handleGenerateFlashcards(activeNotebookId)}
      onGenerateQuiz={() => activeNotebookId && handleGenerateQuiz(activeNotebookId)}
      onGenerateVideo={() => activeNotebookId && handleGenerateVideo(activeNotebookId)}
      onOpenMindMap={openMindMapInNewTab}
      onOpenReport={openReportInNewTab}
      onOpenFlashcards={openFlashcardsInNewTab}
      onOpenQuiz={openQuizInNewTab}
      onOpenVideo={openVideoInNewTab}
    />;
  };

  return (
    <div className="flex h-screen overflow-hidden font-sans text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-900">
      <Sidebar 
        notebooks={notebooks}
        activeNotebookId={activeNotebookId}
        onSelectNotebook={handleSelectNotebook}
        onNewNotebook={handleNewNotebook}
        onRenameNotebook={handleRenameNotebook}
        onDeleteNotebook={handleDeleteNotebook}
        sources={sources}
        onUpdateSource={handleUpdateSource}
        onSelectSource={handleSelectSource}
        selectedSource={selectedSource}
        onAddFiles={handleAddSources}
        onAddWebSource={handleAddWebSource}
        onDeleteSource={handleDeleteSource}
        mobileSourcesVisible={mobileSourcesVisible}
        setMobileSourcesVisible={setMobileSourcesVisible}
      />
      <main className="flex-1 flex flex-row min-w-0">
        <ChatPanel
          messages={chatHistory}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          onSelectSource={handleSelectSource}
          sources={sources}
          activeNotebook={activeNotebook}
          setMobileSourcesVisible={setMobileSourcesVisible}
          setMobileViewerVisible={setMobileViewerVisible}
          selectedSource={selectedSource}
        />
        {thirdColumn()}
      </main>
      <Assistant 
        notebooks={notebooks}
        onOpenNotebook={handleAIOpenNotebook}
        onCreateMindMap={handleAICreateMindMap}
        onCreateAudioSummary={handleAICreateAudioSummary}
        onAnswerQuestion={handleAIAnswerFromSources}
      />
       <SummaryModal
            isOpen={summaryState.isOpen}
            isLoading={summaryState.isLoading}
            content={summaryState.content}
            sourceName={summaryState.sourceName}
            onClose={() => setSummaryState({ isOpen: false, isLoading: false, content: '', sourceName: '' })}
        />
    </div>
  );
}

export default App;
