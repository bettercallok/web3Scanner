"""
Ingest datasets of known Web3 vulnerabilities into ChromaDB.
Expands the RAG pipeline with Rekt.news, Immunefi disclosures, and SWC registry.
"""
import os
import json
import logging
from django.conf import settings
from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = "Ingest historical DeFi exploits and vulnerabilities into ChromaDB."

    def add_arguments(self, parser):
        parser.add_argument(
            '--source', 
            type=str, 
            choices=['all', 'swc', 'immunefi', 'rekt'], 
            default='all',
            help='Which knowledge source to ingest'
        )

    def handle(self, *args, **options):
        source = options['source']
        self.stdout.write(f"Starting ingestion for source: {source}")

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

            if source in ['all', 'swc']:
                docs.extend(self._ingest_swc())
                self.stdout.write(self.style.SUCCESS(f"Loaded {len(docs)} SWC documents."))

            if source in ['all', 'immunefi']:
                new_docs = self._ingest_immunefi()
                docs.extend(new_docs)
                self.stdout.write(self.style.SUCCESS(f"Loaded {len(new_docs)} Immunefi documents."))

            if source in ['all', 'rekt']:
                new_docs = self._ingest_rekt()
                docs.extend(new_docs)
                self.stdout.write(self.style.SUCCESS(f"Loaded {len(new_docs)} Rekt.news documents."))

            if docs:
                self.stdout.write("Adding to ChromaDB (this may take a while)...")
                # Add in batches to avoid overwhelming the embedding model
                batch_size = 50
                for i in range(0, len(docs), batch_size):
                    batch = docs[i:i + batch_size]
                    vectorstore.add_documents(batch)
                    self.stdout.write(f"Processed {min(i + batch_size, len(docs))}/{len(docs)} documents.")
                
                self.stdout.write(self.style.SUCCESS("Ingestion complete!"))
            else:
                self.stdout.write(self.style.WARNING("No documents were loaded."))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Ingestion failed: {e}"))
            logger.exception("Ingestion failed")

    def _ingest_swc(self):
        """Simulated load of SWC registry data."""
        from langchain.schema import Document
        # In a real scenario, this would download and parse the SWC JSON files
        return [
            Document(
                page_content="SWC-107: Reentrancy. One of the major dangers of calling external contracts is that they can take over the control flow, and make changes to your data that the calling function wasn't expecting.",
                metadata={"source": "swc", "id": "107", "title": "Reentrancy"}
            ),
            Document(
                page_content="SWC-114: Transaction Order Dependence (Front Running). A race condition vulnerability occurs when code depends on the order of the transactions submitted to it.",
                metadata={"source": "swc", "id": "114", "title": "Front Running"}
            ),
            Document(
                page_content="SWC-112: Delegatecall to Untrusted Callee. Calling into untrusted contracts is very dangerous, as the code at the target address can change any storage values of the caller and has full control over the caller's balance.",
                metadata={"source": "swc", "id": "112", "title": "Delegatecall to Untrusted Callee"}
            )
        ]

    def _ingest_immunefi(self):
        """Simulated load of Immunefi disclosures."""
        from langchain.schema import Document
        return [
            Document(
                page_content="Immunefi Bug Report: Read-only Reentrancy in Curve Finance. A read-only reentrancy vulnerability allows an attacker to manipulate the price oracle while reentering a view function, leading to incorrect liquidations.",
                metadata={"source": "immunefi", "protocol": "Curve", "type": "read-only-reentrancy"}
            ),
            Document(
                page_content="Immunefi Bug Report: Flash Loan Attack on Euler Finance. The attacker used a flash loan to manipulate the exchange rate and borrow more assets than the collateral allowed, due to a missing health check in the donateToReserves function.",
                metadata={"source": "immunefi", "protocol": "Euler", "type": "flash-loan-manipulation"}
            )
        ]

    def _ingest_rekt(self):
        """Simulated load of Rekt.news articles."""
        from langchain.schema import Document
        return [
            Document(
                page_content="Rekt: Poly Network hack ($611M). The attacker exploited a vulnerability in the EthCrossChainManager contract, changing the keeper public keys to their own and stealing funds across multiple chains.",
                metadata={"source": "rekt.news", "protocol": "Poly Network", "amount": "611M"}
            ),
            Document(
                page_content="Rekt: Wormhole Bridge hack ($326M). The attacker exploited a signature verification bypass in the Solana program, allowing them to mint 120k wrapped ETH on Solana without locking collateral on Ethereum.",
                metadata={"source": "rekt.news", "protocol": "Wormhole", "amount": "326M"}
            )
        ]
