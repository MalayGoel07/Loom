import { useEffect, useMemo, useState } from "react";
import { I, Logo, focus } from "./ui.jsx";

function groupByDate(chats) {
  const sod = (t) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const day = 86400000;
  const today = sod(Date.now());
  const buckets = [["Today", []], ["Yesterday", []], ["Previous 7 days", []], ["Older", []]];
  for (const c of chats) {
    const t = sod(c.updated);
    buckets[t >= today ? 0 : t >= today - day ? 1 : t >= today - 7 * day ? 2 : 3][1].push(c);
  }
  return buckets.filter(([, list]) => list.length);
}

function NavButton({ active, icon, label, badge, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${focus} ${
        active ? "bg-white font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {icon}
      {label}
      {badge != null && <span className="ml-auto rounded-full bg-zinc-200/80 px-2 py-0.5 text-xs text-zinc-600">{badge}</span>}
    </button>
  );
}

function ChatItem({ chat, active, streaming, onSelect, onDelete }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  return (
    <div className={`group flex items-center rounded-lg ${active ? "bg-white shadow-sm ring-1 ring-zinc-200" : "hover:bg-zinc-100"}`}>
      <button
        type="button"
        onClick={onSelect}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${focus} ${active ? "font-medium text-zinc-900" : "text-zinc-600"}`}
      >
        {streaming && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-indigo-500" aria-label="Generating" />}
        <span className="truncate">{chat.title}</span>
      </button>
      <button
        type="button"
        onClick={() => (confirm ? onDelete() : setConfirm(true))}
        aria-label={confirm ? "Confirm delete" : `Delete ${chat.title}`}
        className={`mr-1 shrink-0 rounded-md p-1.5 ${focus} ${
          confirm
            ? "bg-red-50 text-red-600"
            : "text-zinc-400 hover:text-zinc-700 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
        }`}
      >
        {confirm ? <span className="px-1 text-xs font-medium">Delete?</span> : <I.Trash className="h-4 w-4" />}
      </button>
    </div>
  );
}

function StatusDot({ ok, optional }) {
  const c = ok === true ? "bg-emerald-500" : ok == null ? "bg-zinc-300" : optional ? "bg-amber-400" : "bg-red-500";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${c}`} />;
}

function SystemStatus({ health, tools }) {
  const [open, setOpen] = useState(false);
  const models = health?.models ? Object.entries(health.models) : [];
  const ready = health && health.ollama && health.mcp && models.every(([, m]) => m.ok);
  const summary = !health ? "Backend offline" : ready ? "All systems ready" : "Needs attention";
  const rows = [
    ["Ollama", health ? health.ollama : false],
    ...models.map(([role, m]) => [m.name, m.ok, role]),
    ["MCP server", health?.mcp ?? false, `${tools.length} tools`],
    ["MongoDB", health?.mongo ?? false, health?.mongo ? "originals kept" : "off", true],
  ];
  return (
    <div className="border-t border-zinc-200 p-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-600 hover:bg-zinc-100 ${focus}`}>
        <StatusDot ok={health ? !!ready : false} />
        {summary}
        <I.Chevron className={`ml-auto h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <ul className="mt-1 space-y-1 px-2 pb-1">
          {rows.map(([label, ok, hint, optional]) => (
            <li key={label} className="flex items-center gap-2 text-xs text-zinc-600">
              <StatusDot ok={ok} optional={optional} />
              <span className="truncate font-mono">{label}</span>
              {hint && <span className="ml-auto shrink-0 text-zinc-400">{hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Sidebar({ chats, activeId, view, streamingId, docsCount, health, tools, onView, onSelect, onNew, onDelete, onClose }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = [...chats].sort((a, b) => b.updated - a.updated);
    if (!t) return list;
    return list.filter((c) => c.title.toLowerCase().includes(t) || c.messages.some((m) => m.content?.toLowerCase().includes(t)));
  }, [chats, q]);
  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div className="flex h-full w-72 flex-col border-r border-zinc-200 bg-zinc-50">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <Logo />
        <div className="leading-tight">
          <p className="text-[15px] font-semibold text-zinc-900">Loom</p>
          <p className="text-xs text-zinc-500">Local RAG + MCP</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close sidebar" className={`ml-auto rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200 lg:hidden ${focus}`}>
            <I.X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="space-y-1 px-3" aria-label="Main">
        <NavButton active={view === "chat"} icon={<I.Chat />} label="Chat" onClick={() => onView("chat")} />
        <NavButton active={view === "library"} icon={<I.Folder />} label="Library" badge={docsCount} onClick={() => onView("library")} />
      </nav>

      <div className="space-y-2 px-3 pt-4">
        <button type="button" onClick={onNew} className={`flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 ${focus}`}>
          <I.Plus className="h-4 w-4" />
          New chat
        </button>
        <div className="relative">
          <I.Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-2 text-sm outline-none placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto px-3 pb-3">
        {groups.map(([label, list]) => (
          <section key={label} className="mb-3">
            <h2 className="px-3 pb-1 text-xs font-medium text-zinc-400">{label}</h2>
            <div className="space-y-0.5">
              {list.map((c) => (
                <ChatItem
                  key={c.id}
                  chat={c}
                  active={view === "chat" && c.id === activeId}
                  streaming={c.id === streamingId}
                  onSelect={() => onSelect(c.id)}
                  onDelete={() => onDelete(c.id)}
                />
              ))}
            </div>
          </section>
        ))}
        {!groups.length && <p className="px-3 py-4 text-sm text-zinc-400">No chats match “{q}”.</p>}
      </div>

      <SystemStatus health={health} tools={tools} />
    </div>
  );
}
