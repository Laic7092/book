// UI Store - Manages UI state

import { defineStore } from "pinia";
import { TOAST_DURATION } from "../utils/constants";

export type ModalType = "toc" | "search" | "bookmarks" | "settings" | "stats" | null;

export interface UIState {
  showControls: boolean;
  activeModal: ModalType;
  showToast: boolean;
  toastMessage: string;
  toastError: boolean;
  showConfirm: boolean;
  confirmAction: (() => void) | null;
  confirmTitle: string;
  confirmMessage: string;
  isTransitioning: boolean;
}

export const useUIStore = defineStore("ui", {
  state: (): UIState => ({
    showControls: false,
    activeModal: null,
    showToast: false,
    toastMessage: "",
    toastError: false,
    showConfirm: false,
    confirmAction: null,
    confirmTitle: "",
    confirmMessage: "",
    isTransitioning: false,
  }),

  actions: {
    /**
     * Toggle reader controls visibility
     */
    toggleControls() {
      this.showControls = !this.showControls;
    },

    /**
     * Set controls visibility
     */
    setControls(visible: boolean) {
      this.showControls = visible;
    },

    /**
     * Open a modal
     */
    openModal(type: ModalType) {
      this.activeModal = type;
      this.showControls = true;
    },

    /**
     * Close current modal
     */
    closeModal() {
      this.activeModal = null;
      this.showControls = true;
    },

    /**
     * Show toast notification
     */
    triggerToast(message: string, isError = false) {
      this.toastMessage = message;
      this.toastError = isError;
      this.showToast = true;
      setTimeout(() => {
        this.showToast = false;
      }, TOAST_DURATION);
    },

    /**
     * Show confirmation dialog
     */
    showConfirmation(title: string, message: string, onConfirm: () => void) {
      this.confirmTitle = title;
      this.confirmMessage = message;
      this.confirmAction = onConfirm;
      this.showConfirm = true;
    },

    /**
     * Cancel confirmation
     */
    cancelConfirmation() {
      this.showConfirm = false;
      this.confirmAction = null;
    },

    /**
     * Confirm action
     */
    confirm() {
      if (this.confirmAction) {
        this.confirmAction();
      }
      this.showConfirm = false;
      this.confirmAction = null;
    },

    /**
     * Set transitioning state
     */
    setTransitioning(value: boolean) {
      this.isTransitioning = value;
    },
  },
});
