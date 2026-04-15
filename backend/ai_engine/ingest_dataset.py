"""
Dataset ingestion script — populates ChromaDB with SmartBugs + SWC data.
Run once: python manage.py shell < ai_engine/ingest_dataset.py
Or as a management command.
"""
import os
import json
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

SWC_DESCRIPTIONS = [
    {
        "id": "SWC-101", "title": "Integer Overflow and Underflow",
        "description": "Unchecked arithmetic operations in Solidity < 0.8.0 can overflow or underflow, leading to unexpected token balance manipulation.",
        "example": "uint256 balance = 0; balance -= 1; // wraps to 2^256-1",
        "remediation": "Use Solidity >= 0.8.0 or SafeMath library. Always validate arithmetic results."
    },
    {
        "id": "SWC-107", "title": "Reentrancy",
        "description": "External contract calls can trigger callbacks before state updates resolve, allowing repeated withdrawals.",
        "example": "function withdraw() { msg.sender.call{value: balance}(''); balance = 0; }",
        "remediation": "Follow Checks-Effects-Interactions pattern. Use ReentrancyGuard. Update state before external calls."
    },
    {
        "id": "SWC-106", "title": "Unprotected Self-Destruct",
        "description": "A self-destruct function callable by any address allows an attacker to destroy the contract and drain its ETH.",
        "remediation": "Add strict onlyOwner or multisig access control to any selfdestruct() call."
    },
    {
        "id": "SWC-115", "title": "Authorization via tx.origin",
        "description": "Using tx.origin for authorization is vulnerable to phishing attacks where malicious contracts impersonate users.",
        "remediation": "Replace tx.origin with msg.sender for authorization checks."
    },
    {
        "id": "SWC-116", "title": "Block Timestamp Dependence",
        "description": "Relying on block.timestamp for randomness or time-locked logic can be manipulated by miners/validators.",
        "remediation": "Use Chainlink VRF for randomness. Use block numbers with tolerances for time checks."
    },
    {
        "id": "SWC-120", "title": "Weak Sources of Randomness",
        "description": "Use of blockhash, block.number, or block.timestamp as random seeds is predictable and manipulable.",
        "remediation": "Integrate Chainlink VRF or a commit-reveal scheme for on-chain randomness."
    },
    {
        "id": "SWC-112", "title": "Delegatecall to Untrusted Callee",
        "description": "delegatecall executes code in the context of the calling contract. Calling untrusted contracts can corrupt storage.",
        "remediation": "Only delegatecall to trusted, audited contracts. Validate callee address."
    },
    {
        "id": "SWC-105", "title": "Unprotected Ether Withdrawal",
        "description": "Missing or weak access control on withdrawal functions allows anyone to drain contract ETH.",
        "remediation": "Add onlyOwner or role-based access control to all withdrawal functions."
    },
]

EXPLOIT_PATTERNS = [
    {
        "title": "Flash Loan Price Manipulation",
        "description": "Attacker borrows large liquidity via flash loan, manipulates AMM price oracle, exploits protocol, repays loan in same block.",
        "impact": "Critical", "example_protocols": "bZx, Harvest Finance, Cheese Bank"
    },
    {
        "title": "Price Oracle Manipulation",
        "description": "Protocol uses a single on-chain DEX as price oracle. Attacker inflates/deflates price via large swap to exploit lending/derivative logic.",
        "impact": "Critical"
    },
    {
        "title": "Sandwich Attack",
        "description": "MEV bot detects pending transaction, front-runs to buy token, victim buys at higher price, bot sells — extracting value via slippage.",
        "impact": "Medium"
    },
    {
        "title": "Access Control Bypass",
        "description": "Initialization functions (initialize()) callable multiple times allow attackers to re-initialize proxy contracts and take ownership.",
        "impact": "Critical"
    },
]


def ingest_to_chromadb():
    try:
        from langchain_community.embeddings import OllamaEmbeddings
        from langchain_chroma import Chroma
        from langchain.schema import Document

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

        docs = []

        for swc in SWC_DESCRIPTIONS:
            content = (
                f"Vulnerability: {swc['title']} ({swc['id']})\n"
                f"Description: {swc['description']}\n"
                f"Remediation: {swc['remediation']}\n"
                + (f"Example: {swc.get('example', '')}" if swc.get("example") else "")
            )
            docs.append(Document(
                page_content=content,
                metadata={"source": "SWC", "swc_id": swc["id"], "title": swc["title"]},
            ))

        for pattern in EXPLOIT_PATTERNS:
            content = (
                f"Exploit Pattern: {pattern['title']}\n"
                f"Description: {pattern['description']}\n"
                f"Impact: {pattern['impact']}\n"
            )
            docs.append(Document(
                page_content=content,
                metadata={"source": "exploit_pattern", "title": pattern["title"]},
            ))

        vectorstore.add_documents(docs)
        logger.info(f"Ingested {len(docs)} documents into ChromaDB.")
        print(f"✅ Ingested {len(docs)} documents into ChromaDB collection 'web3_vulnerabilities'.")

    except Exception as e:
        logger.error(f"ChromaDB ingestion failed: {e}")
        print(f"❌ Ingestion failed: {e}")


if __name__ == "__main__":
    import django
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    django.setup()
    ingest_to_chromadb()
