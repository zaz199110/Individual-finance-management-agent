/** Client-safe path display (no node: imports). */
export function formatReportFilePathDisplay(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
