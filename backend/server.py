"""
MCP server (stdio). main.py launches this as a subprocess and exposes its tools to the model.
Never print() to stdout here — stdout is the MCP transport. Use stderr for logs.

Standalone test:  npx @modelcontextprotocol/inspector python server.py
"""
import ast
import math
import operator
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from mcp.server.fastmcp import FastMCP

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
DEFAULT_TZ = os.getenv("DEFAULT_TZ", "UTC")

mcp = FastMCP("rag-tools")

def log(*a):
    print(*a, file=sys.stderr)


# ───────────────────────── RAG tools (call back into FastAPI) ─────────────────────────
@mcp.tool()
async def search_documents(query: str, top_k: int = 4) -> str:
    """Semantic search over the user's uploaded documents. Use for questions about their files.
    Args:
        query: What to look for, phrased as a short search query.
        top_k: Number of passages to return (1-10).
    """
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{BACKEND_URL}/api/search", json={"query": query, "top_k": top_k})
        r.raise_for_status()
        hits = r.json()
    if not hits:
        return "No documents have been uploaded yet, or nothing matched."
    return "\n\n".join(f"[{h['doc']}] (score {h['score']})\n{h['text']}" for h in hits)


@mcp.tool()
async def list_documents() -> str:
    """List the names of all documents the user has uploaded."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{BACKEND_URL}/api/documents")
        r.raise_for_status()
        docs = r.json()
    if not docs:
        return "No documents uploaded."
    return "\n".join(f"- {d['name']} ({d['chunks']} chunks)" for d in docs)


# ───────────────────────── utility tools ─────────────────────────
_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod, ast.Pow: operator.pow,
    ast.USub: operator.neg, ast.UAdd: operator.pos,
}
_FUNCS = {
    "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos, "tan": math.tan, "log": math.log,
    "log10": math.log10, "exp": math.exp, "abs": abs, "round": round, "floor": math.floor, "ceil": math.ceil,
}
_CONSTS = {"pi": math.pi, "e": math.e}


def _eval(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.Name) and node.id in _CONSTS:
        return _CONSTS[node.id]
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        left, right = _eval(node.left), _eval(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > 1000:
            raise ValueError("exponent too large")
        return _OPS[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.operand))
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _FUNCS:
        return _FUNCS[node.func.id](*[_eval(a) for a in node.args])
    raise ValueError("unsupported expression")


@mcp.tool()
def calculate(expression: str) -> str:
    """Evaluate a math expression exactly, e.g. '(12.5 * 4) / 3' or 'sqrt(2) ** 3'.
    Supports + - * / // % **, parentheses, pi, e, sqrt, sin, cos, tan, log, log10, exp, abs, round, floor, ceil."""
    try:
        return str(_eval(ast.parse(expression, mode="eval").body))
    except Exception as e:
        return f"Could not evaluate '{expression}': {e}"


@mcp.tool()
def get_current_time(timezone: str = DEFAULT_TZ) -> str:
    """Get the current date and time.

    Args:
        timezone: IANA timezone name, e.g. 'UTC', 'Asia/Kolkata', 'America/New_York'.
    """
    try:
        now = datetime.now(ZoneInfo(timezone))
    except ZoneInfoNotFoundError:
        return (
            f"Timezone data for '{timezone}' is not available on the server "
            "(on Windows, run: pip install tzdata). Do not retry; tell the user."
        )
    except Exception as e:
        return f"Invalid timezone '{timezone}': {e}"
    return now.strftime(f"%A, %d %B %Y, %H:%M:%S ({timezone}, UTC%z)")


if __name__ == "__main__":
    log("[server.py] starting MCP server over stdio")
    mcp.run(transport="stdio")
