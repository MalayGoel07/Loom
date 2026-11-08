import { useCallback, useEffect, useMemo, useState } from "react";

const KEY = "loom.chats.v1";
export const uid = () => Math.random().toString(36).slice(2, 10);
const blank = () => ({ id: uid(), title: "New chat", created: Date.now(), updated: Date.now(), messages: [] });

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (Array.isArray(raw?.chats) && raw.chats.length) {
      // a message saved mid-stream was interrupted (page closed / reloaded)
      const chats = raw.chats.map((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.status ? { ...m, status: "", error: m.content ? m.error : "Interrupted before it finished." } : m
        ),
      }));
      return { chats, activeId: chats.some((c) => c.id === raw.activeId) ? raw.activeId : chats[0].id };
    }
  } catch {
    /* corrupted storage: start fresh */
  }
  const c = blank();
  return { chats: [c], activeId: c.id };
}

export function useChats() {
  const [state, setState] = useState(load);
  const { chats, activeId } = state;

  // debounced persistence; images are dropped (data URLs would blow the ~5 MB localStorage quota)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const slim = chats.map((c) => ({
          ...c,
          messages: c.messages.map(({ images, ...m }) => (images?.length ? { ...m, imageCount: images.length } : m)),
        }));
        localStorage.setItem(KEY, JSON.stringify({ chats: slim, activeId }));
      } catch {
        /* quota exceeded or storage disabled */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [chats, activeId]);

  const select = useCallback((id) => setState((s) => ({ ...s, activeId: id })), []);

  const create = useCallback(
    () =>
      setState((s) => {
        const cur = s.chats.find((c) => c.id === s.activeId);
        if (cur && !cur.messages.length) return s; // reuse the empty chat instead of piling up blanks
        const c = blank();
        return { chats: [c, ...s.chats], activeId: c.id };
      }),
    []
  );

  const remove = useCallback(
    (id) =>
      setState((s) => {
        let rest = s.chats.filter((c) => c.id !== id);
        if (!rest.length) rest = [blank()];
        const next = s.activeId === id ? [...rest].sort((a, b) => b.updated - a.updated)[0].id : s.activeId;
        return { chats: rest, activeId: next };
      }),
    []
  );

  const rename = useCallback(
    (id, title) => setState((s) => ({ ...s, chats: s.chats.map((c) => (c.id === id ? { ...c, title } : c)) })),
    []
  );

  const append = useCallback(
    (chatId, msgs) =>
      setState((s) => ({
        ...s,
        chats: s.chats.map((c) => {
          if (c.id !== chatId) return c;
          const messages = [...c.messages, ...msgs];
          const first = messages.find((m) => m.role === "user" && m.content);
          const title = c.title === "New chat" && first ? first.content.replace(/\s+/g, " ").slice(0, 48) : c.title;
          return { ...c, messages, title, updated: Date.now() };
        }),
      })),
    []
  );

  const patchMessage = useCallback(
    (chatId, msgId, fn) =>
      setState((s) => ({
        ...s,
        chats: s.chats.map((c) =>
          c.id === chatId ? { ...c, messages: c.messages.map((m) => (m.id === msgId ? fn(m) : m)) } : c
        ),
      })),
    []
  );

  const active = useMemo(() => chats.find((c) => c.id === activeId) ?? chats[0], [chats, activeId]);

  return { chats, active, activeId: active.id, select, create, remove, rename, append, patchMessage };
}