const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

const generateEmbedding = async (text) => {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'nomic-embed-text',
            prompt: text,
        }),
    });

    if (!response.ok) {
        throw new Error(`Ollama embedding error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding;
};

const generateEmbeddings = async (texts) => {
    const embeddings = [];
    for (const text of texts) {
        const embedding = await generateEmbedding(text);
        embeddings.push(embedding);
    }
    return embeddings;
};

const streamChat = async (prompt, context, onChunk) => {
    const systemPrompt = `You are a helpful assistant that answers questions based on the provided document context. 
Use the context below to answer the user's question. If the context doesn't contain relevant information, 
say that you don't have enough information from the document to answer the question.
Be concise and accurate in your responses.

Context from the document:
${context}`;

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'llama3',
            prompt: prompt,
            system: systemPrompt,
            stream: true,
        }),
    });

    if (!response.ok) {
        throw new Error(`Ollama generate error: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((line) => line.trim());

        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                if (parsed.response) {
                    onChunk(parsed.response);
                }
                if (parsed.done) {
                    return;
                }
            } catch (e) {
                // Skip invalid JSON
            }
        }
    }
};

module.exports = { generateEmbedding, generateEmbeddings, streamChat };
