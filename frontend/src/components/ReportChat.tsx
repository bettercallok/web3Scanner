import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API, errorMessage } from "../api";
import Icon from "./Icon";

const MAX_CHARS = 2000;
const SUGGESTIONS = [
  "Which finding should I fix first?",
  "Explain the highest-severity issue",
  "Is this contract safe to interact with?",
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

const GREETING: Message = {
  role: "assistant",
  content: "Ask me anything about this contract or its findings — how an issue could be exploited, how to fix it, or what to prioritise.",
};

export default function ReportChat({ jobId }: { jobId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/scans/${jobId}/chat/`, { message: msg });
      setMessages((prev) => [...prev, { role: "assistant", content: res.data.reply }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: errorMessage(err, "Sorry, I couldn't process that request right now.") }]);
    } finally {
      setLoading(false);
    }
  };

  const clear = async () => {
    await axios.delete(`${API}/api/scans/${jobId}/chat/`).catch(() => undefined);
    setMessages([GREETING]);
  };

  return (
    <>
      {!isOpen && (
        <button className="chat-fab" onClick={() => setIsOpen(true)} aria-label="Ask the AI auditor">
          <Icon name="sparkles" size={16} /> Ask AI
        </button>
      )}

      <aside className={`chat-panel ${isOpen ? "open" : ""}`} aria-hidden={!isOpen} aria-label="AI auditor chat">
        <div className="chat-head">
          <span className="check-icon" style={{ width: 30, height: 30 }}><Icon name="sparkles" size={16} /></span>
          <div style={{ flex: 1 }}>
            <div className="chat-title">AI auditor</div>
            <div className="chat-sub">Answers are AI-generated — verify before acting.</div>
          </div>
          <button className="icon-btn" onClick={clear} title="Clear conversation" aria-label="Clear conversation">
            <Icon name="trash" size={15} />
          </button>
          <button className="icon-btn" onClick={() => setIsOpen(false)} title="Close" aria-label="Close chat">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="chat-body">
          {messages.map((m, i) => (
            <div key={i} className={`msg msg-${m.role}`}>{m.content}</div>
          ))}
          {messages.length === 1 && (
            <div className="chat-suggest">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}
          {loading && (
            <div className="msg msg-assistant muted" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="btn-spinner" style={{ borderColor: "var(--surface-3)", borderTopColor: "var(--accent-text)" }} /> Thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            ref={inputRef}
            className="form-input"
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
            maxLength={MAX_CHARS}
            placeholder="Ask about the findings…"
            aria-label="Ask the AI auditor"
            disabled={loading}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()} aria-label="Send">
            <Icon name="arrowRight" size={16} />
          </button>
        </form>
      </aside>
    </>
  );
}
