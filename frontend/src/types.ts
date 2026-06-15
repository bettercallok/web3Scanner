export const SEV_ORDER = ["critical", "high", "medium", "low", "informational"] as const;
export type Severity = typeof SEV_ORDER[number];

export interface Vulnerability {
  id: string;
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
  contract_name?: string;
  address?: string;
  network?: string;
  compiler_version?: string;
  risk_score?: number;
  risk_level?: string;
  ai_summary?: string;
  is_honeypot?: boolean;
  vulnerabilities?: Vulnerability[];
  gas_issues?: GasIssue[];
  is_public?: boolean;
  public_slug?: string;
  share_label?: string;
  graph_view?: boolean;
}
