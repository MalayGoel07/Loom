"""
FastAPI backend: RAG (Ollama embeddings + numpy) + MCP client (spawns server.py over stdio)
+ streaming chat with tool-calling on local Ollama.

Run:  uvicorn main:app --port 8000          (add --reload on Linux/macOS only)
"""
import asyncio
import io
import json
import os
import re
import sys
import time
import uuid
from contextlib import AsyncExitStack, asynccontextmanager
from pathlib import Path

import numpy as np
from urllib.parse import quote

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from ollama import AsyncClient
from pydantic import BaseModel
from pypdf import PdfReader

# ───────────────────────── config ─────────────────────────
BASE = Path(__file__).parent
DATA = BASE / "data"
DATA.mkdir(exist_ok=True)

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
CHAT_MODEL = os.getenv("CHAT_MODEL", "qwen3.5:4b")
VISION_MODEL = os.getenv("VISION_MODEL", "qwen2.5vl:3b")
EMBED_MODEL = os.getenv("EMBED_MODEL", "nomic-embed-text")  # ollama pull nomic-embed-text
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", 900))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", 150))
TOP_K = int(os.getenv("TOP_K", 4))
MAX_TOOL_ROUNDS = int(os.getenv("MAX_TOOL_ROUNDS", 4))
MAX_HISTORY = int(os.getenv("MAX_HISTORY", 12))
THINK = os.getenv("THINK", "false").lower() == "true"

ollama = AsyncClient(host=OLLAMA_HOST)

try:
    import db
    MONGO_OK = True
except Exception as e:
    db = None
    MONGO_OK = False
    print(f"[mongo] disabled: {e!r}")

def owner_of(request: Request) -> str:
    return request.headers.get("x-user-id") or os.getenv("DEFAULT_OWNER", "local")

# ───────────────────────── RAG store ─────────────────────────
def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    text = re.sub(r"[ \t]+\n", "\n", text).strip()
    chunks, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):  # prefer breaking on a paragraph / sentence boundary
            cut = max(text.rfind("\n\n", start, end), text.rfind(". ", start, end))
            if cut > start + size * 0.5:
                end = cut + 1
        piece = text[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return chunks


async def embed(texts: list[str]) -> np.ndarray:
    vecs = []
    try:
        for i in range(0, len(texts), 16):
            res = await ollama.embed(model=EMBED_MODEL, input=texts[i : i + 16])
            vecs.extend(res.embeddings)
    except Exception as e:
        raise HTTPException(502, f"Embedding failed ({EMBED_MODEL}). Try: ollama pull {EMBED_MODEL}. {e}")
    m = np.array(vecs, dtype=np.float32)
    return m / (np.linalg.norm(m, axis=1, keepdims=True) + 1e-9)


class VectorStore:
    def __init__(self, path: Path):
        self.path = path
        self.docs: dict[str, dict] = {}
        self.chunks: list[dict] = []
        self.matrix = np.zeros((0, 1), dtype=np.float32)
        self._load()

    def _load(self):
        if not self.path.exists():
            return
        raw = json.loads(self.path.read_text())
        self.docs, self.chunks = raw["docs"], raw["chunks"]
        if self.chunks:
            self.matrix = np.array([c["vec"] for c in self.chunks], dtype=np.float32)

    def _save(self):
        self.path.write_text(json.dumps({"docs": self.docs, "chunks": self.chunks}))

    async def add(self, name: str, text: str, file_id: str | None = None) -> dict:
        pieces = chunk_text(text)
        if not pieces:
            raise HTTPException(400, "No readable text found in file.")
        vecs = await embed(pieces)
        doc_id = uuid.uuid4().hex[:8]
        self.docs[doc_id] = {
            "id": doc_id,
            "name": name,
            "chunks": len(pieces),
            "added": int(time.time()),
            "file_id": file_id,  # key of the original file in MongoDB (None if not stored)
        }
        for p, v in zip(pieces, vecs):
            self.chunks.append({"doc_id": doc_id, "doc_name": name, "text": p, "vec": v.tolist()})
        self.matrix = np.array([c["vec"] for c in self.chunks], dtype=np.float32)
        self._save()
        return self.docs[doc_id]

    def remove(self, doc_id: str):
        if doc_id not in self.docs:
            raise HTTPException(404, "Document not found")
        del self.docs[doc_id]
        self.chunks = [c for c in self.chunks if c["doc_id"] != doc_id]
        self.matrix = (
            np.array([c["vec"] for c in self.chunks], dtype=np.float32)
            if self.chunks
            else np.zeros((0, 1), dtype=np.float32)
        )
        self._save()

    async def search(self, query: str, k: int = TOP_K) -> list[dict]:
        if not self.chunks:
            return []
        q = (await embed([query]))[0]
        scores = self.matrix @ q
        top = np.argsort(-scores)[:k]
        return [
            {"doc": self.chunks[i]["doc_name"], "text": self.chunks[i]["text"], "score": round(float(scores[i]), 3)}
            for i in top
        ]


store = VectorStore(DATA / "store.json")


# ───────────────────────── MCP client ─────────────────────────
class MCPState:
    session: ClientSession | None = None
    tools: list[dict] = []
mcp_state = MCPState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncExitStack() as stack:
        try:
            params = StdioServerParameters(
                command=sys.executable,
                args=[str(BASE / "server.py")],
                env={**os.environ, "BACKEND_URL": BACKEND_URL},
            )
            read, write = await stack.enter_async_context(stdio_client(params))
            session = await stack.enter_async_context(ClientSession(read, write))
            await session.initialize()
            listed = await session.list_tools()
            mcp_state.session = session
            mcp_state.tools = [
                {
                    "type": "function",
                    "function": {"name": t.name, "description": t.description or "", "parameters": t.inputSchema},
                }
                for t in listed.tools
            ]
            print(f"[mcp] connected, tools: {[t['function']['name'] for t in mcp_state.tools]}")
        except Exception as e:  # app still works as plain RAG chat
            print(f"[mcp] failed to start server.py: {e!r}")
        yield


app = FastAPI(title="RAG + MCP", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

async def call_mcp_tool(name: str, args: dict) -> str:
    if not mcp_state.session:
        return "Tool server is not connected."
    try:
        res = await mcp_state.session.call_tool(name, args)
        text = "\n".join(c.text for c in res.content if getattr(c, "text", None))
        return f"Error: {text}" if res.isError else (text or "(no output)")
    except Exception as e:
        return f"Error calling {name}: {e}"


# ───────────────────────── REST: health, docs, search ─────────────────────────
@app.get("/api/health")
async def health():
    try:
        have = [m.model for m in (await ollama.list()).models]
    except Exception:
        have = None
    def present(name: str) -> bool | None:
        if have is None:
            return None
        return any(h == name or h.startswith(name + ":") or h.split(":")[0] == name for h in have)
    return {
        "ollama": have is not None,
        "models": {
            "chat": {"name": CHAT_MODEL, "ok": present(CHAT_MODEL)},
            "vision": {"name": VISION_MODEL, "ok": present(VISION_MODEL)},
            "embed": {"name": EMBED_MODEL, "ok": present(EMBED_MODEL)},
        },
        "mcp": mcp_state.session is not None,
        "mongo": MONGO_OK,
    }

@app.get("/api/tools")
async def tools():
    return [{"name": t["function"]["name"], "description": t["function"]["description"]} for t in mcp_state.tools]

@app.get("/api/documents")
async def list_documents():
    return sorted(store.docs.values(), key=lambda d: d["added"], reverse=True)

@app.post("/api/documents")
async def upload_document(request: Request, file: UploadFile = File(...)):
    raw = await file.read()
    name = file.filename or "untitled"
    owner = owner_of(request)

    # 1) extract text first (cheap, and fails before anything is stored)
    if name.lower().endswith(".pdf"):
        try:
            text = "\n\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(raw)).pages)
        except Exception as e:
            raise HTTPException(400, f"Could not read PDF: {e}")
    else:
        text = raw.decode("utf-8", errors="ignore")

    # 2) keep the original in MongoDB (blocking pymongo call -> worker thread)
    file_id = None
    if MONGO_OK:
        try:
            file_id = await asyncio.to_thread(db.save_file, name, raw, owner)
        except Exception as e:
            raise HTTPException(503, f"MongoDB error: {e}")
        if file_id is None:
            raise HTTPException(409, f"File limit reached ({db.MAX_FILES}). Delete a file first.")

    # 3) chunk + embed + index; roll the stored original back if indexing fails
    try:
        return await store.add(name, text, file_id)
    except Exception:
        if file_id:
            await asyncio.to_thread(db.delete_file, file_id, owner)
        raise


@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str, request: Request):
    doc = store.docs.get(doc_id)
    store.remove(doc_id)  # raises 404 if unknown
    if MONGO_OK and doc and doc.get("file_id"):
        await asyncio.to_thread(db.delete_file, doc["file_id"], owner_of(request))
    return {"ok": True}


@app.get("/api/documents/{doc_id}/download")
async def download_document(doc_id: str, request: Request):
    doc = store.docs.get(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    if not (MONGO_OK and doc.get("file_id")):
        raise HTTPException(404, "Original file was not stored")
    owner = owner_of(request)
    data = await asyncio.to_thread(db.load_file, doc["file_id"], owner)
    if data is None:  # Mongo's TTL index deletes originals after 7 days
        raise HTTPException(404, "Original file has expired (stored for 7 days)")
    return Response(
        data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(doc['name'])}"},
    )


@app.get("/api/files")
async def stored_files(request: Request):
    """What is currently stored in MongoDB for this owner (name, size, created)."""
    if not MONGO_OK:
        return []
    rows = await asyncio.to_thread(db.show_files, owner_of(request))
    return [{"id": r["_id"], "name": r["name"], "size": r["size"], "created": r["created"].isoformat()} for r in rows]

class SearchReq(BaseModel):
    query: str
    top_k: int = TOP_K

@app.post("/api/search")
async def search(req: SearchReq):
    return await store.search(req.query, max(1, min(req.top_k, 10)))


# ───────────────────────── chat (SSE) ─────────────────────────
class ChatReq(BaseModel):
    messages: list[dict]
    images: list[str] = []
    use_rag: bool = True
    use_tools: bool = True

def sse(**event) -> str:
    return f"data: {json.dumps(event)}\n\n"

SYSTEM = (
    "You are a helpful assistant running fully locally. "
    "When document context is provided, ground your answer in it and cite the file name in square brackets, "
    "e.g. [notes.pdf]. If the context does not contain the answer, say so instead of guessing. "
    "Use tools when they help (math, current time, searching or listing documents). Be concise."
)

@app.post("/api/chat")
async def chat(req: ChatReq):
    async def stream():
        try:
            history = [
                {"role": m["role"], "content": m["content"]}
                for m in req.messages
                if m.get("role") in ("user", "assistant") and m.get("content")
            ][-MAX_HISTORY:]
            question = next((m["content"] for m in reversed(history) if m["role"] == "user"), "")
            system = SYSTEM

            # 1) vision: let qwen2.5vl describe attached images, pass the text on to the chat model
            if req.images:
                yield sse(type="status", text=f"Reading image with {VISION_MODEL}…")
                vis = await ollama.chat(
                    model=VISION_MODEL,
                    messages=[
                        {
                            "role": "user",
                            "content": "Describe this image in detail and transcribe any visible text. "
                            f"Focus on what is relevant to: {question}",
                            "images": req.images,
                        }
                    ],
                )
                system += f"\n\nThe user attached an image. Description from the vision model:\n{vis.message.content}"

            # 2) RAG: retrieve top-k chunks and inject as context
            if req.use_rag and store.chunks and question:
                yield sse(type="status", text="Searching documents…")
                hits = await store.search(question, TOP_K)
                yield sse(type="sources", items=hits)
                ctx = "\n\n".join(f"[{i + 1}] ({h['doc']})\n{h['text']}" for i, h in enumerate(hits))
                system += f"\n\nContext from the user's documents:\n{ctx}"

            messages = [{"role": "system", "content": system}, *history]
            tools = mcp_state.tools if (req.use_tools and mcp_state.tools) else None

            # 3) generate, with a tool-calling loop (MCP)
            for _ in range(MAX_TOOL_ROUNDS + 1):
                yield sse(type="status", text=f"Thinking with {CHAT_MODEL}…")
                text, calls = "", []
                async for chunk in await ollama.chat( model=CHAT_MODEL, messages=messages, tools=tools, stream=True, think=THINK11):
                    if chunk.message.content:
                        text += chunk.message.content
                        yield sse(type="token", text=chunk.message.content)
                    if chunk.message.tool_calls:
                        calls.extend(chunk.message.tool_calls)

                if not calls:
                    break

                messages.append({"role": "assistant", "content": text, "tool_calls": calls})
                for call in calls:
                    cid = uuid.uuid4().hex[:6]
                    name, args = call.function.name, dict(call.function.arguments or {})
                    yield sse(type="tool_call", id=cid, name=name, args=args)
                    result = await call_mcp_tool(name, args)
                    yield sse(type="tool_result", id=cid, result=result[:4000])
                    messages.append({"role": "tool", "tool_name": name, "content": result})

            yield sse(type="done")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            yield sse(type="error", text=str(e))

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})