import { generateId, readAsArrayBuffer, parseXML } from "../base";
import { wrapHtml, collectChildren, resolvePath, parseHTML } from "../shared";
import type { BookParser, ParserResult, ChapterData } from "../types";

// ── PDB / PalmDB container constants ──

const PDB_HEADER_SIZE = 78;
const RECORD_INFO_SIZE = 8;

// ── MOBI header offsets (from start of record 0 data) ──

const MOBI_HEADER_LEN = 4; // 4 bytes
const MOBI_TYPE = 8; // 4 bytes (2=book, 3=KF8)
const MOBI_ENCODING = 12; // 4 bytes (65001=UTF-8, 1252=CP1252)
const MOBI_FIRST_CONTENT = 60; // 4 bytes: first content record index
const MOBI_LAST_CONTENT = 64; // 4 bytes: last content record index

// ── EXTH header offsets (from start of EXTH block) ──

const EXTH_RECORD_COUNT = 8; // 4 bytes
const EXTH_RECORD_HEADER = 12; // start of records
const EXTH_RECORD_TYPE = 0; // 4 bytes
const EXTH_RECORD_SIZE = 4; // 4 bytes
const EXTH_RECORD_DATA = 8; // actual data

// ── Compression types ──

const C_NONE = 0;
const C_PALMDOC = 1;
const C_HUFFMAN = 2;

// ── EXTH record types ──

const EXTH_AUTHOR = 100;
const EXTH_TITLE = 503;
const EXTH_KF8_BOUNDARY = 501;

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4"]);

// ── Helpers ──

function readStr(data: Uint8Array, off: number, len: number): string {
  let end = off + len;
  while (end > off && data[end - 1] === 0) end--;
  return new TextDecoder().decode(data.slice(off, end));
}

function readU32(view: DataView, off: number): number {
  return view.getUint32(off, false);
}

function readU16(view: DataView, off: number): number {
  return view.getUint16(off, false);
}

/** PalmDOC decompression. */
function decompressPalmdoc(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const c = data[i++];

    if (c === 0) {
      out.push(0);
    } else if (c < 0x08) {
      // Short back-reference (2 bytes): length=3, dist=next_byte
      const dist = data[i++];
      if (dist === 0) break;
      const src = out.length - dist;
      if (src < 0) break;
      for (let j = 0; j < 3; j++) out.push(out[src + j]);
    } else if (c <= 0x7f) {
      // Literal byte
      out.push(c);
    } else if (c <= 0xbf) {
      // Long back-reference (2 bytes): dist=((c&0x3F)<<8)|next, len=(c>>6)+2
      const c2 = data[i++];
      const dist = ((c & 0x3f) << 8) | c2;
      const length = (c >> 6) + 2;
      if (dist === 0) break;
      const src = out.length - dist;
      if (src < 0) break;
      for (let j = 0; j < length; j++) out.push(out[src + j]);
    } else {
      // Long back-reference (3 bytes): dist=((c&0x3F)<<8)|next, len=third+1
      if (i + 1 >= data.length) break;
      const c2 = data[i++];
      const c3 = data[i++];
      const dist = ((c & 0x3f) << 8) | c2;
      const length = c3 + 1;
      if (dist === 0) break;
      const src = out.length - dist;
      if (src < 0) break;
      for (let j = 0; j < length; j++) out.push(out[src + j]);
    }
  }
  return new Uint8Array(out);
}

/** Split HTML content into chapters by heading boundaries. */
function splitHtmlChapters(
  html: string,
  fallbackTitle: string,
): { chapters: ChapterData[]; content: Map<string, string> } {
  const content = new Map<string, string>();
  const chapters: ChapterData[] = [];

  // Parse headings from the HTML
  const headingRe = /<h([1-4])[^>]*>(.*?)<\/h\1>/gi;
  const headings: Array<{ tag: string; title: string; index: number }> = [];
  let match: RegExpExecArray | null;

  // We need to split at heading positions. Parse the HTML manually since
  // we're working with a string, not a DOM document.
  while ((match = headingRe.exec(html)) !== null) {
    const title = match[2].replace(/<[^>]*>/g, "").trim() || `Chapter ${headings.length + 1}`;
    headings.push({ tag: match[1], title, index: match.index });
  }

  if (headings.length === 0) {
    const id = generateId("ch");
    content.set(id, wrapHtml(html, fallbackTitle));
    chapters.push({ id, title: fallbackTitle, order: 0 });
    return { chapters, content };
  }

  // Content before first heading
  if (headings[0].index > 0) {
    const intro = html.slice(0, headings[0].index).trim();
    if (intro) {
      const id = generateId("ch");
      content.set(id, wrapHtml(intro, fallbackTitle));
      chapters.push({ id, title: fallbackTitle, order: 0 });
    }
  }

  // Chapter for each heading (include the heading in the content)
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index : html.length;
    const chunk = html.slice(start, end).trim();
    const id = generateId("ch");
    content.set(id, wrapHtml(chunk, headings[i].title));
    chapters.push({ id, title: headings[i].title, order: chapters.length });
  }

  return { chapters, content };
}

/** Try to find the KF8 embedded ZIP start offset in the raw file data. */
function findKf8ZipOffset(data: Uint8Array): number {
  // Search for ZIP magic PK\x03\x04
  for (let i = 0; i < data.length - 4; i++) {
    if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x03 && data[i + 3] === 0x04) {
      return i;
    }
  }
  return -1;
}

export class MobiParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = [
    "application/x-mobipocket-ebook",
    "application/x-mobi",
    "application/x-kindle",
    "application/x-azw3",
  ];

  readonly format = "mobi";

  supportsFormat(mimeType: string): boolean {
    return MobiParser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  async parse(file: File): Promise<ParserResult> {
    const arrayBuffer = await readAsArrayBuffer(file);
    const data = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    // ── Parse PDB header ──
    const recordCount = readU16(view, 76);
    if (recordCount === 0) throw new Error("Invalid MOBI file: no records");

    // ── Parse record info list ──
    const recordOffsets: number[] = [];
    for (let i = 0; i < recordCount; i++) {
      const off = PDB_HEADER_SIZE + i * RECORD_INFO_SIZE;
      recordOffsets.push(readU32(view, off));
    }

    // ── Parse MOBI header from record 0 ──
    const r0 = recordOffsets[0];
    const mobiMagic = readStr(data, r0, 4);
    if (mobiMagic !== "MOBI") throw new Error("Invalid MOBI file: missing MOBI magic");

    const mobiHeaderLen = readU32(view, r0 + MOBI_HEADER_LEN);
    const mobiType = readU32(view, r0 + MOBI_TYPE);
    const encoding = readU32(view, r0 + MOBI_ENCODING);

    // ── Parse EXTH header (embedded in MOBI header) ──
    // Search for "EXTH" within the MOBI header data
    let title = file.name.replace(/\.(mobi|azw3|azw)$/i, "") || "Untitled";
    let author = "Unknown Author";
    let kf8BoundaryOffset = -1;

    let exthStart = -1;
    for (let i = r0; i < r0 + mobiHeaderLen - 4; i++) {
      if (
        data[i] === 0x45 &&
        data[i + 1] === 0x58 &&
        data[i + 2] === 0x54 &&
        data[i + 3] === 0x48
      ) {
        exthStart = i;
        break;
      }
    }

    if (exthStart !== -1) {
      const exthCount = readU32(view, exthStart + EXTH_RECORD_COUNT);
      let exthOff = exthStart + EXTH_RECORD_HEADER;
      for (let r = 0; r < exthCount; r++) {
        const recType = readU32(view, exthOff + EXTH_RECORD_TYPE);
        const recSize = readU32(view, exthOff + EXTH_RECORD_SIZE);
        const recDataOff = exthOff + EXTH_RECORD_DATA;
        const recDataLen = recSize - 8;

        if (recType === EXTH_AUTHOR && recDataLen > 0) {
          author = readStr(data, recDataOff, recDataLen);
        } else if (recType === EXTH_TITLE && recDataLen > 0) {
          title = readStr(data, recDataOff, recDataLen);
        } else if (recType === EXTH_KF8_BOUNDARY && recDataLen >= 4) {
          kf8BoundaryOffset = readU32(view, recDataOff);
        }

        exthOff += recSize;
      }
    }

    // ── Determine if this is KF8/AZW3 with embedded EPUB ──
    // KF8: mobiType === 3 or EXTH boundary offset points to a valid ZIP
    const isKf8 = mobiType === 3 || kf8BoundaryOffset > 0;

    if (isKf8) {
      // Try byte offset first, then search for ZIP magic
      let zipStart = kf8BoundaryOffset > 0 ? kf8BoundaryOffset : -1;
      if (zipStart <= 0 || zipStart >= data.length) {
        zipStart = findKf8ZipOffset(data);
      }
      // Fallback: try offset from end of MOBI header data
      if (zipStart <= 0) {
        zipStart = r0 + mobiHeaderLen;
      }

      if (zipStart > 0 && zipStart < data.length) {
        const kf8Data = data.slice(zipStart);
        // Verify ZIP magic
        if (kf8Data[0] === 0x50 && kf8Data[1] === 0x4b) {
          return this.parseKf8Epub(
            kf8Data.buffer.slice(
              kf8Data.byteOffset,
              kf8Data.byteOffset + kf8Data.byteLength,
            ) as ArrayBuffer,
            title,
            author,
            arrayBuffer,
          );
        }
      }
    }

    // ── Standard MOBI: extract and decompress content records ──

    // Find content record range from MOBI header
    let firstContentIdx = 1; // default: start from record 1
    let lastContentIdx = recordCount - 1;

    if (mobiHeaderLen > 64) {
      const fc = readU32(view, r0 + MOBI_FIRST_CONTENT);
      const lc = readU32(view, r0 + MOBI_LAST_CONTENT);
      if (fc > 0 && fc < recordCount) firstContentIdx = fc;
      if (lc > fc && lc < recordCount) lastContentIdx = lc;
    }

    // Determine compression from bytes after the MOBI header
    const pdOff = r0 + mobiHeaderLen;
    let compression = C_PALMDOC; // default

    if (pdOff + 2 <= data.length) {
      const maybeComp = readU16(view, pdOff);
      if (maybeComp === C_NONE || maybeComp === C_PALMDOC || maybeComp === C_HUFFMAN) {
        compression = maybeComp;
      }
    }

    if (compression === C_HUFFMAN) {
      throw new Error("MOBI with Huffman compression is not yet supported");
    }

    // Concatenate content records
    const chunks: Uint8Array[] = [];
    let totalLen = 0;
    for (let i = firstContentIdx; i <= lastContentIdx && i < recordOffsets.length; i++) {
      const rStart = recordOffsets[i];
      const rEnd = i + 1 < recordOffsets.length ? recordOffsets[i + 1] : data.length;
      const chunk = data.slice(rStart, rEnd);
      chunks.push(chunk);
      totalLen += chunk.length;
    }

    if (chunks.length === 0) throw new Error("MOBI file has no content records");

    // Combine all record data
    const allContent = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      allContent.set(chunk, offset);
      offset += chunk.length;
    }

    // For PalmDOC compression, we need to find the start of the compressed data.
    // The first two bytes at pdOff are the compression type.
    // The actual compressed data starts at pdOff + 2 (or pdOff + 16 if there's a full PalmDOC header).
    const compressedStart = pdOff + 2; // skip compression type

    // Decompress
    let decodedHtml: string;
    if (compression === C_NONE && compressedStart < allContent.length) {
      // Try as raw HTML text
      const rawText = allContent.slice(compressedStart);
      // The text might be in CP1252 or UTF-8
      if (encoding === 65001) {
        decodedHtml = new TextDecoder("utf-8", { fatal: false }).decode(rawText);
      } else {
        decodedHtml = new TextDecoder("windows-1252", { fatal: false }).decode(rawText);
      }
    } else if (compression === C_PALMDOC) {
      const compressedData = allContent.slice(compressedStart);
      const decompressed = decompressPalmdoc(compressedData);
      if (encoding === 65001) {
        decodedHtml = new TextDecoder("utf-8", { fatal: false }).decode(decompressed);
      } else {
        decodedHtml = new TextDecoder("windows-1252", { fatal: false }).decode(decompressed);
      }
    } else {
      decodedHtml = "";
    }

    // Clean up null bytes and control characters that might interfere
    decodedHtml = decodedHtml.split("\x00").join("");

    // ── Parse HTML and split into chapters ──
    const { chapters, content } = this.processHtml(decodedHtml, title);

    return {
      id: generateId("book"),
      title,
      author,
      chapters,
      content,
      rawData: arrayBuffer,
    };
  }

  /** Process HTML content: parse with DOMParser and split by headings. */
  private processHtml(
    rawHtml: string,
    fallbackTitle: string,
  ): { chapters: ChapterData[]; content: Map<string, string> } {
    // Use DOMParser for proper parsing if we have a recognizable HTML document
    let bodyHtml = rawHtml;
    try {
      const doc = parseHTML(rawHtml);
      const parseError = doc.querySelector("parsererror");
      if (!parseError && doc.body) {
        // Use the DOM-parsed version for heading splitting
        const body = doc.body;
        const headings: Array<{ el: Element; index: number }> = [];
        for (let i = 0; i < body.children.length; i++) {
          const child = body.children[i];
          if (HEADING_TAGS.has(child.tagName.toLowerCase())) {
            headings.push({ el: child, index: i });
          }
        }

        const content = new Map<string, string>();
        const chapters: ChapterData[] = [];

        if (headings.length === 0) {
          const id = generateId("ch");
          content.set(id, wrapHtml(body.innerHTML, fallbackTitle));
          chapters.push({ id, title: fallbackTitle, order: 0 });
        } else {
          // Introductory content before first heading
          if (headings[0].index > 0) {
            const intro = collectChildren(body, 0, headings[0].index);
            if (intro.trim()) {
              const id = generateId("ch");
              content.set(id, wrapHtml(intro, fallbackTitle));
              chapters.push({ id, title: fallbackTitle, order: 0 });
            }
          }

          for (let i = 0; i < headings.length; i++) {
            const startIdx = headings[i].index;
            const endIdx = i + 1 < headings.length ? headings[i + 1].index : body.children.length;
            const headingTitle = headings[i].el.textContent?.trim() || `Chapter ${i + 1}`;
            const chunk = collectChildren(body, startIdx, endIdx);
            const id = generateId("ch");
            content.set(id, wrapHtml(chunk, headingTitle));
            chapters.push({ id, title: headingTitle, order: chapters.length });
          }
        }

        return { chapters, content };
      }
    } catch {
      // Fall through to string-based splitting
    }

    // Fallback: string-based heading splitting
    return splitHtmlChapters(bodyHtml, fallbackTitle);
  }

  async extractChapterContent(
    _rawData: ArrayBuffer,
    _chapter: { id: string; href?: string },
  ): Promise<string | undefined> {
    // Content was eagerly extracted in parse() for MOBI
    return undefined;
  }

  async extractResource(_rawData: ArrayBuffer, _path: string): Promise<ArrayBuffer | undefined> {
    // Resources not supported for standard MOBI (no embedded images)
    return undefined;
  }

  /** Parse KF8 embedded EPUB section. */
  private async parseKf8Epub(
    kf8Data: ArrayBuffer,
    title: string,
    author: string,
    rawData: ArrayBuffer,
  ): Promise<ParserResult> {
    const { ZipReader: ZR, Uint8ArrayReader: UAR, BlobWriter: BW } = await import("@zip.js/zip.js");
    const zipReader = new ZR(new UAR(new Uint8Array(kf8Data)));

    try {
      const entries = await zipReader.getEntries();
      const files = new Map<string, Blob>();
      for (const entry of entries) {
        if (!entry.directory) {
          files.set(entry.filename, await (entry as any).getData(new BW()));
        }
      }

      // Parse container.xml to find OPF
      const containerXml = files.get("META-INF/container.xml");
      if (!containerXml) throw new Error("KF8 EPUB: missing container.xml");

      const containerDoc = parseXML(await containerXml.text());
      const opfPath =
        containerDoc.querySelector("rootfile")?.getAttribute("full-path") || "OEBPS/content.opf";
      const opfDir = opfPath.substring(0, opfPath.lastIndexOf("/") + 1);

      const opfFile = files.get(opfPath);
      if (!opfFile) throw new Error("KF8 EPUB: missing content.opf");

      const opfDoc = parseXML(await opfFile.text());

      // Extract metadata
      const titleEl = opfDoc.querySelector("dc\\:title, title");
      const creatorEl = opfDoc.querySelector("dc\\:creator, creator");
      const metaTitle = titleEl?.textContent?.trim();
      const metaAuthor = creatorEl?.textContent?.trim();

      const bookTitle = metaTitle || title;
      const bookAuthor = metaAuthor || author;

      // Build manifest
      const manifest = new Map<string, { id: string; href: string; mediaType: string }>();
      opfDoc.querySelectorAll("manifest item").forEach((item) => {
        const id = item.getAttribute("id");
        const href = item.getAttribute("href");
        const mediaType = item.getAttribute("media-type") || "";
        if (id && href) manifest.set(id, { id, href, mediaType });
      });

      // Build spine
      const spine = opfDoc.querySelector("spine");
      const spineItems: string[] = [];
      if (spine) {
        spine.querySelectorAll("itemref").forEach((ref) => {
          const idref = ref.getAttribute("idref");
          if (idref) spineItems.push(idref);
        });
      }

      // Extract cover
      let coverUrl: string | undefined;
      const resources = new Map<string, ArrayBuffer>();

      const coverMeta = opfDoc.querySelector('meta[name="cover"]');
      const coverId = coverMeta?.getAttribute("content");
      if (coverId) {
        const coverManifest = manifest.get(coverId);
        if (coverManifest) {
          const coverFullPath = resolvePath(opfDir, coverManifest.href);
          const coverBlob = files.get(coverFullPath);
          if (coverBlob) {
            const buf = await coverBlob.arrayBuffer();
            resources.set(coverManifest.href, buf);
            coverUrl = coverManifest.href;
          }
        }
      }

      // Build chapters from spine
      const chapters: ChapterData[] = [];
      let order = 0;
      for (const itemId of spineItems) {
        const item = manifest.get(itemId);
        if (item) {
          const fullPath = resolvePath(opfDir, item.href);
          chapters.push({
            id: generateId("ch"),
            title: `Chapter ${order + 1}`,
            href: fullPath,
            order,
          });
        }
        order++;
      }

      return {
        id: generateId("book"),
        title: bookTitle,
        author: bookAuthor,
        coverUrl,
        chapters,
        content: new Map(),
        resources,
        rawData,
      };
    } finally {
      await zipReader.close();
    }
  }
}
