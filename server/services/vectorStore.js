const { ChromaClient } = require('chromadb');

let client = null;

// No-op embedding function — we provide our own embeddings from Ollama
class NoopEmbeddingFunction {
    async generate(texts) {
        return texts.map(() => []);
    }
}

const getClient = async () => {
    if (!client) {
        client = new ChromaClient({ path: 'http://localhost:8000' });
    }
    return client;
};

const getOrCreateCollection = async (userId) => {
    const chromaClient = await getClient();
    // Take the userId string. Find ANY character that is NOT a letter, a number, an underscore, or a hyphen. If you find any of those bad characters, instantly replace them with a safe underscore (_).
    const collectionName = `user_${userId.toString().replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const collection = await chromaClient.getOrCreateCollection({
        name: collectionName,
        embeddingFunction: new NoopEmbeddingFunction(),
    });
    return collection;
};


const storeEmbeddings = async (userId, chunks, embeddings, customMetadatas) => {
    const collection = await getOrCreateCollection(userId);

    const ids = chunks.map((_, i) => `chunk_${i}`);
    const documents = chunks.map((chunk) => chunk);
    const metadatas = customMetadatas || chunks.map((_, i) => ({ index: i }));

    //ChromaDB lines up all four of your arrays perfectly by their index:
    // Item 0: Gets ids[0], documents[0], embeddings[0], and metadatas[0].
    // Item 1: Gets ids[1], documents[1], embeddings[1], and metadatas[1].
    await collection.add({
        ids,
        documents,
        embeddings,
        metadatas,
    });

    console.log(`Stored ${chunks.length} chunks for user ${userId}`);
};

const queryEmbeddings = async (userId, queryEmbedding, nResults = 5) => {
    const collection = await getOrCreateCollection(userId);

    const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults,
    });

    const documents = results.documents[0] || [];
    const metadatas = results.metadatas[0] || [];

    return documents.map((doc, i) => ({
        content: doc,
        metadata: metadatas[i] || {}
    }));
};

const deleteCollection = async (userId) => {
    try {
        const chromaClient = await getClient();
        const collectionName = `user_${userId.toString().replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        await chromaClient.deleteCollection({ name: collectionName });
        console.log(`Deleted collection for user ${userId}`);
    } catch (error) {
        // Collection may not exist yet, that's fine
        console.log(`No existing collection to delete for user ${userId}`);
    }
};

module.exports = { storeEmbeddings, queryEmbeddings, deleteCollection };
