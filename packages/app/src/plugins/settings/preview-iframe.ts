import type { ReaderSettings } from "../../core/reader-settings";
import { generateThemeCSS, generateTypographyCSS } from "../../utils/reader-css";
import { BASE_CSS } from "@book/reader-engine";
import { buildCustomColors } from "./index";

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

  const customColors = buildCustomColors(settings);
  const themeCSS =
    settings.theme || settings.useCustomColors || settings.customBgImage
      ? generateThemeCSS(settings.theme, settings.contrast, customColors)
      : "";
  const baseCSS = BASE_CSS;
  const typographyCSS = generateTypographyCSS(settings);

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html data-mode="scroll" style="overflow: hidden;">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style id="theme-style">${themeCSS}</style>
      <style id="base-style">${baseCSS}</style>
      <style id="typography-style">${typographyCSS}</style>
    </head>
    <body class="reader-content" style="padding-bottom: 0;">
      <p style="margin-top: 0;">Preview</p>
      <p style="margin-bottom: 0;">This is a preview. Adjust the settings to see how your reading experience changes.</p>
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
        const customColors = buildCustomColors(newSettings);
        themeStyle.textContent =
          newSettings.theme || newSettings.useCustomColors || newSettings.customBgImage
            ? generateThemeCSS(newSettings.theme, newSettings.contrast, customColors)
            : "";
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
