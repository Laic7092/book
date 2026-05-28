const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/SettingsPanel-CJJD57gv.js","assets/index-BtHwXNTb.js","assets/preload-helper-B3TuGwO1.js","assets/runtime-core.esm-bundler-D8kBTu07.js","assets/ui-C8bed0D3.js","assets/constants-BPzvsGbP.js","assets/context-DEAuJTR_.js","assets/theme-registry-BM6rCdJt.js","assets/db-D7EJ-oc3.js","assets/reader-session-iO-G15jx.js","assets/store-factory-B8723t9H.js","assets/types-ex4pELKf.js","assets/books-DTWqa0N5.js","assets/raw-data-Ckvq3SFl.js","assets/chunk-CilyBKbf.js","assets/base-B7WyyXGZ.js","assets/src-DFdUrJ_L.js","assets/index-BMXDZwTI.css","assets/ModalHeader-CIgmG2j-.js","assets/ModalHeader-DO7qvt2O.css","assets/options-DhZ7mrWA.js","assets/SettingsPanel-DC1llYgy.css","assets/TypographyPanel-DAz5BMYS.js","assets/TypographyPanel-BBR1K3oj.css"])))=>i.map(i=>d[i]);
import{n as e}from"./chunk-CilyBKbf.js";import{O as t,z as n}from"./runtime-core.esm-bundler-D8kBTu07.js";import{t as r}from"./preload-helper-B3TuGwO1.js";import{t as i}from"./theme-registry-BM6rCdJt.js";import{t as a}from"./types-ex4pELKf.js";import{t as o}from"./store-factory-B8723t9H.js";var s={fontSize:null,fontFamily:`Literata, Georgia, serif`,lineHeight:1.6,theme:null,margin:24,letterSpacing:0,paragraphSpacing:1.2,textAlign:`left`,contrast:`normal`,readingMode:`pagination`,paginationAnimation:`fade`,customTypography:!1,useCustomColors:!1,customBgColor:`#fdfcfb`,customTextColor:`#1f1a17`,customBgImage:void 0,customBgImageRepeat:`no-repeat`,customBgImageSize:`cover`,customFontFamily:void 0};function c(e,t,n){let r,a,o,s;if(e){let n=i.get(e);r=n.content.background,a=n.content.text,e===`dark`&&t&&(t===`soft`?(r=`#2a2a2a`,a=`#d0d0d0`):t===`high`&&(r=`#000000`,a=`#ffffff`)),o=n.content.textSecondary??(e===`dark`?`rgba(255,255,255,0.6)`:`rgba(0,0,0,0.55)`),s=n.content.borderSubtle??(e===`dark`?`rgba(255,255,255,0.1)`:`rgba(0,0,0,0.08)`)}else r=`#fdfcfb`,a=`#1f1a17`,o=`rgba(0,0,0,0.55)`,s=`rgba(0,0,0,0.08)`;n?.bg&&(r=n.bg),n?.text&&(a=n.text);let c=n?.bgImage?`
      background-image: url("${n.bgImage}");
      background-repeat: ${n.bgImageRepeat||`no-repeat`};
      background-size: ${n.bgImageSize||`cover`};
      background-position: center;
    `:``;return`
    :root {
      --reader-bg: ${r};
      --reader-text: ${a};
      --border-subtle: ${s};
      --text-secondary: ${o};
    }
    body {
      background-color: var(--reader-bg);
      color: var(--reader-text);
      ${c}
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
      margin: 0 var(--page-margin, 24px);
    }
    html[data-mode="scroll"] .scroll-chapter {
      min-height: 100vh;
      padding-bottom: 1em;
    }
  `}function u(e){let t=e.customTypography??!1,n=e.fontSize==null?``:`font-size: ${e.fontSize}px;`;return t?`
    body.reader-content {
      ${[n,`font-family: ${e.fontFamily};`,`line-height: ${e.lineHeight};`,`letter-spacing: ${e.letterSpacing||0}em;`,`text-align: ${e.textAlign||`left`};`].filter(Boolean).join(`
      `)}
    }

    body.reader-content p {
      margin-bottom: calc(var(--paragraph-spacing, ${e.paragraphSpacing||1.2}) * 1em);
      text-rendering: optimizeLegibility;
    }

    body.reader-content .chapter-heading {
      margin-bottom: 1em;
      border-bottom: 1px solid var(--border-subtle);
    }
  `:n?`body.reader-content { ${n} }`:``}var d=e({buildCustomColors:()=>v,getFontStore:()=>_,getSettingsState:()=>g,settingsPlugin:()=>C}),f=`reader-settings`,p=null,m=null,h=n({...s});function g(){return p?{settings:h,async update(e){h.value={...h.value,...e},await p.add({id:f,...h.value})}}:null}function _(){return m}function v(e){if(!(!e.useCustomColors&&!e.customBgImage))return{bg:e.useCustomColors?e.customBgColor:void 0,text:e.useCustomColors?e.customTextColor:void 0,bgImage:e.customBgImage,bgImageRepeat:e.customBgImageRepeat,bgImageSize:e.customBgImageSize}}function y(e){return e.map(e=>`
@font-face {
  font-family: "${e.name}";
  src: url("${e.data}") format("${e.format}");
  font-display: swap;
}`).join(`
`)}function b(e,t){if(t.customFontFamily)return e.find(e=>e.name===t.customFontFamily)}var x=`<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>`;function S(e,t){let n=v(e),r=e.theme||e.useCustomColors||e.customBgImage?c(e.theme,e.contrast,n):``,i=``,a=t?b(t,e):void 0;return a&&(i=y([a])),l()+i+r+u(e)}var C={[a]:!0,id:`settings`,name:`Settings`,version:`1.0.0`,async setup(e,{onTeardown:n}){let i=o(e.storage,`setting`);p=i;let a=o(e.storage,`font`);m=a,i.loaded.value||await new Promise(e=>{let n=t(()=>i.loaded.value,t=>{t&&(n(),e())})});let c=i.getById(f);if(c){let{id:e,...t}=c;h.value={...s,...t}}else await i.add({id:f,...s}),h.value={...s};let l=h;function u(){return l.value.customTypography?l.value.margin:s.margin}function d(t){if(t){e.ui.setTheme(t);try{localStorage.setItem(`reader-bg`,e.themes.get(t).chrome.bg)}catch{}}else{e.ui.clearTheme();try{localStorage.removeItem(`reader-bg`)}catch{}}}e.registerContentTransformer({id:`settings-typography`,priority:50,transform(e){return e}}),e.ui.registerModal(`settings`,()=>r(()=>import(`./SettingsPanel-CJJD57gv.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]))),e.ui.registerModal(`typographySettings`,()=>r(()=>import(`./TypographyPanel-DAz5BMYS.js`),__vite__mapDeps([22,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,23]))),e.ui.registerHeaderAction({id:`settings`,order:0,icon:x,label:`Settings`,onClick:()=>e.ui.openModal(`settings`)});function g(){let t=[...a.items.value];e.ui.injectIframeStyle(`typography`,S(l.value,t))}let _=t=>{d(l.value.theme),g();let n=e.readerSession();return n&&n.setPageMargin(u()),l.value.readingMode===`vertical`?{...t,mode:`scroll`}:t};_({}),e.hooks.filter(`reader:init-config`,_),t(()=>[l.value.theme,l.value.useCustomColors,l.value.customBgColor,l.value.customTextColor,l.value.customBgImage,l.value.customBgImageRepeat,l.value.customBgImageSize],()=>{d(l.value.theme),g()}),t(()=>l.value.readingMode,t=>{let n=e.readerSession();n&&n.dispatch({type:`SET_MODE`,mode:(t??`pagination`)===`vertical`?`scroll`:`pagination`})}),t(()=>[l.value.margin,l.value.customTypography],([t,n])=>{let r=e.readerSession();r&&r.setPageMargin(n?t:s.margin)}),t(()=>[l.value.fontSize,l.value.fontFamily,l.value.lineHeight,l.value.letterSpacing,l.value.textAlign,l.value.paragraphSpacing,l.value.customTypography,l.value.margin,l.value.contrast,l.value.customFontFamily],()=>{g()}),t(()=>a.items.value,()=>{g()},{deep:!0}),n(()=>{p=null,m=null;try{localStorage.removeItem(`reader-bg`)}catch{}})}};export{l as a,s as c,d as i,_ as n,c as o,g as r,u as s,v as t};