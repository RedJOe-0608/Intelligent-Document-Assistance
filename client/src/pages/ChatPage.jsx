import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import PdfUpload from '../components/PdfUpload';
import ChatPanel from '../components/ChatPanel';

const ChatPage = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [isPdfReady, setIsPdfReady] = useState(false);

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <div className="chat-page-header">
                <h2>📄 Chat with PDF</h2>
                <div className="user-info">
                    <span className="user-name">{user?.name}</span>
                    <button className="btn-logout" onClick={handleLogout}>
                        Logout
                    </button>
                </div>
            </div>

            <div className="split-layout">
                <PdfUpload onReady={() => setIsPdfReady(true)} />
                <ChatPanel isReady={isPdfReady} />
            </div>
        </div>
    );
};

export default ChatPage;
