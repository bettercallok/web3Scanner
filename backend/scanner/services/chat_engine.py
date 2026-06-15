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

def chat_with_report(job, user_message: str) -> str:
    """
    Handle a user question about a specific ScanJob.
    Maintains a 1-hour conversation history in Redis.
    """
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
        for v in job.vulnerabilities.filter(is_false_positive=False):
            confirmed.append(f"- [{v.severity.upper()}] {v.title}: {v.description}")

        false_positives = []
        for v in job.vulnerabilities.filter(is_false_positive=True):
            false_positives.append(f"- {v.title}: {v.description} (reason: {v.tool} flagged but AI determined this is benign due to contract design)")

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
        cache_key = f"chat_history_{job.id}"
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
