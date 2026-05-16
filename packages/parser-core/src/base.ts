export function generateId(prefix = ""): string {
  let id: string;
  if (crypto.randomUUID) {
    id = crypto.randomUUID().replace(/-/g, "");
  } else {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 10);
    id = timestamp + randomPart;
  }
  return prefix ? `${prefix}_${id}` : id;
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/.*[/\\]/, "");
}

export function getFileMetadata(file: File): { name: string; size: number; type: string } {
  return {
    name: sanitizeFilename(file.name),
    size: file.size,
    type: file.type,
  };
}

export function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export function parseXML(content: string, mimeType = "application/xml"): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, mimeType as DOMParserSupportedType);

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent}`);
  }

  return doc;
}
