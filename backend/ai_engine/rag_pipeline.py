"""
LangChain RAG pipeline using Ollama (CodeLlama/Mistral) + ChromaDB.
Performs semantic vulnerability analysis and false-positive filtering.
"""
import logging
import re

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


_POC_PROMPT = """You are an elite smart contract security researcher.
Generate a complete, self-contained Foundry (forge) test contract that demonstrates the following vulnerability.
Vulnerability Title: {title}
Description: {description}

Target Contract Source:
```solidity
{source_code}
```

Return ONLY the raw Solidity test code, starting with `// SPDX-License-Identifier:` or `pragma solidity`.
Do not include markdown formatting (e.g. ```solidity), explanations, or any other text.
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
        result = normalize_ai_result(_parse_llm_response(response))
        
        # Phase 2: Generate PoC for High/Critical vulnerabilities
        # Each PoC is a full LLM round-trip; cap them so one scan cannot hog the AI queue.
        poc_budget = MAX_POCS
        for v in result.get("vulnerabilities", []):
            if v.get("severity", "").lower() in ["critical", "high"] and poc_budget > 0:
                poc_budget -= 1
                try:
                    logger.info(f"Generating PoC for {v.get('title')}")
                    poc_code = generate_poc(v, source_code)
                    v["poc_code"] = poc_code
                except Exception as e:
                    logger.error(f"Failed to generate PoC for {v.get('title')}: {e}")
                    v["poc_code"] = ""
            else:
                v["poc_code"] = ""
                
        return result
    except Exception as e:
        logger.error(f"LLM inference failed: {e}")
        return {
            "summary": "AI analysis could not complete (model unavailable or timed out).",
            "vulnerabilities": [],
            "false_positives": [],
        }


_VALID_SEVERITIES = {"critical", "high", "medium", "low", "informational"}
_SEVERITY_ALIASES = {"info": "informational", "informative": "informational", "note": "informational",
                     "moderate": "medium", "severe": "high"}
_VALID_CONFIDENCE = {"high", "medium", "low"}
MAX_AI_FINDINGS = 25
MAX_POCS = 3


def normalize_ai_result(result) -> dict:
    """
    Coerce untrusted LLM JSON into the schema the task layer expects.

    Small local models frequently emit invalid severities, overly long titles
    (DB column is 255 chars), non-list fields, or empty strings in
    ``false_positives`` — the latter would match *every* finding with
    ``title__icontains=""``. Everything is validated here.
    """
    if not isinstance(result, dict):
        result = {}

    summary = result.get("summary")
    summary = summary.strip() if isinstance(summary, str) else ""

    vulns = []
    raw_vulns = result.get("vulnerabilities")
    for v in raw_vulns if isinstance(raw_vulns, list) else []:
        if not isinstance(v, dict):
            continue
        title = str(v.get("title") or "").strip()
        if not title:
            continue
        sev = str(v.get("severity") or "").strip().lower()
        sev = _SEVERITY_ALIASES.get(sev, sev)
        if sev not in _VALID_SEVERITIES:
            sev = "medium"
        conf = str(v.get("confidence") or "").strip().lower()
        if conf not in _VALID_CONFIDENCE:
            conf = "medium"
        swc = str(v.get("swc_id") or "").strip().upper()
        if swc and not re.fullmatch(r"SWC-\d{3}", swc):
            swc = ""
        vulns.append({
            "title": title[:255],
            "description": str(v.get("description") or "")[:5000],
            "severity": sev,
            "confidence": conf,
            "swc_id": swc,
            "remediation": str(v.get("remediation") or "")[:5000],
        })
        if len(vulns) >= MAX_AI_FINDINGS:
            break

    fps = []
    raw_fps = result.get("false_positives")
    for fp in raw_fps if isinstance(raw_fps, list) else []:
        fp = str(fp or "").strip()
        # Require a meaningful title so we never blanket-match every finding.
        if len(fp) >= 4 and fp not in fps:
            fps.append(fp[:255])

    return {"summary": summary[:10000], "vulnerabilities": vulns, "false_positives": fps}


def generate_poc(vuln: dict, source_code: str) -> str:
    """Generate a Foundry PoC for a specific vulnerability."""
    from langchain_community.llms import Ollama
    llm = Ollama(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL,
        temperature=0.2, # slightly higher temp for code gen
        timeout=300,
    )
    
    prompt = _POC_PROMPT.format(
        title=vuln.get("title", "Unknown"),
        description=vuln.get("description", "Unknown"),
        source_code=source_code[:5000] # Cap source to avoid token limits
    )
    
    response = llm.invoke(prompt)
    
    # Clean up response: remove markdown formatting if the model still included it
    response = response.strip()
    if response.startswith("```solidity"):
        response = response[11:]
    elif response.startswith("```"):
        response = response[3:]
    if response.endswith("```"):
        response = response[:-3]
        
    return response.strip()


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
    
    clean_resp = response.strip()
    if clean_resp.startswith("```json"):
        clean_resp = clean_resp[7:]
    elif clean_resp.startswith("```"):
        clean_resp = clean_resp[3:]
    if clean_resp.endswith("```"):
        clean_resp = clean_resp[:-3]
    clean_resp = clean_resp.strip()

    # Try to extract the first { ... } block
    match = re.search(r"\{.*\}", clean_resp, re.DOTALL)
    
    # Try to parse entire JSON
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    # Fallback: if json parsing failed (e.g. truncated output), try to extract just the summary
    summary_match = re.search(r'"summary"\s*:\s*"([^"]+)"', clean_resp)
    summary_text = summary_match.group(1) if summary_match else clean_resp[:500]
    
    return {
        "summary": summary_text.replace("\\n", "\n").strip(),
        "vulnerabilities": [],
        "false_positives": [],
    }
