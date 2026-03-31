import { createReaderError, ErrorCode } from "../core/errors";
import { ALLOWED_FILE_EXTENSIONS, MAX_FILE_SIZE_BYTES } from "./constants";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateBookFile(file: File): ValidationResult {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too large (max ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)}MB)`,
    };
  }

  if (file.size === 0) {
    return { valid: false, error: "File is empty" };
  }

  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext as (typeof ALLOWED_FILE_EXTENSIONS)[number])) {
    return {
      valid: false,
      error: `Unsupported file format. Allowed: ${ALLOWED_FILE_EXTENSIONS.join(", ")}`,
    };
  }

  return { valid: true };
}

export function assertValidBookFile(file: File): void {
  const result = validateBookFile(file);
  if (!result.valid) {
    throw createReaderError(result.error!, ErrorCode.INVALID_FILE, { fileName: file.name });
  }
}

export function validateBookId(bookId: unknown): string {
  if (typeof bookId !== "string" || bookId.trim().length === 0) {
    throw createReaderError("Invalid book ID", ErrorCode.INVALID_FILE, { bookId });
  }
  return bookId.trim();
}
