const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/SettingsPanel-DsqEsx6u.js","assets/index-BXHgxZpS.js","assets/reactivity.esm-bundler-tvzTZSQK.js","assets/runtime-core.esm-bundler-BYERhXJl.js","assets/context-BeHf-E6A.js","assets/theme-registry-KqjLvqAz.js","assets/db-C7Uxpa8m.js","assets/chunk-CilyBKbf.js","assets/ui-CChcm6ga.js","assets/constants-hiDoVoHU.js","assets/store-factory-CEDv4W6A.js","assets/types-3U6GF28h.js","assets/raw-data-CRHrHRMb.js","assets/index-CoJaKSxD.css","assets/ModalHeader-CuClZS9T.js","assets/ModalHeader-DO7qvt2O.css","assets/options-BuuVVn7K.js","assets/SettingsPanel-YxZi_62b.css","assets/TypographyPanel-B6heGrE3.js","assets/TypographyPanel-D8aAxuUY.css"])))=>i.map(i=>d[i]);
import{n as e}from"./chunk-CilyBKbf.js";import{p as t}from"./reactivity.esm-bundler-tvzTZSQK.js";import{E as n}from"./runtime-core.esm-bundler-BYERhXJl.js";import{t as r}from"./theme-registry-KqjLvqAz.js";import{t as i}from"./types-3U6GF28h.js";import{t as a}from"./store-factory-CEDv4W6A.js";import{b as o}from"./index-BXHgxZpS.js";var s={fontSize:20,fontFamily:`Literata, Georgia, serif`,lineHeight:1.6,theme:null,margin:24,letterSpacing:0,paragraphSpacing:1.2,textAlign:`left`,contrast:`normal`,readingMode:`pagination`,paginationAnimation:`fade`,customTypography:!1};function c(e,t){let n=r.get(e),i=n.content.background,a=n.content.text;e===`dark`&&t&&(t===`soft`?(i=`#2a2a2a`,a=`#d0d0d0`):t===`high`&&(i=`#000000`,a=`#ffffff`));let o=n.content.textSecondary??(e===`dark`?`rgba(255,255,255,0.6)`:`rgba(0,0,0,0.55)`),s=n.content.borderSubtle??(e===`dark`?`rgba(255,255,255,0.1)`:`rgba(0,0,0,0.08)`);return`
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
    `}var d=e({getSettingsState:()=>h,settingsPlugin:()=>v}),f=`reader-settings`,p=null,m=t({...s});function h(){return p?{settings:m,async update(e){m.value={...m.value,...e},await p.add({id:f,...m.value})}}:null}var g=`<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>`;function _(e){let t=e.theme?c(e.theme,e.contrast):``;return l()+t+u(e)}var v={[i]:!0,id:`settings`,name:`Settings`,version:`1.0.0`,async setup(e){let t=a(e.storage,`setting`);p=t,t.loaded.value||await new Promise(e=>{let r=n(()=>t.loaded.value,t=>{t&&(r(),e())})});let r=t.getById(f);if(r){let{id:e,...t}=r;m.value={...s,...t}}else await t.add({id:f,...s}),m.value={...s};let i=m;function c(){return i.value.customTypography?i.value.margin:s.margin}function l(t){if(t){e.ui.setTheme(t);try{localStorage.setItem(`reader-bg`,e.themes.get(t).chrome.bg)}catch{}}else{e.ui.clearTheme();try{localStorage.removeItem(`reader-bg`)}catch{}}}e.registerContentTransformer({id:`settings-typography`,priority:50,transform(e){return e}}),e.ui.registerModal(`settings`,()=>o(()=>import(`./SettingsPanel-DsqEsx6u.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]))),e.ui.registerModal(`typographySettings`,()=>o(()=>import(`./TypographyPanel-B6heGrE3.js`),__vite__mapDeps([18,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,19]))),e.ui.registerHeaderAction({id:`settings`,order:0,icon:g,label:`Settings`,onClick:()=>e.ui.openModal(`settings`)});let u=t=>{l(i.value.theme),e.ui.injectIframeStyle(`typography`,_(i.value));let n=e.readerSession();return n&&n.setPageMargin(c()),i.value.readingMode===`vertical`?{...t,mode:`scroll`}:t};u({}),e.hooks.filter(`reader:init-config`,u),n(()=>i.value.theme,()=>{l(i.value.theme),e.ui.injectIframeStyle(`typography`,_(i.value))}),n(()=>i.value.readingMode,t=>{let n=e.readerSession();n&&n.dispatch({type:`SET_MODE`,mode:(t??`pagination`)===`vertical`?`scroll`:`pagination`})}),n(()=>[i.value.margin,i.value.customTypography],([t,n])=>{let r=e.readerSession();r&&r.setPageMargin(n?t:s.margin)}),n(()=>[i.value.fontSize,i.value.fontFamily,i.value.lineHeight,i.value.letterSpacing,i.value.textAlign,i.value.paragraphSpacing,i.value.customTypography,i.value.margin,i.value.contrast],()=>{e.ui.injectIframeStyle(`typography`,_(i.value))}),e.onCleanup(()=>{p=null;try{localStorage.removeItem(`reader-bg`)}catch{}})}};export{u as a,c as i,d as n,s as o,l as r,h as t};