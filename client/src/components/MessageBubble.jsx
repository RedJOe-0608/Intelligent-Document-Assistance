const MessageBubble = ({ message }) => {
    const { role, content, streaming } = message;

    return (
        <div className={`message ${role}`}>
            <div className="message-avatar">
                {role === 'user' ? 'U' : 'AI'}
            </div>
            <div className="message-content">
                {content}
                {streaming && <span className="cursor-blink" />}
            </div>
        </div>
    );
};

export default MessageBubble;
