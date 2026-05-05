/**
 * Toast message utility functions.
 */

import { TOAST_TITLE_MAX_LENGTH } from "../config/constants";

/**
 * Truncate a book title for toast messages.
 * Keeps the title within a reasonable length while preserving readability.
 * Adds ellipsis when truncated.
 *
 * @param title - The full book title
 * @param maxLength - Maximum length (defaults to TOAST_TITLE_MAX_LENGTH)
 * @returns Truncated title with ellipsis if needed
 */
export function truncateTitle(title: string, maxLength = TOAST_TITLE_MAX_LENGTH): string {
  if (title.length <= maxLength) return title;

  // Find a good breaking point (space, punctuation)
  const truncated = title.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  // If there's a space in the last 5 characters, break there
  if (lastSpace > maxLength - 5) {
    return truncated.slice(0, lastSpace) + "…";
  }

  // Otherwise, just cut and add ellipsis
  return truncated.trimEnd() + "…";
}

/**
 * Format a toast message with a book title.
 * Returns an object with title and message for two-line toast display.
 *
 * @param title - The book title
 * @param action - The action description (e.g., "added to library")
 * @returns Object with title and message
 */
export function formatBookToast(title: string, action: string): { title: string; message: string } {
  return {
    title: truncateTitle(title),
    message: action,
  };
}
