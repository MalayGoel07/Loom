export const API = import.meta.env?.VITE_API_URL ?? "http://localhost:8000";

const json = async (r) => {
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail ?? `${r.status} ${r.statusText}`);
  }
  return r.json();
};

export const getHealth = () => fetch(`${API}/api/health`).then(json);
export const getDocuments = () => fetch(`${API}/api/documents`).then(json);
export const getTools = () => fetch(`${API}/api/tools`).then(json);

export async function uploadDocument(file) {
  const fd = new FormData();
  fd.append("file", file);
  try {
    return await fetch(`${API}/api/documents`, { method: "POST", body: fd }).then(json);
  } catch (e) {
    throw new Error(e.message === "Failed to fetch" ? "Backend not reachable" : `${file.name}: ${e.message}`);
  }
}

export const deleteDocument = (id) => fetch(`${API}/api/documents/${id}`, { method: "DELETE" }).then(json);
export const downloadUrl = (id) => `${API}/api/documents/${id}/download`;

export const searchDocuments = (query, top_k = 8) =>
  fetch(`${API}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k }),
  }).then(json);

/** POST /api/chat and call onEvent for every SSE event. */
export async function streamChat(body, signal, onEvent) {
  const res = await fetch(`${API}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`Chat request failed (${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop();
    for (const p of parts) if (p.startsWith("data: ")) onEvent(JSON.parse(p.slice(6)));
  }
}