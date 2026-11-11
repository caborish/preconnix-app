// The parts of a scored result the report and guidance need (same shape as the API's result response).
export interface ReportResult {
  pathway: 'pregnancy_planning' | 'general_wellness';
  country: string | null;
  overall: { score: number; band: 'high' | 'moderate' | 'low'; bandLabel: string };
  domains: { code: string; name: string; percent: number }[];
  safetyFlags: { code: string }[];
  /** Lines from her answers, such as vaccines to ask about (Dr Gloria, 9 Nov 2026). */
  notes?: string[];
  computedAt: string;
}
