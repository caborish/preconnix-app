// Result wording shared by the app (results screen, PDF report) and the API (report email). Plain data.
// Changes are clinical wording: new version + human approval (CLAUDE.md).

// Band descriptions exactly as preconnix.com/rra shows them today (pending clinical review: CF-03 for the wellness path).
export const LEGACY_BAND_TEXT = {
  high: 'Your score indicates strong reproductive health. You are well-positioned across most health domains. Continue maintaining your healthy habits and consult your healthcare provider to review your results and discuss any remaining areas.',
  moderate: 'Your score suggests moderate reproductive health with some areas that need attention. You have a solid foundation, but there are specific health domains where targeted action could significantly improve your preconception health. Review your domain breakdown below and consider addressing the lowest-scoring areas with a healthcare provider.',
  low: "Your score indicates important areas that need attention before conception. This does not mean pregnancy is not possible — it means there are modifiable risk factors that, if addressed, could significantly improve your health outcomes and your future baby's wellbeing. We strongly recommend discussing these results with a healthcare provider."
} as const;

export const PATHWAY_LABEL = {
  pregnancy_planning: 'Planning or considering pregnancy',
  general_wellness: 'General reproductive wellness'
} as const;

export const levelWord = (pct: number) => (pct >= 75 ? 'Strong' : pct >= 50 ? 'Needs attention' : 'Priority');

export const METHOD_TEXT = (policyId: string) =>
  `Each answer earns 0, 1 or 2 points. Your score is the points you earned as a percentage of the maximum, using the same method as the PreConnix website (scoring version ${policyId}). This method is awaiting clinical review.`;

export const SAFETY_TEXT =
  'Some of your answers suggest you may not feel safe, or may need extra support. If you are in immediate danger, call your local emergency number.';

export const DISCLAIMER =
  'The Reproductive Health Assessment supports education and planning and does not replace individual medical care. This report is based on your self-reported answers. It is not medical advice, diagnosis or treatment. Please discuss your results and next steps with a qualified healthcare provider.';
