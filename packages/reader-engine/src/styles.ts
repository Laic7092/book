export const BASE_CSS = `
  html, body { margin: 0; padding: 0; }
  body.reader-content {
    word-wrap: break-word;
    overflow-wrap: break-word;
    hyphens: auto;
    margin: var(--page-margin, 24px);
  }
  body.reader-content img,
  body.reader-content svg,
  body.reader-content video {
    max-width: 100% !important;
    height: auto !important;
    width: auto !important;
  }
  body.reader-content h1, h2, h3, h4, h5, h6 {
    break-inside: avoid;
  }
`;

export const PAGINATION_CSS = `
  html[data-mode="paginated"] {
    overflow: hidden;
  }
  html[data-mode="paginated"] body.reader-content {
    column-width: calc(100dvw - 2 * var(--page-margin, 24px));
    column-gap: calc(2 * var(--page-margin, 24px));
    column-fill: auto;
    height: calc(100dvh - 2 * var(--page-margin, 24px));
    overflow: visible;
    transform: translateX(calc(-1 * var(--current-page, 0) * 100dvw));
    content-visibility: auto;
    contain-intrinsic-size: auto 100dvh;
  }
  html[data-mode="paginated"] body.reader-content pre,
  html[data-mode="paginated"] body.reader-content table,
  html[data-mode="paginated"] body.reader-content blockquote {
    max-width: 100%;
    overflow-x: auto;
  }
`;
