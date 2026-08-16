const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/SettingsPanel-BtrqVHkO.js","assets/index-pzAD5UAT.js","assets/chunk-QTnfLwEv.js","assets/raw-data-DXySxYhg.js","assets/ui-BQ1KQm8y.js","assets/constants-B26xLSZm.js","assets/runtime-core.esm-bundler-BYA8md5Y.js","assets/index-LTCZ9dNd.css","assets/ModalPanel-C1rFfAnY.js","assets/ModalPanel-C-tlb-iB.css","assets/file-BswdcShs.js","assets/SettingsPanel-CHeGjNu_.css","assets/TypographyPanel-CCoNuU4W.js","assets/ToggleSwitch-DGHqLRw9.js","assets/ToggleSwitch-BUb8uJ_u.css","assets/styles-ISgwm6Ns.js","assets/TypographyPanel-CM2C1-vZ.css"])))=>i.map(i=>d[i]);
import{n as e}from"./chunk-QTnfLwEv.js";import{A as t,V as n}from"./runtime-core.esm-bundler-BYA8md5Y.js";import{d as r,k as i,p as a,z as o}from"./index-pzAD5UAT.js";var s={fontSize:null,fontFamily:`Literata, Georgia, serif`,lineHeight:1.6,theme:null,margin:24,letterSpacing:0,paragraphSpacing:1.2,textAlign:`left`,contrast:`normal`,readingMode:`pagination`,paginationAnimation:`fade`,customTypography:!1,useCustomColors:!1,customBgColor:`#fdfcfb`,customTextColor:`#1f1a17`,customBgImage:void 0,customBgImageRepeat:`no-repeat`,customBgImageSize:`cover`,customFontFamily:void 0};function c(e,t,n){let r,a,o,s;if(e){let n=i.get(e);r=n.content.background,a=n.content.text,e===`dark`&&t&&(t===`soft`?(r=`#2a2a2a`,a=`#d0d0d0`):t===`high`&&(r=`#000000`,a=`#ffffff`)),o=n.content.textSecondary??(e===`dark`?`rgba(255,255,255,0.6)`:`rgba(0,0,0,0.55)`),s=n.content.borderSubtle??(e===`dark`?`rgba(255,255,255,0.1)`:`rgba(0,0,0,0.08)`)}else r=`#fdfcfb`,a=`#1f1a17`,o=`rgba(0,0,0,0.55)`,s=`rgba(0,0,0,0.08)`;n?.bg&&(r=n.bg),n?.text&&(a=n.text);let c=n?.bgImage?`
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
`)}function f(e,t){if(t.customFontFamily)return e.find(e=>e.name===t.customFontFamily)}function p(e,t){let n=u(e),r=e.theme||e.useCustomColors||e.customBgImage?c(e.theme,e.contrast,n):``,i=``,a=t?f(t,e):void 0;return a&&(i=d([a])),i+r+l(e)}function m(e){return e===`scroll`||e===`vertical`?`scroll`:`pagination`}var h=`reader-settings`,g=null;function _(){return g}function v(){return g?.fontStore??null}function y(e){let t=r(e,`setting`),i=r(e,`font`),a=n({...s});return{store:t,fontStore:i,settings:a,update:async e=>{a.value={...a.value,...e},await t.add({id:h,...a.value})}}}async function b(e){e.loaded.value||await new Promise(n=>{let r=t(()=>e.loaded.value,e=>{e&&(r(),n())})})}async function x(e,n){let r=y(e.storage);g=r;let{store:i,fontStore:a,settings:o,update:c}=r;await b(i);let l=i.getById(h);if(l){let{id:e,...t}=l;o.value={...s,...t,readingMode:m(t.readingMode)}}else await c({...s}),o.value={...s};function u(){return o.value.customTypography?o.value.margin:s.margin}function d(t){if(t){e.ui.setTheme(t);try{localStorage.setItem(`reader-bg`,e.themes.get(t).chrome.bg)}catch{}}else{e.ui.clearTheme();try{localStorage.removeItem(`reader-bg`)}catch{}}}function f(){let t=[...a.items.value];e.ui.injectIframeStyle(`typography`,p(o.value,t))}let _=t=>{d(o.value.theme),f();let n=e.readerSession();return n&&n.setPageMargin(u()),{...t,mode:o.value.readingMode??`pagination`}};return _({}),e.hooks.filter(`reader:init-config`,_),e.registerContentTransformer({id:`settings-typography`,priority:50,transform(e){return e}}),t(()=>[o.value.theme,o.value.useCustomColors,o.value.customBgColor,o.value.customTextColor,o.value.customBgImage,o.value.customBgImageRepeat,o.value.customBgImageSize],()=>{d(o.value.theme),f()}),t(()=>o.value.readingMode,t=>{let n=e.readerSession();n&&n.setMode(t??`pagination`)}),t(()=>[o.value.margin,o.value.customTypography],([t,n])=>{let r=e.readerSession();r&&r.setPageMargin(n?t:s.margin)}),t(()=>[o.value.fontSize,o.value.fontFamily,o.value.lineHeight,o.value.letterSpacing,o.value.textAlign,o.value.paragraphSpacing,o.value.customTypography,o.value.margin,o.value.contrast,o.value.customFontFamily],()=>{f()}),t(()=>a.items.value,()=>{f()},{deep:!0}),n(()=>{g=null;try{localStorage.removeItem(`reader-bg`)}catch{}}),r}var S=e({getFontStore:()=>w,getSettingsState:()=>C,settingsPlugin:()=>E});function C(){return _()}function w(){return v()}var T=`<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>`,E={[a]:!0,id:`settings`,name:`Settings`,version:`1.0.0`,core:!0,async setup(e,{onTeardown:t}){await x(e,t),e.ui.registerModal(`settings`,()=>o(()=>import(`./SettingsPanel-BtrqVHkO.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11]))),e.ui.registerModal(`typographySettings`,()=>o(()=>import(`./TypographyPanel-CCoNuU4W.js`),__vite__mapDeps([12,1,2,3,4,5,6,7,8,9,13,14,10,15,16]))),e.ui.registerHeaderAction({id:`settings`,order:0,icon:T,label:`Settings`,onClick:()=>e.ui.openModal(`settings`)})}};export{u as a,s as c,m as i,C as n,c as o,S as r,l as s,w as t};