const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/SettingsPanel-C1Cvd3J7.js","assets/index-BYLta4tk.js","assets/chunk-QTnfLwEv.js","assets/theme-registry-C7s5WGm4.js","assets/db-Du0IvV7L.js","assets/raw-data-BiAdqBFz.js","assets/reader-session-BtalMhT0.js","assets/runtime-core.esm-bundler-BYA8md5Y.js","assets/ui-BQ1KQm8y.js","assets/constants-B26xLSZm.js","assets/index-LTCZ9dNd.css","assets/ModalPanel-D_QrJOzt.js","assets/ModalPanel-C-tlb-iB.css","assets/file-Fnn5U0JX.js","assets/SettingsPanel-2ZVr8Gqx.css","assets/TypographyPanel-BCHkXnRr.js","assets/ToggleSwitch-C88i-1lx.js","assets/ToggleSwitch-BUb8uJ_u.css","assets/styles-ISgwm6Ns.js","assets/TypographyPanel-Dv__v2AE.css"])))=>i.map(i=>d[i]);
import{n as e}from"./chunk-QTnfLwEv.js";import{A as t,V as n}from"./runtime-core.esm-bundler-BYA8md5Y.js";import{t as r}from"./theme-registry-C7s5WGm4.js";import{I as i,d as a,p as o}from"./index-BYLta4tk.js";var s={fontSize:null,fontFamily:`Literata, Georgia, serif`,lineHeight:1.6,theme:null,margin:24,letterSpacing:0,paragraphSpacing:1.2,textAlign:`left`,contrast:`normal`,readingMode:`pagination`,paginationAnimation:`fade`,customTypography:!1,useCustomColors:!1,customBgColor:`#fdfcfb`,customTextColor:`#1f1a17`,customBgImage:void 0,customBgImageRepeat:`no-repeat`,customBgImageSize:`cover`,customFontFamily:void 0};function c(e,t,n){let i,a,o,s;if(e){let n=r.get(e);i=n.content.background,a=n.content.text,e===`dark`&&t&&(t===`soft`?(i=`#2a2a2a`,a=`#d0d0d0`):t===`high`&&(i=`#000000`,a=`#ffffff`)),o=n.content.textSecondary??(e===`dark`?`rgba(255,255,255,0.6)`:`rgba(0,0,0,0.55)`),s=n.content.borderSubtle??(e===`dark`?`rgba(255,255,255,0.1)`:`rgba(0,0,0,0.08)`)}else i=`#fdfcfb`,a=`#1f1a17`,o=`rgba(0,0,0,0.55)`,s=`rgba(0,0,0,0.08)`;n?.bg&&(i=n.bg),n?.text&&(a=n.text);let c=n?.bgImage?`
      background-image: url("${n.bgImage}");
      background-repeat: ${n.bgImageRepeat||`no-repeat`};
      background-size: ${n.bgImageSize||`cover`};
      background-position: center;
    `:``;return`
    :root {
      --reader-bg: ${i};
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
  `:n?`body.reader-content { ${n} }`:``}var u=e({buildCustomColors:()=>_,getFontStore:()=>g,getSettingsState:()=>h,settingsPlugin:()=>S}),d=`reader-settings`,f=null,p=null,m=n({...s});function h(){return f?{settings:m,async update(e){m.value={...m.value,...e},await f.add({id:d,...m.value})}}:null}function g(){return p}function _(e){if(!(!e.useCustomColors&&!e.customBgImage))return{bg:e.useCustomColors?e.customBgColor:void 0,text:e.useCustomColors?e.customTextColor:void 0,bgImage:e.customBgImage,bgImageRepeat:e.customBgImageRepeat,bgImageSize:e.customBgImageSize}}function v(e){return e.map(e=>`
@font-face {
  font-family: "${e.name}";
  src: url("${e.data}") format("${e.format}");
  font-display: swap;
}`).join(`
`)}function y(e,t){if(t.customFontFamily)return e.find(e=>e.name===t.customFontFamily)}var b=`<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>`;function x(e,t){let n=_(e),r=e.theme||e.useCustomColors||e.customBgImage?c(e.theme,e.contrast,n):``,i=``,a=t?y(t,e):void 0;return a&&(i=v([a])),i+r+l(e)}var S={[o]:!0,id:`settings`,name:`Settings`,version:`1.0.0`,async setup(e,{onTeardown:n}){let r=a(e.storage,`setting`);f=r;let o=a(e.storage,`font`);p=o,r.loaded.value||await new Promise(e=>{let n=t(()=>r.loaded.value,t=>{t&&(n(),e())})});let c=r.getById(d);if(c){let{id:e,...t}=c;m.value={...s,...t}}else await r.add({id:d,...s}),m.value={...s};let l=m;function u(){return l.value.customTypography?l.value.margin:s.margin}function h(t){if(t){e.ui.setTheme(t);try{localStorage.setItem(`reader-bg`,e.themes.get(t).chrome.bg)}catch{}}else{e.ui.clearTheme();try{localStorage.removeItem(`reader-bg`)}catch{}}}e.registerContentTransformer({id:`settings-typography`,priority:50,transform(e){return e}}),e.ui.registerModal(`settings`,()=>i(()=>import(`./SettingsPanel-C1Cvd3J7.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14]))),e.ui.registerModal(`typographySettings`,()=>i(()=>import(`./TypographyPanel-BCHkXnRr.js`),__vite__mapDeps([15,1,2,3,4,5,6,7,8,9,10,11,12,16,17,13,18,19]))),e.ui.registerHeaderAction({id:`settings`,order:0,icon:b,label:`Settings`,onClick:()=>e.ui.openModal(`settings`)});function g(){let t=[...o.items.value];e.ui.injectIframeStyle(`typography`,x(l.value,t))}let _=t=>{h(l.value.theme),g();let n=e.readerSession();return n&&n.setPageMargin(u()),l.value.readingMode===`vertical`?{...t,mode:`scroll`}:t};_({}),e.hooks.filter(`reader:init-config`,_),t(()=>[l.value.theme,l.value.useCustomColors,l.value.customBgColor,l.value.customTextColor,l.value.customBgImage,l.value.customBgImageRepeat,l.value.customBgImageSize],()=>{h(l.value.theme),g()}),t(()=>l.value.readingMode,t=>{let n=e.readerSession();n&&n.dispatch({type:`SET_MODE`,mode:(t??`pagination`)===`vertical`?`scroll`:`pagination`})}),t(()=>[l.value.margin,l.value.customTypography],([t,n])=>{let r=e.readerSession();r&&r.setPageMargin(n?t:s.margin)}),t(()=>[l.value.fontSize,l.value.fontFamily,l.value.lineHeight,l.value.letterSpacing,l.value.textAlign,l.value.paragraphSpacing,l.value.customTypography,l.value.margin,l.value.contrast,l.value.customFontFamily],()=>{g()}),t(()=>o.items.value,()=>{g()},{deep:!0}),n(()=>{f=null,p=null;try{localStorage.removeItem(`reader-bg`)}catch{}})}};export{c as a,u as i,g as n,l as o,h as r,s,_ as t};