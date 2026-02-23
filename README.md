# Intelligent-Document-Assistance — RAG Application

A full-stack Retrieval-Augmented Generation (RAG) application that lets users upload a PDF document and have a natural-language conversation with its content. The system runs entirely locally, using Ollama for LLM inference and embeddings, ChromaDB as the vector store, and Redis for background job queuing.

---

## Table of Contents

1. [How It Works](#how-it-works)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [File Structure](#file-structure)
5. [Prerequisites](#prerequisites)
6. [Running Locally](#running-locally)
7. [Environment Variables](#environment-variables)
8. [API Reference](#api-reference)

---

## How It Works

The application follows a standard RAG pipeline broken into two phases: **ingestion** and **retrieval**.

### PDF Ingestion

1. A logged-in user uploads a PDF via the frontend.
2. The server saves the file to disk and pushes a job onto a **BullMQ queue** backed by Redis.
3. A separate **worker process** picks up the job and:
   - Loads the PDF using LangChain's `PDFLoader` (one document object per page).
   - Splits the text into overlapping chunks (500 characters, 50-character overlap) using `RecursiveCharacterTextSplitter`.
   - Generates a vector embedding for each chunk by calling Ollama's `nomic-embed-text` model.
   - Deletes the user's previous ChromaDB collection (so a new PDF always replaces the old one).
   - Stores all chunks and their embeddings in ChromaDB under a collection scoped to the user's ID.
   - Deletes the temporary file from disk.

### Chat / Retrieval

1. The user types a question in the chat panel.
2. The server generates an embedding for the question using the same `nomic-embed-text` model.
3. ChromaDB performs a **cosine similarity search** and returns the five most relevant chunks from the user's collection.
4. Those chunks are assembled into a context string (with source filename and page number) and sent to Ollama's `llama3` model.
5. The model streams its response back token-by-token using **Server-Sent Events (SSE)**, so the answer appears in real time.

### Authentication

Users sign up and sign in with email and password. Passwords are hashed with `bcryptjs`. On success, a **JWT is issued and stored as an `httpOnly` cookie**, protecting it from client-side JavaScript. Every protected route verifies this cookie via a middleware guard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (React)                    │
│  AuthPage  ──► sign in / sign up                        │
│  ChatPage  ──► PDF upload + chat interface              │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP / SSE
┌──────────────────────────▼──────────────────────────────┐
│               Express Server  (port 3001)               │
│                                                         │
│  POST /api/auth/signup   POST /api/auth/signin          │
│  POST /api/upload   ──► pushes job to Redis queue       │
│  GET  /api/job-status/:id                               │
│  GET  /api/chat     ──► SSE streaming response          │
└───────┬──────────────────────────────┬──────────────────┘
        │                              │
        │ BullMQ job                   │ HTTP
┌───────▼────────┐          ┌──────────▼──────────────────┐
│  Worker Process │          │          Ollama             │
│  (worker.js)   │          │  model: llama3              │
│                │          │  embed: nomic-embed-text     │
│  1. Load PDF   │          └─────────────────────────────┘
│  2. Chunk text │
│  3. Embed ──────────────► Ollama (nomic-embed-text)
│  4. Store ──────────────► ChromaDB (port 8000)
└────────────────┘

External Services
┌─────────────────┐   ┌──────────────────┐   ┌──────────────┐
│  MongoDB Atlas  │   │  Redis (local)   │   │  ChromaDB    │
│  (users)        │   │  (job queue)     │   │  (vectors)   │
└─────────────────┘   └──────────────────┘   └──────────────┘
```

The worker runs as a **separate process** from the API server. This means heavy PDF processing never blocks HTTP request handling.

Each user's vectors are stored in their own ChromaDB **collection** named `user_<userId>`, so one user's documents are never accessible to another.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router v7, Lucide icons |
| Backend | Node.js, Express 5 |
| Authentication | JWT (httpOnly cookies), bcryptjs |
| Database | MongoDB Atlas via Mongoose |
| Job Queue | BullMQ + Redis (ioredis) |
| Vector Store | ChromaDB |
| LLM & Embeddings | Ollama (`llama3`, `nomic-embed-text`) |
| PDF Processing | LangChain (`PDFLoader`, `RecursiveCharacterTextSplitter`) |
| Streaming | Server-Sent Events (SSE) |

---

## File Structure

```
chat-with-pdf-rag/
│
├── client/                     # React frontend (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatPanel.jsx       # Chat UI with SSE streaming
│   │   │   ├── MessageBubble.jsx   # Individual chat message
│   │   │   ├── PdfUpload.jsx       # Upload widget + progress polling
│   │   │   └── ProtectedRoute.jsx  # Route guard (redirects if not logged in)
│   │   ├── context/
│   │   │   └── AuthContext.jsx     # Global auth state (user, login, logout)
│   │   ├── pages/
│   │   │   ├── AuthPage.jsx        # Sign-in / Sign-up page
│   │   │   └── ChatPage.jsx        # Main app page (PDF panel + chat panel)
│   │   ├── App.jsx                 # Router setup and auth-aware redirects
│   │   ├── main.jsx                # React entry point
│   │   └── index.css               # Global styles
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── server/                     # Node.js/Express backend
    ├── config/
    │   └── db.js                   # MongoDB Atlas connection
    ├── middleware/
    │   └── auth.js                 # JWT cookie verification middleware
    ├── models/
    │   └── User.js                 # Mongoose user schema (hashed password)
    ├── routes/
    │   ├── auth.js                 # /signup, /signin, /logout, /me
    │   └── chat.js                 # /upload, /job-status/:id, /chat (SSE)
    ├── services/
    │   ├── ollamaService.js        # Embedding generation + streaming LLM calls
    │   ├── queue.js                # BullMQ queue definition
    │   └── vectorStore.js          # ChromaDB CRUD (store, query, delete)
    ├── uploads/                    # Temporary storage for uploaded PDFs
    ├── chroma/                     # ChromaDB persistent data directory
    ├── worker.js                   # Background PDF processing worker
    ├── index.js                    # Express app entry point
    ├── .env                        # Environment variables (not committed)
    └── package.json
```

---

## Prerequisites

Make sure the following are installed and running before starting the project:

- **Node.js** v18 or later
- **Ollama** — [ollama.ai](https://ollama.ai). Pull the required models:
  ```bash
  ollama pull llama3
  ollama pull nomic-embed-text
  ```
- **ChromaDB** — Install via pip and run it as a server:
  ```bash
  pip install chromadb
  chroma run --path ./server/chroma
  ```
  ChromaDB will listen on `http://localhost:8000` by default.
- **Redis** — Can be run via Docker:
  ```bash
  docker run -d -p 6379:6379 redis
  ```
  Or installed natively on your system.
- **MongoDB Atlas** — Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com) and copy your connection string into `.env`.

---

## Running Locally

The application requires **four concurrent processes**. Open a terminal for each.

### 1. Start ChromaDB

```bash
cd server
chroma run --path ./chroma
```

### 2. Start the API Server

```bash
cd server
npm install
npm start
```

The server runs on `http://localhost:3001`.

### 3. Start the Worker

```bash
cd server
npm run worker
```

The worker connects to Redis and listens for PDF processing jobs. It must be running for PDF uploads to be processed.

### 4. Start the Frontend

```bash
cd client
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

Once all four are running, open `http://localhost:5173` in your browser, create an account, upload a PDF, and start chatting.

---

## Environment Variables

Create a `.env` file inside the `server/` directory with the following keys:

```env
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>
JWT_SECRET=a-long-random-secret-string
OLLAMA_BASE_URL=http://localhost:11434
REDIS_URL=redis://localhost:6379
CLIENT_URL=http://localhost:5173
PORT=3001
```

> The `.env` file is listed in `.gitignore` and should never be committed to version control.

---

## API Reference

All routes under `/api` (except `/api/auth/signup` and `/api/auth/signin`) require a valid JWT cookie.

### Authentication

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Create a new account |
| `POST` | `/api/auth/signin` | Sign in and receive a JWT cookie |
| `POST` | `/api/auth/logout` | Clear the JWT cookie |
| `GET` | `/api/auth/me` | Return the current authenticated user |

### Chat & PDF

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload a PDF (multipart/form-data, field: `pdf`) |
| `GET` | `/api/job-status/:id` | Poll processing status (`waiting`, `active`, `completed`, `failed`) |
| `GET` | `/api/chat?question=...` | Stream an answer via SSE |

The `/api/chat` endpoint returns a stream of `text/event-stream` events in the format:

```
data: {"token": "Hello"}
data: {"token": " world"}
data: {"done": true}
```
