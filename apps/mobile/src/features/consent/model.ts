// Maps the privacy choices to the consent purposes the server records.
// One agreement (owner, 1 Nov 2026): agreeing to the Terms of Use and Privacy Policy covers being 18 or older,
// PreConnix using health answers to give results, and PreConnix keeping a record of results. It is ticked before
// signing up. Email tips stay a separate, unticked choice (CASL / NDPA: never bundled with what the service needs).
// The AI-assisted explanation (ADR-018) is its own choice too, asked when first used and changeable here.
// Plain TypeScript, unit-tested with node:test.
import type { ConsentPurpose } from '../../core/api.ts';

export interface PrivacyChoices {
  agreement: boolean;
  marketing: boolean;
  ai: boolean;
}

export const emptyChoices = (): PrivacyChoices => ({ agreement: false, marketing: false, ai: false });

/** The purposes the single agreement records. */
export const AGREEMENT_PURPOSES: ConsentPurpose[] = ['terms_privacy', 'health_processing', 'history_storage'];

export function fromConsents(c: Partial<Record<ConsentPurpose, boolean>>): PrivacyChoices {
  return { agreement: AGREEMENT_PURPOSES.every(p => c[p] === true), marketing: c.email_comms === true, ai: c.ai_explanation === true };
}

/** Consent records to send for the choices that changed. */
export function toConsents(next: PrivacyChoices, before: PrivacyChoices): Partial<Record<ConsentPurpose, boolean>> {
  const out: Partial<Record<ConsentPurpose, boolean>> = {};
  if (next.agreement !== before.agreement) for (const p of AGREEMENT_PURPOSES) out[p] = next.agreement;
  if (next.marketing !== before.marketing) out.email_comms = next.marketing;
  if (next.ai !== before.ai) out.ai_explanation = next.ai;
  return out;
}
