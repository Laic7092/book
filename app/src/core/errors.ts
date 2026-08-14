export const ErrorCode = {
  BOOK_NOT_FOUND: "BOOK_NOT_FOUND",
  CHAPTER_NOT_FOUND: "CHAPTER_NOT_FOUND",
  CHAPTER_CONTENT_NOT_FOUND: "CHAPTER_CONTENT_NOT_FOUND",
  PARSE_FAILED: "PARSE_FAILED",
  STORAGE_ERROR: "STORAGE_ERROR",
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  NO_BOOK_LOADED: "NO_BOOK_LOADED",
  BOOKMARK_NOT_FOUND: "BOOKMARK_NOT_FOUND",
  INVALID_FILE: "INVALID_FILE",
  FOLDER_NOT_FOUND: "FOLDER_NOT_FOUND",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ReaderError {
  message: string;
  code: ErrorCode;
  details?: unknown;
  name: "ReaderError";
}

export function createReaderError(
  message: string,
  code: ErrorCode,
  details?: unknown,
): ReaderError {
  return {
    message,
    code,
    details,
    name: "ReaderError",
  };
}

export function isReaderError(error: unknown): error is ReaderError {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "ReaderError"
  );
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}
