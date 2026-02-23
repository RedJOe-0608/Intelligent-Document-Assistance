import { useState, useRef, useEffect } from 'react';
import { ArrowUp, MessageCircleMore } from 'lucide-react';
import MessageBubble from './MessageBubble';

const API_URL = 'http://localhost:3001/api';

const ChatPanel = ({ isReady }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const question = input.trim();
        if (!question || isStreaming) return;

        // Add user message
        const userMessage = { role: 'user', content: question };
        const assistantMessage = { role: 'assistant', content: '', streaming: true };

        setMessages((prev) => [...prev, userMessage, assistantMessage]);
        setInput('');
        setIsStreaming(true);

        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        try {
            const res = await fetch(
                `${API_URL}/chat?question=${encodeURIComponent(question)}`,
                {
                    credentials: 'include',
                }
            );

            if (!res.ok) throw new Error('Chat request failed');

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.done) {
                                break;
                            }

                            if (data.token) {
                                accumulated += data.token;
                                setMessages((prev) => {
                                    const updated = [...prev];
                                    const lastMsg = updated[updated.length - 1];
                                    if (lastMsg.role === 'assistant') {
                                        updated[updated.length - 1] = {
                                            ...lastMsg,
                                            content: accumulated,
                                            streaming: true,
                                        };
                                    }
                                    return updated;
                                });
                            }

                            if (data.error) {
                                accumulated += `\n\nError: ${data.error}`;
                            }
                        } catch (parseErr) {
                            // Skip invalid JSON
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Chat error:', err);
            setMessages((prev) => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg.role === 'assistant') {
                    updated[updated.length - 1] = {
                        ...lastMsg,
                        content: 'Sorry, something went wrong. Please try again.',
                        streaming: false,
                    };
                }
                return updated;
            });
        } finally {
            // Mark streaming as done
            setMessages((prev) => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg.role === 'assistant') {
                    updated[updated.length - 1] = { ...lastMsg, streaming: false };
                }
                return updated;
            });
            setIsStreaming(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleTextareaChange = (e) => {
        setInput(e.target.value);
        // Auto-resize textarea
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
    };

    const disabled = !isReady || isStreaming;

    return (
        <div className="chat-panel">
            <div className="chat-messages">
                {messages.length === 0 ? (
                    <div className="chat-empty">
                        <div className="chat-empty-icon"><MessageCircleMore size={48} strokeWidth={1.5} /></div>
                        <h3>Chat with your PDF</h3>
                        <p>
                            {isReady
                                ? 'Ask any question about the uploaded document and get instant answers.'
                                : 'Upload a PDF on the left to get started.'}
                        </p>
                    </div>
                ) : (
                    messages.map((msg, i) => <MessageBubble key={i} message={msg} />)
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-container">
                <form className="chat-input-form" onSubmit={handleSubmit}>
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        placeholder={
                            isReady
                                ? 'Ask a question about your PDF...'
                                : 'Upload a PDF first...'
                        }
                        value={input}
                        onChange={handleTextareaChange}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                    />
                    <button
                        type="submit"
                        className="btn-send"
                        disabled={disabled || !input.trim()}
                    >
                        <ArrowUp size={20} />
                    </button>
                </form>
                <div className="chat-input-hint">
                    Press Enter to send, Shift+Enter for new line
                </div>
            </div>
        </div>
    );
};

export default ChatPanel;
