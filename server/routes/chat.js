const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');
const { addPdfJob, pdfQueue } = require('../services/queue');
const { generateEmbedding } = require('../services/ollamaService');
const { queryEmbeddings } = require('../services/vectorStore');
const { streamChat } = require('../services/ollamaService');

const router = express.Router();

// POST /api/upload — Upload PDF and add to processing queue
router.post('/upload', auth, async (req, res) => {
    try {
        if (!req.files || !req.files.pdf) {
            return res.status(400).json({ message: 'No PDF file uploaded' });
        }

        const pdfFile = req.files.pdf;

        // Validate file type
        if (pdfFile.mimetype !== 'application/pdf') {
            return res.status(400).json({ message: 'Only PDF files are allowed' });
        }

        // Save file to uploads directory
        // what if two different users uploaded the same filename? hence we need uuid.
        const fileName = `${uuidv4()}_${pdfFile.name}`;
        // current (routes) folder -> go one step back (server) -> go to uploads folder -> save the file
        const uploadPath = path.join(__dirname, '..', 'uploads', fileName);

        await pdfFile.mv(uploadPath);

        // Add job to queue
        const jobId = await addPdfJob(req.user.id, uploadPath, pdfFile.name);

        res.status(202).json({
            message: 'PDF uploaded and queued for processing',
            jobId,
            fileName: pdfFile.name,
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Upload failed' });
    }
});

// GET /api/job-status/:id — Check PDF processing job status
router.get('/job-status/:id', auth, async (req, res) => {
    try {
        const job = await pdfQueue.getJob(req.params.id);

        if (!job) {
            return res.status(404).json({ message: 'Job not found' });
        }

        const state = await job.getState();
        const progress = job.progress || 0;

        res.json({
            jobId: job.id,
            state, // waiting, active, completed, failed
            progress,
            data: state === 'failed' ? { error: job.failedReason } : undefined,
        });
    } catch (error) {
        console.error('Job status error:', error);
        res.status(500).json({ message: 'Failed to get job status' });
    }
});

// GET /api/chat — SSE streaming chat endpoint
router.get('/chat', auth, async (req, res) => {
    const { question } = req.query;

    if (!question) {
        return res.status(400).json({ message: 'Question is required' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
        // 1. Generate embedding for the question
        const queryEmbedding = await generateEmbedding(question);

        // 2. Query ChromaDB for relevant chunks
        const relevantChunks = await queryEmbeddings(req.user.id, queryEmbedding, 5);
        const context = relevantChunks.join('\n\n---\n\n');

        if (!context || relevantChunks.length === 0) {
            res.write(`data: ${JSON.stringify({ token: "I don't have any document loaded to answer your question. Please upload a PDF first." })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
            return;
        }

        // 3. Stream response from Ollama
        await streamChat(question, context, (token) => {
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
        });

        // Signal completion
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    } catch (error) {
        console.error('Chat error:', error);
        res.write(`data: ${JSON.stringify({ error: 'Failed to generate response' })}\n\n`);
        res.end();
    }

    // Handle client disconnect
    // what if the user closes the connection in between the response? (like closing the tab) we should stop the process.
    req.on('close', () => {
        res.end();
    });
});

module.exports = router;
