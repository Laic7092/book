const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/SettingsPanel-DFgfIx8a.js","assets/index-BiAsyXEO.js","assets/chunk-QTnfLwEv.js","assets/raw-data-DXySxYhg.js","assets/ui-BOSgEfyK.js","assets/constants-B26xLSZm.js","assets/reactivity.esm-bundler-mCHFN0w4.js","assets/runtime-core.esm-bundler-CF3jp_8T.js","assets/index-LTCZ9dNd.css","assets/ModalPanel-pXYgo_xT.js","assets/ModalPanel-C-tlb-iB.css","assets/file-BswdcShs.js","assets/SettingsPanel-CHeGjNu_.css","assets/TypographyPanel-TEEFpxRW.js","assets/ToggleSwitch-BCnCdMCi.js","assets/ToggleSwitch-BUb8uJ_u.css","assets/styles-ISgwm6Ns.js","assets/TypographyPanel-CM2C1-vZ.css"])))=>i.map(i=>d[i]);
import{n as e}from"./chunk-QTnfLwEv.js";import{_ as t}from"./reactivity.esm-bundler-mCHFN0w4.js";import{A as n}from"./runtime-core.esm-bundler-CF3jp_8T.js";import{V as r,d as i,j as a,p as o}from"./index-BiAsyXEO.js";var s={fontSize:null,fontFamily:`Literata, Georgia, serif`,lineHeight:1.6,theme:null,margin:24,letterSpacing:0,paragraphSpacing:1.2,textAlign:`left`,contrast:`normal`,readingMode:`pagination`,paginationAnimation:`fade`,customTypography:!1,useCustomColors:!1,customBgColor:`#fdfcfb`,customTextColor:`#1f1a17`,customBgImage:void 0,customBgImageRepeat:`no-repeat`,customBgImageSize:`cover`,customFontFamily:void 0};function c(e,t,n){let r,i,o,s;if(e){let n=a.get(e);r=n.content.background,i=n.content.text,e===`dark`&&t&&(t===`soft`?(r=`#2a2a2a`,i=`#d0d0d0`):t===`high`&&(r=`#000000`,i=`#ffffff`)),o=n.content.textSecondary??(e===`dark`?`rgba(255,255,255,0.6)`:`rgba(0,0,0,0.55)`),s=n.content.borderSubtle??(e===`dark`?`rgba(255,255,255,0.1)`:`rgba(0,0,0,0.08)`)}else r=`#fdfcfb`,i=`#1f1a17`,o=`rgba(0,0,0,0.55)`,s=`rgba(0,0,0,0.08)`;n?.bg&&(r=n.bg),n?.text&&(i=n.text);let c=n?.bgImage?`
      background-image: url("${n.bgImage}");
      background-repeat: ${n.bgImageRepeat||`no-repeat`};
      background-size: ${n.bgImageSize||`cover`};
      background-position: center;
    `:``;return`
    :root {
      --reader-bg: ${r};
      --reader-text: ${i};
      --border-subtle: ${s};
      --text-secondary: ${o};
    }
    body {
      background-color: var(--reader-bg);
      color: var(--reader-text);
      ${c}
    }
  `}function l(e){let t=e.customTypography??!1,n=e.fontSize==null?``:`font-size: ${e.fontSize}px;`;return t?`
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
  `:n?`body.reader-content { ${n} }`:``}function u(e){if(!(!e.useCustomColors&&!e.customBgImage))return{bg:e.useCustomColors?e.customBgColor:void 0,text:e.useCustomColors?e.customTextColor:void 0,bgImage:e.customBgImage,bgImageRepeat:e.customBgImageRepeat,bgImageSize:e.customBgImageSize}}function d(e){return e.map(e=>`
@font-face {
  font-family: "${e.name}";
  src: url("${e.data}") format("${e.format}");
  font-display: swap;
}`).join(`
`)}function f(e,t){if(t.customFontFamily)return e.find(e=>e.name===t.customFontFamily)}function p(e,t){let n=u(e),r=e.theme||e.useCustomColors||e.customBgImage?c(e.theme,e.contrast,n):``,i=``,a=t?f(t,e):void 0;return a&&(i=d([a])),i+r+l(e)}function m(e){return e===`scroll`||e===`vertical`?`scroll`:`pagination`}var h=`reader-settings`,g=null;function _(){return g}function v(){return g?.fontStore??null}function y(e){let n=i(e,`setting`),r=i(e,`font`),a=t({...s});return{store:n,fontStore:r,settings:a,update:async e=>{a.value={...a.value,...e},await n.add({id:h,...a.value})}}}async function b(e){e.loaded.value||await new Promise(t=>{let r=n(()=>e.loaded.value,e=>{e&&(r(),t())})})}async function x(e,t){let r=y(e.storage);g=r;let{store:i,fontStore:a,settings:o,update:c}=r;await b(i);let l=i.getById(h);if(l){let{id:e,...t}=l;o.value={...s,...t,readingMode:m(t.readingMode)}}else await c({...s}),o.value={...s};function u(){return o.value.customTypography?o.value.margin:s.margin}function d(t){if(t){e.ui.setTheme(t);try{localStorage.setItem(`reader-bg`,e.themes.get(t).chrome.bg)}catch{}}else{e.ui.clearTheme();try{localStorage.removeItem(`reader-bg`)}catch{}}}function f(){let t=[...a.items.value];e.ui.injectIframeStyle(`typography`,p(o.value,t))}let _=t=>{d(o.value.theme),f();let n=e.readerSession();return n&&n.setPageMargin(u()),{...t,mode:o.value.readingMode??`pagination`}};return _({}),e.hooks.filter(`reader:init-config`,_),e.registerContentTransformer({id:`settings-typography`,priority:50,transform(e){return e}}),n(()=>[o.value.theme,o.value.useCustomColors,o.value.customBgColor,o.value.customTextColor,o.value.customBgImage,o.value.customBgImageRepeat,o.value.customBgImageSize],()=>{d(o.value.theme),f()}),n(()=>o.value.readingMode,t=>{let n=e.readerSession();n&&n.setMode(t??`pagination`)}),n(()=>[o.value.margin,o.value.customTypography],([t,n])=>{let r=e.readerSession();r&&r.setPageMargin(n?t:s.margin)}),n(()=>[o.value.fontSize,o.value.fontFamily,o.value.lineHeight,o.value.letterSpacing,o.value.textAlign,o.value.paragraphSpacing,o.value.customTypography,o.value.margin,o.value.contrast,o.value.customFontFamily],()=>{f()}),n(()=>a.items.value,()=>{f()},{deep:!0}),t(()=>{g=null;try{localStorage.removeItem(`reader-bg`)}catch{}}),r}var S=e({getFontStore:()=>w,getSettingsState:()=>C,settingsPlugin:()=>E});function C(){return _()}function w(){return v()}var T=`<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>`,E={[o]:!0,id:`settings`,name:`Settings`,version:`1.0.0`,core:!0,async setup(e,{onTeardown:t}){await x(e,t),e.ui.registerModal(`settings`,()=>r(()=>import(`./SettingsPanel-DFgfIx8a.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12]))),e.ui.registerModal(`typographySettings`,()=>r(()=>import(`./TypographyPanel-TEEFpxRW.js`),__vite__mapDeps([13,1,2,3,4,5,6,7,8,9,10,14,15,11,16,17]))),e.ui.registerHeaderAction({id:`settings`,order:0,icon:T,label:`Settings`,onClick:()=>e.ui.openModal(`settings`)})}};export{u as a,s as c,m as i,C as n,c as o,S as r,l as s,w as t};