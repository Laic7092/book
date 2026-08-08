// Base styles injected into the reader iframe. Single source of truth for
// reader layout: shared rules, media sizing, and both scroll/paginated modes.
export const BASE_CSS = `
  html, body {
    margin: 0;
    padding: 0;
    scrollbar-width: none;
  }

  body.reader-content {
    word-wrap: break-word;
    overflow-wrap: break-word;
    hyphens: auto;
    -webkit-hyphens: auto;
    margin: var(--page-margin, 24px);
  }

  body.reader-content h1,
  body.reader-content h2,
  body.reader-content h3,
  body.reader-content h4,
  body.reader-content h5,
  body.reader-content h6 {
    break-inside: avoid;
  }

  body.reader-content img,
  body.reader-content svg,
  body.reader-content video,
  body.reader-content audio {
    max-width: 100% !important;
    height: auto !important;
    width: auto !important;
  }

  body.reader-content img {
    object-fit: contain;
    display: block;
    -webkit-user-drag: none;
    user-drag: none;
  }

  body.reader-content svg image {
    max-width: 100% !important;
    height: auto !important;
    width: auto !important;
    display: inline;
    margin: 0;
  }

  body.reader-content figure {
    max-width: 100% !important;
    margin: 1em auto;
    text-align: center;
  }

  body.reader-content figcaption {
    font-size: 0.9em;
    color: var(--text-secondary);
    margin-top: 0.5em;
    text-align: center;
  }

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
  }

  html[data-mode="scroll"] {
    overflow-y: auto;
  }
  html[data-mode="scroll"] body.reader-content {
    touch-action: pan-y;
    margin: 0 var(--page-margin, 24px);
  }
  html[data-mode="scroll"] .scroll-chapter {
    min-height: 100vh;
    padding-bottom: 1em;
  }
`;
