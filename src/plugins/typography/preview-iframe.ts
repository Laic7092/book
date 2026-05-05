import type { ReaderSettings } from "../../core/types";
import {
  generateIframeStyles,
  generateThemeCSS,
  generateTypographyCSS,
} from "../../reader-engine/reader-styles";

export interface PreviewIframe {
  updateStyles(settings: ReaderSettings): void;
  destroy(): void;
}

export function createPreviewIframe(
  container: HTMLElement,
  settings: ReaderSettings,
): PreviewIframe {
  const iframe = document.createElement("iframe");
  iframe.className = "preview-iframe";
  iframe.setAttribute("frameborder", "0");
  Object.assign(iframe.style, {
    width: "100%",
    height: "100%",
    border: "none",
    display: "block",
  });
  container.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    return {
      updateStyles() {},
      destroy() {
        container.removeChild(iframe);
      },
    };
  }

  const styles = generateIframeStyles(settings);
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style id="theme-style">${styles.theme}</style>
      <style id="base-style">${styles.base}</style>
      <style id="typography-style">${styles.typography}</style>
    </head>
    <body class="reader-content vertical-content">
      <h2 class="chapter-heading">Preview</h2>
      <p>This is a preview. Adjust the settings to see how your reading experience changes.</p>
      <p>The reading experience includes paragraph spacing, line height, font selection, and other typographic parameters displayed in real time.</p>
    </body>
    </html>
  `);
  doc.close();

  return {
    updateStyles(newSettings: ReaderSettings) {
      if (!doc) return;
      const themeStyle = doc.getElementById("theme-style");
      const typographyStyle = doc.getElementById("typography-style");
      if (themeStyle) {
        themeStyle.textContent = generateThemeCSS(newSettings.theme, newSettings.contrast);
      }
      if (typographyStyle) {
        typographyStyle.textContent = generateTypographyCSS(newSettings);
      }
    },
    destroy() {
      if (container.contains(iframe)) {
        container.removeChild(iframe);
      }
    },
  };
}
