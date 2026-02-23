import { useState, useRef } from 'react';
import { Upload, FileText } from 'lucide-react';

const API_URL = 'http://localhost:3001/api';

const PdfUpload = ({ onReady }) => {
    const [status, setStatus] = useState('idle'); // idle, uploading, processing, ready, error
    const [fileName, setFileName] = useState('');
    const [pdfUrl, setPdfUrl] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const pollJobStatus = async (jobId) => {
        const maxAttempts = 120; // 2 minutes max
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                const res = await fetch(`${API_URL}/job-status/${jobId}`, {
                    credentials: 'include',
                });
                const data = await res.json();

                if (data.state === 'completed') {
                    setStatus('ready');
                    onReady?.();
                    return;
                } else if (data.state === 'failed') {
                    setStatus('error');
                    setErrorMsg(data.data?.error || 'Processing failed');
                    return;
                }
            } catch (err) {
                console.error('Polling error:', err);
            }

            attempts++;
            await new Promise((r) => setTimeout(r, 1000));
        }

        setStatus('error');
        setErrorMsg('Processing timed out');
    };

    const handleUpload = async (file) => {
        if (!file || file.type !== 'application/pdf') {
            setErrorMsg('Please select a PDF file');
            setStatus('error');
            return;
        }

        setFileName(file.name);
        setStatus('uploading');
        setErrorMsg('');

        // Create preview URL
        const url = URL.createObjectURL(file);
        setPdfUrl(url);

        // Upload file
        const formData = new FormData();
        formData.append('pdf', file);

        try {
            const res = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || 'Upload failed');
            }

            const data = await res.json();
            setStatus('processing');

            // Poll for job completion
            await pollJobStatus(data.jobId);
        } catch (err) {
            setStatus('error');
            setErrorMsg(err.message);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) handleUpload(file);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleUpload(file);
    };

    const handleReupload = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = ''; // Clear value so selecting same file works
            fileInputRef.current.click();
        }
    };

    return (
        <div className="pdf-panel">
            <div className="pdf-panel-header">📄 Document</div>

            {status === 'idle' ? (
                <div
                    className={`pdf-upload-zone ${dragOver ? 'drag-over' : ''}`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div className={`upload-area ${dragOver ? 'drag-over' : ''}`}>
                        <div className="upload-icon"><Upload size={32} strokeWidth={1.5} /></div>
                        <div className="upload-text">
                            <span className="upload-text-title">Drag and drop</span>
                            <span style={{ fontWeight: 'normal' }}>PDF files only</span>
                        </div>
                        <button className="btn-reupload">
                            Browse files
                        </button>
                    </div>

                </div>
            ) : pdfUrl ? (
                <div className="pdf-success-container">
                    <div className={`pdf-success-card ${status}`}>
                        <div className="pdf-success-icon">
                            <FileText size={32} />
                        </div>
                        <div className="pdf-success-info">
                            <h4>{fileName}</h4>
                            <div className="pdf-success-status">
                                {(status === 'uploading' || status === 'processing') && <div className="spinner small" />}
                                <span>
                                    {status === 'uploading' && 'Uploading...'}
                                    {status === 'processing' && 'Processing PDF...'}
                                    {status === 'ready' && 'Ready for chat'}
                                    {status === 'error' && (errorMsg || 'Error processing file')}
                                </span>
                            </div>
                        </div>
                        {(status === 'ready' || status === 'error') && (
                            <button className="btn-reupload" onClick={handleReupload}>
                                {status === 'error' ? 'Try again' : 'Upload new'}
                            </button>
                        )}
                    </div>
                </div>
            ) : null}

            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
            />
        </div>
    );
};

export default PdfUpload;
