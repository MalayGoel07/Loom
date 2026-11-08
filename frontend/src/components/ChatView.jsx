import { useEffect, useRef, useState } from "react";
import { CopyButton, I, Markdown, Typing, focus } from "./ui.jsx";

const SUGGESTIONS = [
  { title: "Summarise a document", text: "Summarise the key points of my most recent document" },
  { title: "Use a tool", text: "What is 18% of 4,250, then the square root of that?" },
  { title: "Ask about the time", text: "What time is it in Tokyo right now?" },
];

function Chip({ on, onClick, children, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${focus} ${
        on ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-indigo-500" : "bg-zinc-300"}`} />
      {children}
    </button>
  );
}

function Title({ chat, onRename }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(chat.title);
  useEffect(() => {
    setVal(chat.title);
    setEdit(false);
  }, [chat.id, chat.title]);
  const commit = () => {
    const t = val.trim();
    if (t && t !== chat.title) onRename(chat.id, t);
    setEdit(false);
  };
  if (edit)
    return (
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setVal(chat.title);
            setEdit(false);
          }
        }}
        aria-label="Chat title"
        className="min-w-0 max-w-md rounded-md border border-indigo-500 px-2 py-1 text-sm font-medium outline-none ring-2 ring-indigo-500/20"
      />
    );
  return (
    <button type="button" onClick={() => setEdit(true)} title="Rename chat" className={`group flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-zinc-900 hover:bg-zinc-100 ${focus}`}>
      <span className="truncate">{chat.title}</span>
      <I.Pencil className="h-3.5 w-3.5 shrink-0 text-zinc-400 opacity-0 group-hover:opacity-100" />
    </button>
  );
}

function ToolCall({ t }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`flex w-full items-center gap-2 px-3 py-2 text-left ${focus}`}>
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-amber-100 text-amber-700">
          <I.Tool className="h-3 w-3" />
        </span>
        <span className="font-mono text-xs font-medium text-zinc-800">{t.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-500">{JSON.stringify(t.args)}</span>
        <span className="shrink-0 text-xs text-zinc-500">{t.result == null ? "Running…" : open ? "Hide" : "Details"}</span>
      </button>
      {open && t.result != null && (
        <pre className="max-h-52 overflow-auto border-t border-zinc-200 bg-white px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-700">{t.result}</pre>
      )}
    </div>
  );
}

function Sources({ items }) {
  const [open, setOpen] = useState(false);
  const names = [...new Set(items.map((s) => s.doc))];
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`flex w-full items-center gap-2 px-3 py-2 text-left ${focus}`}>
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-emerald-100 text-emerald-700">
          <I.File className="h-3 w-3" />
        </span>
        <span className="text-xs font-medium text-zinc-800">{items.length} passages from your documents</span>
        <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{names.join(", ")}</span>
        <span className="shrink-0 text-xs text-zinc-500">{open ? "Hide" : "View"}</span>
      </button>
      {open && (
        <ul className="divide-y divide-zinc-200 border-t border-zinc-200 bg-white">
          {items.map((s, i) => (
            <li key={i} className="px-3 py-2.5">
              <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                <span className="font-medium text-zinc-700">{s.doc}</span>
                <span className="font-mono">{Math.round(s.score * 100)}% match</span>
              </div>
              <p className="line-clamp-4 text-[13px] leading-relaxed text-zinc-600">{s.text}</p>
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
        <div className="max-w-[85%] space-y-2 rounded-2xl bg-zinc-100 px-4 py-2.5 text-[15px] leading-relaxed text-zinc-900">
          {m.images?.map((src, i) => (
            <img key={i} src={src} alt="attachment" className="max-h-52 rounded-lg" />
          ))}
          {!m.images?.length && m.imageCount > 0 && (
            <p className="text-xs text-zinc-500">{m.imageCount} image{m.imageCount > 1 ? "s" : ""} attached</p>
          )}
          {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
        </div>
      </div>
    );

  const working = !!m.status;
  return (
    <div className="group">
      {(m.sources?.length > 0 || m.tools?.length > 0) && (
        <div className="mb-3 space-y-2">
          {m.sources?.length > 0 && <Sources items={m.sources} />}
          {m.tools?.map((t) => <ToolCall key={t.id} t={t} />)}
        </div>
      )}
      {m.content && (
        <div className="text-[15px] text-zinc-800">
          <Markdown text={m.content} />
        </div>
      )}
      {working && (
        <div className="flex items-center gap-2.5 py-1 text-sm text-zinc-500">
          <Typing />
          {m.status}
        </div>
      )}
      {m.error && <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{m.error}</p>}
      {m.content && !working && (
        <div className="mt-1 flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <CopyButton text={m.content} className="text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" />
        </div>
      )}
    </div>
  );
}

export default function ChatView({
  chat, model, docsCount, streaming, blocked, draft, setDraft,
  useRag, setUseRag, useTools, setUseTools, onSend, onStop, onRename, onOpenLibrary,
}) {
  const [images, setImages] = useState([]);
  const endRef = useRef(null);
  const taRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.messages, chat.id]);
  useEffect(() => setImages([]), [chat.id]);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [draft]);

  const addImages = (files) =>
    [...files].forEach((f) => {
      const rd = new FileReader();
      rd.onload = () => setImages((p) => [...p, rd.result]);
      rd.readAsDataURL(f);
    });

  const canSend = !streaming && !blocked && (draft.trim() || images.length);
  const submit = () => {
    if (!canSend) return;
    onSend(draft, images);
    setImages([]);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 px-4">
        <Title chat={chat} onRename={onRename} />
        <span className="ml-auto shrink-0 rounded-md bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-600">{model}</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-8 px-5 py-8">
          {!chat.messages.length && (
            <div className="pt-[8vh]">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">Ask your documents anything</h2>
              <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-zinc-500">
                Answers come from files in your Library and the tools on the MCP server, all running on this machine.
                {docsCount === 0 && (
                  <>
                    {" "}
                    <button type="button" onClick={onOpenLibrary} className={`rounded text-indigo-600 underline underline-offset-2 hover:text-indigo-700 ${focus}`}>
                      Add your first document
                    </button>
                    .
                  </>
                )}
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => {
                      setDraft(s.text);
                      taRef.current?.focus();
                    }}
                    className={`rounded-xl border border-zinc-200 p-4 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 ${focus}`}
                  >
                    <span className="block text-sm font-medium text-zinc-900">{s.title}</span>
                    <span className="mt-1 block text-[13px] leading-snug text-zinc-500">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {chat.messages.map((m) => <Message key={m.id} m={m} />)}
          <div ref={endRef} />
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-zinc-300 bg-white shadow-sm transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
            {images.length > 0 && (
              <div className="flex gap-2 px-3 pt-3">
                {images.map((src, i) => (
                  <div key={i} className="relative">
                    <img src={src} alt="" className="h-16 rounded-lg border border-zinc-200" />
                    <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="Remove image" className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-white">
                      <I.X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={taRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              disabled={blocked}
              placeholder={blocked ? "Another chat is still generating…" : "Message Loom…"}
              aria-label="Message"
              className="block max-h-44 min-h-[44px] w-full resize-none bg-transparent px-4 pb-1 pt-3 text-[15px] outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed"
            />
            <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-1">
              <button type="button" onClick={() => imgRef.current?.click()} aria-label="Attach image" title="Attach image (read by the vision model)" className={`rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 ${focus}`}>
                <I.Image className="h-5 w-5" />
              </button>
              <input ref={imgRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
              <Chip on={useRag} onClick={() => setUseRag(!useRag)} title="Retrieve passages from your documents">Documents</Chip>
              <Chip on={useTools} onClick={() => setUseTools(!useTools)} title="Let the model call MCP tools">Tools</Chip>
              <div className="ml-auto">
                {streaming ? (
                  <button type="button" onClick={onStop} aria-label="Stop generating" className={`grid h-8 w-8 place-items-center rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 ${focus}`}>
                    <I.Stop className="h-4 w-4" />
                  </button>
                ) : (
                  <button type="button" onClick={submit} disabled={!canSend} aria-label="Send" className={`grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:bg-zinc-200 disabled:text-zinc-400 ${focus}`}>
                    <I.Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-zinc-400">Enter to send · Shift+Enter for a new line · Runs locally, answers can be wrong</p>
        </div>
      </div>
    </div>
  );
}
