const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/SettingsPanel-csIIY0T1.js","assets/index-BsF__DCP.js","assets/preload-helper-CizOLQf1.js","assets/runtime-core.esm-bundler-BRP3Uj1z.js","assets/ui-CYZiYBQM.js","assets/constants-6jmQRIMV.js","assets/theme-registry-C7s5WGm4.js","assets/db-Dc6Q09L-.js","assets/raw-data-Cjl2oyA_.js","assets/chunk-QTnfLwEv.js","assets/reader-session-ChW9HItt.js","assets/shared-ROxp9qie.js","assets/src-DTrLhyRm.js","assets/index-Dl_jHGzg.css","assets/ModalHeader-C2u_QCKh.js","assets/ModalHeader-DO7qvt2O.css","assets/options-BsDWmd5j.js","assets/SettingsPanel-CWLaySYz.css","assets/TypographyPanel-BOoSxfH_.js","assets/src-DwIvQxku.js","assets/TypographyPanel-BBR1K3oj.css"])))=>i.map(i=>d[i]);
import{n as e}from"./chunk-QTnfLwEv.js";import{B as t,k as n}from"./runtime-core.esm-bundler-BRP3Uj1z.js";import{t as r}from"./preload-helper-CizOLQf1.js";import{t as i}from"./theme-registry-C7s5WGm4.js";import{d as a,u as o}from"./index-BsF__DCP.js";var s={fontSize:null,fontFamily:`Literata, Georgia, serif`,lineHeight:1.6,theme:null,margin:24,letterSpacing:0,paragraphSpacing:1.2,textAlign:`left`,contrast:`normal`,readingMode:`pagination`,paginationAnimation:`fade`,customTypography:!1,useCustomColors:!1,customBgColor:`#fdfcfb`,customTextColor:`#1f1a17`,customBgImage:void 0,customBgImageRepeat:`no-repeat`,customBgImageSize:`cover`,customFontFamily:void 0};function c(e,t,n){let r,a,o,s;if(e){let n=i.get(e);r=n.content.background,a=n.content.text,e===`dark`&&t&&(t===`soft`?(r=`#2a2a2a`,a=`#d0d0d0`):t===`high`&&(r=`#000000`,a=`#ffffff`)),o=n.content.textSecondary??(e===`dark`?`rgba(255,255,255,0.6)`:`rgba(0,0,0,0.55)`),s=n.content.borderSubtle??(e===`dark`?`rgba(255,255,255,0.1)`:`rgba(0,0,0,0.08)`)}else r=`#fdfcfb`,a=`#1f1a17`,o=`rgba(0,0,0,0.55)`,s=`rgba(0,0,0,0.08)`;n?.bg&&(r=n.bg),n?.text&&(a=n.text);let c=n?.bgImage?`
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
  `:n?`body.reader-content { ${n} }`:``}var u=e({buildCustomColors:()=>_,getFontStore:()=>g,getSettingsState:()=>h,settingsPlugin:()=>S}),d=`reader-settings`,f=null,p=null,m=t({...s});function h(){return f?{settings:m,async update(e){m.value={...m.value,...e},await f.add({id:d,...m.value})}}:null}function g(){return p}function _(e){if(!(!e.useCustomColors&&!e.customBgImage))return{bg:e.useCustomColors?e.customBgColor:void 0,text:e.useCustomColors?e.customTextColor:void 0,bgImage:e.customBgImage,bgImageRepeat:e.customBgImageRepeat,bgImageSize:e.customBgImageSize}}function v(e){return e.map(e=>`
@font-face {
  font-family: "${e.name}";
  src: url("${e.data}") format("${e.format}");
  font-display: swap;
}`).join(`
`)}function y(e,t){if(t.customFontFamily)return e.find(e=>e.name===t.customFontFamily)}var b=`<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>`;function x(e,t){let n=_(e),r=e.theme||e.useCustomColors||e.customBgImage?c(e.theme,e.contrast,n):``,i=``,a=t?y(t,e):void 0;return a&&(i=v([a])),i+r+l(e)}var S={[a]:!0,id:`settings`,name:`Settings`,version:`1.0.0`,async setup(e,{onTeardown:t}){let i=o(e.storage,`setting`);f=i;let a=o(e.storage,`font`);p=a,i.loaded.value||await new Promise(e=>{let t=n(()=>i.loaded.value,n=>{n&&(t(),e())})});let c=i.getById(d);if(c){let{id:e,...t}=c;m.value={...s,...t}}else await i.add({id:d,...s}),m.value={...s};let l=m;function u(){return l.value.customTypography?l.value.margin:s.margin}function h(t){if(t){e.ui.setTheme(t);try{localStorage.setItem(`reader-bg`,e.themes.get(t).chrome.bg)}catch{}}else{e.ui.clearTheme();try{localStorage.removeItem(`reader-bg`)}catch{}}}e.registerContentTransformer({id:`settings-typography`,priority:50,transform(e){return e}}),e.ui.registerModal(`settings`,()=>r(()=>import(`./SettingsPanel-csIIY0T1.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]))),e.ui.registerModal(`typographySettings`,()=>r(()=>import(`./TypographyPanel-BOoSxfH_.js`),__vite__mapDeps([18,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,19,20]))),e.ui.registerHeaderAction({id:`settings`,order:0,icon:b,label:`Settings`,onClick:()=>e.ui.openModal(`settings`)});function g(){let t=[...a.items.value];e.ui.injectIframeStyle(`typography`,x(l.value,t))}let _=t=>{h(l.value.theme),g();let n=e.readerSession();return n&&n.setPageMargin(u()),l.value.readingMode===`vertical`?{...t,mode:`scroll`}:t};_({}),e.hooks.filter(`reader:init-config`,_),n(()=>[l.value.theme,l.value.useCustomColors,l.value.customBgColor,l.value.customTextColor,l.value.customBgImage,l.value.customBgImageRepeat,l.value.customBgImageSize],()=>{h(l.value.theme),g()}),n(()=>l.value.readingMode,t=>{let n=e.readerSession();n&&n.dispatch({type:`SET_MODE`,mode:(t??`pagination`)===`vertical`?`scroll`:`pagination`})}),n(()=>[l.value.margin,l.value.customTypography],([t,n])=>{let r=e.readerSession();r&&r.setPageMargin(n?t:s.margin)}),n(()=>[l.value.fontSize,l.value.fontFamily,l.value.lineHeight,l.value.letterSpacing,l.value.textAlign,l.value.paragraphSpacing,l.value.customTypography,l.value.margin,l.value.contrast,l.value.customFontFamily],()=>{g()}),n(()=>a.items.value,()=>{g()},{deep:!0}),t(()=>{f=null,p=null;try{localStorage.removeItem(`reader-bg`)}catch{}})}};export{c as a,u as i,g as n,l as o,h as r,s,_ as t};