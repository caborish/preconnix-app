// Download my data: saves the account's export as a JSON file in the app's cache and opens the share sheet,
// so the person can keep it in Files, email it to themselves or pass it on. Nothing is kept after the next export.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { exportMyData } from '@/core/api';
import { localDay } from '@/features/plan/progress';

export async function shareMyData(): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone.');
  const data = await exportMyData();
  for (const entry of Paths.cache.list()) {
    if (entry instanceof File && entry.name.startsWith('PreConnix_my_data_')) entry.delete();
  }
  const file = new File(Paths.cache, `PreConnix_my_data_${localDay()}.json`);
  file.create();
  file.write(JSON.stringify(data, null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save a copy of your data' });
}
