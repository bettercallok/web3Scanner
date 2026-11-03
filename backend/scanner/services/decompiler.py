"""
On-chain bytecode decompiler for unverified contracts.

Pipeline:
  1. Fetch raw bytecode via eth_getCode (public JSON-RPC)
  2. Write it to a .bin file in the job's work directory
  3. Run Mythril directly on the bytecode (myth analyze -f bytecode.bin)
  4. Return pseudo-decompiled output + analysis mode flag

Slither is skipped for bytecode-only scans (it requires Solidity source).
The analysis_mode field on ScanJob is set to "bytecode" to communicate
the reduced confidence level to the front-end and AI engine.
"""
import os
import logging

logger = logging.getLogger(__name__)

def fetch_bytecode(address: str, network: str) -> str:
    """
    Fetch raw contract bytecode via eth_getCode JSON-RPC.
    Returns the hex-encoded bytecode string (0x-prefixed), or "" if empty/EOA.
    """
    from .rpc import get_code

    code = get_code(address, network)
    if code:
        logger.info(f"[decompiler] fetched {len(code)//2} bytes from {address}")
    else:
        logger.info(f"[decompiler] {address} has no bytecode (EOA or self-destructed)")
    return code


def write_bytecode_file(bytecode_hex: str, work_dir: str) -> str:
    """
    Write raw bytecode to a .bin file for Mythril analysis.
    Returns the path to the written file.
    """
    os.makedirs(work_dir, exist_ok=True)
    bin_path = os.path.join(work_dir, "contract.bin")

    # Strip 0x prefix and write raw hex
    raw_hex = bytecode_hex.removeprefix("0x")
    with open(bin_path, "w", encoding="utf-8") as fh:
        fh.write(raw_hex)

    logger.info(f"[decompiler] wrote bytecode to {bin_path}")
    return bin_path


def generate_pseudo_source(bytecode_hex: str, contract_name: str) -> str:
    """
    Generate a minimal pseudo-Solidity skeleton from bytecode for the AI engine.
    Uses pyevmasm for disassembly if available, otherwise returns a placeholder.
    """
    pseudo = f"// Contract: {contract_name} (bytecode-only — source not verified)\n"
    pseudo += f"// Bytecode length: {len(bytecode_hex) // 2} bytes\n\n"
    pseudo += "// ⚠️ This contract's source code is not publicly available.\n"
    pseudo += "// Analysis is based on EVM bytecode decompilation.\n"
    pseudo += "// Confidence of findings may be lower than source-based analysis.\n\n"

    try:
        import pyevmasm  # optional dependency
        instructions = pyevmasm.disassemble_all(bytes.fromhex(bytecode_hex.removeprefix("0x")))
        # Show first 50 instructions as a comment block
        asm_lines = [str(i) for i in list(instructions)[:50]]
        pseudo += "/* EVM Disassembly (first 50 instructions):\n"
        pseudo += "\n".join(asm_lines)
        pseudo += "\n*/\n"
    except ImportError:
        pseudo += "// (Install pyevmasm for disassembly: pip install pyevmasm)\n"
    except Exception as exc:
        pseudo += f"// (Disassembly failed: {exc})\n"

    return pseudo
