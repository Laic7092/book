// Event bus for the Reader application

import type { ReaderEventMap } from "./types";

type EventCallback<T> = (data: T) => void;

type Unsubscribe = () => void;

/**
 * Simple event bus for decoupled communication
 */
export class EventBus {
  private listeners: Map<keyof ReaderEventMap, Set<EventCallback<any>>> = new Map();

  /**
   * Subscribe to an event
   */
  on<K extends keyof ReaderEventMap>(
    event: K,
    callback: EventCallback<ReaderEventMap[K]>,
  ): Unsubscribe {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const callbacks = this.listeners.get(event)!;
    callbacks.add(callback);

    // Return unsubscribe function
    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * Subscribe to an event once
   */
  once<K extends keyof ReaderEventMap>(
    event: K,
    callback: EventCallback<ReaderEventMap[K]>,
  ): Unsubscribe {
    const wrapped: EventCallback<ReaderEventMap[K]> = (data) => {
      unsubscribe();
      callback(data);
    };

    const unsubscribe = this.on(event, wrapped);
    return unsubscribe;
  }

  /**
   * Emit an event
   */
  emit<K extends keyof ReaderEventMap>(event: K, data: ReaderEventMap[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      // Copy to avoid mutation during iteration
      const snapshot = new Set(callbacks);
      snapshot.forEach((cb) => cb(data));
    }
  }

  /**
   * Clear all listeners for an event (or all events)
   */
  off(event?: keyof ReaderEventMap): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount(event: keyof ReaderEventMap): number {
    return this.listeners.get(event)?.size || 0;
  }
}

// Global event bus instance
export const eventBus = new EventBus();
