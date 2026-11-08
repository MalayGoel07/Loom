import { useEffect, useMemo, useRef, useState } from "react";
import { downloadUrl, searchDocuments } from "../api/api.js";
import { I, focus } from "./ui.jsx";

const TTL_DAYS = 7; // matches the TTL index in db.py
const fmtDate = (s) => new Date(s * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const ext = (name) => (name.includes(".") ? name.split(".").pop().toUpperCase().slice(0, 4) : "FILE");

function originalState(d) {
  if (!d.file_id) return { label: "Index only", cls: "bg-zinc-100 text-zinc-600", canDownload: false };
  if (Date.now() / 1000 - d.added > TTL_DAYS * 86400) return { label: "Expired", cls: "bg-amber-50 text-amber-700", canDownload: false };
  return { label: "Stored", cls: "bg-emerald-50 text-emerald-700", canDownload: true };
}

function Row({ d, onRemove, onAsk }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);
  const st = originalState(d);
  const btn = `rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 ${focus}`;
  return (
    <tr className="border-t border-zinc-200 hover:bg-zinc-50/60">
      <td className="py-2.5 pl-4 pr-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-10 shrink-0 place-items-center rounded-md bg-indigo-50 text-[10px] font-semibold tracking-wide text-indigo-700">{ext(d.name)}</span>
          <span className="truncate text-sm font-medium text-zinc-900" title={d.name}>{d.name}</span>
        </div>
      </td>
      <td className="hidden px-2 text-sm text-zinc-600 sm:table-cell">{d.chunks}</td>
      <td className="hidden px-2 text-sm text-zinc-600 md:table-cell">{fmtDate(d.added)}</td>
      <td className="hidden px-2 lg:table-cell">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
      </td>
      <td className="py-2 pl-2 pr-3">
        <div className="flex items-center justify-end gap-0.5">
          <button type="button" onClick={() => onAsk(d)} className={`rounded-md px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 ${focus}`}>Ask</button>
          {st.canDownload && (
            <a href={downloadUrl(d.id)} aria-label={`Download ${d.name}`} title="Download original" className={btn}>
              <I.Download className="h-4 w-4" />
            </a>
          )}
          <button
            type="button"
            onClick={() => (confirm ? onRemove(d.id) : setConfirm(true))}
            aria-label={confirm ? "Confirm delete" : `Delete ${d.name}`}
            className={`rounded-md p-1.5 ${focus} ${confirm ? "bg-red-50 text-red-600" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"}`}
          >
            {confirm ? <span className="px-1 text-xs font-medium">Delete?</span> : <I.Trash className="h-4 w-4" />}
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function Library({ docs, health, indexing, uploadErr, onUpload, onRemove, onAsk }) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("files"); // files = filter by name, content = semantic search
  const [hits, setHits] = useState(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? docs.filter((d) => d.name.toLowerCase().includes(t)) : docs;
  }, [docs, q]);

  const runSearch = async () => {
    const t = q.trim();
    if (!t) return;
    setSearching(true);
    setErr("");
    try {
      setHits(await searchDocuments(t, 8));
    } catch (e) {
      setErr(e.message);
      setHits(null);
    } finally {
      setSearching(false);
    }
  };

  const pick = (files) => {
    const list = [...files];
    if (list.length) onUpload(list);
  };

  const totalChunks = docs.reduce((n, d) => n + d.chunks, 0);

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files);
      }}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 px-5">
        <h1 className="text-sm font-medium text-zinc-900">Library</h1>
        <span className="text-xs text-zinc-500">{docs.length} documents · {totalChunks} passages</span>
        <button type="button" onClick={() => fileRef.current?.click()} className={`ml-auto inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 ${focus}`}>
          <I.Upload className="h-4 w-4" />
          {indexing ? "Indexing…" : "Add files"}
        </button>
        <input ref={fileRef} type="file" multiple hidden accept=".pdf,.txt,.md,.csv,.json,.py,.js,.jsx,.ts,.html" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-5 px-5 py-6">
          {/* search */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <I.Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    if (mode === "content") setHits(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && mode === "content" && runSearch()}
                  placeholder={mode === "files" ? "Filter documents by name" : "Search inside your documents, press Enter"}
                  aria-label="Search library"
                  className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div role="tablist" aria-label="Search mode" className="flex rounded-lg bg-zinc-100 p-0.5 text-sm">
                {[["files", "File names"], ["content", "Contents"]].map(([k, label]) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={mode === k}
                    type="button"
                    onClick={() => {
                      setMode(k);
                      setHits(null);
                      setErr("");
                    }}
                    className={`rounded-md px-3 py-1.5 ${focus} ${mode === k ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {mode === "content" && (
                <button type="button" onClick={runSearch} disabled={!q.trim() || searching} className={`rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 ${focus}`}>
                  {searching ? "Searching…" : "Search"}
                </button>
              )}
            </div>
            {mode === "content" && <p className="text-xs text-zinc-500">Semantic search: finds passages by meaning, not just exact words.</p>}
          </div>

          {uploadErr && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{uploadErr}</p>}
          {health && !health.mongo && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              MongoDB is not connected, so original files are not kept. Documents are still indexed and searchable.
            </p>
          )}

          {/* content search results */}
          {mode === "content" && (
            <section aria-live="polite">
              {err && <p className="text-sm text-red-700">{err}</p>}
              {hits && !hits.length && <p className="py-6 text-center text-sm text-zinc-500">Nothing matched. Try different words or add more documents.</p>}
              {hits?.length > 0 && (
                <ul className="space-y-3">
                  {hits.map((h, i) => {
                    const doc = docs.find((d) => d.name === h.doc);
                    return (
                      <li key={i} className="rounded-xl border border-zinc-200 p-4">
                        <div className="mb-2 flex items-center gap-2 text-xs">
                          <span className="font-medium text-zinc-800">{h.doc}</span>
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-mono text-indigo-700">{Math.round(h.score * 100)}% match</span>
                          {doc && (
                            <button type="button" onClick={() => onAsk(doc)} className={`ml-auto rounded px-1.5 py-0.5 font-medium text-indigo-600 hover:bg-indigo-50 ${focus}`}>
                              Ask about this file
                            </button>
                          )}
                        </div>
                        <p className="line-clamp-6 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-600">{h.text}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!hits && !err && !searching && <p className="py-6 text-center text-sm text-zinc-400">Type a question or phrase and press Enter.</p>}
            </section>
          )}

          {/* documents table */}
          {mode === "files" && (
            <>
              {docs.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 px-6 py-14 text-center hover:border-indigo-400 hover:bg-indigo-50/30 ${focus}`}
                >
                  <I.Upload className="h-6 w-6 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-800">Drop files here or click to browse</span>
                  <span className="text-xs text-zinc-500">PDF, text, markdown, CSV, JSON or code</span>
                </button>
              ) : (
                <div className="overflow-hidden rounded-xl border border-zinc-200">
                  <table className="w-full table-fixed text-left">
                    <thead className="bg-zinc-50 text-xs font-medium text-zinc-500">
                      <tr>
                        <th className="py-2.5 pl-4 pr-2 font-medium">Name</th>
                        <th className="hidden w-24 px-2 font-medium sm:table-cell">Passages</th>
                        <th className="hidden w-36 px-2 font-medium md:table-cell">Added</th>
                        <th className="hidden w-28 px-2 font-medium lg:table-cell">Original</th>
                        <th className="w-36 py-2.5 pr-3"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((d) => <Row key={d.id} d={d} onRemove={onRemove} onAsk={onAsk} />)}
                    </tbody>
                  </table>
                  {!filtered.length && <p className="border-t border-zinc-200 py-8 text-center text-sm text-zinc-500">No documents match “{q}”.</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-2xl border-2 border-dashed border-indigo-400 bg-indigo-50/80 text-sm font-medium text-indigo-700">
          Drop to add to your library
        </div>
      )}
    </div>
  );
}
