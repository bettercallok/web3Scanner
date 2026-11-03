import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { API, errorMessage } from "../api";

const MAX_CHARS = 2000;

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ReportChat({ jobId }: { jobId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm your AI security auditor. What would you like to know about this contract or its vulnerabilities?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await axios.post(`${API}/api/scans/${jobId}/chat/`, { message: userMessage });
      setMessages(prev => [...prev, { role: "assistant", content: res.data.reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: errorMessage(err, "Sorry, I couldn't process that request right now.") }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close AI chat" : "Open AI chat"}
        aria-expanded={isOpen}
        style={{
          position: "fixed",
          bottom: 30,
          right: isOpen ? "min(430px, calc(100vw - 80px))" : 30,
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: "var(--blue)",
          color: "white",
          border: "none",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)",
          fontSize: 24,
          cursor: "pointer",
          zIndex: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.2s"
        }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
      >
        {isOpen ? "✕" : "💬"}
      </button>

      {/* Slide-in Chat Panel */}
      <div style={{
        position: "fixed",
        top: 0,
        right: isOpen ? 0 : "-110vw",
        width: "min(400px, 100vw)",
        height: "100vh",
        background: "#0a0a0c",
        borderLeft: "1px solid var(--border)",
        boxShadow: "-10px 0 30px rgba(0,0,0,0.8)",
        transition: "right 0.3s ease",
        zIndex: 998,
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Chat Header */}
        <div style={{
          padding: "20px",
          borderBottom: "1px solid var(--border)",
          background: "rgba(0,0,0,0.2)",
          display: "flex",
          alignItems: "center",
          gap: 12
        }}>
          <div style={{ fontSize: 24 }}>🤖</div>
          <div>
            <div style={{ fontWeight: "bold", color: "var(--text-1)", fontFamily: "'JetBrains Mono', monospace", fontSize: 14 }}>
              AI AUDITOR
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>Answers are AI-generated — verify before acting.</div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await axios.delete(`${API}/api/scans/${jobId}/chat/`).catch(() => undefined);
              setMessages(m => m.slice(0, 1));
            }}
            title="Clear conversation"
            style={{ marginLeft: "auto", background: "none", border: "1px solid var(--border)", color: "var(--text-3)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}
          >
            Clear
          </button>
        </div>

        {/* Message List */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
            }}>
              <div style={{
                fontSize: 11,
                color: "var(--text-3)",
                marginBottom: 4,
                textAlign: msg.role === "user" ? "right" : "left",
                fontFamily: "'JetBrains Mono', monospace",
                textTransform: "uppercase"
              }}>
                {msg.role}
              </div>
              <div style={{
                background: msg.role === "user" ? "var(--blue)" : "rgba(255,255,255,0.05)",
                color: "var(--text-1)",
                padding: "12px 16px",
                borderRadius: "12px",
                borderBottomRightRadius: msg.role === "user" ? 4 : 12,
                borderBottomLeftRadius: msg.role === "assistant" ? 4 : 12,
                border: msg.role === "assistant" ? "1px solid var(--border)" : "none",
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap"
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: "flex-start", color: "var(--text-3)", fontSize: 14 }}>
              <span className="spinner" style={{ width: 14, height: 14, display: "inline-block", marginRight: 8, borderWidth: 2 }} />
              Thinking...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <form onSubmit={handleSend} style={{ padding: 20, borderTop: "1px solid var(--border)", background: "rgba(0,0,0,0.2)" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value.slice(0, MAX_CHARS))}
              maxLength={MAX_CHARS}
              aria-label="Ask the AI auditor"
              placeholder="Ask about the vulnerabilities..."
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "12px 16px",
                color: "var(--text-1)",
                fontSize: 14,
                outline: "none"
              }}
              disabled={loading}
            />
            <button 
              type="submit" 
              disabled={loading || !input.trim()}
              style={{
                background: "var(--blue)",
                color: "white",
                border: "none",
                borderRadius: 8,
                padding: "0 20px",
                cursor: (loading || !input.trim()) ? "not-allowed" : "pointer",
                opacity: (loading || !input.trim()) ? 0.5 : 1,
                fontWeight: "bold",
                fontFamily: "'JetBrains Mono', monospace"
              }}
            >
              SEND
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
