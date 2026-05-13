import{t as e}from"./theme-registry-ChkwLADe.js";function t(e,t){let n=null,i=e=>{!t||!e.data||e.data.type!==`link-click`||t(e.data.href)};function a(a){let o=e.value;if(!o||(n=o.contentDocument||o.contentWindow?.document||null,!n))return;let s=r(),c=t?`<script>
      (function() {
        document.addEventListener('click', function(e) {
          var link = e.target.closest('a[href]');
          if (!link) return;
          var href = link.getAttribute('href');
          if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) return;
          e.preventDefault();
          e.stopPropagation();
          window.parent.postMessage({ type: 'link-click', href: href }, window.location.origin);
        }, true);
      })();
    <\/script>`:``;n.open(),n.write(`
      <!DOCTYPE html>
      <html data-mode="${a}">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
        <style id="base-style">${s}</style>
        <style id="resource-style"></style>
        ${c}
      </head>
      <body class="reader-content"></body>
      </html>
    `),n.close(),t&&window.addEventListener(`message`,i)}function o(){return n}function s(){return n?.body||null}function c(){window.removeEventListener(`message`,i),n=null}return{initIframe:a,getDocument:o,getArticle:s,cleanup:c}}function n(t,n){let r=e.get(t),i=r.content.background,a=r.content.text;t===`dark`&&n&&(n===`soft`?(i=`#2a2a2a`,a=`#d0d0d0`):n===`high`&&(i=`#000000`,a=`#ffffff`));let o=r.content.textSecondary??(t===`dark`?`rgba(255,255,255,0.6)`:`rgba(0,0,0,0.55)`),s=r.content.borderSubtle??(t===`dark`?`rgba(255,255,255,0.1)`:`rgba(0,0,0,0.08)`);return`
    :root {
      --reader-bg: ${i};
      --reader-text: ${a};
      --border-subtle: ${s};
      --text-secondary: ${o};
    }
    body {
      background-color: var(--reader-bg);
      color: var(--reader-text);
    }
  `}function r(){return`
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

    /* ── Mode-specific layout ── */

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
      will-change: transform;
      padding-bottom: 40vh;
      margin: var(--page-margin, 24px);
    }
  `}function i(e){return e.customTypography??!1?`
    body.reader-content {
      font-size: ${e.fontSize}px;
      font-family: ${e.fontFamily};
      line-height: ${e.lineHeight};
      letter-spacing: ${e.letterSpacing||0}em;
      text-align: ${e.textAlign||`left`};
    }

    body.reader-content p {
      margin-bottom: calc(var(--paragraph-spacing, ${e.paragraphSpacing||1.2}) * 1em);
      text-rendering: optimizeLegibility;
    }

    body.reader-content .chapter-heading {
      margin-bottom: 1em;
      border-bottom: 1px solid var(--border-subtle);
    }
  `:`
      body.reader-content {
        font-size: ${e.fontSize}px;
      }
    `}export{t as i,n,i as r,r as t};