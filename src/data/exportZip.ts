import JSZip from 'jszip';
import { buildExportFiles, exportFileName, type ExportData } from '../domain/csv';

/** CSV一式を ZIP 1つにしてダウンロードさせる（D-13）。BOMなしUTF-8 */
export async function downloadExportZip(data: ExportData, now = new Date()): Promise<string> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(buildExportFiles(data))) zip.file(name, content);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const fileName = exportFileName(now);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return fileName;
}
