import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { normalizeData, TrackerData } from './trackerData';

const fileName = () => `tvtracker-backup-${new Date().toISOString().slice(0, 10)}.json`;

/** Saves the data as a JSON file (download on web, share sheet on phones). */
export async function exportBackup(data: TrackerData): Promise<void> {
  const json = JSON.stringify({ app: 'tvtracker', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const file = new File(Paths.cache, fileName());
  file.create({ overwrite: true });
  await file.write(json);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save TV Tracker backup', UTI: 'public.json' });
}

/** Lets the user pick a backup file. Returns null if they cancel. */
export async function pickBackup(): Promise<TrackerData | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const text = asset.file ? await asset.file.text() : await new File(asset.uri).text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not a TV Tracker backup.');
  }
  const body = parsed as { app?: string; data?: unknown };
  if (body?.app !== 'tvtracker' || !body.data) throw new Error('That file is not a TV Tracker backup.');
  return normalizeData(body.data);
}
