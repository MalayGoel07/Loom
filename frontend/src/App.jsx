import { useCallback, useEffect, useRef, useState } from "react";

const API = import.meta.env?.VITE_API_URL ?? "http://localhost:8000";
const uid = () => Math.random().toString(36).slice(2, 9);
const SUGGESTIONS = [
  "Summarise the main points of the document I uploaded",
  "What is 18% of 4,250, then the square root of that?",
  "What time is it in Tokyo right now?",
];

/* ───────────── icons ───────────── */
const Icon = ({ d, className = "h-4 w-4" }) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{d}</svg>);
const IconImage = (p) => <Icon {...p} d={<><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="1.6" /><path d="m21 15-5-5L5 21" /></>} />;
const IconSend = (p) => <Icon {...p} d={<path d="M12 19V5m0 0-6 6m6-6 6 6" />} />;
const IconStop = (p) => <Icon {...p} d={<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />} />;
const IconFile = (p) => <Icon {...p} d={<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>} />;
const IconX = (p) => <Icon {...p} d={<path d="M18 6 6 18M6 6l12 12" />} />;
const IconMenu = (p) => <Icon {...p} d={<path d="M4 7h16M4 12h16M4 17h16" />} />;
const IconUpload = (p) => <Icon {...p} d={<><path d="M12 16V4m0 0-4 4m4-4 4 4" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>} />;
const IconTool = (p) => <Icon {...p} d={<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z" />} />;

/* ───────────── small pieces ───────────── */
function StatusRow({ ok, label, hint }) {
  const c = ok === true ? "bg-emerald-400" : ok === false ? "bg-rose-500" : "bg-slate-500";
  return (
    <div className="flex items-center gap-2.5 py-1 text-[13px]">
      <span className={`h-2 w-2 shrink-0 rounded-full ${c} ${ok ? "shadow-[0_0_0_3px_rgba(52,211,153,0.18)]" : ""}`} />
      <span className="truncate text-[#D8E6E1]">{label}</span>
      {hint && <span className="ml-auto text-xs text-[#7F9C96]">{hint}</span>}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-[13px] text-[#D8E6E1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8E86F2]"
    >
      {label}
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-[#7A72EE]" : "bg-[#25504E]"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function SideTitle({ children }) {
  return <h2 className="mb-1.5 text-[13px] font-semibold text-white">{children}</h2>;
}

function Rich({ text }) {
  return text.split(/(```[\s\S]*?(?:```|$))/g).map((p, i) => {
    if (!p) return null;
    if (p.startsWith("```"))
      return (
        <pre key={i} className="my-2 overflow-x-auto rounded-xl bg-[#0E2B2B] p-4 font-mono text-[13px] leading-relaxed text-[#D8E6E1]">
          {p.replace(/^```[\w-]*\n?/, "").replace(/```$/, "")}
        </pre>
      );
    return (
      <p key={i} className="whitespace-pre-wrap">
        {p}
      </p>
    );
  });
}

function Typing() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Working">
      {[0, 150, 300].map((d) => (
        <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#4F46C8]" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

/* a node on the reply's trace line */
function Step({ color, children }) {
  return (
    <div className="relative">
      <span className={`absolute -left-[27px] top-3 h-3 w-3 rounded-full border-2 border-[#F2F4F5] ${color}`} />
      {children}
    </div>
  );
}

function ToolCall({ t }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-[#F0D9A8] bg-[#FFF8E9]">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <IconTool className="h-3.5 w-3.5 shrink-0 text-[#B26A00]" />
        <span className="font-mono text-[13px] font-medium text-[#8A5200]">{t.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-[#9A7B45]">{JSON.stringify(t.args)}</span>
        <span className="shrink-0 text-xs text-[#9A7B45]">{t.result == null ? "running…" : open ? "hide" : "result"}</span>
      </button>
      {open && t.result != null && (
        <pre className="max-h-52 overflow-auto border-t border-[#F0D9A8] px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-[#5E4A22]">
          {t.result}
        </pre>
      )}
    </div>
  );
}

function Sources({ items }) {
  const [open, setOpen] = useState(false);
  const names = [...new Set(items.map((s) => s.doc))];
  return (
    <div className="overflow-hidden rounded-xl border border-[#BFE0DA] bg-[#EDF8F6]">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <IconFile className="h-3.5 w-3.5 shrink-0 text-[#0F766E]" />
        <span className="text-[13px] font-medium text-[#0B5E57]">{items.length} passages retrieved</span>
        <span className="min-w-0 flex-1 truncate text-xs text-[#4E8B84]">{names.join(", ")}</span>
        <span className="shrink-0 text-xs text-[#4E8B84]">{open ? "hide" : "view"}</span>
      </button>
      {open && (
        <ul className="divide-y divide-[#CFE8E3] border-t border-[#BFE0DA]">
          {items.map((s, i) => (
            <li key={i} className="px-3 py-2.5">
              <div className="mb-1 flex items-center justify-between text-xs text-[#4E8B84]">
                <span className="font-medium">{s.doc}</span>
                <span className="font-mono">{Math.round(s.score * 100)}% match</span>
              </div>
              <p className="line-clamp-4 text-[13px] leading-relaxed text-[#2F4F4B]">{s.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Message({ m }) {
  if (m.role === "user")
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-2 rounded-2xl rounded-br-md bg-[#4F46C8] px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-sm">
          {m.images?.map((src, i) => (
            <img key={i} src={src} alt="attachment" className="max-h-52 rounded-lg" />
          ))}
          <Rich text={m.content} />
        </div>
      </div>
    );

  const working = !!m.status;
  return (
    <div className="relative ml-2 space-y-3 border-l-2 border-[#D5DBDF] pl-6">
      {m.sources?.length > 0 && (
        <Step color="bg-[#0F766E]">
          <Sources items={m.sources} />
        </Step>
      )}
      {m.tools?.map((t) => (
        <Step key={t.id} color="bg-[#B26A00]">
          <ToolCall t={t} />
        </Step>
      ))}
      <Step color={`bg-[#4F46C8] ${working ? "animate-pulse" : ""}`}>
        {m.content && (
          <div className="space-y-2 rounded-2xl rounded-tl-md border border-[#DCE2E5] bg-white px-4 py-3 text-[15px] leading-relaxed text-[#16222A] shadow-sm">
            <Rich text={m.content} />
          </div>
        )}
        {working && (
          <div className="flex items-center gap-2.5 py-1.5 text-sm text-[#5E6E76]">
            <Typing />
            {m.status}
          </div>
        )}
        {m.error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
            {m.error}. Check that Ollama is running and the models are pulled.
          </p>
        )}
      </Step>
    </div>
  );
}

/* ───────────── app ───────────── */
export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState([]);
  const [tools, setTools] = useState([]);
  const [health, setHealth] = useState(null);
  const [useRag, setUseRag] = useState(true);
  const [useTools, setUseTools] = useState(true);
  const [indexing, setIndexing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const abortRef = useRef(null);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const imgRef = useRef(null);
  const taRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [h, d, t] = await Promise.all([
        fetch(`${API}/api/health`).then((r) => r.json()),
        fetch(`${API}/api/documents`).then((r) => r.json()),
        fetch(`${API}/api/tools`).then((r) => r.json()),
      ]);
      setHealth(h);
      setDocs(d);
      setTools(t);
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  /* documents */
  const upload = async (files) => {
    if (!files?.length) return;
    setUploadErr("");
    setIndexing(true);
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const r = await fetch(`${API}/api/documents`, { method: "POST", body: fd });
        if (!r.ok) setUploadErr((await r.json().catch(() => ({}))).detail ?? `Could not index ${f.name}`);
      } catch {
        setUploadErr("Backend not reachable");
      }
    }
    setIndexing(false);
    refresh();
  };
  const removeDoc = async (id) => {
    await fetch(`${API}/api/documents/${id}`, { method: "DELETE" });
    refresh();
  };

  const addImages = (files) =>
    [...files].forEach((f) => {
      const rd = new FileReader();
      rd.onload = () => setImages((p) => [...p, rd.result]);
      rd.readAsDataURL(f);
    });

  /* chat */
  const send = async (override) => {
    const text = (override ?? input).trim();
    if ((!text && !images.length) || busy) return;
    const userMsg = { id: uid(), role: "user", content: text, images };
    const aid = uid();
    const assistant = { id: aid, role: "assistant", content: "", tools: [], sources: [], status: "Starting…" };
    const history = [...messages, userMsg];
    setMessages([...history, assistant]);
    setInput("");
    setImages([]);
    setBusy(true);

    const patch = (fn) => setMessages((ms) => ms.map((m) => (m.id === aid ? fn(m) : m)));
    const handle = (ev) => {
      switch (ev.type) {
        case "status":
          return patch((m) => ({ ...m, status: ev.text }));
        case "sources":
          return patch((m) => ({ ...m, sources: ev.items }));
        case "token":
          return patch((m) => ({ ...m, content: m.content + ev.text, status: "" }));
        case "tool_call":
          return patch((m) => ({
            ...m,
            tools: [...m.tools, { id: ev.id, name: ev.name, args: ev.args, result: null }],
            status: `Running ${ev.name}…`,
          }));
        case "tool_result":
          return patch((m) => ({ ...m, tools: m.tools.map((t) => (t.id === ev.id ? { ...t, result: ev.result } : t)) }));
        case "error":
          return patch((m) => ({ ...m, error: ev.text, status: "" }));
        case "done":
          return patch((m) => ({ ...m, status: "" }));
      }
    };

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          images: userMsg.images.map((d) => d.split(",")[1]),
          use_rag: useRag,
          use_tools: useTools,
        }),
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const p of parts) if (p.startsWith("data: ")) handle(JSON.parse(p.slice(6)));
      }
    } catch (e) {
      if (e.name !== "AbortError") handle({ type: "error", text: e.message });
      else handle({ type: "done" });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const models = health?.models;
  const canSend = input.trim() || images.length;

  return (
    <div className="flex h-screen bg-[#F2F4F5] font-sans text-[#16222A]">
      {sidebar && <div className="fixed inset-0 z-10 bg-black/40 lg:hidden" onClick={() => setSidebar(false)} />}

      {/* ───── sidebar ───── */}
      <aside
        className={`${sidebar ? "flex" : "hidden"} fixed inset-y-0 left-0 z-20 w-80 shrink-0 flex-col gap-6 overflow-y-auto bg-[#0E2B2B] p-5 lg:static lg:z-auto lg:flex`}
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Local RAG + MCP</h1>
          <p className="mt-1 text-[13px] leading-snug text-[#8FA9A3]">Your files and tools, answered by models running on this machine.</p>
        </div>

        <section>
          <SideTitle>Status</SideTitle>
          <StatusRow ok={health ? health.ollama : false} label="Ollama" />
          {models &&
            Object.entries(models).map(([role, m]) => <StatusRow key={role} ok={m.ok} label={<span className="font-mono text-xs">{m.name}</span>} hint={role} />)}
          <StatusRow ok={health?.mcp ?? false} label="MCP server" hint={`${tools.length} tools`} />
          {!health && <p className="mt-1 text-xs text-rose-300">Backend not reachable at {API}</p>}
        </section>

        <section>
          <SideTitle>Answer with</SideTitle>
          <Toggle checked={useRag} onChange={setUseRag} label="Document context" />
          <Toggle checked={useTools} onChange={setUseTools} label="MCP tools" />
        </section>

        <section>
          <SideTitle>Documents</SideTitle>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              upload(e.dataTransfer.files);
            }}
            onClick={() => fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-3 py-5 text-center text-[13px] transition-colors ${
              dragging ? "border-[#8E86F2] bg-[#1A3F3E] text-white" : "border-[#2F5C5A] text-[#8FA9A3] hover:bg-[#143635]"
            }`}
          >
            <IconUpload className="h-5 w-5" />
            {indexing ? "Indexing…" : "Drop files here or click to browse"}
            <span className="text-xs text-[#6C8883]">PDF, text, markdown, code</span>
          </div>
          <input ref={fileRef} type="file" multiple hidden accept=".pdf,.txt,.md,.csv,.json,.py,.js,.jsx,.ts,.html" onChange={(e) => upload(e.target.files)} />
          {uploadErr && <p className="mt-2 text-xs text-rose-300">{uploadErr}</p>}
          <ul className="mt-2 space-y-0.5">
            {docs.map((d) => (
              <li key={d.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-[#D8E6E1] hover:bg-[#143635]">
                <IconFile className="h-3.5 w-3.5 shrink-0 text-[#6C8883]" />
                <span className="truncate">{d.name}</span>
                <span className="ml-auto shrink-0 text-xs text-[#6C8883] group-hover:hidden">{d.chunks}</span>
                <button onClick={() => removeDoc(d.id)} className="ml-auto hidden shrink-0 text-[#8FA9A3] hover:text-rose-300 group-hover:block" aria-label={`Remove ${d.name}`}>
                  <IconX className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {!docs.length && <li className="px-2 text-xs text-[#6C8883]">Nothing indexed yet.</li>}
          </ul>
        </section>

        <section>
          <SideTitle>Tools</SideTitle>
          <ul className="space-y-2">
            {tools.map((t) => (
              <li key={t.name}>
                <span className="font-mono text-xs text-[#F2C879]">{t.name}</span>
                <p className="line-clamp-2 text-xs leading-snug text-[#6C8883]">{t.description}</p>
              </li>
            ))}
            {!tools.length && <li className="text-xs text-[#6C8883]">No tools loaded.</li>}
          </ul>
        </section>
      </aside>

      {/* ───── chat ───── */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-[#DCE2E5] bg-white/70 px-4 py-3 backdrop-blur">
          <button onClick={() => setSidebar(true)} className="rounded-lg p-1.5 text-[#5E6E76] hover:bg-[#E8ECEE] lg:hidden" aria-label="Open panel">
            <IconMenu className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium">{models?.chat.name ?? "qwen3.5:4b"}</span>
          <span className="rounded-full bg-[#E8ECEE] px-2 py-0.5 text-xs text-[#5E6E76]">
            {[useRag && "documents", useTools && "tools"].filter(Boolean).join(" + ") || "plain chat"}
          </span>
          {messages.length > 0 && (
            <button onClick={() => !busy && setMessages([])} disabled={busy} className="ml-auto rounded-lg px-2.5 py-1 text-sm text-[#5E6E76] hover:bg-[#E8ECEE] disabled:opacity-40">
              New chat
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="mx-auto max-w-3xl space-y-7">
            {!messages.length && (
              <div className="pt-[10vh]">
                <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight">What do you want to look into?</h2>
                <p className="mt-2 max-w-md text-[15px] text-[#5E6E76]">Add documents on the left, attach an image, or just ask. The model decides when to use a tool.</p>
                <div className="mt-6 flex flex-col items-start gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setInput(s);
                        taRef.current?.focus();
                      }}
                      className="rounded-xl border border-[#DCE2E5] bg-white px-4 py-2.5 text-left text-sm text-[#16222A] shadow-sm transition-colors hover:border-[#4F46C8] hover:text-[#4F46C8]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <Message key={m.id} m={m} />
            ))}
            <div ref={endRef} />
          </div>
        </div>

        {/* composer */}
        <div className="px-4 pb-5">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-[#CBD3D8] bg-white p-2 shadow-[0_2px_12px_rgba(22,34,42,0.06)] transition-colors focus-within:border-[#4F46C8]">
              {images.length > 0 && (
                <div className="flex gap-2 px-2 pb-2 pt-1">
                  {images.map((src, i) => (
                    <div key={i} className="relative">
                      <img src={src} alt="" className="h-16 rounded-lg border border-[#DCE2E5]" />
                      <button
                        onClick={() => setImages(images.filter((_, j) => j !== i))}
                        className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#16222A] text-white"
                        aria-label="Remove image"
                      >
                        <IconX className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-1.5">
                <button onClick={() => imgRef.current?.click()} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#5E6E76] hover:bg-[#E8ECEE]" aria-label="Attach image" title="Attach image (read by qwen2.5vl)">
                  <IconImage className="h-5 w-5" />
                </button>
                <input ref={imgRef} type="file" accept="image/*" multiple hidden onChange={(e) => addImages(e.target.files)} />
                <textarea
                  ref={taRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  rows={1}
                  placeholder="Ask anything…"
                  className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-[#8A98A0]"
                />
                {busy ? (
                  <button onClick={() => abortRef.current?.abort()} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#16222A] text-white" aria-label="Stop">
                    <IconStop className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => send()}
                    disabled={!canSend}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#4F46C8] text-white transition-opacity hover:bg-[#4339B0] disabled:opacity-30"
                    aria-label="Send"
                  >
                    <IconSend className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-[#8A98A0]">Enter to send, Shift+Enter for a new line</p>
          </div>
        </div>
      </main>
    </div>
  );
}