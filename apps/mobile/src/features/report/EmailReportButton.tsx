// Emails the detailed report to the person's own sign-in address, to keep or forward to their doctor (owner,
// 1 Nov 2026). Only for saved results: unsaved ones are not kept on the server.
import { useState } from 'react';
import { Alert } from 'react-native';
import { ApiError, emailReport, problemMessage, type AssessmentResult } from '@/core/api';
import { Button } from '@/design/components';

export function EmailReportButton({ result }: { result: AssessmentResult }) {
  const [busy, setBusy] = useState(false);
  if (!result.saved) return null;
  return (
    <Button
      label={busy ? 'Sending…' : 'Email my report'}
      variant="secondary"
      disabled={busy}
      onPress={async () => {
        setBusy(true);
        try {
          await emailReport(result.assessmentId);
          Alert.alert('Report sent', 'Your detailed report is on its way to your email. Forward it to your doctor to talk it through.');
        } catch (e) {
          const code = e instanceof ApiError ? e.code : '';
          Alert.alert('Report not sent',
            code === 'email_unavailable' ? 'Emailing reports starts soon. For now, use Download / share PDF.'
              : code === 'no_email' ? 'Sign in with your email to have your report sent to you.'
                : code === 'too_many_requests' ? 'You can email your report up to 5 times a day.'
                  : problemMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
