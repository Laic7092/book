// UI Store - Manages UI state

import { defineStore } from "./store";
import { TOAST_DURATION } from "../utils/constants";

export type ModalType = string | null;

export interface UIState {
  showControls: boolean;
  activeModal: ModalType;
  showToast: boolean;
  toastTitle: string;
  toastMessage: string;
  toastError: boolean;
  showConfirm: boolean;
  confirmAction: (() => void) | null;
  confirmTitle: string;
  confirmMessage: string;
  isTransitioning: boolean;
  /** When true, header/footer/toolbar won't show even if showControls is true. Used by plugins. */
  suppressControls: boolean;
}

export const useUIStore = defineStore("ui", {
  state: (): UIState => ({
    showControls: false,
    activeModal: null,
    showToast: false,
    toastTitle: "",
    toastMessage: "",
    toastError: false,
    showConfirm: false,
    confirmAction: null,
    confirmTitle: "",
    confirmMessage: "",
    isTransitioning: false,
    suppressControls: false,
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
      this.showControls = false;
      this.activeModal = type;
    },

    /**
     * Close current modal
     */
    closeModal() {
      this.activeModal = null;
    },

    /**
     * Show toast notification
     */
    triggerToast(message: string, isError = false) {
      // Reset first to ensure re-trigger animation
      this.showToast = false;
      this.toastTitle = "";
      this.toastMessage = message;
      this.toastError = isError;

      // Use requestAnimationFrame to ensure DOM update
      requestAnimationFrame(() => {
        this.showToast = true;
        setTimeout(() => {
          this.showToast = false;
        }, TOAST_DURATION);
      });
    },

    /**
     * Show toast notification with title and message
     */
    triggerToastWithTitle(title: string, message: string, isError = false) {
      this.showToast = false;
      this.toastTitle = title;
      this.toastMessage = message;
      this.toastError = isError;

      requestAnimationFrame(() => {
        this.showToast = true;
        setTimeout(() => {
          this.showToast = false;
        }, TOAST_DURATION);
      });
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

    setSuppressControls(value: boolean) {
      this.suppressControls = value;
    },
  },

  getters: {
    effectiveShowControls: (state) => state.showControls && !state.suppressControls,
  },
});
