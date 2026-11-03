export const SEV_ORDER = ["critical", "high", "medium", "low", "informational"] as const;
export type Severity = typeof SEV_ORDER[number];

export const SEV_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  informational: "Info",
};

export const RISK_COLORS: Record<string, string> = {
  Critical: "var(--red)",
  High: "var(--orange)",
  Medium: "var(--yellow)",
  Low: "var(--green)",
};

/** Networks the backend can analyse today (must match SUPPORTED_NETWORKS server-side). */
export const NETWORKS: { value: string; label: string }[] = [
  { value: "mainnet", label: "Ethereum Mainnet" },
  { value: "polygon", label: "Polygon" },
  { value: "bsc", label: "BNB Smart Chain" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "optimism", label: "Optimism" },
];

export const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export const ACTIVE_STATUSES = ["pending", "fetching", "analyzing", "ai_review", "reporting"];

export interface Vulnerability {
  id: number | string;
  title: string;
  severity: Severity;
  description?: string;
  file_path?: string;
  line_numbers?: string | number;
  confidence?: string;
  code_snippet?: string;
  remediation?: string;
  swc_id?: string;
  tool?: string;
  is_false_positive?: boolean;
  false_positive_source?: "" | "ai" | "user";
  poc_code?: string;
}

export interface GasIssue {
  id: number | string;
  title: string;
  description?: string;
  file_path?: string;
  line_numbers?: string | number;
  code_snippet?: string;
  estimated_gas_saving?: number;
}

export interface ScanJob {
  id: string;
  status?: string;
  progress?: number;
  status_message?: string;
  error_detail?: string;
  contract_name?: string;
  address?: string;
  network?: string;
  compiler_version?: string;
  risk_score?: number;
  risk_level?: string;
  ai_summary?: string;
  is_honeypot?: boolean | null;
  honeypot_details?: { simulation_status?: string; red_flags?: string[]; reason?: string } | null;
  is_proxy?: boolean | null;
  proxy_type?: string;
  implementation_address?: string;
  analysis_mode?: "source" | "bytecode" | "abi_only";
  source_file_count?: number;
  vulnerabilities?: Vulnerability[];
  gas_issues?: GasIssue[];
  is_public?: boolean;
  public_slug?: string;
  share_label?: string;
  is_owner?: boolean;
  created_at?: string;
}

export interface ScanListItem {
  id: string;
  address: string;
  network: string;
  status: string;
  progress: number;
  contract_name: string;
  risk_score: number | null;
  risk_level: string;
  is_honeypot: boolean | null;
  is_proxy: boolean | null;
  analysis_mode: string;
  is_public: boolean;
  created_at: string;
  critical_count: number;
  high_count: number;
  finding_count: number;
}

export function shortAddress(addr?: string) {
  return addr ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : "";
}
