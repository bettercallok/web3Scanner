"""
LangChain RAG pipeline using Ollama (CodeLlama/Mistral) + ChromaDB.
Performs semantic vulnerability analysis and false-positive filtering.
"""
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are an expert Ethereum smart contract security auditor with deep knowledge
of the SWC registry, DeFi exploits, and Solidity internals.

You will be given:
1. A Solidity smart contract source code
2. Findings from Slither (static analysis)
3. Findings from Mythril (symbolic execution)
4. Relevant historical vulnerability context from the knowledge base

Your tasks:
A) Identify any additional vulnerabilities the automated tools missed (focus on business logic, access control, economic attacks).
B) Flag any tool findings that are false positives given the contract's intended design.
C) Write clear remediation advice for each real vulnerability.
D) Produce an executive summary for a non-technical audience.

Respond ONLY in valid JSON with this exact schema:
{
  "summary": "<executive summary string>",
  "vulnerabilities": [
    {
      "title": "<short title>",
      "description": "<detailed technical description>",
      "severity": "<critical|high|medium|low|informational>",
      "confidence": "<high|medium|low>",
      "swc_id": "<SWC-XXX or empty>",
      "remediation": "<specific fix recommendation>"
    }
  ],
  "false_positives": ["<tool finding title that is a false positive>"]
}
"""


def analyze_with_rag(source_code: str, slither_findings: dict, mythril_findings: dict) -> dict:
    """
    Run the full RAG pipeline:
    1. Retrieve similar historical vulnerabilities from ChromaDB
    2. Build an augmented prompt
    3. Query Ollama (CodeLlama or Mistral)
    4. Parse and return structured response
    """
    try:
        from langchain_community.llms import Ollama
        from langchain_community.embeddings import OllamaEmbeddings
        from langchain_chroma import Chroma
        from langchain.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser

        llm = Ollama(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
            temperature=0.1,
            timeout=900,
        )

        embeddings = OllamaEmbeddings(
            base_url=settings.OLLAMA_BASE_URL,
            model="nomic-embed-text",
        )

        vectorstore = Chroma(
            collection_name="web3_vulnerabilities",
            embedding_function=embeddings,
            host=settings.CHROMA_HOST,
            port=settings.CHROMA_PORT,
        )

        retriever = vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": 5},
        )

        # Retrieve relevant context using source code as query
        query = f"Smart contract vulnerability analysis:\n{source_code[:3000]}"
        context_docs = retriever.invoke(query)
        context = "\n\n---\n\n".join(d.page_content for d in context_docs)

    except Exception as e:
        logger.warning(f"RAG retrieval failed, falling back to direct LLM: {e}")
        llm = Ollama(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
            temperature=0.1,
            timeout=900,
        )
        context = "No historical context available."

    # Build prompt
    slither_summary = _summarize_findings(slither_findings, "Slither")
    mythril_summary = _summarize_findings(mythril_findings, "Mythril")

    user_message = f"""
## Smart Contract Source Code (truncated):
```solidity
{source_code[:3000]}
```

## Slither Findings:
{slither_summary}

## Mythril Findings:
{mythril_summary}

Analyze this contract and respond with the JSON schema defined in your instructions.
"""

    try:
        response = llm.invoke(_SYSTEM_PROMPT + "\n\n" + user_message)
        return _parse_llm_response(response)
    except Exception as e:
        logger.error(f"LLM inference failed: {e}")
        return {
            "summary": f"AI analysis could not complete: {e}",
            "vulnerabilities": [],
            "false_positives": [],
        }


def _summarize_findings(findings: dict | None, tool: str) -> str:
    if not findings:
        return f"{tool}: No data"
    if "error" in findings:
        return f"{tool}: Error — {findings['error']}"

    detectors = findings.get("results", {}).get("detectors", findings.get("issues", []))
    if not detectors:
        return f"{tool}: No issues detected"

    lines = []
    for d in detectors[:15]:   # cap at 15 findings to stay within context
        name = d.get("check", d.get("title", "?"))
        impact = d.get("impact", d.get("severity", "?"))
        lines.append(f"- [{impact}] {name}: {d.get('description', d.get('description', ''))[:150]}")
    return "\n".join(lines)


def _parse_llm_response(response: str) -> dict:
    import json, re
    # Extract JSON from the response (model may add commentary around it)
    match = re.search(r"\{.*\}", response, re.DOTALL)
    if not match:
        return {
            "summary": response[:500],
            "vulnerabilities": [],
            "false_positives": [],
        }
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return {
            "summary": response[:500],
            "vulnerabilities": [],
            "false_positives": [],
        }
