import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const loadingVerbs = ['generating', 'stand by', 'fetching', 'pondering', 'thinking'];

const MessageBubble = ({ message }) => {
    const { role, content, streaming } = message;
    const { user } = useAuth();
    const [verbIndex, setVerbIndex] = useState(0);

    useEffect(() => {
        let interval;
        if (streaming) {
            interval = setInterval(() => {
                setVerbIndex((prev) => (prev + 1) % loadingVerbs.length);
            }, 1500);
        }
        return () => clearInterval(interval);
    }, [streaming]);

    const getUserInitials = (name) => {
        if (!name) return 'U';
        const parts = name.trim().split(' ').filter(Boolean);
        if (parts.length > 1) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    return (
        <div className={`message ${role}`}>
            <div className="message-avatar">
                {role === 'user' ? getUserInitials(user?.name) : 'AI'}
            </div>
            <div className="message-content">
                {content}
                {streaming && !content && (
                    <span className="streaming-verb" style={{ opacity: 0.6, fontStyle: 'italic', fontSize: '0.9em', marginLeft: '0' }}>
                        [{loadingVerbs[verbIndex]}...]
                    </span>
                )}
                {streaming && content && <span className="cursor-blink" />}
            </div>
        </div>
    );
};

export default MessageBubble;
