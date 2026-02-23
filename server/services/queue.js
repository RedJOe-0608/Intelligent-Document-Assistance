const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

const pdfQueue = new Queue('pdf-processing', { connection });

const addPdfJob = async (userId, filePath, originalName) => {
    const job = await pdfQueue.add('process-pdf', {
        userId,
        filePath,
        originalName,
    });
    return job.id;
};

module.exports = { pdfQueue, addPdfJob, connection };
