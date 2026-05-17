const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/SettingsPanel-D7B8ImYC.js","assets/index-BxhY3kNL.js","assets/preload-helper-B3TuGwO1.js","assets/runtime-core.esm-bundler-D8kBTu07.js","assets/ui-C8bed0D3.js","assets/constants-BPzvsGbP.js","assets/context-A-DJ7YJu.js","assets/theme-registry-DFCO6tTp.js","assets/db-D7EJ-oc3.js","assets/reader-session-CdqMRaGN.js","assets/store-factory-DFdSq88f.js","assets/types-JYBgOGf0.js","assets/books-_71cLwAy.js","assets/raw-data-BjUEW6eq.js","assets/chunk-CilyBKbf.js","assets/base-B7WyyXGZ.js","assets/index-CQwQso7L.css","assets/ModalHeader-D6csoRFi.js","assets/ModalHeader-DO7qvt2O.css","assets/options-D4v3CGPI.js","assets/SettingsPanel-YxZi_62b.css","assets/TypographyPanel-DwbYW_eX.js","assets/TypographyPanel-D8aAxuUY.css"])))=>i.map(i=>d[i]);
import{n as e}from"./chunk-CilyBKbf.js";import{O as t,z as n}from"./runtime-core.esm-bundler-D8kBTu07.js";import{t as r}from"./preload-helper-B3TuGwO1.js";import{t as i}from"./theme-registry-DFCO6tTp.js";import{t as a}from"./types-JYBgOGf0.js";import{t as o}from"./store-factory-DFdSq88f.js";var s={fontSize:20,fontFamily:`Literata, Georgia, serif`,lineHeight:1.6,theme:null,margin:24,letterSpacing:0,paragraphSpacing:1.2,textAlign:`left`,contrast:`normal`,readingMode:`pagination`,paginationAnimation:`fade`,customTypography:!1};function c(e,t){let n=i.get(e),r=n.content.background,a=n.content.text;e===`dark`&&t&&(t===`soft`?(r=`#2a2a2a`,a=`#d0d0d0`):t===`high`&&(r=`#000000`,a=`#ffffff`));let o=n.content.textSecondary??(e===`dark`?`rgba(255,255,255,0.6)`:`rgba(0,0,0,0.55)`),s=n.content.borderSubtle??(e===`dark`?`rgba(255,255,255,0.1)`:`rgba(0,0,0,0.08)`);return`
    :root {
      --reader-bg: ${r};
      --reader-text: ${a};
      --border-subtle: ${s};
      --text-secondary: ${o};
    }
    body {
      background-color: var(--reader-bg);
      color: var(--reader-text);
    }
  `}function l(){return`
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
      will-change: transform;
      padding-bottom: 40vh;
      margin: var(--page-margin, 24px);
    }
  `}function u(e){return e.customTypography??!1?`
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
    `}var d=e({getSettingsState:()=>h,settingsPlugin:()=>v}),f=`reader-settings`,p=null,m=n({...s});function h(){return p?{settings:m,async update(e){m.value={...m.value,...e},await p.add({id:f,...m.value})}}:null}var g=`<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>`;function _(e){let t=e.theme?c(e.theme,e.contrast):``;return l()+t+u(e)}var v={[a]:!0,id:`settings`,name:`Settings`,version:`1.0.0`,async setup(e,{onTeardown:n}){let i=o(e.storage,`setting`);p=i,i.loaded.value||await new Promise(e=>{let n=t(()=>i.loaded.value,t=>{t&&(n(),e())})});let a=i.getById(f);if(a){let{id:e,...t}=a;m.value={...s,...t}}else await i.add({id:f,...s}),m.value={...s};let c=m;function l(){return c.value.customTypography?c.value.margin:s.margin}function u(t){if(t){e.ui.setTheme(t);try{localStorage.setItem(`reader-bg`,e.themes.get(t).chrome.bg)}catch{}}else{e.ui.clearTheme();try{localStorage.removeItem(`reader-bg`)}catch{}}}e.registerContentTransformer({id:`settings-typography`,priority:50,transform(e){return e}}),e.ui.registerModal(`settings`,()=>r(()=>import(`./SettingsPanel-D7B8ImYC.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]))),e.ui.registerModal(`typographySettings`,()=>r(()=>import(`./TypographyPanel-DwbYW_eX.js`),__vite__mapDeps([21,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,22]))),e.ui.registerHeaderAction({id:`settings`,order:0,icon:g,label:`Settings`,onClick:()=>e.ui.openModal(`settings`)});let d=t=>{u(c.value.theme),e.ui.injectIframeStyle(`typography`,_(c.value));let n=e.readerSession();return n&&n.setPageMargin(l()),c.value.readingMode===`vertical`?{...t,mode:`scroll`}:t};d({}),e.hooks.filter(`reader:init-config`,d),t(()=>c.value.theme,()=>{u(c.value.theme),e.ui.injectIframeStyle(`typography`,_(c.value))}),t(()=>c.value.readingMode,t=>{let n=e.readerSession();n&&n.dispatch({type:`SET_MODE`,mode:(t??`pagination`)===`vertical`?`scroll`:`pagination`})}),t(()=>[c.value.margin,c.value.customTypography],([t,n])=>{let r=e.readerSession();r&&r.setPageMargin(n?t:s.margin)}),t(()=>[c.value.fontSize,c.value.fontFamily,c.value.lineHeight,c.value.letterSpacing,c.value.textAlign,c.value.paragraphSpacing,c.value.customTypography,c.value.margin,c.value.contrast],()=>{e.ui.injectIframeStyle(`typography`,_(c.value))}),n(()=>{p=null;try{localStorage.removeItem(`reader-bg`)}catch{}})}};export{u as a,c as i,d as n,s as o,l as r,h as t};