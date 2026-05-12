import type { ReaderSettings } from "./types";
import {
  generateThemeCSS,
  generateBaseCSS,
  generateTypographyCSS,
} from "../../composables/useIframeRenderer";

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

  const themeCSS = generateThemeCSS(settings.theme, settings.contrast);
  const baseCSS = generateBaseCSS();
  const typographyCSS = generateTypographyCSS(settings);

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html data-mode="scroll">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style id="theme-style">${themeCSS}</style>
      <style id="base-style">${baseCSS}</style>
      <style id="typography-style">${typographyCSS}</style>
    </head>
    <body class="reader-content">
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
