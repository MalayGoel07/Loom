import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1";

const Svg = ({ children, className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {children}
  </svg>
);

export const I = {
  Chat: (p) => <Svg {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" /></Svg>,
  Folder: (p) => <Svg {...p}><path d="M4 6a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></Svg>,
  Plus: (p) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
  Search: (p) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>,
  Image: (p) => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="1.6" /><path d="m21 15-5-5L5 21" /></Svg>,
  Send: (p) => <Svg {...p}><path d="M12 19V5m0 0-6 6m6-6 6 6" /></Svg>,
  Stop: (p) => <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></Svg>,
  File: (p) => <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Svg>,
  X: (p) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>,
  Menu: (p) => <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>,
  Upload: (p) => <Svg {...p}><path d="M12 16V4m0 0-4 4m4-4 4 4" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></Svg>,
  Download: (p) => <Svg {...p}><path d="M12 4v12m0 0-4-4m4 4 4-4" /><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1" /></Svg>,
  Tool: (p) => <Svg {...p}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z" /></Svg>,
  Trash: (p) => <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></Svg>,
  Copy: (p) => <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></Svg>,
  Check: (p) => <Svg {...p}><path d="m5 12 5 5 9-10" /></Svg>,
  Chevron: (p) => <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>,
  Pencil: (p) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /></Svg>,
  Chat2: (p) => <Svg {...p}><path d="M5 5h14v10H9l-4 4z" /></Svg>,
};

export function Logo({ className = "h-8 w-8" }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-lg bg-indigo-600 text-white ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-[60%] w-[60%]" aria-hidden="true">
        <path d="M6 4v16M12 4v16M18 4v16M4 8h16M4 14h16" />
      </svg>
    </span>
  );
}

export function Typing() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Working">
      {[0, 150, 300].map((d) => (
        <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-500" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

export function CopyButton({ text, className = "" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className={`rounded-md p-1.5 transition-opacity ${focus} ${className}`}
    >
      {done ? <I.Check className="h-4 w-4" /> : <I.Copy className="h-4 w-4" />}
    </button>
  );
}

/* ───────── markdown ───────── */
const tag = (Tag, cls) =>
  function MdTag({ node, ...props }) {
    return <Tag className={cls} {...props} />;
  };

const md = {
  h1: tag("h3", "mt-6 mb-2 text-lg font-semibold text-zinc-900"),
  h2: tag("h3", "mt-5 mb-2 text-base font-semibold text-zinc-900"),
  h3: tag("h4", "mt-4 mb-1.5 text-[15px] font-semibold text-zinc-900"),
  h4: tag("h4", "mt-4 mb-1.5 text-[15px] font-semibold text-zinc-900"),
  p: tag("p", "my-2.5 leading-7"),
  ul: tag("ul", "my-2.5 list-disc space-y-1 pl-6 marker:text-zinc-400"),
  ol: tag("ol", "my-2.5 list-decimal space-y-1 pl-6 marker:text-zinc-500"),
  li: tag("li", "pl-1 leading-7"),
  blockquote: tag("blockquote", "my-3 border-l-2 border-zinc-300 pl-4 text-zinc-600"),
  hr: tag("hr", "my-5 border-zinc-200"),
  strong: tag("strong", "font-semibold text-zinc-900"),
  thead: tag("thead", "bg-zinc-50 text-zinc-600"),
  th: tag("th", "px-3 py-2 font-medium"),
  td: tag("td", "border-t border-zinc-200 px-3 py-2 align-top"),
  a: ({ node, ...props }) => (
    <a target="_blank" rel="noreferrer" className="text-indigo-600 underline underline-offset-2 hover:text-indigo-700" {...props} />
  ),
  table: ({ node, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-zinc-200">
      <table className="w-full text-left text-sm" {...props} />
    </div>
  ),
  pre: ({ node, children }) => {
    const c = Array.isArray(children) ? children[0] : children;
    const text = String(c?.props?.children ?? "").replace(/\n$/, "");
    return (
      <div className="group/code relative my-3">
        <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 text-[13px] leading-relaxed text-zinc-100">{children}</pre>
        <CopyButton text={text} className="absolute right-2 top-2 bg-zinc-800 text-zinc-300 opacity-0 hover:text-white group-hover/code:opacity-100 focus-visible:opacity-100" />
      </div>
    );
  },
  code: ({ node, className, children, ...props }) => {
    const block = /language-/.test(className || "") || String(children).includes("\n");
    return block ? (
      <code className={`font-mono ${className || ""}`} {...props}>{children}</code>
    ) : (
      <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] text-zinc-800" {...props}>{children}</code>
    );
  },
};

export function Markdown({ text }) {
  return (
    <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
