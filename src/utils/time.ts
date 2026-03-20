// Time formatting utilities

/**
 * Format duration in milliseconds to human-readable string
 * Examples: "2h 34m", "45m", "1h", "30s"
 */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${hours}h`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    if (remainingSeconds > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Format duration with more detail
 * Examples: "2 hours 34 minutes", "45 minutes", "30 seconds"
 */
export function formatDurationLong(ms: number): string {
  if (ms < 0) ms = 0;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  }

  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  }

  if (minutes > 0 && hours === 0) {
    parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  }

  if (seconds > 0 && minutes === 0 && hours === 0) {
    parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);
  }

  if (parts.length === 0) {
    return "0 seconds";
  }

  return parts.join(" ");
}

/**
 * Format relative time (e.g., "2 hours ago", "yesterday")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return years === 1 ? "a year ago" : `${years} years ago`;
  }

  if (months > 0) {
    return months === 1 ? "a month ago" : `${months} months ago`;
  }

  if (weeks > 0) {
    return weeks === 1 ? "a week ago" : `${weeks} weeks ago`;
  }

  if (days > 0) {
    if (days === 1) return "yesterday";
    if (days === 2) return "2 days ago";
    return `${days} days ago`;
  }

  if (hours > 0) {
    return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  }

  if (minutes > 0) {
    return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;
  }

  if (seconds > 0) {
    return "just now";
  }

  return "just now";
}

/**
 * Get the start of the week for a given date
 * Returns Monday as the start of the week
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the start of the day for a given date
 */
export function getDayStart(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Check if a date is within this week
 */
export function isThisWeek(timestamp: number): boolean {
  const now = new Date();
  const weekStart = getWeekStart(now);
  return timestamp >= weekStart.getTime();
}

/**
 * Format date to YYYY-MM-DD string
 */
export function formatDate(date: Date = new Date()): string {
  return date.toISOString().split("T")[0];
}

/**
 * Get hour label for display (e.g., "8 AM", "2 PM")
 */
export function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}
