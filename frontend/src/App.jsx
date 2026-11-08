import { useCallback, useEffect, useRef, useState } from "react";
import { deleteDocument, getDocuments, getHealth, getTools, streamChat, uploadDocument } from "./api/api.js";
import { uid, useChats } from "./hooks/useChats.js";
import ChatView from "./components/ChatView.jsx";
import Library from "./components/Library.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { I, Logo, focus } from "./components/ui.jsx";

export default function App() {
  const chats = useChats();
  const [view, setView] = useState("chat");
  const [drawer, setDrawer] = useState(false);

  const [health, setHealth] = useState(null);
  const [docs, setDocs] = useState([]);
  const [tools, setTools] = useState([]);
  const [indexing, setIndexing] = useState(false);
  const [uploadErr, setUploadErr] = useState("");

  const [useRag, setUseRag] = useState(true);
  const [useTools, setUseTools] = useState(true);
  const [draft, setDraft] = useState("");
  const [streamingId, setStreamingId] = useState(null); // id of the chat currently generating
  const abortRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [h, d, t] = await Promise.all([getHealth(), getDocuments(), getTools()]);
      setHealth(h);
      setDocs(d);
      setTools(t);
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [refresh]);

  /* ───── library actions ───── */
  const upload = async (files) => {
    setUploadErr("");
    setIndexing(true);
    for (const f of files) {
      try {
        await uploadDocument(f);
      } catch (e) {
        setUploadErr(e.message);
      }
    }
    setIndexing(false);
    refresh();
  };

  const removeDoc = async (id) => {
    try {
      await deleteDocument(id);
    } catch (e) {
      setUploadErr(e.message);
    }
    refresh();
  };

  const askAbout = (doc) => {
    chats.create();
    setDraft(`Summarise "${doc.name}" and list the key points.`);
    setView("chat");
  };

  /* ───── chat ───── */
  const send = async (text, images = []) => {
    const chatId = chats.activeId;
    const content = text.trim();
    if (streamingId || (!content && !images.length)) return;

    const userMsg = { id: uid(), role: "user", content, images };
    const aid = uid();
    const history = [...chats.active.messages, userMsg];
    chats.append(chatId, [userMsg, { id: aid, role: "assistant", content: "", tools: [], sources: [], status: "Starting…" }]);
    setDraft("");
    setStreamingId(chatId);

    const patch = (fn) => chats.patchMessage(chatId, aid, fn);
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
      await streamChat(
        {
          messages: history.map(({ role, content }) => ({ role, content })),
          images: images.map((d) => d.split(",")[1]), // strip "data:...;base64,"
          use_rag: useRag,
          use_tools: useTools,
        },
        ctrl.signal,
        handle
      );
      handle({ type: "done" });
    } catch (e) {
      if (e.name === "AbortError") handle({ type: "done" });
      else handle({ type: "error", text: e.message === "Failed to fetch" ? "Could not reach the backend. Is uvicorn running?" : e.message });
    } finally {
      setStreamingId(null);
      abortRef.current = null;
    }
  };

  const goChat = (fn) => (...a) => {
    fn?.(...a);
    setView("chat");
    setDrawer(false);
  };

  return (
    <div className="flex h-screen bg-white font-sans text-zinc-900 antialiased">
      {drawer && <div className="fixed inset-0 z-20 bg-zinc-900/40 lg:hidden" onClick={() => setDrawer(false)} />}
      <div className={`fixed inset-y-0 left-0 z-30 transition-transform lg:static lg:translate-x-0 ${drawer ? "translate-x-0" : "-translate-x-full"}`}>
        <Sidebar
          chats={chats.chats}
          activeId={chats.activeId}
          view={view}
          streamingId={streamingId}
          docsCount={docs.length}
          health={health}
          tools={tools}
          onView={(v) => {
            setView(v);
            setDrawer(false);
          }}
          onSelect={goChat(chats.select)}
          onNew={goChat(() => {
            chats.create();
            setDraft("");
          })}
          onDelete={chats.remove}
          onClose={() => setDrawer(false)}
        />
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 px-3 lg:hidden">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open sidebar" className={`rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 ${focus}`}>
            <I.Menu className="h-5 w-5" />
          </button>
          <Logo className="h-6 w-6" />
          <span className="text-sm font-semibold">Loom</span>
        </div>

        {view === "chat" ? (
          <ChatView
            chat={chats.active}
            model={health?.models?.chat?.name ?? "local model"}
            docsCount={docs.length}
            streaming={streamingId === chats.activeId}
            blocked={!!streamingId && streamingId !== chats.activeId}
            draft={draft}
            setDraft={setDraft}
            useRag={useRag}
            setUseRag={setUseRag}
            useTools={useTools}
            setUseTools={setUseTools}
            onSend={send}
            onStop={() => abortRef.current?.abort()}
            onRename={chats.rename}
            onOpenLibrary={() => setView("library")}
          />
        ) : (
          <Library docs={docs} health={health} indexing={indexing} uploadErr={uploadErr} onUpload={upload} onRemove={removeDoc} onAsk={askAbout} />
        )}
      </main>
    </div>
  );
}