import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert } from 'react-native';
import type { AssessmentResult } from '@/core/api';
import { Button } from '@/design/components';
import { ReportError, shareReport } from './shareReport';

const testBuild = Constants.expoConfig?.extra?.testBuild === true;

export function ShareReportButton({ result }: { result: AssessmentResult }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      label={busy ? 'Preparing PDF…' : 'Download / share PDF'}
      variant="secondary"
      disabled={busy}
      onPress={async () => {
        setBusy(true);
        try {
          await shareReport(result);
        } catch (e) {
          // Test builds show which step failed (no health data) so problems can be diagnosed.
          const detail = testBuild && e instanceof ReportError ? `\n\nTest details: step "${e.step}": ${e.message}` : '';
          Alert.alert('PDF not created', `Your report could not be created on this phone. Please try again.${detail}`);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
