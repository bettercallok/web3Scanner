"""
Chat engine for report interactions.
Maintains context of the report and vulnerabilities to answer user questions.
"""
import logging
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

_CHAT_SYSTEM_PROMPT = """You are a smart contract security expert assisting a developer.
You are answering questions about a specific smart contract and its security audit report.

Contract Source (Truncated):
```solidity
{source_code}
```

Audit Findings:
{findings_summary}

Be concise, helpful, and technically accurate. If the user asks how to fix a vulnerability,
provide concrete Solidity code snippets if possible.
"""

MAX_MESSAGE_CHARS = 2000


def history_cache_key(job, user) -> str:
    # History is per (job, user): public reports are chatted with by many people
    # and must not leak one viewer's conversation into another's prompt.
    uid = getattr(user, "id", None) or "anon"
    return f"chat_history:{job.id}:{uid}"


def clear_history(job, user) -> None:
    cache.delete(history_cache_key(job, user))


def chat_with_report(job, user_message: str, user=None) -> str:
    """
    Handle a user question about a specific ScanJob.
    Maintains a 1-hour per-user conversation history in the cache.
    """
    user_message = (user_message or "").strip()[:MAX_MESSAGE_CHARS]
    try:
        from langchain_community.llms import Ollama
        from langchain.schema import HumanMessage, SystemMessage, AIMessage

        llm = Ollama(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
            temperature=0.4,
            timeout=120,
        )

        # Build context from job - include confirmed vulns AND false positives
        confirmed = []
        for v in job.vulnerabilities.filter(is_false_positive=False)[:40]:
            confirmed.append(f"- [{v.severity.upper()}] {v.title}: {v.description[:400]}")

        false_positives = []
        for v in job.vulnerabilities.filter(is_false_positive=True)[:20]:
            who = "a reviewer" if v.false_positive_source == "user" else "the AI"
            false_positives.append(f"- {v.title}: {v.description[:200]} (reason: {v.tool} flagged but {who} marked it as benign)")

        findings_summary = ""
        if confirmed:
            findings_summary += "Confirmed Vulnerabilities:\n" + "\n".join(confirmed)
        else:
            findings_summary += "Confirmed Vulnerabilities: None.\n"

        if false_positives:
            findings_summary += "\n\nFalse Positives (tools flagged but AI dismissed):\n" + "\n".join(false_positives)
        else:
            findings_summary += "\n\nFalse Positives: None."

        if job.ai_summary:
            findings_summary += f"\n\nAI Audit Summary:\n{job.ai_summary}"

        sys_prompt = _CHAT_SYSTEM_PROMPT.format(
            source_code=job.source_code[:4000] if job.source_code else "Source code not available.",
            findings_summary=findings_summary,
        )

        # Retrieve history from cache
        cache_key = history_cache_key(job, user)
        history = cache.get(cache_key, [])
        
        # We need to construct the prompt manually for the base Ollama class if not using ChatOllama
        # but the easiest way is to just format a prompt string since the basic Ollama wrapper takes a string
        
        prompt_parts = [sys_prompt, "\n--- Conversation History ---"]
        for msg in history[-6:]: # Keep last 6 messages
            prompt_parts.append(f"{msg['role'].capitalize()}: {msg['content']}")
            
        prompt_parts.append(f"User: {user_message}")
        prompt_parts.append("Assistant:")
        
        full_prompt = "\n".join(prompt_parts)

        response = llm.invoke(full_prompt)
        response_text = response.strip()

        # Update history
        history.append({"role": "user", "content": user_message})
        history.append({"role": "assistant", "content": response_text})
        
        # Keep history bounded and save to cache (1 hour TTL)
        cache.set(cache_key, history[-10:], timeout=3600)

        return response_text

    except Exception as e:
        logger.error(f"Chat engine failed: {e}")
        return "I'm sorry, I'm currently unavailable to answer questions."
