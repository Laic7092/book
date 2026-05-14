let _pdfjsLib: any = null;

export async function openPdf(data: ArrayBuffer): Promise<any> {
  if (!_pdfjsLib) {
    _pdfjsLib = await import("pdfjs-dist");
  }
  return _pdfjsLib.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
}
