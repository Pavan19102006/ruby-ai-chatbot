'use client';

import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent, ClipboardEvent, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  image?: string;
}

interface UploadedDocument {
  fileName: string;
  text: string;
  characterCount: number;
}

interface PastedImage {
  data: string;
  name: string;
}

// CodeBlock component with copy functionality
function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="code-block-container">
      <div className="code-block-header">
        <span className="code-language">{language || 'code'}</span>
        <button className="copy-button" onClick={handleCopy}>
          {copied ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: '0 0 8px 8px', fontSize: '14px' }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

// Available models with provider info
const MODELS = [
  // Groq Models
  { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', provider: 'groq' },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', provider: 'groq' },
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: 'groq' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', provider: 'groq' },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', provider: 'groq' },
  // Qwen Models (via MuleRouter)
  { id: 'qwen3-max', name: 'Qwen3 Max', provider: 'qwen' },
  { id: 'qwen3-235b-a22b', name: 'Qwen3 235B', provider: 'qwen' },
  { id: 'qwen3-30b-a3b', name: 'Qwen3 30B', provider: 'qwen' },
  { id: 'qwen3-32b', name: 'Qwen3 32B', provider: 'qwen' },
];

export default function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedDoc, setUploadedDoc] = useState<UploadedDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pastedImage, setPastedImage] = useState<PastedImage | null>(null);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Upload failed');

      setUploadedDoc({
        fileName: data.fileName,
        text: data.text,
        characterCount: data.characterCount,
      });
    } catch (error) {
      console.error('Upload error:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload document');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setPastedImage({
              data: event.target?.result as string,
              name: `screenshot-${Date.now()}.png`,
            });
          };
          reader.readAsDataURL(file);
        }
        return;
      }
    }
  };

  const sendMessage = async () => {
    if ((!input.trim() && !pastedImage) || isLoading) return;

    let userContent = input.trim();
    if (uploadedDoc && messages.length === 0) {
      userContent = `[Document: ${uploadedDoc.fileName}]\n\nDocument Content:\n${uploadedDoc.text}\n\n---\n\nUser Question: ${userContent}`;
    }

    const currentImage = pastedImage?.data;
    if (pastedImage && !userContent) {
      userContent = 'What do you see in this image?';
    }

    const userMessage: Message = { role: 'user', content: userContent, image: currentImage };
    const displayMessage: Message = { role: 'user', content: input.trim() || 'What do you see in this image?', image: currentImage };
    const newMessages = [...messages, userMessage];
    const displayMessages = [...messages, displayMessage];

    setMessages(displayMessages);
    setInput('');
    setPastedImage(null);
    setIsLoading(true);

    try {
      const selectedModelInfo = MODELS.find(m => m.id === selectedModel);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          model: selectedModel,
          provider: selectedModelInfo?.provider || 'groq'
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      setMessages([...displayMessages, { role: 'assistant', content: '' }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                assistantMessage += parsed.content;
                setMessages([...displayMessages, { role: 'assistant', content: assistantMessage }]);
              }
            } catch { /* Skip invalid JSON */ }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages([...displayMessages, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setUploadedDoc(null);
  };

  return (
    <div className="chat-container">
      <aside className="sidebar">
        <button className="new-chat-btn" onClick={clearChat}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          New Chat
        </button>
      </aside>

      <main className="main-content">
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <h1>Hi, I&apos;m Ruby! How can I help you?</h1>
              <div className="suggestions">
                <button onClick={() => setInput('Explain quantum computing in simple terms')}>
                  <span className="suggestion-icon">💡</span>
                  Explain quantum computing in simple terms
                </button>
                <button onClick={() => setInput('Write a creative story about a robot learning to paint')}>
                  <span className="suggestion-icon">✍️</span>
                  Write a creative story about a robot
                </button>
                <button onClick={() => setInput('Help me debug my JavaScript code')}>
                  <span className="suggestion-icon">🔧</span>
                  Help me debug my code
                </button>
                <button onClick={() => setInput('What are the best practices for learning a new language?')}>
                  <span className="suggestion-icon">🌍</span>
                  Tips for learning a new language
                </button>
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((message, index) => (
                <div key={index} className={`message ${message.role}`}>
                  <div className={`avatar ${message.role === 'user' ? 'user-avatar' : 'assistant-avatar'}`}>
                    {message.role === 'user' ? 'U' : '✦'}
                  </div>
                  <div className="message-content">
                    <div className="message-role">{message.role === 'user' ? 'You' : 'Ruby'}</div>
                    {message.image && (
                      <div className="message-image">
                        <img src={message.image} alt="Shared" />
                      </div>
                    )}
                    <div className="message-text">
                      {message.role === 'assistant' ? (
                        <ReactMarkdown
                          components={{
                            code({ className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '');
                              const codeString = String(children).replace(/\n$/, '');
                              if (match) {
                                return <CodeBlock language={match[1]}>{codeString}</CodeBlock>;
                              }
                              return <code className="inline-code" {...props}>{children}</code>;
                            },
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      ) : message.content}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className="message assistant">
                  <div className="avatar assistant-avatar">✦</div>
                  <div className="message-content">
                    <div className="message-role">Ruby</div>
                    <div className="typing-indicator">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="input-container">
          {uploadedDoc && (
            <div className="document-preview">
              <div className="document-info">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <span className="document-name">{uploadedDoc.fileName}</span>
                <span className="document-size">({Math.round(uploadedDoc.characterCount / 1000)}k chars)</span>
              </div>
              <button className="remove-doc-btn" onClick={() => setUploadedDoc(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          )}

          {/* Model Selector - Simple dropdown */}
          <div className="model-picker">
            <button
              className="model-picker-btn"
              onClick={() => setShowModelSelector(!showModelSelector)}
            >
              <span>Model</span>
              <span className="current-model">{MODELS.find(m => m.id === selectedModel)?.name}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            {showModelSelector && (
              <div className="model-picker-dropdown">
                <div className="model-picker-header">Groq Models</div>
                {MODELS.filter(m => m.provider === 'groq').map(model => (
                  <button
                    key={model.id}
                    className={`model-picker-option ${selectedModel === model.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setShowModelSelector(false);
                    }}
                  >
                    {model.name}
                  </button>
                ))}
                <div className="model-picker-header">Qwen Models</div>
                {MODELS.filter(m => m.provider === 'qwen').map(model => (
                  <button
                    key={model.id}
                    className={`model-picker-option ${selectedModel === model.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setShowModelSelector(false);
                    }}
                  >
                    {model.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="input-wrapper">
            {pastedImage && (
              <div className="image-preview-inline">
                <img src={pastedImage.data} alt="Pasted" />
                <button className="remove-image-btn" onClick={() => setPastedImage(null)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.docx,.txt,.md"
              style={{ display: 'none' }}
            />
            <button
              className="upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isLoading}
              title="Upload document"
            >
              {isUploading ? (
                <div className="upload-spinner"></div>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                </svg>
              )}
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={pastedImage ? "Describe what you want to know about this image..." : uploadedDoc ? "Ask about your document..." : "Message Ruby..."}
              rows={1}
              disabled={isLoading}
            />
            <button
              className="send-btn"
              onClick={sendMessage}
              disabled={(!input.trim() && !pastedImage) || isLoading}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
          <p className="disclaimer">AI can make mistakes. Consider checking important information.</p>
        </div>
      </main >
    </div >
  );
}
