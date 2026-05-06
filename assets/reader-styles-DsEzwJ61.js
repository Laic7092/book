var e={light:{background:`#ffffff`,text:`#333333`},dark:{background:`#1a1a1a`,text:`#e0e0e0`},sepia:{background:`#f4ecd8`,text:`#5b4636`}};function t(t,n){let r=e[t]||e.light,i=r.background,a=r.text;return t===`dark`&&n&&(n===`soft`?(i=`#2a2a2a`,a=`#d0d0d0`):n===`high`&&(i=`#000000`,a=`#ffffff`)),`
    :root {
      --reader-bg: ${i};
      --reader-text: ${a};
      --border-subtle: ${t===`dark`?`rgba(255,255,255,0.1)`:`rgba(0,0,0,0.08)`};
      --text-secondary: ${t===`dark`?`rgba(255,255,255,0.6)`:`rgba(0,0,0,0.55)`};
    }
    body {
      background-color: var(--reader-bg);
      color: var(--reader-text);
    }
  `}function n(){return`
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
      margin: 24px;
      touch-action: pan-y;
      will-change: transform;
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

    /* 垂直滚动模式：底部留白供进度条 */
    body.reader-content.vertical-content {
      padding-bottom: 40vh;
    }
  `}function r(e){return e.customTypography??!1?`
    body.reader-content {
      font-size: ${e.fontSize}px;
      font-family: ${e.fontFamily};
      line-height: ${e.lineHeight};
      letter-spacing: ${e.letterSpacing||0}em;
      text-align: ${e.textAlign||`left`};
      margin: ${e.margin||24}px;
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
    `}function i(e,t,n){return`
    html {
      overflow: hidden;
    }
    body.reader-content {
      column-width: ${e}px;
      column-gap: ${n}px;
      column-fill: auto;
      height: ${t}px;
      overflow: visible;
    }
  `}function a(e){return{theme:t(e.theme,e.contrast),base:n(),typography:r(e)}}export{r as i,i as n,t as r,a as t};