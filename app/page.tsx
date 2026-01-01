'use client';

import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent, ClipboardEvent } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  image?: string; // Base64 image data
}

interface UploadedDocument {
  fileName: string;
  text: string;
  characterCount: number;
}

interface PastedImage {
  data: string; // Base64 data URL
  name: string;
}

export default function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedDoc, setUploadedDoc] = useState<UploadedDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pastedImage, setPastedImage] = useState<PastedImage | null>(null);
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
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

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
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeDocument = () => {
    setUploadedDoc(null);
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
            const base64 = event.target?.result as string;
            setPastedImage({
              data: base64,
              name: `screenshot-${Date.now()}.png`,
            });
          };
          reader.readAsDataURL(file);
        }
        return;
      }
    }
  };

  const removeImage = () => {
    setPastedImage(null);
  };

  const sendMessage = async () => {
    if ((!input.trim() && !pastedImage) || isLoading) return;

    // Build the user message with document context if available
    let userContent = input.trim();
    if (uploadedDoc && messages.length === 0) {
      // Include document context only for the first message when a document is uploaded
      userContent = `[Document: ${uploadedDoc.fileName}]\n\nDocument Content:\n${uploadedDoc.text}\n\n---\n\nUser Question: ${userContent}`;
    }

    // Add image description if there's a pasted image
    const currentImage = pastedImage?.data;
    if (pastedImage) {
      userContent = userContent || 'What do you see in this image?';
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
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      setMessages([...newMessages, { role: 'assistant', content: '' }]);

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
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages([
        ...displayMessages,
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Allow all keyboard shortcuts (Ctrl/Cmd + C, V, X, A, Z, etc.)
    if (e.ctrlKey || e.metaKey) {
      return; // Let browser handle native shortcuts
    }
    
    // Send message on Enter (without Shift for new line)
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
      {/* Sidebar */}
      <aside className="sidebar">
        <button className="new-chat-btn" onClick={clearChat}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          New Chat
        </button>
      </aside>

      {/* Main Chat Area */}
      <main className="main-content">
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <h1>Hi, I'm Ruby! How can I help you?</h1>
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
                  <div className="message-avatar">
                    {message.role === 'user' ? (
                      <div className="avatar user-avatar">U</div>
                    ) : (
                      <div className="avatar assistant-avatar">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="message-content">
                    <div className="message-role">{message.role === 'user' ? 'You' : 'Ruby'}</div>
                    {message.image && (
                      <div className="message-image">
                        <img 
                          src={message.image} 
                          alt="Shared image"
                          loading="eager"
                        />
                      </div>
                    )}
                    <div className="message-text">{message.content}</div>
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className="message assistant">
                  <div className="message-avatar">
                    <div className="avatar assistant-avatar">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none"/>
                      </svg>
                    </div>
                  </div>
                  <div className="message-content">
                    <div className="message-role">Ruby</div>
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="input-container">
          {/* Document Preview */}
          {uploadedDoc && (
            <div className="document-preview">
              <div className="document-info">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <span className="document-name">{uploadedDoc.fileName}</span>
                <span className="document-size">({Math.round(uploadedDoc.characterCount / 1000)}k chars)</span>
              </div>
              <button className="remove-doc-btn" onClick={removeDocument} title="Remove document">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          )}
          <div className="input-wrapper">
            {/* Image Preview Inside Input */}
            {pastedImage && (
              <div className="image-preview-inline">
                <img src={pastedImage.data} alt="Pasted screenshot" />
                <button className="remove-image-btn" onClick={removeImage} title="Remove image">
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
              title="Upload document (PDF, DOCX, TXT, MD)"
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
      </main>
    </div>
  );
}
