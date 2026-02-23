require('dotenv').config();

const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const { PDFLoader } = require('@langchain/community/document_loaders/fs/pdf');
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const { generateEmbeddings } = require('./services/ollamaService');
const { storeEmbeddings, deleteCollection } = require('./services/vectorStore');
const fs = require('fs');

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

const worker = new Worker(
    'pdf-processing', // queue name
    // when a job arrives in the queue, this function will be called
    async (job) => {
        const { userId, filePath, originalName } = job.data;
        console.log(`Processing PDF: ${originalName} for user: ${userId}`);

        try {
            // Step 1: Load PDF using LangChain's PDFLoader
            await job.updateProgress(10);
            const loader = new PDFLoader(filePath); // one document object corresponds exactly to one page in the pdf.
            // so, if we upload a 10-page pdf:
            // docs will be an array of 10 document objects.
            const docs = await loader.load();
            console.log(`Loaded ${docs.length} pages from PDF`);

            // Step 2: Split into chunks using LangChain's RecursiveCharacterTextSplitter
            await job.updateProgress(30);
            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 500,
                chunkOverlap: 50,
            });
            const chunks = await splitter.splitDocuments(docs);
            const chunkTexts = chunks.map((chunk) => chunk.pageContent);
            const chunkMetadatas = chunks.map((chunk, i) => ({
                index: i,
                page: chunk.metadata?.loc?.pageNumber || chunk.metadata?.page || 1,
                source: originalName
            }));
            console.log(`Created ${chunkTexts.length} chunks`);

            if (chunkTexts.length === 0) {
                throw new Error("Could not extract any readable text from this PDF. It might be a scanned image or empty.");
            }


            // Step 3: Generate embeddings for all chunks via Ollama
            await job.updateProgress(50);
            console.log('Generating embeddings...');
            const embeddings = await generateEmbeddings(chunkTexts);
            console.log(`Generated ${embeddings.length} embeddings`);

            // Step 4: Clear old data and store new embeddings in ChromaDB
            await job.updateProgress(80);
            await deleteCollection(userId);
            await storeEmbeddings(userId, chunkTexts, embeddings, chunkMetadatas);

            // Step 5: Clean up uploaded file
            try {
                fs.unlinkSync(filePath);
            } catch (e) {
                console.warn('Could not delete uploaded file:', e.message);
            }

            await job.updateProgress(100);
            console.log(`PDF processing complete for user: ${userId}`);

            return { success: true, chunks: chunkTexts.length };
        } catch (error) {
            console.error(`PDF processing failed:`, error);
            throw error;
        }
    },
    { connection }
);

worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed successfully`);
});

worker.on('failed', (job, error) => {
    console.error(`Job ${job.id} failed:`, error.message);
});

console.log('PDF processing worker started and listening for jobs...');
