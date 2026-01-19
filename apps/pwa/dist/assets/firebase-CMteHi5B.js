const Qf=()=>{};var xc={};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Tl={NODE_ADMIN:!1,SDK_VERSION:"${JSCORE_VERSION}"};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Jf=function(n,e){if(!n)throw Xf(e)},Xf=function(n){return new Error("Firebase Database ("+Tl.SDK_VERSION+") INTERNAL ASSERT FAILED: "+n)};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Il=function(n){const e=[];let t=0;for(let r=0;r<n.length;r++){let s=n.charCodeAt(r);s<128?e[t++]=s:s<2048?(e[t++]=s>>6|192,e[t++]=s&63|128):(s&64512)===55296&&r+1<n.length&&(n.charCodeAt(r+1)&64512)===56320?(s=65536+((s&1023)<<10)+(n.charCodeAt(++r)&1023),e[t++]=s>>18|240,e[t++]=s>>12&63|128,e[t++]=s>>6&63|128,e[t++]=s&63|128):(e[t++]=s>>12|224,e[t++]=s>>6&63|128,e[t++]=s&63|128)}return e},Yf=function(n){const e=[];let t=0,r=0;for(;t<n.length;){const s=n[t++];if(s<128)e[r++]=String.fromCharCode(s);else if(s>191&&s<224){const i=n[t++];e[r++]=String.fromCharCode((s&31)<<6|i&63)}else if(s>239&&s<365){const i=n[t++],a=n[t++],c=n[t++],l=((s&7)<<18|(i&63)<<12|(a&63)<<6|c&63)-65536;e[r++]=String.fromCharCode(55296+(l>>10)),e[r++]=String.fromCharCode(56320+(l&1023))}else{const i=n[t++],a=n[t++];e[r++]=String.fromCharCode((s&15)<<12|(i&63)<<6|a&63)}}return e.join("")},wl={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:typeof atob=="function",encodeByteArray(n,e){if(!Array.isArray(n))throw Error("encodeByteArray takes an array as a parameter");this.init_();const t=e?this.byteToCharMapWebSafe_:this.byteToCharMap_,r=[];for(let s=0;s<n.length;s+=3){const i=n[s],a=s+1<n.length,c=a?n[s+1]:0,l=s+2<n.length,d=l?n[s+2]:0,p=i>>2,m=(i&3)<<4|c>>4;let E=(c&15)<<2|d>>6,b=d&63;l||(b=64,a||(E=64)),r.push(t[p],t[m],t[E],t[b])}return r.join("")},encodeString(n,e){return this.HAS_NATIVE_SUPPORT&&!e?btoa(n):this.encodeByteArray(Il(n),e)},decodeString(n,e){return this.HAS_NATIVE_SUPPORT&&!e?atob(n):Yf(this.decodeStringToByteArray(n,e))},decodeStringToByteArray(n,e){this.init_();const t=e?this.charToByteMapWebSafe_:this.charToByteMap_,r=[];for(let s=0;s<n.length;){const i=t[n.charAt(s++)],c=s<n.length?t[n.charAt(s)]:0;++s;const d=s<n.length?t[n.charAt(s)]:64;++s;const m=s<n.length?t[n.charAt(s)]:64;if(++s,i==null||c==null||d==null||m==null)throw new Zf;const E=i<<2|c>>4;if(r.push(E),d!==64){const b=c<<4&240|d>>2;if(r.push(b),m!==64){const C=d<<6&192|m;r.push(C)}}}return r},init_(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(let n=0;n<this.ENCODED_VALS.length;n++)this.byteToCharMap_[n]=this.ENCODED_VALS.charAt(n),this.charToByteMap_[this.byteToCharMap_[n]]=n,this.byteToCharMapWebSafe_[n]=this.ENCODED_VALS_WEBSAFE.charAt(n),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[n]]=n,n>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(n)]=n,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(n)]=n)}}};class Zf extends Error{constructor(){super(...arguments),this.name="DecodeBase64StringError"}}const ep=function(n){const e=Il(n);return wl.encodeByteArray(e,!0)},ws=function(n){return ep(n).replace(/\./g,"")},As=function(n){try{return wl.decodeString(n,!0)}catch(e){console.error("base64Decode failed: ",e)}return null};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function CI(n){return Al(void 0,n)}function Al(n,e){if(!(e instanceof Object))return e;switch(e.constructor){case Date:const t=e;return new Date(t.getTime());case Object:n===void 0&&(n={});break;case Array:n=[];break;default:return e}for(const t in e)!e.hasOwnProperty(t)||!tp(t)||(n[t]=Al(n[t],e[t]));return n}function tp(n){return n!=="__proto__"}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function np(){if(typeof self<"u")return self;if(typeof window<"u")return window;if(typeof global<"u")return global;throw new Error("Unable to locate global object.")}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const rp=()=>np().__FIREBASE_DEFAULTS__,sp=()=>{if(typeof process>"u"||typeof xc>"u")return;const n=xc.__FIREBASE_DEFAULTS__;if(n)return JSON.parse(n)},ip=()=>{if(typeof document>"u")return;let n;try{n=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch{return}const e=n&&As(n[1]);return e&&JSON.parse(e)},$s=()=>{try{return Qf()||rp()||sp()||ip()}catch(n){console.info(`Unable to get __FIREBASE_DEFAULTS__ due to: ${n}`);return}},Rl=n=>{var e,t;return(t=(e=$s())===null||e===void 0?void 0:e.emulatorHosts)===null||t===void 0?void 0:t[n]},bl=n=>{const e=Rl(n);if(!e)return;const t=e.lastIndexOf(":");if(t<=0||t+1===e.length)throw new Error(`Invalid host ${e} with no separate hostname and port!`);const r=parseInt(e.substring(t+1),10);return e[0]==="["?[e.substring(1,t-1),r]:[e.substring(0,t),r]},Sl=()=>{var n;return(n=$s())===null||n===void 0?void 0:n.config},Pl=n=>{var e;return(e=$s())===null||e===void 0?void 0:e[`_${n}`]};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class op{constructor(){this.reject=()=>{},this.resolve=()=>{},this.promise=new Promise((e,t)=>{this.resolve=e,this.reject=t})}wrapCallback(e){return(t,r)=>{t?this.reject(t):this.resolve(r),typeof e=="function"&&(this.promise.catch(()=>{}),e.length===1?e(t):e(t,r))}}}/**
 * @license
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ft(n){try{return(n.startsWith("http://")||n.startsWith("https://")?new URL(n).hostname:n).endsWith(".cloudworkstations.dev")}catch{return!1}}async function Vo(n){return(await fetch(n,{credentials:"include"})).ok}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Cl(n,e){if(n.uid)throw new Error('The "uid" field is no longer supported by mockUserToken. Please use "sub" instead for Firebase Auth User ID.');const t={alg:"none",type:"JWT"},r=e||"demo-project",s=n.iat||0,i=n.sub||n.user_id;if(!i)throw new Error("mockUserToken must contain 'sub' or 'user_id' field!");const a=Object.assign({iss:`https://securetoken.google.com/${r}`,aud:r,iat:s,exp:s+3600,auth_time:s,sub:i,user_id:i,firebase:{sign_in_provider:"custom",identities:{}}},n);return[ws(JSON.stringify(t)),ws(JSON.stringify(a)),""].join(".")}const lr={};function ap(){const n={prod:[],emulator:[]};for(const e of Object.keys(lr))lr[e]?n.emulator.push(e):n.prod.push(e);return n}function cp(n){let e=document.getElementById(n),t=!1;return e||(e=document.createElement("div"),e.setAttribute("id",n),t=!0),{created:t,element:e}}let Uc=!1;function Oo(n,e){if(typeof window>"u"||typeof document>"u"||!Ft(window.location.host)||lr[n]===e||lr[n]||Uc)return;lr[n]=e;function t(E){return`__firebase__banner__${E}`}const r="__firebase__banner",i=ap().prod.length>0;function a(){const E=document.getElementById(r);E&&E.remove()}function c(E){E.style.display="flex",E.style.background="#7faaf0",E.style.position="fixed",E.style.bottom="5px",E.style.left="5px",E.style.padding=".5em",E.style.borderRadius="5px",E.style.alignItems="center"}function l(E,b){E.setAttribute("width","24"),E.setAttribute("id",b),E.setAttribute("height","24"),E.setAttribute("viewBox","0 0 24 24"),E.setAttribute("fill","none"),E.style.marginLeft="-6px"}function d(){const E=document.createElement("span");return E.style.cursor="pointer",E.style.marginLeft="16px",E.style.fontSize="24px",E.innerHTML=" &times;",E.onclick=()=>{Uc=!0,a()},E}function p(E,b){E.setAttribute("id",b),E.innerText="Learn more",E.href="https://firebase.google.com/docs/studio/preview-apps#preview-backend",E.setAttribute("target","__blank"),E.style.paddingLeft="5px",E.style.textDecoration="underline"}function m(){const E=cp(r),b=t("text"),C=document.getElementById(b)||document.createElement("span"),V=t("learnmore"),k=document.getElementById(V)||document.createElement("a"),q=t("preprendIcon"),U=document.getElementById(q)||document.createElementNS("http://www.w3.org/2000/svg","svg");if(E.created){const F=E.element;c(F),p(k,V);const z=d();l(U,q),F.append(U,C,k,z),document.body.appendChild(F)}i?(C.innerText="Preview backend disconnected.",U.innerHTML=`<g clip-path="url(#clip0_6013_33858)">
<path d="M4.8 17.6L12 5.6L19.2 17.6H4.8ZM6.91667 16.4H17.0833L12 7.93333L6.91667 16.4ZM12 15.6C12.1667 15.6 12.3056 15.5444 12.4167 15.4333C12.5389 15.3111 12.6 15.1667 12.6 15C12.6 14.8333 12.5389 14.6944 12.4167 14.5833C12.3056 14.4611 12.1667 14.4 12 14.4C11.8333 14.4 11.6889 14.4611 11.5667 14.5833C11.4556 14.6944 11.4 14.8333 11.4 15C11.4 15.1667 11.4556 15.3111 11.5667 15.4333C11.6889 15.5444 11.8333 15.6 12 15.6ZM11.4 13.6H12.6V10.4H11.4V13.6Z" fill="#212121"/>
</g>
<defs>
<clipPath id="clip0_6013_33858">
<rect width="24" height="24" fill="white"/>
</clipPath>
</defs>`):(U.innerHTML=`<g clip-path="url(#clip0_6083_34804)">
<path d="M11.4 15.2H12.6V11.2H11.4V15.2ZM12 10C12.1667 10 12.3056 9.94444 12.4167 9.83333C12.5389 9.71111 12.6 9.56667 12.6 9.4C12.6 9.23333 12.5389 9.09444 12.4167 8.98333C12.3056 8.86111 12.1667 8.8 12 8.8C11.8333 8.8 11.6889 8.86111 11.5667 8.98333C11.4556 9.09444 11.4 9.23333 11.4 9.4C11.4 9.56667 11.4556 9.71111 11.5667 9.83333C11.6889 9.94444 11.8333 10 12 10ZM12 18.4C11.1222 18.4 10.2944 18.2333 9.51667 17.9C8.73889 17.5667 8.05556 17.1111 7.46667 16.5333C6.88889 15.9444 6.43333 15.2611 6.1 14.4833C5.76667 13.7056 5.6 12.8778 5.6 12C5.6 11.1111 5.76667 10.2833 6.1 9.51667C6.43333 8.73889 6.88889 8.06111 7.46667 7.48333C8.05556 6.89444 8.73889 6.43333 9.51667 6.1C10.2944 5.76667 11.1222 5.6 12 5.6C12.8889 5.6 13.7167 5.76667 14.4833 6.1C15.2611 6.43333 15.9389 6.89444 16.5167 7.48333C17.1056 8.06111 17.5667 8.73889 17.9 9.51667C18.2333 10.2833 18.4 11.1111 18.4 12C18.4 12.8778 18.2333 13.7056 17.9 14.4833C17.5667 15.2611 17.1056 15.9444 16.5167 16.5333C15.9389 17.1111 15.2611 17.5667 14.4833 17.9C13.7167 18.2333 12.8889 18.4 12 18.4ZM12 17.2C13.4444 17.2 14.6722 16.6944 15.6833 15.6833C16.6944 14.6722 17.2 13.4444 17.2 12C17.2 10.5556 16.6944 9.32778 15.6833 8.31667C14.6722 7.30555 13.4444 6.8 12 6.8C10.5556 6.8 9.32778 7.30555 8.31667 8.31667C7.30556 9.32778 6.8 10.5556 6.8 12C6.8 13.4444 7.30556 14.6722 8.31667 15.6833C9.32778 16.6944 10.5556 17.2 12 17.2Z" fill="#212121"/>
</g>
<defs>
<clipPath id="clip0_6083_34804">
<rect width="24" height="24" fill="white"/>
</clipPath>
</defs>`,C.innerText="Preview backend running in this workspace."),C.setAttribute("id",b)}document.readyState==="loading"?window.addEventListener("DOMContentLoaded",m):m()}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function be(){return typeof navigator<"u"&&typeof navigator.userAgent=="string"?navigator.userAgent:""}function up(){return typeof window<"u"&&!!(window.cordova||window.phonegap||window.PhoneGap)&&/ios|iphone|ipod|ipad|android|blackberry|iemobile/i.test(be())}function lp(){var n;const e=(n=$s())===null||n===void 0?void 0:n.forceEnvironment;if(e==="node")return!0;if(e==="browser")return!1;try{return Object.prototype.toString.call(global.process)==="[object process]"}catch{return!1}}function hp(){return typeof navigator<"u"&&navigator.userAgent==="Cloudflare-Workers"}function dp(){const n=typeof chrome=="object"?chrome.runtime:typeof browser=="object"?browser.runtime:void 0;return typeof n=="object"&&n.id!==void 0}function fp(){return typeof navigator=="object"&&navigator.product==="ReactNative"}function pp(){const n=be();return n.indexOf("MSIE ")>=0||n.indexOf("Trident/")>=0}function kI(){return Tl.NODE_ADMIN===!0}function mp(){return!lp()&&!!navigator.userAgent&&navigator.userAgent.includes("Safari")&&!navigator.userAgent.includes("Chrome")}function gp(){try{return typeof indexedDB=="object"}catch{return!1}}function _p(){return new Promise((n,e)=>{try{let t=!0;const r="validate-browser-context-for-indexeddb-analytics-module",s=self.indexedDB.open(r);s.onsuccess=()=>{s.result.close(),t||self.indexedDB.deleteDatabase(r),n(!0)},s.onupgradeneeded=()=>{t=!1},s.onerror=()=>{var i;e(((i=s.error)===null||i===void 0?void 0:i.message)||"")}}catch(t){e(t)}})}function DI(){return!(typeof navigator>"u"||!navigator.cookieEnabled)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const yp="FirebaseError";class Ze extends Error{constructor(e,t,r){super(t),this.code=e,this.customData=r,this.name=yp,Object.setPrototypeOf(this,Ze.prototype),Error.captureStackTrace&&Error.captureStackTrace(this,br.prototype.create)}}class br{constructor(e,t,r){this.service=e,this.serviceName=t,this.errors=r}create(e,...t){const r=t[0]||{},s=`${this.service}/${e}`,i=this.errors[e],a=i?Ep(i,r):"Error",c=`${this.serviceName}: ${a} (${s}).`;return new Ze(s,c,r)}}function Ep(n,e){return n.replace(vp,(t,r)=>{const s=e[r];return s!=null?String(s):`<${r}?>`})}const vp=/\{\$([^}]+)}/g;/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Fc(n){return JSON.parse(n)}function NI(n){return JSON.stringify(n)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const kl=function(n){let e={},t={},r={},s="";try{const i=n.split(".");e=Fc(As(i[0])||""),t=Fc(As(i[1])||""),s=i[2],r=t.d||{},delete t.d}catch{}return{header:e,claims:t,data:r,signature:s}},VI=function(n){const e=kl(n),t=e.claims;return!!t&&typeof t=="object"&&t.hasOwnProperty("iat")},OI=function(n){const e=kl(n).claims;return typeof e=="object"&&e.admin===!0};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function LI(n,e){return Object.prototype.hasOwnProperty.call(n,e)}function MI(n,e){if(Object.prototype.hasOwnProperty.call(n,e))return n[e]}function Tp(n){for(const e in n)if(Object.prototype.hasOwnProperty.call(n,e))return!1;return!0}function xI(n,e,t){const r={};for(const s in n)Object.prototype.hasOwnProperty.call(n,s)&&(r[s]=e.call(t,n[s],s,n));return r}function lt(n,e){if(n===e)return!0;const t=Object.keys(n),r=Object.keys(e);for(const s of t){if(!r.includes(s))return!1;const i=n[s],a=e[s];if(Bc(i)&&Bc(a)){if(!lt(i,a))return!1}else if(i!==a)return!1}for(const s of r)if(!t.includes(s))return!1;return!0}function Bc(n){return n!==null&&typeof n=="object"}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Sr(n){const e=[];for(const[t,r]of Object.entries(n))Array.isArray(r)?r.forEach(s=>{e.push(encodeURIComponent(t)+"="+encodeURIComponent(s))}):e.push(encodeURIComponent(t)+"="+encodeURIComponent(r));return e.length?"&"+e.join("&"):""}function ir(n){const e={};return n.replace(/^\?/,"").split("&").forEach(r=>{if(r){const[s,i]=r.split("=");e[decodeURIComponent(s)]=decodeURIComponent(i)}}),e}function or(n){const e=n.indexOf("?");if(!e)return"";const t=n.indexOf("#",e);return n.substring(e,t>0?t:void 0)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class UI{constructor(){this.chain_=[],this.buf_=[],this.W_=[],this.pad_=[],this.inbuf_=0,this.total_=0,this.blockSize=512/8,this.pad_[0]=128;for(let e=1;e<this.blockSize;++e)this.pad_[e]=0;this.reset()}reset(){this.chain_[0]=1732584193,this.chain_[1]=4023233417,this.chain_[2]=2562383102,this.chain_[3]=271733878,this.chain_[4]=3285377520,this.inbuf_=0,this.total_=0}compress_(e,t){t||(t=0);const r=this.W_;if(typeof e=="string")for(let m=0;m<16;m++)r[m]=e.charCodeAt(t)<<24|e.charCodeAt(t+1)<<16|e.charCodeAt(t+2)<<8|e.charCodeAt(t+3),t+=4;else for(let m=0;m<16;m++)r[m]=e[t]<<24|e[t+1]<<16|e[t+2]<<8|e[t+3],t+=4;for(let m=16;m<80;m++){const E=r[m-3]^r[m-8]^r[m-14]^r[m-16];r[m]=(E<<1|E>>>31)&4294967295}let s=this.chain_[0],i=this.chain_[1],a=this.chain_[2],c=this.chain_[3],l=this.chain_[4],d,p;for(let m=0;m<80;m++){m<40?m<20?(d=c^i&(a^c),p=1518500249):(d=i^a^c,p=1859775393):m<60?(d=i&a|c&(i|a),p=2400959708):(d=i^a^c,p=3395469782);const E=(s<<5|s>>>27)+d+l+p+r[m]&4294967295;l=c,c=a,a=(i<<30|i>>>2)&4294967295,i=s,s=E}this.chain_[0]=this.chain_[0]+s&4294967295,this.chain_[1]=this.chain_[1]+i&4294967295,this.chain_[2]=this.chain_[2]+a&4294967295,this.chain_[3]=this.chain_[3]+c&4294967295,this.chain_[4]=this.chain_[4]+l&4294967295}update(e,t){if(e==null)return;t===void 0&&(t=e.length);const r=t-this.blockSize;let s=0;const i=this.buf_;let a=this.inbuf_;for(;s<t;){if(a===0)for(;s<=r;)this.compress_(e,s),s+=this.blockSize;if(typeof e=="string"){for(;s<t;)if(i[a]=e.charCodeAt(s),++a,++s,a===this.blockSize){this.compress_(i),a=0;break}}else for(;s<t;)if(i[a]=e[s],++a,++s,a===this.blockSize){this.compress_(i),a=0;break}}this.inbuf_=a,this.total_+=t}digest(){const e=[];let t=this.total_*8;this.inbuf_<56?this.update(this.pad_,56-this.inbuf_):this.update(this.pad_,this.blockSize-(this.inbuf_-56));for(let s=this.blockSize-1;s>=56;s--)this.buf_[s]=t&255,t/=256;this.compress_(this.buf_);let r=0;for(let s=0;s<5;s++)for(let i=24;i>=0;i-=8)e[r]=this.chain_[s]>>i&255,++r;return e}}function Ip(n,e){const t=new wp(n,e);return t.subscribe.bind(t)}class wp{constructor(e,t){this.observers=[],this.unsubscribes=[],this.observerCount=0,this.task=Promise.resolve(),this.finalized=!1,this.onNoObservers=t,this.task.then(()=>{e(this)}).catch(r=>{this.error(r)})}next(e){this.forEachObserver(t=>{t.next(e)})}error(e){this.forEachObserver(t=>{t.error(e)}),this.close(e)}complete(){this.forEachObserver(e=>{e.complete()}),this.close()}subscribe(e,t,r){let s;if(e===void 0&&t===void 0&&r===void 0)throw new Error("Missing Observer.");Ap(e,["next","error","complete"])?s=e:s={next:e,error:t,complete:r},s.next===void 0&&(s.next=$i),s.error===void 0&&(s.error=$i),s.complete===void 0&&(s.complete=$i);const i=this.unsubscribeOne.bind(this,this.observers.length);return this.finalized&&this.task.then(()=>{try{this.finalError?s.error(this.finalError):s.complete()}catch{}}),this.observers.push(s),i}unsubscribeOne(e){this.observers===void 0||this.observers[e]===void 0||(delete this.observers[e],this.observerCount-=1,this.observerCount===0&&this.onNoObservers!==void 0&&this.onNoObservers(this))}forEachObserver(e){if(!this.finalized)for(let t=0;t<this.observers.length;t++)this.sendOne(t,e)}sendOne(e,t){this.task.then(()=>{if(this.observers!==void 0&&this.observers[e]!==void 0)try{t(this.observers[e])}catch(r){typeof console<"u"&&console.error&&console.error(r)}})}close(e){this.finalized||(this.finalized=!0,e!==void 0&&(this.finalError=e),this.task.then(()=>{this.observers=void 0,this.onNoObservers=void 0}))}}function Ap(n,e){if(typeof n!="object"||n===null)return!1;for(const t of e)if(t in n&&typeof n[t]=="function")return!0;return!1}function $i(){}function FI(n,e){return`${n} failed: ${e} argument `}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const BI=function(n){const e=[];let t=0;for(let r=0;r<n.length;r++){let s=n.charCodeAt(r);if(s>=55296&&s<=56319){const i=s-55296;r++,Jf(r<n.length,"Surrogate pair missing trail surrogate.");const a=n.charCodeAt(r)-56320;s=65536+(i<<10)+a}s<128?e[t++]=s:s<2048?(e[t++]=s>>6|192,e[t++]=s&63|128):s<65536?(e[t++]=s>>12|224,e[t++]=s>>6&63|128,e[t++]=s&63|128):(e[t++]=s>>18|240,e[t++]=s>>12&63|128,e[t++]=s>>6&63|128,e[t++]=s&63|128)}return e},jI=function(n){let e=0;for(let t=0;t<n.length;t++){const r=n.charCodeAt(t);r<128?e++:r<2048?e+=2:r>=55296&&r<=56319?(e+=4,t++):e+=3}return e};/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function J(n){return n&&n._delegate?n._delegate:n}class Nt{constructor(e,t,r){this.name=e,this.instanceFactory=t,this.type=r,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null}setInstantiationMode(e){return this.instantiationMode=e,this}setMultipleInstances(e){return this.multipleInstances=e,this}setServiceProps(e){return this.serviceProps=e,this}setInstanceCreatedCallback(e){return this.onInstanceCreated=e,this}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Kt="[DEFAULT]";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Rp{constructor(e,t){this.name=e,this.container=t,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map}get(e){const t=this.normalizeInstanceIdentifier(e);if(!this.instancesDeferred.has(t)){const r=new op;if(this.instancesDeferred.set(t,r),this.isInitialized(t)||this.shouldAutoInitialize())try{const s=this.getOrInitializeService({instanceIdentifier:t});s&&r.resolve(s)}catch{}}return this.instancesDeferred.get(t).promise}getImmediate(e){var t;const r=this.normalizeInstanceIdentifier(e==null?void 0:e.identifier),s=(t=e==null?void 0:e.optional)!==null&&t!==void 0?t:!1;if(this.isInitialized(r)||this.shouldAutoInitialize())try{return this.getOrInitializeService({instanceIdentifier:r})}catch(i){if(s)return null;throw i}else{if(s)return null;throw Error(`Service ${this.name} is not available`)}}getComponent(){return this.component}setComponent(e){if(e.name!==this.name)throw Error(`Mismatching Component ${e.name} for Provider ${this.name}.`);if(this.component)throw Error(`Component for ${this.name} has already been provided`);if(this.component=e,!!this.shouldAutoInitialize()){if(Sp(e))try{this.getOrInitializeService({instanceIdentifier:Kt})}catch{}for(const[t,r]of this.instancesDeferred.entries()){const s=this.normalizeInstanceIdentifier(t);try{const i=this.getOrInitializeService({instanceIdentifier:s});r.resolve(i)}catch{}}}}clearInstance(e=Kt){this.instancesDeferred.delete(e),this.instancesOptions.delete(e),this.instances.delete(e)}async delete(){const e=Array.from(this.instances.values());await Promise.all([...e.filter(t=>"INTERNAL"in t).map(t=>t.INTERNAL.delete()),...e.filter(t=>"_delete"in t).map(t=>t._delete())])}isComponentSet(){return this.component!=null}isInitialized(e=Kt){return this.instances.has(e)}getOptions(e=Kt){return this.instancesOptions.get(e)||{}}initialize(e={}){const{options:t={}}=e,r=this.normalizeInstanceIdentifier(e.instanceIdentifier);if(this.isInitialized(r))throw Error(`${this.name}(${r}) has already been initialized`);if(!this.isComponentSet())throw Error(`Component ${this.name} has not been registered yet`);const s=this.getOrInitializeService({instanceIdentifier:r,options:t});for(const[i,a]of this.instancesDeferred.entries()){const c=this.normalizeInstanceIdentifier(i);r===c&&a.resolve(s)}return s}onInit(e,t){var r;const s=this.normalizeInstanceIdentifier(t),i=(r=this.onInitCallbacks.get(s))!==null&&r!==void 0?r:new Set;i.add(e),this.onInitCallbacks.set(s,i);const a=this.instances.get(s);return a&&e(a,s),()=>{i.delete(e)}}invokeOnInitCallbacks(e,t){const r=this.onInitCallbacks.get(t);if(r)for(const s of r)try{s(e,t)}catch{}}getOrInitializeService({instanceIdentifier:e,options:t={}}){let r=this.instances.get(e);if(!r&&this.component&&(r=this.component.instanceFactory(this.container,{instanceIdentifier:bp(e),options:t}),this.instances.set(e,r),this.instancesOptions.set(e,t),this.invokeOnInitCallbacks(r,e),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,e,r)}catch{}return r||null}normalizeInstanceIdentifier(e=Kt){return this.component?this.component.multipleInstances?e:Kt:e}shouldAutoInitialize(){return!!this.component&&this.component.instantiationMode!=="EXPLICIT"}}function bp(n){return n===Kt?void 0:n}function Sp(n){return n.instantiationMode==="EAGER"}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Pp{constructor(e){this.name=e,this.providers=new Map}addComponent(e){const t=this.getProvider(e.name);if(t.isComponentSet())throw new Error(`Component ${e.name} has already been registered with ${this.name}`);t.setComponent(e)}addOrOverwriteComponent(e){this.getProvider(e.name).isComponentSet()&&this.providers.delete(e.name),this.addComponent(e)}getProvider(e){if(this.providers.has(e))return this.providers.get(e);const t=new Rp(e,this);return this.providers.set(e,t),t}getProviders(){return Array.from(this.providers.values())}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */var H;(function(n){n[n.DEBUG=0]="DEBUG",n[n.VERBOSE=1]="VERBOSE",n[n.INFO=2]="INFO",n[n.WARN=3]="WARN",n[n.ERROR=4]="ERROR",n[n.SILENT=5]="SILENT"})(H||(H={}));const Cp={debug:H.DEBUG,verbose:H.VERBOSE,info:H.INFO,warn:H.WARN,error:H.ERROR,silent:H.SILENT},kp=H.INFO,Dp={[H.DEBUG]:"log",[H.VERBOSE]:"log",[H.INFO]:"info",[H.WARN]:"warn",[H.ERROR]:"error"},Np=(n,e,...t)=>{if(e<n.logLevel)return;const r=new Date().toISOString(),s=Dp[e];if(s)console[s](`[${r}]  ${n.name}:`,...t);else throw new Error(`Attempted to log a message with an invalid logType (value: ${e})`)};class Lo{constructor(e){this.name=e,this._logLevel=kp,this._logHandler=Np,this._userLogHandler=null}get logLevel(){return this._logLevel}set logLevel(e){if(!(e in H))throw new TypeError(`Invalid value "${e}" assigned to \`logLevel\``);this._logLevel=e}setLogLevel(e){this._logLevel=typeof e=="string"?Cp[e]:e}get logHandler(){return this._logHandler}set logHandler(e){if(typeof e!="function")throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=e}get userLogHandler(){return this._userLogHandler}set userLogHandler(e){this._userLogHandler=e}debug(...e){this._userLogHandler&&this._userLogHandler(this,H.DEBUG,...e),this._logHandler(this,H.DEBUG,...e)}log(...e){this._userLogHandler&&this._userLogHandler(this,H.VERBOSE,...e),this._logHandler(this,H.VERBOSE,...e)}info(...e){this._userLogHandler&&this._userLogHandler(this,H.INFO,...e),this._logHandler(this,H.INFO,...e)}warn(...e){this._userLogHandler&&this._userLogHandler(this,H.WARN,...e),this._logHandler(this,H.WARN,...e)}error(...e){this._userLogHandler&&this._userLogHandler(this,H.ERROR,...e),this._logHandler(this,H.ERROR,...e)}}const Vp=(n,e)=>e.some(t=>n instanceof t);let jc,qc;function Op(){return jc||(jc=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function Lp(){return qc||(qc=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}const Dl=new WeakMap,ro=new WeakMap,Nl=new WeakMap,zi=new WeakMap,Mo=new WeakMap;function Mp(n){const e=new Promise((t,r)=>{const s=()=>{n.removeEventListener("success",i),n.removeEventListener("error",a)},i=()=>{t(ot(n.result)),s()},a=()=>{r(n.error),s()};n.addEventListener("success",i),n.addEventListener("error",a)});return e.then(t=>{t instanceof IDBCursor&&Dl.set(t,n)}).catch(()=>{}),Mo.set(e,n),e}function xp(n){if(ro.has(n))return;const e=new Promise((t,r)=>{const s=()=>{n.removeEventListener("complete",i),n.removeEventListener("error",a),n.removeEventListener("abort",a)},i=()=>{t(),s()},a=()=>{r(n.error||new DOMException("AbortError","AbortError")),s()};n.addEventListener("complete",i),n.addEventListener("error",a),n.addEventListener("abort",a)});ro.set(n,e)}let so={get(n,e,t){if(n instanceof IDBTransaction){if(e==="done")return ro.get(n);if(e==="objectStoreNames")return n.objectStoreNames||Nl.get(n);if(e==="store")return t.objectStoreNames[1]?void 0:t.objectStore(t.objectStoreNames[0])}return ot(n[e])},set(n,e,t){return n[e]=t,!0},has(n,e){return n instanceof IDBTransaction&&(e==="done"||e==="store")?!0:e in n}};function Up(n){so=n(so)}function Fp(n){return n===IDBDatabase.prototype.transaction&&!("objectStoreNames"in IDBTransaction.prototype)?function(e,...t){const r=n.call(Hi(this),e,...t);return Nl.set(r,e.sort?e.sort():[e]),ot(r)}:Lp().includes(n)?function(...e){return n.apply(Hi(this),e),ot(Dl.get(this))}:function(...e){return ot(n.apply(Hi(this),e))}}function Bp(n){return typeof n=="function"?Fp(n):(n instanceof IDBTransaction&&xp(n),Vp(n,Op())?new Proxy(n,so):n)}function ot(n){if(n instanceof IDBRequest)return Mp(n);if(zi.has(n))return zi.get(n);const e=Bp(n);return e!==n&&(zi.set(n,e),Mo.set(e,n)),e}const Hi=n=>Mo.get(n);function jp(n,e,{blocked:t,upgrade:r,blocking:s,terminated:i}={}){const a=indexedDB.open(n,e),c=ot(a);return r&&a.addEventListener("upgradeneeded",l=>{r(ot(a.result),l.oldVersion,l.newVersion,ot(a.transaction),l)}),t&&a.addEventListener("blocked",l=>t(l.oldVersion,l.newVersion,l)),c.then(l=>{i&&l.addEventListener("close",()=>i()),s&&l.addEventListener("versionchange",d=>s(d.oldVersion,d.newVersion,d))}).catch(()=>{}),c}function qI(n,{blocked:e}={}){const t=indexedDB.deleteDatabase(n);return e&&t.addEventListener("blocked",r=>e(r.oldVersion,r)),ot(t).then(()=>{})}const qp=["get","getKey","getAll","getAllKeys","count"],$p=["put","add","delete","clear"],Wi=new Map;function $c(n,e){if(!(n instanceof IDBDatabase&&!(e in n)&&typeof e=="string"))return;if(Wi.get(e))return Wi.get(e);const t=e.replace(/FromIndex$/,""),r=e!==t,s=$p.includes(t);if(!(t in(r?IDBIndex:IDBObjectStore).prototype)||!(s||qp.includes(t)))return;const i=async function(a,...c){const l=this.transaction(a,s?"readwrite":"readonly");let d=l.store;return r&&(d=d.index(c.shift())),(await Promise.all([d[t](...c),s&&l.done]))[0]};return Wi.set(e,i),i}Up(n=>({...n,get:(e,t,r)=>$c(e,t)||n.get(e,t,r),has:(e,t)=>!!$c(e,t)||n.has(e,t)}));/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class zp{constructor(e){this.container=e}getPlatformInfoString(){return this.container.getProviders().map(t=>{if(Hp(t)){const r=t.getImmediate();return`${r.library}/${r.version}`}else return null}).filter(t=>t).join(" ")}}function Hp(n){const e=n.getComponent();return(e==null?void 0:e.type)==="VERSION"}const io="@firebase/app",zc="0.13.2";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ht=new Lo("@firebase/app"),Wp="@firebase/app-compat",Gp="@firebase/analytics-compat",Kp="@firebase/analytics",Qp="@firebase/app-check-compat",Jp="@firebase/app-check",Xp="@firebase/auth",Yp="@firebase/auth-compat",Zp="@firebase/database",em="@firebase/data-connect",tm="@firebase/database-compat",nm="@firebase/functions",rm="@firebase/functions-compat",sm="@firebase/installations",im="@firebase/installations-compat",om="@firebase/messaging",am="@firebase/messaging-compat",cm="@firebase/performance",um="@firebase/performance-compat",lm="@firebase/remote-config",hm="@firebase/remote-config-compat",dm="@firebase/storage",fm="@firebase/storage-compat",pm="@firebase/firestore",mm="@firebase/ai",gm="@firebase/firestore-compat",_m="firebase",ym="11.10.0";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const oo="[DEFAULT]",Em={[io]:"fire-core",[Wp]:"fire-core-compat",[Kp]:"fire-analytics",[Gp]:"fire-analytics-compat",[Jp]:"fire-app-check",[Qp]:"fire-app-check-compat",[Xp]:"fire-auth",[Yp]:"fire-auth-compat",[Zp]:"fire-rtdb",[em]:"fire-data-connect",[tm]:"fire-rtdb-compat",[nm]:"fire-fn",[rm]:"fire-fn-compat",[sm]:"fire-iid",[im]:"fire-iid-compat",[om]:"fire-fcm",[am]:"fire-fcm-compat",[cm]:"fire-perf",[um]:"fire-perf-compat",[lm]:"fire-rc",[hm]:"fire-rc-compat",[dm]:"fire-gcs",[fm]:"fire-gcs-compat",[pm]:"fire-fst",[gm]:"fire-fst-compat",[mm]:"fire-vertex","fire-js":"fire-js",[_m]:"fire-js-all"};/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Rs=new Map,vm=new Map,ao=new Map;function Hc(n,e){try{n.container.addComponent(e)}catch(t){ht.debug(`Component ${e.name} failed to register with FirebaseApp ${n.name}`,t)}}function Xt(n){const e=n.name;if(ao.has(e))return ht.debug(`There were multiple attempts to register component ${e}.`),!1;ao.set(e,n);for(const t of Rs.values())Hc(t,n);for(const t of vm.values())Hc(t,n);return!0}function zs(n,e){const t=n.container.getProvider("heartbeat").getImmediate({optional:!0});return t&&t.triggerHeartbeat(),n.container.getProvider(e)}function Le(n){return n==null?!1:n.settings!==void 0}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Tm={"no-app":"No Firebase App '{$appName}' has been created - call initializeApp() first","bad-app-name":"Illegal App name: '{$appName}'","duplicate-app":"Firebase App named '{$appName}' already exists with different options or config","app-deleted":"Firebase App named '{$appName}' already deleted","server-app-deleted":"Firebase Server App has been deleted","no-options":"Need to provide options, when not being deployed to hosting via source.","invalid-app-argument":"firebase.{$appName}() takes either no argument or a Firebase App instance.","invalid-log-argument":"First argument to `onLog` must be null or a function.","idb-open":"Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}.","idb-get":"Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}.","idb-set":"Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}.","idb-delete":"Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}.","finalization-registry-not-supported":"FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry.","invalid-server-app-environment":"FirebaseServerApp is not for use in browser environments."},Pt=new br("app","Firebase",Tm);/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Im{constructor(e,t,r){this._isDeleted=!1,this._options=Object.assign({},e),this._config=Object.assign({},t),this._name=t.name,this._automaticDataCollectionEnabled=t.automaticDataCollectionEnabled,this._container=r,this.container.addComponent(new Nt("app",()=>this,"PUBLIC"))}get automaticDataCollectionEnabled(){return this.checkDestroyed(),this._automaticDataCollectionEnabled}set automaticDataCollectionEnabled(e){this.checkDestroyed(),this._automaticDataCollectionEnabled=e}get name(){return this.checkDestroyed(),this._name}get options(){return this.checkDestroyed(),this._options}get config(){return this.checkDestroyed(),this._config}get container(){return this._container}get isDeleted(){return this._isDeleted}set isDeleted(e){this._isDeleted=e}checkDestroyed(){if(this.isDeleted)throw Pt.create("app-deleted",{appName:this._name})}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const rn=ym;function wm(n,e={}){let t=n;typeof e!="object"&&(e={name:e});const r=Object.assign({name:oo,automaticDataCollectionEnabled:!0},e),s=r.name;if(typeof s!="string"||!s)throw Pt.create("bad-app-name",{appName:String(s)});if(t||(t=Sl()),!t)throw Pt.create("no-options");const i=Rs.get(s);if(i){if(lt(t,i.options)&&lt(r,i.config))return i;throw Pt.create("duplicate-app",{appName:s})}const a=new Pp(s);for(const l of ao.values())a.addComponent(l);const c=new Im(t,r,a);return Rs.set(s,c),c}function xo(n=oo){const e=Rs.get(n);if(!e&&n===oo&&Sl())return wm();if(!e)throw Pt.create("no-app",{appName:n});return e}function Ge(n,e,t){var r;let s=(r=Em[n])!==null&&r!==void 0?r:n;t&&(s+=`-${t}`);const i=s.match(/\s|\//),a=e.match(/\s|\//);if(i||a){const c=[`Unable to register library "${s}" with version "${e}":`];i&&c.push(`library name "${s}" contains illegal characters (whitespace or "/")`),i&&a&&c.push("and"),a&&c.push(`version name "${e}" contains illegal characters (whitespace or "/")`),ht.warn(c.join(" "));return}Xt(new Nt(`${s}-version`,()=>({library:s,version:e}),"VERSION"))}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Am="firebase-heartbeat-database",Rm=1,yr="firebase-heartbeat-store";let Gi=null;function Vl(){return Gi||(Gi=jp(Am,Rm,{upgrade:(n,e)=>{switch(e){case 0:try{n.createObjectStore(yr)}catch(t){console.warn(t)}}}}).catch(n=>{throw Pt.create("idb-open",{originalErrorMessage:n.message})})),Gi}async function bm(n){try{const t=(await Vl()).transaction(yr),r=await t.objectStore(yr).get(Ol(n));return await t.done,r}catch(e){if(e instanceof Ze)ht.warn(e.message);else{const t=Pt.create("idb-get",{originalErrorMessage:e==null?void 0:e.message});ht.warn(t.message)}}}async function Wc(n,e){try{const r=(await Vl()).transaction(yr,"readwrite");await r.objectStore(yr).put(e,Ol(n)),await r.done}catch(t){if(t instanceof Ze)ht.warn(t.message);else{const r=Pt.create("idb-set",{originalErrorMessage:t==null?void 0:t.message});ht.warn(r.message)}}}function Ol(n){return`${n.name}!${n.options.appId}`}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Sm=1024,Pm=30;class Cm{constructor(e){this.container=e,this._heartbeatsCache=null;const t=this.container.getProvider("app").getImmediate();this._storage=new Dm(t),this._heartbeatsCachePromise=this._storage.read().then(r=>(this._heartbeatsCache=r,r))}async triggerHeartbeat(){var e,t;try{const s=this.container.getProvider("platform-logger").getImmediate().getPlatformInfoString(),i=Gc();if(((e=this._heartbeatsCache)===null||e===void 0?void 0:e.heartbeats)==null&&(this._heartbeatsCache=await this._heartbeatsCachePromise,((t=this._heartbeatsCache)===null||t===void 0?void 0:t.heartbeats)==null)||this._heartbeatsCache.lastSentHeartbeatDate===i||this._heartbeatsCache.heartbeats.some(a=>a.date===i))return;if(this._heartbeatsCache.heartbeats.push({date:i,agent:s}),this._heartbeatsCache.heartbeats.length>Pm){const a=Nm(this._heartbeatsCache.heartbeats);this._heartbeatsCache.heartbeats.splice(a,1)}return this._storage.overwrite(this._heartbeatsCache)}catch(r){ht.warn(r)}}async getHeartbeatsHeader(){var e;try{if(this._heartbeatsCache===null&&await this._heartbeatsCachePromise,((e=this._heartbeatsCache)===null||e===void 0?void 0:e.heartbeats)==null||this._heartbeatsCache.heartbeats.length===0)return"";const t=Gc(),{heartbeatsToSend:r,unsentEntries:s}=km(this._heartbeatsCache.heartbeats),i=ws(JSON.stringify({version:2,heartbeats:r}));return this._heartbeatsCache.lastSentHeartbeatDate=t,s.length>0?(this._heartbeatsCache.heartbeats=s,await this._storage.overwrite(this._heartbeatsCache)):(this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache)),i}catch(t){return ht.warn(t),""}}}function Gc(){return new Date().toISOString().substring(0,10)}function km(n,e=Sm){const t=[];let r=n.slice();for(const s of n){const i=t.find(a=>a.agent===s.agent);if(i){if(i.dates.push(s.date),Kc(t)>e){i.dates.pop();break}}else if(t.push({agent:s.agent,dates:[s.date]}),Kc(t)>e){t.pop();break}r=r.slice(1)}return{heartbeatsToSend:t,unsentEntries:r}}class Dm{constructor(e){this.app=e,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()}async runIndexedDBEnvironmentCheck(){return gp()?_p().then(()=>!0).catch(()=>!1):!1}async read(){if(await this._canUseIndexedDBPromise){const t=await bm(this.app);return t!=null&&t.heartbeats?t:{heartbeats:[]}}else return{heartbeats:[]}}async overwrite(e){var t;if(await this._canUseIndexedDBPromise){const s=await this.read();return Wc(this.app,{lastSentHeartbeatDate:(t=e.lastSentHeartbeatDate)!==null&&t!==void 0?t:s.lastSentHeartbeatDate,heartbeats:e.heartbeats})}else return}async add(e){var t;if(await this._canUseIndexedDBPromise){const s=await this.read();return Wc(this.app,{lastSentHeartbeatDate:(t=e.lastSentHeartbeatDate)!==null&&t!==void 0?t:s.lastSentHeartbeatDate,heartbeats:[...s.heartbeats,...e.heartbeats]})}else return}}function Kc(n){return ws(JSON.stringify({version:2,heartbeats:n})).length}function Nm(n){if(n.length===0)return-1;let e=0,t=n[0].date;for(let r=1;r<n.length;r++)n[r].date<t&&(t=n[r].date,e=r);return e}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Vm(n){Xt(new Nt("platform-logger",e=>new zp(e),"PRIVATE")),Xt(new Nt("heartbeat",e=>new Cm(e),"PRIVATE")),Ge(io,zc,n),Ge(io,zc,"esm2017"),Ge("fire-js","")}Vm("");var Qc=function(){return Qc=Object.assign||function(e){for(var t,r=1,s=arguments.length;r<s;r++){t=arguments[r];for(var i in t)Object.prototype.hasOwnProperty.call(t,i)&&(e[i]=t[i])}return e},Qc.apply(this,arguments)};function Uo(n,e){var t={};for(var r in n)Object.prototype.hasOwnProperty.call(n,r)&&e.indexOf(r)<0&&(t[r]=n[r]);if(n!=null&&typeof Object.getOwnPropertySymbols=="function")for(var s=0,r=Object.getOwnPropertySymbols(n);s<r.length;s++)e.indexOf(r[s])<0&&Object.prototype.propertyIsEnumerable.call(n,r[s])&&(t[r[s]]=n[r[s]]);return t}function $I(n,e,t){if(t||arguments.length===2)for(var r=0,s=e.length,i;r<s;r++)(i||!(r in e))&&(i||(i=Array.prototype.slice.call(e,0,r)),i[r]=e[r]);return n.concat(i||Array.prototype.slice.call(e))}function Ll(){return{"dependent-sdk-initialized-before-auth":"Another Firebase SDK was initialized and is trying to use Auth before Auth is initialized. Please be sure to call `initializeAuth` or `getAuth` before starting any other Firebase SDK."}}const Om=Ll,Ml=new br("auth","Firebase",Ll());/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const bs=new Lo("@firebase/auth");function Lm(n,...e){bs.logLevel<=H.WARN&&bs.warn(`Auth (${rn}): ${n}`,...e)}function ps(n,...e){bs.logLevel<=H.ERROR&&bs.error(`Auth (${rn}): ${n}`,...e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function qe(n,...e){throw Fo(n,...e)}function Ke(n,...e){return Fo(n,...e)}function xl(n,e,t){const r=Object.assign(Object.assign({},Om()),{[e]:t});return new br("auth","Firebase",r).create(e,{appName:n.name})}function at(n){return xl(n,"operation-not-supported-in-this-environment","Operations that alter the current user are not supported in conjunction with FirebaseServerApp")}function Fo(n,...e){if(typeof n!="string"){const t=e[0],r=[...e.slice(1)];return r[0]&&(r[0].appName=n.name),n._errorFactory.create(t,...r)}return Ml.create(n,...e)}function M(n,e,...t){if(!n)throw Fo(e,...t)}function st(n){const e="INTERNAL ASSERTION FAILED: "+n;throw ps(e),new Error(e)}function dt(n,e){n||st(e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function co(){var n;return typeof self<"u"&&((n=self.location)===null||n===void 0?void 0:n.href)||""}function Mm(){return Jc()==="http:"||Jc()==="https:"}function Jc(){var n;return typeof self<"u"&&((n=self.location)===null||n===void 0?void 0:n.protocol)||null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function xm(){return typeof navigator<"u"&&navigator&&"onLine"in navigator&&typeof navigator.onLine=="boolean"&&(Mm()||dp()||"connection"in navigator)?navigator.onLine:!0}function Um(){if(typeof navigator>"u")return null;const n=navigator;return n.languages&&n.languages[0]||n.language||null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Pr{constructor(e,t){this.shortDelay=e,this.longDelay=t,dt(t>e,"Short delay should be less than long delay!"),this.isMobile=up()||fp()}get(){return xm()?this.isMobile?this.longDelay:this.shortDelay:Math.min(5e3,this.shortDelay)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Bo(n,e){dt(n.emulator,"Emulator should always be set here");const{url:t}=n.emulator;return e?`${t}${e.startsWith("/")?e.slice(1):e}`:t}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ul{static initialize(e,t,r){this.fetchImpl=e,t&&(this.headersImpl=t),r&&(this.responseImpl=r)}static fetch(){if(this.fetchImpl)return this.fetchImpl;if(typeof self<"u"&&"fetch"in self)return self.fetch;if(typeof globalThis<"u"&&globalThis.fetch)return globalThis.fetch;if(typeof fetch<"u")return fetch;st("Could not find fetch implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}static headers(){if(this.headersImpl)return this.headersImpl;if(typeof self<"u"&&"Headers"in self)return self.Headers;if(typeof globalThis<"u"&&globalThis.Headers)return globalThis.Headers;if(typeof Headers<"u")return Headers;st("Could not find Headers implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}static response(){if(this.responseImpl)return this.responseImpl;if(typeof self<"u"&&"Response"in self)return self.Response;if(typeof globalThis<"u"&&globalThis.Response)return globalThis.Response;if(typeof Response<"u")return Response;st("Could not find Response implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Fm={CREDENTIAL_MISMATCH:"custom-token-mismatch",MISSING_CUSTOM_TOKEN:"internal-error",INVALID_IDENTIFIER:"invalid-email",MISSING_CONTINUE_URI:"internal-error",INVALID_PASSWORD:"wrong-password",MISSING_PASSWORD:"missing-password",INVALID_LOGIN_CREDENTIALS:"invalid-credential",EMAIL_EXISTS:"email-already-in-use",PASSWORD_LOGIN_DISABLED:"operation-not-allowed",INVALID_IDP_RESPONSE:"invalid-credential",INVALID_PENDING_TOKEN:"invalid-credential",FEDERATED_USER_ID_ALREADY_LINKED:"credential-already-in-use",MISSING_REQ_TYPE:"internal-error",EMAIL_NOT_FOUND:"user-not-found",RESET_PASSWORD_EXCEED_LIMIT:"too-many-requests",EXPIRED_OOB_CODE:"expired-action-code",INVALID_OOB_CODE:"invalid-action-code",MISSING_OOB_CODE:"internal-error",CREDENTIAL_TOO_OLD_LOGIN_AGAIN:"requires-recent-login",INVALID_ID_TOKEN:"invalid-user-token",TOKEN_EXPIRED:"user-token-expired",USER_NOT_FOUND:"user-token-expired",TOO_MANY_ATTEMPTS_TRY_LATER:"too-many-requests",PASSWORD_DOES_NOT_MEET_REQUIREMENTS:"password-does-not-meet-requirements",INVALID_CODE:"invalid-verification-code",INVALID_SESSION_INFO:"invalid-verification-id",INVALID_TEMPORARY_PROOF:"invalid-credential",MISSING_SESSION_INFO:"missing-verification-id",SESSION_EXPIRED:"code-expired",MISSING_ANDROID_PACKAGE_NAME:"missing-android-pkg-name",UNAUTHORIZED_DOMAIN:"unauthorized-continue-uri",INVALID_OAUTH_CLIENT_ID:"invalid-oauth-client-id",ADMIN_ONLY_OPERATION:"admin-restricted-operation",INVALID_MFA_PENDING_CREDENTIAL:"invalid-multi-factor-session",MFA_ENROLLMENT_NOT_FOUND:"multi-factor-info-not-found",MISSING_MFA_ENROLLMENT_ID:"missing-multi-factor-info",MISSING_MFA_PENDING_CREDENTIAL:"missing-multi-factor-session",SECOND_FACTOR_EXISTS:"second-factor-already-in-use",SECOND_FACTOR_LIMIT_EXCEEDED:"maximum-second-factor-count-exceeded",BLOCKING_FUNCTION_ERROR_RESPONSE:"internal-error",RECAPTCHA_NOT_ENABLED:"recaptcha-not-enabled",MISSING_RECAPTCHA_TOKEN:"missing-recaptcha-token",INVALID_RECAPTCHA_TOKEN:"invalid-recaptcha-token",INVALID_RECAPTCHA_ACTION:"invalid-recaptcha-action",MISSING_CLIENT_TYPE:"missing-client-type",MISSING_RECAPTCHA_VERSION:"missing-recaptcha-version",INVALID_RECAPTCHA_VERSION:"invalid-recaptcha-version",INVALID_REQ_TYPE:"invalid-req-type"};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Bm=["/v1/accounts:signInWithCustomToken","/v1/accounts:signInWithEmailLink","/v1/accounts:signInWithIdp","/v1/accounts:signInWithPassword","/v1/accounts:signInWithPhoneNumber","/v1/token"],jm=new Pr(3e4,6e4);function Bt(n,e){return n.tenantId&&!e.tenantId?Object.assign(Object.assign({},e),{tenantId:n.tenantId}):e}async function gt(n,e,t,r,s={}){return Fl(n,s,async()=>{let i={},a={};r&&(e==="GET"?a=r:i={body:JSON.stringify(r)});const c=Sr(Object.assign({key:n.config.apiKey},a)).slice(1),l=await n._getAdditionalHeaders();l["Content-Type"]="application/json",n.languageCode&&(l["X-Firebase-Locale"]=n.languageCode);const d=Object.assign({method:e,headers:l},i);return hp()||(d.referrerPolicy="no-referrer"),n.emulatorConfig&&Ft(n.emulatorConfig.host)&&(d.credentials="include"),Ul.fetch()(await Bl(n,n.config.apiHost,t,c),d)})}async function Fl(n,e,t){n._canInitEmulator=!1;const r=Object.assign(Object.assign({},Fm),e);try{const s=new $m(n),i=await Promise.race([t(),s.promise]);s.clearNetworkTimeout();const a=await i.json();if("needConfirmation"in a)throw os(n,"account-exists-with-different-credential",a);if(i.ok&&!("errorMessage"in a))return a;{const c=i.ok?a.errorMessage:a.error.message,[l,d]=c.split(" : ");if(l==="FEDERATED_USER_ID_ALREADY_LINKED")throw os(n,"credential-already-in-use",a);if(l==="EMAIL_EXISTS")throw os(n,"email-already-in-use",a);if(l==="USER_DISABLED")throw os(n,"user-disabled",a);const p=r[l]||l.toLowerCase().replace(/[_\s]+/g,"-");if(d)throw xl(n,p,d);qe(n,p)}}catch(s){if(s instanceof Ze)throw s;qe(n,"network-request-failed",{message:String(s)})}}async function Cr(n,e,t,r,s={}){const i=await gt(n,e,t,r,s);return"mfaPendingCredential"in i&&qe(n,"multi-factor-auth-required",{_serverResponse:i}),i}async function Bl(n,e,t,r){const s=`${e}${t}?${r}`,i=n,a=i.config.emulator?Bo(n.config,s):`${n.config.apiScheme}://${s}`;return Bm.includes(t)&&(await i._persistenceManagerAvailable,i._getPersistenceType()==="COOKIE")?i._getPersistence()._getFinalTarget(a).toString():a}function qm(n){switch(n){case"ENFORCE":return"ENFORCE";case"AUDIT":return"AUDIT";case"OFF":return"OFF";default:return"ENFORCEMENT_STATE_UNSPECIFIED"}}class $m{clearNetworkTimeout(){clearTimeout(this.timer)}constructor(e){this.auth=e,this.timer=null,this.promise=new Promise((t,r)=>{this.timer=setTimeout(()=>r(Ke(this.auth,"network-request-failed")),jm.get())})}}function os(n,e,t){const r={appName:n.name};t.email&&(r.email=t.email),t.phoneNumber&&(r.phoneNumber=t.phoneNumber);const s=Ke(n,e,r);return s.customData._tokenResponse=t,s}function Xc(n){return n!==void 0&&n.enterprise!==void 0}class zm{constructor(e){if(this.siteKey="",this.recaptchaEnforcementState=[],e.recaptchaKey===void 0)throw new Error("recaptchaKey undefined");this.siteKey=e.recaptchaKey.split("/")[3],this.recaptchaEnforcementState=e.recaptchaEnforcementState}getProviderEnforcementState(e){if(!this.recaptchaEnforcementState||this.recaptchaEnforcementState.length===0)return null;for(const t of this.recaptchaEnforcementState)if(t.provider&&t.provider===e)return qm(t.enforcementState);return null}isProviderEnabled(e){return this.getProviderEnforcementState(e)==="ENFORCE"||this.getProviderEnforcementState(e)==="AUDIT"}isAnyProviderEnabled(){return this.isProviderEnabled("EMAIL_PASSWORD_PROVIDER")||this.isProviderEnabled("PHONE_PROVIDER")}}async function Hm(n,e){return gt(n,"GET","/v2/recaptchaConfig",Bt(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Wm(n,e){return gt(n,"POST","/v1/accounts:delete",e)}async function Ss(n,e){return gt(n,"POST","/v1/accounts:lookup",e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function hr(n){if(n)try{const e=new Date(Number(n));if(!isNaN(e.getTime()))return e.toUTCString()}catch{}}async function Gm(n,e=!1){const t=J(n),r=await t.getIdToken(e),s=jo(r);M(s&&s.exp&&s.auth_time&&s.iat,t.auth,"internal-error");const i=typeof s.firebase=="object"?s.firebase:void 0,a=i==null?void 0:i.sign_in_provider;return{claims:s,token:r,authTime:hr(Ki(s.auth_time)),issuedAtTime:hr(Ki(s.iat)),expirationTime:hr(Ki(s.exp)),signInProvider:a||null,signInSecondFactor:(i==null?void 0:i.sign_in_second_factor)||null}}function Ki(n){return Number(n)*1e3}function jo(n){const[e,t,r]=n.split(".");if(e===void 0||t===void 0||r===void 0)return ps("JWT malformed, contained fewer than 3 sections"),null;try{const s=As(t);return s?JSON.parse(s):(ps("Failed to decode base64 JWT payload"),null)}catch(s){return ps("Caught error parsing JWT payload as JSON",s==null?void 0:s.toString()),null}}function Yc(n){const e=jo(n);return M(e,"internal-error"),M(typeof e.exp<"u","internal-error"),M(typeof e.iat<"u","internal-error"),Number(e.exp)-Number(e.iat)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function An(n,e,t=!1){if(t)return e;try{return await e}catch(r){throw r instanceof Ze&&Km(r)&&n.auth.currentUser===n&&await n.auth.signOut(),r}}function Km({code:n}){return n==="auth/user-disabled"||n==="auth/user-token-expired"}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Qm{constructor(e){this.user=e,this.isRunning=!1,this.timerId=null,this.errorBackoff=3e4}_start(){this.isRunning||(this.isRunning=!0,this.schedule())}_stop(){this.isRunning&&(this.isRunning=!1,this.timerId!==null&&clearTimeout(this.timerId))}getInterval(e){var t;if(e){const r=this.errorBackoff;return this.errorBackoff=Math.min(this.errorBackoff*2,96e4),r}else{this.errorBackoff=3e4;const s=((t=this.user.stsTokenManager.expirationTime)!==null&&t!==void 0?t:0)-Date.now()-3e5;return Math.max(0,s)}}schedule(e=!1){if(!this.isRunning)return;const t=this.getInterval(e);this.timerId=setTimeout(async()=>{await this.iteration()},t)}async iteration(){try{await this.user.getIdToken(!0)}catch(e){(e==null?void 0:e.code)==="auth/network-request-failed"&&this.schedule(!0);return}this.schedule()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class uo{constructor(e,t){this.createdAt=e,this.lastLoginAt=t,this._initializeTime()}_initializeTime(){this.lastSignInTime=hr(this.lastLoginAt),this.creationTime=hr(this.createdAt)}_copy(e){this.createdAt=e.createdAt,this.lastLoginAt=e.lastLoginAt,this._initializeTime()}toJSON(){return{createdAt:this.createdAt,lastLoginAt:this.lastLoginAt}}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ps(n){var e;const t=n.auth,r=await n.getIdToken(),s=await An(n,Ss(t,{idToken:r}));M(s==null?void 0:s.users.length,t,"internal-error");const i=s.users[0];n._notifyReloadListener(i);const a=!((e=i.providerUserInfo)===null||e===void 0)&&e.length?jl(i.providerUserInfo):[],c=Xm(n.providerData,a),l=n.isAnonymous,d=!(n.email&&i.passwordHash)&&!(c!=null&&c.length),p=l?d:!1,m={uid:i.localId,displayName:i.displayName||null,photoURL:i.photoUrl||null,email:i.email||null,emailVerified:i.emailVerified||!1,phoneNumber:i.phoneNumber||null,tenantId:i.tenantId||null,providerData:c,metadata:new uo(i.createdAt,i.lastLoginAt),isAnonymous:p};Object.assign(n,m)}async function Jm(n){const e=J(n);await Ps(e),await e.auth._persistUserIfCurrent(e),e.auth._notifyListenersIfCurrent(e)}function Xm(n,e){return[...n.filter(r=>!e.some(s=>s.providerId===r.providerId)),...e]}function jl(n){return n.map(e=>{var{providerId:t}=e,r=Uo(e,["providerId"]);return{providerId:t,uid:r.rawId||"",displayName:r.displayName||null,email:r.email||null,phoneNumber:r.phoneNumber||null,photoURL:r.photoUrl||null}})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ym(n,e){const t=await Fl(n,{},async()=>{const r=Sr({grant_type:"refresh_token",refresh_token:e}).slice(1),{tokenApiHost:s,apiKey:i}=n.config,a=await Bl(n,s,"/v1/token",`key=${i}`),c=await n._getAdditionalHeaders();c["Content-Type"]="application/x-www-form-urlencoded";const l={method:"POST",headers:c,body:r};return n.emulatorConfig&&Ft(n.emulatorConfig.host)&&(l.credentials="include"),Ul.fetch()(a,l)});return{accessToken:t.access_token,expiresIn:t.expires_in,refreshToken:t.refresh_token}}async function Zm(n,e){return gt(n,"POST","/v2/accounts:revokeToken",Bt(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class vn{constructor(){this.refreshToken=null,this.accessToken=null,this.expirationTime=null}get isExpired(){return!this.expirationTime||Date.now()>this.expirationTime-3e4}updateFromServerResponse(e){M(e.idToken,"internal-error"),M(typeof e.idToken<"u","internal-error"),M(typeof e.refreshToken<"u","internal-error");const t="expiresIn"in e&&typeof e.expiresIn<"u"?Number(e.expiresIn):Yc(e.idToken);this.updateTokensAndExpiration(e.idToken,e.refreshToken,t)}updateFromIdToken(e){M(e.length!==0,"internal-error");const t=Yc(e);this.updateTokensAndExpiration(e,null,t)}async getToken(e,t=!1){return!t&&this.accessToken&&!this.isExpired?this.accessToken:(M(this.refreshToken,e,"user-token-expired"),this.refreshToken?(await this.refresh(e,this.refreshToken),this.accessToken):null)}clearRefreshToken(){this.refreshToken=null}async refresh(e,t){const{accessToken:r,refreshToken:s,expiresIn:i}=await Ym(e,t);this.updateTokensAndExpiration(r,s,Number(i))}updateTokensAndExpiration(e,t,r){this.refreshToken=t||null,this.accessToken=e||null,this.expirationTime=Date.now()+r*1e3}static fromJSON(e,t){const{refreshToken:r,accessToken:s,expirationTime:i}=t,a=new vn;return r&&(M(typeof r=="string","internal-error",{appName:e}),a.refreshToken=r),s&&(M(typeof s=="string","internal-error",{appName:e}),a.accessToken=s),i&&(M(typeof i=="number","internal-error",{appName:e}),a.expirationTime=i),a}toJSON(){return{refreshToken:this.refreshToken,accessToken:this.accessToken,expirationTime:this.expirationTime}}_assign(e){this.accessToken=e.accessToken,this.refreshToken=e.refreshToken,this.expirationTime=e.expirationTime}_clone(){return Object.assign(new vn,this.toJSON())}_performRefresh(){return st("not implemented")}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Tt(n,e){M(typeof n=="string"||typeof n>"u","internal-error",{appName:e})}class Fe{constructor(e){var{uid:t,auth:r,stsTokenManager:s}=e,i=Uo(e,["uid","auth","stsTokenManager"]);this.providerId="firebase",this.proactiveRefresh=new Qm(this),this.reloadUserInfo=null,this.reloadListener=null,this.uid=t,this.auth=r,this.stsTokenManager=s,this.accessToken=s.accessToken,this.displayName=i.displayName||null,this.email=i.email||null,this.emailVerified=i.emailVerified||!1,this.phoneNumber=i.phoneNumber||null,this.photoURL=i.photoURL||null,this.isAnonymous=i.isAnonymous||!1,this.tenantId=i.tenantId||null,this.providerData=i.providerData?[...i.providerData]:[],this.metadata=new uo(i.createdAt||void 0,i.lastLoginAt||void 0)}async getIdToken(e){const t=await An(this,this.stsTokenManager.getToken(this.auth,e));return M(t,this.auth,"internal-error"),this.accessToken!==t&&(this.accessToken=t,await this.auth._persistUserIfCurrent(this),this.auth._notifyListenersIfCurrent(this)),t}getIdTokenResult(e){return Gm(this,e)}reload(){return Jm(this)}_assign(e){this!==e&&(M(this.uid===e.uid,this.auth,"internal-error"),this.displayName=e.displayName,this.photoURL=e.photoURL,this.email=e.email,this.emailVerified=e.emailVerified,this.phoneNumber=e.phoneNumber,this.isAnonymous=e.isAnonymous,this.tenantId=e.tenantId,this.providerData=e.providerData.map(t=>Object.assign({},t)),this.metadata._copy(e.metadata),this.stsTokenManager._assign(e.stsTokenManager))}_clone(e){const t=new Fe(Object.assign(Object.assign({},this),{auth:e,stsTokenManager:this.stsTokenManager._clone()}));return t.metadata._copy(this.metadata),t}_onReload(e){M(!this.reloadListener,this.auth,"internal-error"),this.reloadListener=e,this.reloadUserInfo&&(this._notifyReloadListener(this.reloadUserInfo),this.reloadUserInfo=null)}_notifyReloadListener(e){this.reloadListener?this.reloadListener(e):this.reloadUserInfo=e}_startProactiveRefresh(){this.proactiveRefresh._start()}_stopProactiveRefresh(){this.proactiveRefresh._stop()}async _updateTokensIfNecessary(e,t=!1){let r=!1;e.idToken&&e.idToken!==this.stsTokenManager.accessToken&&(this.stsTokenManager.updateFromServerResponse(e),r=!0),t&&await Ps(this),await this.auth._persistUserIfCurrent(this),r&&this.auth._notifyListenersIfCurrent(this)}async delete(){if(Le(this.auth.app))return Promise.reject(at(this.auth));const e=await this.getIdToken();return await An(this,Wm(this.auth,{idToken:e})),this.stsTokenManager.clearRefreshToken(),this.auth.signOut()}toJSON(){return Object.assign(Object.assign({uid:this.uid,email:this.email||void 0,emailVerified:this.emailVerified,displayName:this.displayName||void 0,isAnonymous:this.isAnonymous,photoURL:this.photoURL||void 0,phoneNumber:this.phoneNumber||void 0,tenantId:this.tenantId||void 0,providerData:this.providerData.map(e=>Object.assign({},e)),stsTokenManager:this.stsTokenManager.toJSON(),_redirectEventId:this._redirectEventId},this.metadata.toJSON()),{apiKey:this.auth.config.apiKey,appName:this.auth.name})}get refreshToken(){return this.stsTokenManager.refreshToken||""}static _fromJSON(e,t){var r,s,i,a,c,l,d,p;const m=(r=t.displayName)!==null&&r!==void 0?r:void 0,E=(s=t.email)!==null&&s!==void 0?s:void 0,b=(i=t.phoneNumber)!==null&&i!==void 0?i:void 0,C=(a=t.photoURL)!==null&&a!==void 0?a:void 0,V=(c=t.tenantId)!==null&&c!==void 0?c:void 0,k=(l=t._redirectEventId)!==null&&l!==void 0?l:void 0,q=(d=t.createdAt)!==null&&d!==void 0?d:void 0,U=(p=t.lastLoginAt)!==null&&p!==void 0?p:void 0,{uid:F,emailVerified:z,isAnonymous:me,providerData:ee,stsTokenManager:T}=t;M(F&&T,e,"internal-error");const g=vn.fromJSON(this.name,T);M(typeof F=="string",e,"internal-error"),Tt(m,e.name),Tt(E,e.name),M(typeof z=="boolean",e,"internal-error"),M(typeof me=="boolean",e,"internal-error"),Tt(b,e.name),Tt(C,e.name),Tt(V,e.name),Tt(k,e.name),Tt(q,e.name),Tt(U,e.name);const y=new Fe({uid:F,auth:e,email:E,emailVerified:z,displayName:m,isAnonymous:me,photoURL:C,phoneNumber:b,tenantId:V,stsTokenManager:g,createdAt:q,lastLoginAt:U});return ee&&Array.isArray(ee)&&(y.providerData=ee.map(v=>Object.assign({},v))),k&&(y._redirectEventId=k),y}static async _fromIdTokenResponse(e,t,r=!1){const s=new vn;s.updateFromServerResponse(t);const i=new Fe({uid:t.localId,auth:e,stsTokenManager:s,isAnonymous:r});return await Ps(i),i}static async _fromGetAccountInfoResponse(e,t,r){const s=t.users[0];M(s.localId!==void 0,"internal-error");const i=s.providerUserInfo!==void 0?jl(s.providerUserInfo):[],a=!(s.email&&s.passwordHash)&&!(i!=null&&i.length),c=new vn;c.updateFromIdToken(r);const l=new Fe({uid:s.localId,auth:e,stsTokenManager:c,isAnonymous:a}),d={uid:s.localId,displayName:s.displayName||null,photoURL:s.photoUrl||null,email:s.email||null,emailVerified:s.emailVerified||!1,phoneNumber:s.phoneNumber||null,tenantId:s.tenantId||null,providerData:i,metadata:new uo(s.createdAt,s.lastLoginAt),isAnonymous:!(s.email&&s.passwordHash)&&!(i!=null&&i.length)};return Object.assign(l,d),l}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Zc=new Map;function it(n){dt(n instanceof Function,"Expected a class definition");let e=Zc.get(n);return e?(dt(e instanceof n,"Instance stored in cache mismatched with class"),e):(e=new n,Zc.set(n,e),e)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ql{constructor(){this.type="NONE",this.storage={}}async _isAvailable(){return!0}async _set(e,t){this.storage[e]=t}async _get(e){const t=this.storage[e];return t===void 0?null:t}async _remove(e){delete this.storage[e]}_addListener(e,t){}_removeListener(e,t){}}ql.type="NONE";const eu=ql;/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ms(n,e,t){return`firebase:${n}:${e}:${t}`}class Tn{constructor(e,t,r){this.persistence=e,this.auth=t,this.userKey=r;const{config:s,name:i}=this.auth;this.fullUserKey=ms(this.userKey,s.apiKey,i),this.fullPersistenceKey=ms("persistence",s.apiKey,i),this.boundEventHandler=t._onStorageEvent.bind(t),this.persistence._addListener(this.fullUserKey,this.boundEventHandler)}setCurrentUser(e){return this.persistence._set(this.fullUserKey,e.toJSON())}async getCurrentUser(){const e=await this.persistence._get(this.fullUserKey);if(!e)return null;if(typeof e=="string"){const t=await Ss(this.auth,{idToken:e}).catch(()=>{});return t?Fe._fromGetAccountInfoResponse(this.auth,t,e):null}return Fe._fromJSON(this.auth,e)}removeCurrentUser(){return this.persistence._remove(this.fullUserKey)}savePersistenceForRedirect(){return this.persistence._set(this.fullPersistenceKey,this.persistence.type)}async setPersistence(e){if(this.persistence===e)return;const t=await this.getCurrentUser();if(await this.removeCurrentUser(),this.persistence=e,t)return this.setCurrentUser(t)}delete(){this.persistence._removeListener(this.fullUserKey,this.boundEventHandler)}static async create(e,t,r="authUser"){if(!t.length)return new Tn(it(eu),e,r);const s=(await Promise.all(t.map(async d=>{if(await d._isAvailable())return d}))).filter(d=>d);let i=s[0]||it(eu);const a=ms(r,e.config.apiKey,e.name);let c=null;for(const d of t)try{const p=await d._get(a);if(p){let m;if(typeof p=="string"){const E=await Ss(e,{idToken:p}).catch(()=>{});if(!E)break;m=await Fe._fromGetAccountInfoResponse(e,E,p)}else m=Fe._fromJSON(e,p);d!==i&&(c=m),i=d;break}}catch{}const l=s.filter(d=>d._shouldAllowMigration);return!i._shouldAllowMigration||!l.length?new Tn(i,e,r):(i=l[0],c&&await i._set(a,c.toJSON()),await Promise.all(t.map(async d=>{if(d!==i)try{await d._remove(a)}catch{}})),new Tn(i,e,r))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function tu(n){const e=n.toLowerCase();if(e.includes("opera/")||e.includes("opr/")||e.includes("opios/"))return"Opera";if(Wl(e))return"IEMobile";if(e.includes("msie")||e.includes("trident/"))return"IE";if(e.includes("edge/"))return"Edge";if($l(e))return"Firefox";if(e.includes("silk/"))return"Silk";if(Kl(e))return"Blackberry";if(Ql(e))return"Webos";if(zl(e))return"Safari";if((e.includes("chrome/")||Hl(e))&&!e.includes("edge/"))return"Chrome";if(Gl(e))return"Android";{const t=/([a-zA-Z\d\.]+)\/[a-zA-Z\d\.]*$/,r=n.match(t);if((r==null?void 0:r.length)===2)return r[1]}return"Other"}function $l(n=be()){return/firefox\//i.test(n)}function zl(n=be()){const e=n.toLowerCase();return e.includes("safari/")&&!e.includes("chrome/")&&!e.includes("crios/")&&!e.includes("android")}function Hl(n=be()){return/crios\//i.test(n)}function Wl(n=be()){return/iemobile/i.test(n)}function Gl(n=be()){return/android/i.test(n)}function Kl(n=be()){return/blackberry/i.test(n)}function Ql(n=be()){return/webos/i.test(n)}function qo(n=be()){return/iphone|ipad|ipod/i.test(n)||/macintosh/i.test(n)&&/mobile/i.test(n)}function eg(n=be()){var e;return qo(n)&&!!(!((e=window.navigator)===null||e===void 0)&&e.standalone)}function tg(){return pp()&&document.documentMode===10}function Jl(n=be()){return qo(n)||Gl(n)||Ql(n)||Kl(n)||/windows phone/i.test(n)||Wl(n)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Xl(n,e=[]){let t;switch(n){case"Browser":t=tu(be());break;case"Worker":t=`${tu(be())}-${n}`;break;default:t=n}const r=e.length?e.join(","):"FirebaseCore-web";return`${t}/JsCore/${rn}/${r}`}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ng{constructor(e){this.auth=e,this.queue=[]}pushCallback(e,t){const r=i=>new Promise((a,c)=>{try{const l=e(i);a(l)}catch(l){c(l)}});r.onAbort=t,this.queue.push(r);const s=this.queue.length-1;return()=>{this.queue[s]=()=>Promise.resolve()}}async runMiddleware(e){if(this.auth.currentUser===e)return;const t=[];try{for(const r of this.queue)await r(e),r.onAbort&&t.push(r.onAbort)}catch(r){t.reverse();for(const s of t)try{s()}catch{}throw this.auth._errorFactory.create("login-blocked",{originalMessage:r==null?void 0:r.message})}}}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function rg(n,e={}){return gt(n,"GET","/v2/passwordPolicy",Bt(n,e))}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const sg=6;class ig{constructor(e){var t,r,s,i;const a=e.customStrengthOptions;this.customStrengthOptions={},this.customStrengthOptions.minPasswordLength=(t=a.minPasswordLength)!==null&&t!==void 0?t:sg,a.maxPasswordLength&&(this.customStrengthOptions.maxPasswordLength=a.maxPasswordLength),a.containsLowercaseCharacter!==void 0&&(this.customStrengthOptions.containsLowercaseLetter=a.containsLowercaseCharacter),a.containsUppercaseCharacter!==void 0&&(this.customStrengthOptions.containsUppercaseLetter=a.containsUppercaseCharacter),a.containsNumericCharacter!==void 0&&(this.customStrengthOptions.containsNumericCharacter=a.containsNumericCharacter),a.containsNonAlphanumericCharacter!==void 0&&(this.customStrengthOptions.containsNonAlphanumericCharacter=a.containsNonAlphanumericCharacter),this.enforcementState=e.enforcementState,this.enforcementState==="ENFORCEMENT_STATE_UNSPECIFIED"&&(this.enforcementState="OFF"),this.allowedNonAlphanumericCharacters=(s=(r=e.allowedNonAlphanumericCharacters)===null||r===void 0?void 0:r.join(""))!==null&&s!==void 0?s:"",this.forceUpgradeOnSignin=(i=e.forceUpgradeOnSignin)!==null&&i!==void 0?i:!1,this.schemaVersion=e.schemaVersion}validatePassword(e){var t,r,s,i,a,c;const l={isValid:!0,passwordPolicy:this};return this.validatePasswordLengthOptions(e,l),this.validatePasswordCharacterOptions(e,l),l.isValid&&(l.isValid=(t=l.meetsMinPasswordLength)!==null&&t!==void 0?t:!0),l.isValid&&(l.isValid=(r=l.meetsMaxPasswordLength)!==null&&r!==void 0?r:!0),l.isValid&&(l.isValid=(s=l.containsLowercaseLetter)!==null&&s!==void 0?s:!0),l.isValid&&(l.isValid=(i=l.containsUppercaseLetter)!==null&&i!==void 0?i:!0),l.isValid&&(l.isValid=(a=l.containsNumericCharacter)!==null&&a!==void 0?a:!0),l.isValid&&(l.isValid=(c=l.containsNonAlphanumericCharacter)!==null&&c!==void 0?c:!0),l}validatePasswordLengthOptions(e,t){const r=this.customStrengthOptions.minPasswordLength,s=this.customStrengthOptions.maxPasswordLength;r&&(t.meetsMinPasswordLength=e.length>=r),s&&(t.meetsMaxPasswordLength=e.length<=s)}validatePasswordCharacterOptions(e,t){this.updatePasswordCharacterOptionsStatuses(t,!1,!1,!1,!1);let r;for(let s=0;s<e.length;s++)r=e.charAt(s),this.updatePasswordCharacterOptionsStatuses(t,r>="a"&&r<="z",r>="A"&&r<="Z",r>="0"&&r<="9",this.allowedNonAlphanumericCharacters.includes(r))}updatePasswordCharacterOptionsStatuses(e,t,r,s,i){this.customStrengthOptions.containsLowercaseLetter&&(e.containsLowercaseLetter||(e.containsLowercaseLetter=t)),this.customStrengthOptions.containsUppercaseLetter&&(e.containsUppercaseLetter||(e.containsUppercaseLetter=r)),this.customStrengthOptions.containsNumericCharacter&&(e.containsNumericCharacter||(e.containsNumericCharacter=s)),this.customStrengthOptions.containsNonAlphanumericCharacter&&(e.containsNonAlphanumericCharacter||(e.containsNonAlphanumericCharacter=i))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class og{constructor(e,t,r,s){this.app=e,this.heartbeatServiceProvider=t,this.appCheckServiceProvider=r,this.config=s,this.currentUser=null,this.emulatorConfig=null,this.operations=Promise.resolve(),this.authStateSubscription=new nu(this),this.idTokenSubscription=new nu(this),this.beforeStateQueue=new ng(this),this.redirectUser=null,this.isProactiveRefreshEnabled=!1,this.EXPECTED_PASSWORD_POLICY_SCHEMA_VERSION=1,this._canInitEmulator=!0,this._isInitialized=!1,this._deleted=!1,this._initializationPromise=null,this._popupRedirectResolver=null,this._errorFactory=Ml,this._agentRecaptchaConfig=null,this._tenantRecaptchaConfigs={},this._projectPasswordPolicy=null,this._tenantPasswordPolicies={},this._resolvePersistenceManagerAvailable=void 0,this.lastNotifiedUid=void 0,this.languageCode=null,this.tenantId=null,this.settings={appVerificationDisabledForTesting:!1},this.frameworks=[],this.name=e.name,this.clientVersion=s.sdkClientVersion,this._persistenceManagerAvailable=new Promise(i=>this._resolvePersistenceManagerAvailable=i)}_initializeWithPersistence(e,t){return t&&(this._popupRedirectResolver=it(t)),this._initializationPromise=this.queue(async()=>{var r,s,i;if(!this._deleted&&(this.persistenceManager=await Tn.create(this,e),(r=this._resolvePersistenceManagerAvailable)===null||r===void 0||r.call(this),!this._deleted)){if(!((s=this._popupRedirectResolver)===null||s===void 0)&&s._shouldInitProactively)try{await this._popupRedirectResolver._initialize(this)}catch{}await this.initializeCurrentUser(t),this.lastNotifiedUid=((i=this.currentUser)===null||i===void 0?void 0:i.uid)||null,!this._deleted&&(this._isInitialized=!0)}}),this._initializationPromise}async _onStorageEvent(){if(this._deleted)return;const e=await this.assertedPersistence.getCurrentUser();if(!(!this.currentUser&&!e)){if(this.currentUser&&e&&this.currentUser.uid===e.uid){this._currentUser._assign(e),await this.currentUser.getIdToken();return}await this._updateCurrentUser(e,!0)}}async initializeCurrentUserFromIdToken(e){try{const t=await Ss(this,{idToken:e}),r=await Fe._fromGetAccountInfoResponse(this,t,e);await this.directlySetCurrentUser(r)}catch(t){console.warn("FirebaseServerApp could not login user with provided authIdToken: ",t),await this.directlySetCurrentUser(null)}}async initializeCurrentUser(e){var t;if(Le(this.app)){const a=this.app.settings.authIdToken;return a?new Promise(c=>{setTimeout(()=>this.initializeCurrentUserFromIdToken(a).then(c,c))}):this.directlySetCurrentUser(null)}const r=await this.assertedPersistence.getCurrentUser();let s=r,i=!1;if(e&&this.config.authDomain){await this.getOrInitRedirectPersistenceManager();const a=(t=this.redirectUser)===null||t===void 0?void 0:t._redirectEventId,c=s==null?void 0:s._redirectEventId,l=await this.tryRedirectSignIn(e);(!a||a===c)&&(l!=null&&l.user)&&(s=l.user,i=!0)}if(!s)return this.directlySetCurrentUser(null);if(!s._redirectEventId){if(i)try{await this.beforeStateQueue.runMiddleware(s)}catch(a){s=r,this._popupRedirectResolver._overrideRedirectResult(this,()=>Promise.reject(a))}return s?this.reloadAndSetCurrentUserOrClear(s):this.directlySetCurrentUser(null)}return M(this._popupRedirectResolver,this,"argument-error"),await this.getOrInitRedirectPersistenceManager(),this.redirectUser&&this.redirectUser._redirectEventId===s._redirectEventId?this.directlySetCurrentUser(s):this.reloadAndSetCurrentUserOrClear(s)}async tryRedirectSignIn(e){let t=null;try{t=await this._popupRedirectResolver._completeRedirectFn(this,e,!0)}catch{await this._setRedirectUser(null)}return t}async reloadAndSetCurrentUserOrClear(e){try{await Ps(e)}catch(t){if((t==null?void 0:t.code)!=="auth/network-request-failed")return this.directlySetCurrentUser(null)}return this.directlySetCurrentUser(e)}useDeviceLanguage(){this.languageCode=Um()}async _delete(){this._deleted=!0}async updateCurrentUser(e){if(Le(this.app))return Promise.reject(at(this));const t=e?J(e):null;return t&&M(t.auth.config.apiKey===this.config.apiKey,this,"invalid-user-token"),this._updateCurrentUser(t&&t._clone(this))}async _updateCurrentUser(e,t=!1){if(!this._deleted)return e&&M(this.tenantId===e.tenantId,this,"tenant-id-mismatch"),t||await this.beforeStateQueue.runMiddleware(e),this.queue(async()=>{await this.directlySetCurrentUser(e),this.notifyAuthListeners()})}async signOut(){return Le(this.app)?Promise.reject(at(this)):(await this.beforeStateQueue.runMiddleware(null),(this.redirectPersistenceManager||this._popupRedirectResolver)&&await this._setRedirectUser(null),this._updateCurrentUser(null,!0))}setPersistence(e){return Le(this.app)?Promise.reject(at(this)):this.queue(async()=>{await this.assertedPersistence.setPersistence(it(e))})}_getRecaptchaConfig(){return this.tenantId==null?this._agentRecaptchaConfig:this._tenantRecaptchaConfigs[this.tenantId]}async validatePassword(e){this._getPasswordPolicyInternal()||await this._updatePasswordPolicy();const t=this._getPasswordPolicyInternal();return t.schemaVersion!==this.EXPECTED_PASSWORD_POLICY_SCHEMA_VERSION?Promise.reject(this._errorFactory.create("unsupported-password-policy-schema-version",{})):t.validatePassword(e)}_getPasswordPolicyInternal(){return this.tenantId===null?this._projectPasswordPolicy:this._tenantPasswordPolicies[this.tenantId]}async _updatePasswordPolicy(){const e=await rg(this),t=new ig(e);this.tenantId===null?this._projectPasswordPolicy=t:this._tenantPasswordPolicies[this.tenantId]=t}_getPersistenceType(){return this.assertedPersistence.persistence.type}_getPersistence(){return this.assertedPersistence.persistence}_updateErrorMap(e){this._errorFactory=new br("auth","Firebase",e())}onAuthStateChanged(e,t,r){return this.registerStateListener(this.authStateSubscription,e,t,r)}beforeAuthStateChanged(e,t){return this.beforeStateQueue.pushCallback(e,t)}onIdTokenChanged(e,t,r){return this.registerStateListener(this.idTokenSubscription,e,t,r)}authStateReady(){return new Promise((e,t)=>{if(this.currentUser)e();else{const r=this.onAuthStateChanged(()=>{r(),e()},t)}})}async revokeAccessToken(e){if(this.currentUser){const t=await this.currentUser.getIdToken(),r={providerId:"apple.com",tokenType:"ACCESS_TOKEN",token:e,idToken:t};this.tenantId!=null&&(r.tenantId=this.tenantId),await Zm(this,r)}}toJSON(){var e;return{apiKey:this.config.apiKey,authDomain:this.config.authDomain,appName:this.name,currentUser:(e=this._currentUser)===null||e===void 0?void 0:e.toJSON()}}async _setRedirectUser(e,t){const r=await this.getOrInitRedirectPersistenceManager(t);return e===null?r.removeCurrentUser():r.setCurrentUser(e)}async getOrInitRedirectPersistenceManager(e){if(!this.redirectPersistenceManager){const t=e&&it(e)||this._popupRedirectResolver;M(t,this,"argument-error"),this.redirectPersistenceManager=await Tn.create(this,[it(t._redirectPersistence)],"redirectUser"),this.redirectUser=await this.redirectPersistenceManager.getCurrentUser()}return this.redirectPersistenceManager}async _redirectUserForId(e){var t,r;return this._isInitialized&&await this.queue(async()=>{}),((t=this._currentUser)===null||t===void 0?void 0:t._redirectEventId)===e?this._currentUser:((r=this.redirectUser)===null||r===void 0?void 0:r._redirectEventId)===e?this.redirectUser:null}async _persistUserIfCurrent(e){if(e===this.currentUser)return this.queue(async()=>this.directlySetCurrentUser(e))}_notifyListenersIfCurrent(e){e===this.currentUser&&this.notifyAuthListeners()}_key(){return`${this.config.authDomain}:${this.config.apiKey}:${this.name}`}_startProactiveRefresh(){this.isProactiveRefreshEnabled=!0,this.currentUser&&this._currentUser._startProactiveRefresh()}_stopProactiveRefresh(){this.isProactiveRefreshEnabled=!1,this.currentUser&&this._currentUser._stopProactiveRefresh()}get _currentUser(){return this.currentUser}notifyAuthListeners(){var e,t;if(!this._isInitialized)return;this.idTokenSubscription.next(this.currentUser);const r=(t=(e=this.currentUser)===null||e===void 0?void 0:e.uid)!==null&&t!==void 0?t:null;this.lastNotifiedUid!==r&&(this.lastNotifiedUid=r,this.authStateSubscription.next(this.currentUser))}registerStateListener(e,t,r,s){if(this._deleted)return()=>{};const i=typeof t=="function"?t:t.next.bind(t);let a=!1;const c=this._isInitialized?Promise.resolve():this._initializationPromise;if(M(c,this,"internal-error"),c.then(()=>{a||i(this.currentUser)}),typeof t=="function"){const l=e.addObserver(t,r,s);return()=>{a=!0,l()}}else{const l=e.addObserver(t);return()=>{a=!0,l()}}}async directlySetCurrentUser(e){this.currentUser&&this.currentUser!==e&&this._currentUser._stopProactiveRefresh(),e&&this.isProactiveRefreshEnabled&&e._startProactiveRefresh(),this.currentUser=e,e?await this.assertedPersistence.setCurrentUser(e):await this.assertedPersistence.removeCurrentUser()}queue(e){return this.operations=this.operations.then(e,e),this.operations}get assertedPersistence(){return M(this.persistenceManager,this,"internal-error"),this.persistenceManager}_logFramework(e){!e||this.frameworks.includes(e)||(this.frameworks.push(e),this.frameworks.sort(),this.clientVersion=Xl(this.config.clientPlatform,this._getFrameworks()))}_getFrameworks(){return this.frameworks}async _getAdditionalHeaders(){var e;const t={"X-Client-Version":this.clientVersion};this.app.options.appId&&(t["X-Firebase-gmpid"]=this.app.options.appId);const r=await((e=this.heartbeatServiceProvider.getImmediate({optional:!0}))===null||e===void 0?void 0:e.getHeartbeatsHeader());r&&(t["X-Firebase-Client"]=r);const s=await this._getAppCheckToken();return s&&(t["X-Firebase-AppCheck"]=s),t}async _getAppCheckToken(){var e;if(Le(this.app)&&this.app.settings.appCheckToken)return this.app.settings.appCheckToken;const t=await((e=this.appCheckServiceProvider.getImmediate({optional:!0}))===null||e===void 0?void 0:e.getToken());return t!=null&&t.error&&Lm(`Error while retrieving App Check token: ${t.error}`),t==null?void 0:t.token}}function sn(n){return J(n)}class nu{constructor(e){this.auth=e,this.observer=null,this.addObserver=Ip(t=>this.observer=t)}get next(){return M(this.observer,this.auth,"internal-error"),this.observer.next.bind(this.observer)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Hs={async loadJS(){throw new Error("Unable to load external scripts")},recaptchaV2Script:"",recaptchaEnterpriseScript:"",gapiScript:""};function ag(n){Hs=n}function Yl(n){return Hs.loadJS(n)}function cg(){return Hs.recaptchaEnterpriseScript}function ug(){return Hs.gapiScript}function lg(n){return`__${n}${Math.floor(Math.random()*1e6)}`}class hg{constructor(){this.enterprise=new dg}ready(e){e()}execute(e,t){return Promise.resolve("token")}render(e,t){return""}}class dg{ready(e){e()}execute(e,t){return Promise.resolve("token")}render(e,t){return""}}const fg="recaptcha-enterprise",Zl="NO_RECAPTCHA";class pg{constructor(e){this.type=fg,this.auth=sn(e)}async verify(e="verify",t=!1){async function r(i){if(!t){if(i.tenantId==null&&i._agentRecaptchaConfig!=null)return i._agentRecaptchaConfig.siteKey;if(i.tenantId!=null&&i._tenantRecaptchaConfigs[i.tenantId]!==void 0)return i._tenantRecaptchaConfigs[i.tenantId].siteKey}return new Promise(async(a,c)=>{Hm(i,{clientType:"CLIENT_TYPE_WEB",version:"RECAPTCHA_ENTERPRISE"}).then(l=>{if(l.recaptchaKey===void 0)c(new Error("recaptcha Enterprise site key undefined"));else{const d=new zm(l);return i.tenantId==null?i._agentRecaptchaConfig=d:i._tenantRecaptchaConfigs[i.tenantId]=d,a(d.siteKey)}}).catch(l=>{c(l)})})}function s(i,a,c){const l=window.grecaptcha;Xc(l)?l.enterprise.ready(()=>{l.enterprise.execute(i,{action:e}).then(d=>{a(d)}).catch(()=>{a(Zl)})}):c(Error("No reCAPTCHA enterprise script loaded."))}return this.auth.settings.appVerificationDisabledForTesting?new hg().execute("siteKey",{action:"verify"}):new Promise((i,a)=>{r(this.auth).then(c=>{if(!t&&Xc(window.grecaptcha))s(c,i,a);else{if(typeof window>"u"){a(new Error("RecaptchaVerifier is only supported in browser"));return}let l=cg();l.length!==0&&(l+=c),Yl(l).then(()=>{s(c,i,a)}).catch(d=>{a(d)})}}).catch(c=>{a(c)})})}}async function ru(n,e,t,r=!1,s=!1){const i=new pg(n);let a;if(s)a=Zl;else try{a=await i.verify(t)}catch{a=await i.verify(t,!0)}const c=Object.assign({},e);if(t==="mfaSmsEnrollment"||t==="mfaSmsSignIn"){if("phoneEnrollmentInfo"in c){const l=c.phoneEnrollmentInfo.phoneNumber,d=c.phoneEnrollmentInfo.recaptchaToken;Object.assign(c,{phoneEnrollmentInfo:{phoneNumber:l,recaptchaToken:d,captchaResponse:a,clientType:"CLIENT_TYPE_WEB",recaptchaVersion:"RECAPTCHA_ENTERPRISE"}})}else if("phoneSignInInfo"in c){const l=c.phoneSignInInfo.recaptchaToken;Object.assign(c,{phoneSignInInfo:{recaptchaToken:l,captchaResponse:a,clientType:"CLIENT_TYPE_WEB",recaptchaVersion:"RECAPTCHA_ENTERPRISE"}})}return c}return r?Object.assign(c,{captchaResp:a}):Object.assign(c,{captchaResponse:a}),Object.assign(c,{clientType:"CLIENT_TYPE_WEB"}),Object.assign(c,{recaptchaVersion:"RECAPTCHA_ENTERPRISE"}),c}async function lo(n,e,t,r,s){var i;if(!((i=n._getRecaptchaConfig())===null||i===void 0)&&i.isProviderEnabled("EMAIL_PASSWORD_PROVIDER")){const a=await ru(n,e,t,t==="getOobCode");return r(n,a)}else return r(n,e).catch(async a=>{if(a.code==="auth/missing-recaptcha-token"){console.log(`${t} is protected by reCAPTCHA Enterprise for this project. Automatically triggering the reCAPTCHA flow and restarting the flow.`);const c=await ru(n,e,t,t==="getOobCode");return r(n,c)}else return Promise.reject(a)})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function mg(n,e){const t=zs(n,"auth");if(t.isInitialized()){const s=t.getImmediate(),i=t.getOptions();if(lt(i,e??{}))return s;qe(s,"already-initialized")}return t.initialize({options:e})}function gg(n,e){const t=(e==null?void 0:e.persistence)||[],r=(Array.isArray(t)?t:[t]).map(it);e!=null&&e.errorMap&&n._updateErrorMap(e.errorMap),n._initializeWithPersistence(r,e==null?void 0:e.popupRedirectResolver)}function _g(n,e,t){const r=sn(n);M(/^https?:\/\//.test(e),r,"invalid-emulator-scheme");const s=!1,i=eh(e),{host:a,port:c}=yg(e),l=c===null?"":`:${c}`,d={url:`${i}//${a}${l}/`},p=Object.freeze({host:a,port:c,protocol:i.replace(":",""),options:Object.freeze({disableWarnings:s})});if(!r._canInitEmulator){M(r.config.emulator&&r.emulatorConfig,r,"emulator-config-failed"),M(lt(d,r.config.emulator)&&lt(p,r.emulatorConfig),r,"emulator-config-failed");return}r.config.emulator=d,r.emulatorConfig=p,r.settings.appVerificationDisabledForTesting=!0,Ft(a)?(Vo(`${i}//${a}${l}`),Oo("Auth",!0)):Eg()}function eh(n){const e=n.indexOf(":");return e<0?"":n.substr(0,e+1)}function yg(n){const e=eh(n),t=/(\/\/)?([^?#/]+)/.exec(n.substr(e.length));if(!t)return{host:"",port:null};const r=t[2].split("@").pop()||"",s=/^(\[[^\]]+\])(:|$)/.exec(r);if(s){const i=s[1];return{host:i,port:su(r.substr(i.length+1))}}else{const[i,a]=r.split(":");return{host:i,port:su(a)}}}function su(n){if(!n)return null;const e=Number(n);return isNaN(e)?null:e}function Eg(){function n(){const e=document.createElement("p"),t=e.style;e.innerText="Running in emulator mode. Do not use with production credentials.",t.position="fixed",t.width="100%",t.backgroundColor="#ffffff",t.border=".1em solid #000000",t.color="#b50000",t.bottom="0px",t.left="0px",t.margin="0px",t.zIndex="10000",t.textAlign="center",e.classList.add("firebase-emulator-warning"),document.body.appendChild(e)}typeof console<"u"&&typeof console.info=="function"&&console.info("WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials."),typeof window<"u"&&typeof document<"u"&&(document.readyState==="loading"?window.addEventListener("DOMContentLoaded",n):n())}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class $o{constructor(e,t){this.providerId=e,this.signInMethod=t}toJSON(){return st("not implemented")}_getIdTokenResponse(e){return st("not implemented")}_linkToIdToken(e,t){return st("not implemented")}_getReauthenticationResolver(e){return st("not implemented")}}async function vg(n,e){return gt(n,"POST","/v1/accounts:signUp",e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Tg(n,e){return Cr(n,"POST","/v1/accounts:signInWithPassword",Bt(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ig(n,e){return Cr(n,"POST","/v1/accounts:signInWithEmailLink",Bt(n,e))}async function wg(n,e){return Cr(n,"POST","/v1/accounts:signInWithEmailLink",Bt(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Er extends $o{constructor(e,t,r,s=null){super("password",r),this._email=e,this._password=t,this._tenantId=s}static _fromEmailAndPassword(e,t){return new Er(e,t,"password")}static _fromEmailAndCode(e,t,r=null){return new Er(e,t,"emailLink",r)}toJSON(){return{email:this._email,password:this._password,signInMethod:this.signInMethod,tenantId:this._tenantId}}static fromJSON(e){const t=typeof e=="string"?JSON.parse(e):e;if(t!=null&&t.email&&(t!=null&&t.password)){if(t.signInMethod==="password")return this._fromEmailAndPassword(t.email,t.password);if(t.signInMethod==="emailLink")return this._fromEmailAndCode(t.email,t.password,t.tenantId)}return null}async _getIdTokenResponse(e){switch(this.signInMethod){case"password":const t={returnSecureToken:!0,email:this._email,password:this._password,clientType:"CLIENT_TYPE_WEB"};return lo(e,t,"signInWithPassword",Tg);case"emailLink":return Ig(e,{email:this._email,oobCode:this._password});default:qe(e,"internal-error")}}async _linkToIdToken(e,t){switch(this.signInMethod){case"password":const r={idToken:t,returnSecureToken:!0,email:this._email,password:this._password,clientType:"CLIENT_TYPE_WEB"};return lo(e,r,"signUpPassword",vg);case"emailLink":return wg(e,{idToken:t,email:this._email,oobCode:this._password});default:qe(e,"internal-error")}}_getReauthenticationResolver(e){return this._getIdTokenResponse(e)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function In(n,e){return Cr(n,"POST","/v1/accounts:signInWithIdp",Bt(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ag="http://localhost";class Yt extends $o{constructor(){super(...arguments),this.pendingToken=null}static _fromParams(e){const t=new Yt(e.providerId,e.signInMethod);return e.idToken||e.accessToken?(e.idToken&&(t.idToken=e.idToken),e.accessToken&&(t.accessToken=e.accessToken),e.nonce&&!e.pendingToken&&(t.nonce=e.nonce),e.pendingToken&&(t.pendingToken=e.pendingToken)):e.oauthToken&&e.oauthTokenSecret?(t.accessToken=e.oauthToken,t.secret=e.oauthTokenSecret):qe("argument-error"),t}toJSON(){return{idToken:this.idToken,accessToken:this.accessToken,secret:this.secret,nonce:this.nonce,pendingToken:this.pendingToken,providerId:this.providerId,signInMethod:this.signInMethod}}static fromJSON(e){const t=typeof e=="string"?JSON.parse(e):e,{providerId:r,signInMethod:s}=t,i=Uo(t,["providerId","signInMethod"]);if(!r||!s)return null;const a=new Yt(r,s);return a.idToken=i.idToken||void 0,a.accessToken=i.accessToken||void 0,a.secret=i.secret,a.nonce=i.nonce,a.pendingToken=i.pendingToken||null,a}_getIdTokenResponse(e){const t=this.buildRequest();return In(e,t)}_linkToIdToken(e,t){const r=this.buildRequest();return r.idToken=t,In(e,r)}_getReauthenticationResolver(e){const t=this.buildRequest();return t.autoCreate=!1,In(e,t)}buildRequest(){const e={requestUri:Ag,returnSecureToken:!0};if(this.pendingToken)e.pendingToken=this.pendingToken;else{const t={};this.idToken&&(t.id_token=this.idToken),this.accessToken&&(t.access_token=this.accessToken),this.secret&&(t.oauth_token_secret=this.secret),t.providerId=this.providerId,this.nonce&&!this.pendingToken&&(t.nonce=this.nonce),e.postBody=Sr(t)}return e}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Rg(n){switch(n){case"recoverEmail":return"RECOVER_EMAIL";case"resetPassword":return"PASSWORD_RESET";case"signIn":return"EMAIL_SIGNIN";case"verifyEmail":return"VERIFY_EMAIL";case"verifyAndChangeEmail":return"VERIFY_AND_CHANGE_EMAIL";case"revertSecondFactorAddition":return"REVERT_SECOND_FACTOR_ADDITION";default:return null}}function bg(n){const e=ir(or(n)).link,t=e?ir(or(e)).deep_link_id:null,r=ir(or(n)).deep_link_id;return(r?ir(or(r)).link:null)||r||t||e||n}class zo{constructor(e){var t,r,s,i,a,c;const l=ir(or(e)),d=(t=l.apiKey)!==null&&t!==void 0?t:null,p=(r=l.oobCode)!==null&&r!==void 0?r:null,m=Rg((s=l.mode)!==null&&s!==void 0?s:null);M(d&&p&&m,"argument-error"),this.apiKey=d,this.operation=m,this.code=p,this.continueUrl=(i=l.continueUrl)!==null&&i!==void 0?i:null,this.languageCode=(a=l.lang)!==null&&a!==void 0?a:null,this.tenantId=(c=l.tenantId)!==null&&c!==void 0?c:null}static parseLink(e){const t=bg(e);try{return new zo(t)}catch{return null}}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Vn{constructor(){this.providerId=Vn.PROVIDER_ID}static credential(e,t){return Er._fromEmailAndPassword(e,t)}static credentialWithLink(e,t){const r=zo.parseLink(t);return M(r,"argument-error"),Er._fromEmailAndCode(e,r.code,r.tenantId)}}Vn.PROVIDER_ID="password";Vn.EMAIL_PASSWORD_SIGN_IN_METHOD="password";Vn.EMAIL_LINK_SIGN_IN_METHOD="emailLink";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class th{constructor(e){this.providerId=e,this.defaultLanguageCode=null,this.customParameters={}}setDefaultLanguage(e){this.defaultLanguageCode=e}setCustomParameters(e){return this.customParameters=e,this}getCustomParameters(){return this.customParameters}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class kr extends th{constructor(){super(...arguments),this.scopes=[]}addScope(e){return this.scopes.includes(e)||this.scopes.push(e),this}getScopes(){return[...this.scopes]}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class It extends kr{constructor(){super("facebook.com")}static credential(e){return Yt._fromParams({providerId:It.PROVIDER_ID,signInMethod:It.FACEBOOK_SIGN_IN_METHOD,accessToken:e})}static credentialFromResult(e){return It.credentialFromTaggedObject(e)}static credentialFromError(e){return It.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e||!("oauthAccessToken"in e)||!e.oauthAccessToken)return null;try{return It.credential(e.oauthAccessToken)}catch{return null}}}It.FACEBOOK_SIGN_IN_METHOD="facebook.com";It.PROVIDER_ID="facebook.com";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class wt extends kr{constructor(){super("google.com"),this.addScope("profile")}static credential(e,t){return Yt._fromParams({providerId:wt.PROVIDER_ID,signInMethod:wt.GOOGLE_SIGN_IN_METHOD,idToken:e,accessToken:t})}static credentialFromResult(e){return wt.credentialFromTaggedObject(e)}static credentialFromError(e){return wt.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;const{oauthIdToken:t,oauthAccessToken:r}=e;if(!t&&!r)return null;try{return wt.credential(t,r)}catch{return null}}}wt.GOOGLE_SIGN_IN_METHOD="google.com";wt.PROVIDER_ID="google.com";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class At extends kr{constructor(){super("github.com")}static credential(e){return Yt._fromParams({providerId:At.PROVIDER_ID,signInMethod:At.GITHUB_SIGN_IN_METHOD,accessToken:e})}static credentialFromResult(e){return At.credentialFromTaggedObject(e)}static credentialFromError(e){return At.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e||!("oauthAccessToken"in e)||!e.oauthAccessToken)return null;try{return At.credential(e.oauthAccessToken)}catch{return null}}}At.GITHUB_SIGN_IN_METHOD="github.com";At.PROVIDER_ID="github.com";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Rt extends kr{constructor(){super("twitter.com")}static credential(e,t){return Yt._fromParams({providerId:Rt.PROVIDER_ID,signInMethod:Rt.TWITTER_SIGN_IN_METHOD,oauthToken:e,oauthTokenSecret:t})}static credentialFromResult(e){return Rt.credentialFromTaggedObject(e)}static credentialFromError(e){return Rt.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;const{oauthAccessToken:t,oauthTokenSecret:r}=e;if(!t||!r)return null;try{return Rt.credential(t,r)}catch{return null}}}Rt.TWITTER_SIGN_IN_METHOD="twitter.com";Rt.PROVIDER_ID="twitter.com";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Sg(n,e){return Cr(n,"POST","/v1/accounts:signUp",Bt(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Zt{constructor(e){this.user=e.user,this.providerId=e.providerId,this._tokenResponse=e._tokenResponse,this.operationType=e.operationType}static async _fromIdTokenResponse(e,t,r,s=!1){const i=await Fe._fromIdTokenResponse(e,r,s),a=iu(r);return new Zt({user:i,providerId:a,_tokenResponse:r,operationType:t})}static async _forOperation(e,t,r){await e._updateTokensIfNecessary(r,!0);const s=iu(r);return new Zt({user:e,providerId:s,_tokenResponse:r,operationType:t})}}function iu(n){return n.providerId?n.providerId:"phoneNumber"in n?"phone":null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Cs extends Ze{constructor(e,t,r,s){var i;super(t.code,t.message),this.operationType=r,this.user=s,Object.setPrototypeOf(this,Cs.prototype),this.customData={appName:e.name,tenantId:(i=e.tenantId)!==null&&i!==void 0?i:void 0,_serverResponse:t.customData._serverResponse,operationType:r}}static _fromErrorAndOperation(e,t,r,s){return new Cs(e,t,r,s)}}function nh(n,e,t,r){return(e==="reauthenticate"?t._getReauthenticationResolver(n):t._getIdTokenResponse(n)).catch(i=>{throw i.code==="auth/multi-factor-auth-required"?Cs._fromErrorAndOperation(n,i,e,r):i})}async function Pg(n,e,t=!1){const r=await An(n,e._linkToIdToken(n.auth,await n.getIdToken()),t);return Zt._forOperation(n,"link",r)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Cg(n,e,t=!1){const{auth:r}=n;if(Le(r.app))return Promise.reject(at(r));const s="reauthenticate";try{const i=await An(n,nh(r,s,e,n),t);M(i.idToken,r,"internal-error");const a=jo(i.idToken);M(a,r,"internal-error");const{sub:c}=a;return M(n.uid===c,r,"user-mismatch"),Zt._forOperation(n,s,i)}catch(i){throw(i==null?void 0:i.code)==="auth/user-not-found"&&qe(r,"user-mismatch"),i}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function rh(n,e,t=!1){if(Le(n.app))return Promise.reject(at(n));const r="signIn",s=await nh(n,r,e),i=await Zt._fromIdTokenResponse(n,r,s);return t||await n._updateCurrentUser(i.user),i}async function kg(n,e){return rh(sn(n),e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function sh(n){const e=sn(n);e._getPasswordPolicyInternal()&&await e._updatePasswordPolicy()}async function zI(n,e,t){if(Le(n.app))return Promise.reject(at(n));const r=sn(n),a=await lo(r,{returnSecureToken:!0,email:e,password:t,clientType:"CLIENT_TYPE_WEB"},"signUpPassword",Sg).catch(l=>{throw l.code==="auth/password-does-not-meet-requirements"&&sh(n),l}),c=await Zt._fromIdTokenResponse(r,"signIn",a);return await r._updateCurrentUser(c.user),c}function HI(n,e,t){return Le(n.app)?Promise.reject(at(n)):kg(J(n),Vn.credential(e,t)).catch(async r=>{throw r.code==="auth/password-does-not-meet-requirements"&&sh(n),r})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Dg(n,e){return gt(n,"POST","/v1/accounts:update",e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function WI(n,{displayName:e,photoURL:t}){if(e===void 0&&t===void 0)return;const r=J(n),i={idToken:await r.getIdToken(),displayName:e,photoUrl:t,returnSecureToken:!0},a=await An(r,Dg(r.auth,i));r.displayName=a.displayName||null,r.photoURL=a.photoUrl||null;const c=r.providerData.find(({providerId:l})=>l==="password");c&&(c.displayName=r.displayName,c.photoURL=r.photoURL),await r._updateTokensIfNecessary(a)}function Ng(n,e,t,r){return J(n).onIdTokenChanged(e,t,r)}function Vg(n,e,t){return J(n).beforeAuthStateChanged(e,t)}function GI(n,e,t,r){return J(n).onAuthStateChanged(e,t,r)}function KI(n){return J(n).signOut()}const ks="__sak";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ih{constructor(e,t){this.storageRetriever=e,this.type=t}_isAvailable(){try{return this.storage?(this.storage.setItem(ks,"1"),this.storage.removeItem(ks),Promise.resolve(!0)):Promise.resolve(!1)}catch{return Promise.resolve(!1)}}_set(e,t){return this.storage.setItem(e,JSON.stringify(t)),Promise.resolve()}_get(e){const t=this.storage.getItem(e);return Promise.resolve(t?JSON.parse(t):null)}_remove(e){return this.storage.removeItem(e),Promise.resolve()}get storage(){return this.storageRetriever()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Og=1e3,Lg=10;class oh extends ih{constructor(){super(()=>window.localStorage,"LOCAL"),this.boundEventHandler=(e,t)=>this.onStorageEvent(e,t),this.listeners={},this.localCache={},this.pollTimer=null,this.fallbackToPolling=Jl(),this._shouldAllowMigration=!0}forAllChangedKeys(e){for(const t of Object.keys(this.listeners)){const r=this.storage.getItem(t),s=this.localCache[t];r!==s&&e(t,s,r)}}onStorageEvent(e,t=!1){if(!e.key){this.forAllChangedKeys((a,c,l)=>{this.notifyListeners(a,l)});return}const r=e.key;t?this.detachListener():this.stopPolling();const s=()=>{const a=this.storage.getItem(r);!t&&this.localCache[r]===a||this.notifyListeners(r,a)},i=this.storage.getItem(r);tg()&&i!==e.newValue&&e.newValue!==e.oldValue?setTimeout(s,Lg):s()}notifyListeners(e,t){this.localCache[e]=t;const r=this.listeners[e];if(r)for(const s of Array.from(r))s(t&&JSON.parse(t))}startPolling(){this.stopPolling(),this.pollTimer=setInterval(()=>{this.forAllChangedKeys((e,t,r)=>{this.onStorageEvent(new StorageEvent("storage",{key:e,oldValue:t,newValue:r}),!0)})},Og)}stopPolling(){this.pollTimer&&(clearInterval(this.pollTimer),this.pollTimer=null)}attachListener(){window.addEventListener("storage",this.boundEventHandler)}detachListener(){window.removeEventListener("storage",this.boundEventHandler)}_addListener(e,t){Object.keys(this.listeners).length===0&&(this.fallbackToPolling?this.startPolling():this.attachListener()),this.listeners[e]||(this.listeners[e]=new Set,this.localCache[e]=this.storage.getItem(e)),this.listeners[e].add(t)}_removeListener(e,t){this.listeners[e]&&(this.listeners[e].delete(t),this.listeners[e].size===0&&delete this.listeners[e]),Object.keys(this.listeners).length===0&&(this.detachListener(),this.stopPolling())}async _set(e,t){await super._set(e,t),this.localCache[e]=JSON.stringify(t)}async _get(e){const t=await super._get(e);return this.localCache[e]=JSON.stringify(t),t}async _remove(e){await super._remove(e),delete this.localCache[e]}}oh.type="LOCAL";const Mg=oh;/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ah extends ih{constructor(){super(()=>window.sessionStorage,"SESSION")}_addListener(e,t){}_removeListener(e,t){}}ah.type="SESSION";const ch=ah;/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function xg(n){return Promise.all(n.map(async e=>{try{return{fulfilled:!0,value:await e}}catch(t){return{fulfilled:!1,reason:t}}}))}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ws{constructor(e){this.eventTarget=e,this.handlersMap={},this.boundEventHandler=this.handleEvent.bind(this)}static _getInstance(e){const t=this.receivers.find(s=>s.isListeningto(e));if(t)return t;const r=new Ws(e);return this.receivers.push(r),r}isListeningto(e){return this.eventTarget===e}async handleEvent(e){const t=e,{eventId:r,eventType:s,data:i}=t.data,a=this.handlersMap[s];if(!(a!=null&&a.size))return;t.ports[0].postMessage({status:"ack",eventId:r,eventType:s});const c=Array.from(a).map(async d=>d(t.origin,i)),l=await xg(c);t.ports[0].postMessage({status:"done",eventId:r,eventType:s,response:l})}_subscribe(e,t){Object.keys(this.handlersMap).length===0&&this.eventTarget.addEventListener("message",this.boundEventHandler),this.handlersMap[e]||(this.handlersMap[e]=new Set),this.handlersMap[e].add(t)}_unsubscribe(e,t){this.handlersMap[e]&&t&&this.handlersMap[e].delete(t),(!t||this.handlersMap[e].size===0)&&delete this.handlersMap[e],Object.keys(this.handlersMap).length===0&&this.eventTarget.removeEventListener("message",this.boundEventHandler)}}Ws.receivers=[];/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ho(n="",e=10){let t="";for(let r=0;r<e;r++)t+=Math.floor(Math.random()*10);return n+t}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ug{constructor(e){this.target=e,this.handlers=new Set}removeMessageHandler(e){e.messageChannel&&(e.messageChannel.port1.removeEventListener("message",e.onMessage),e.messageChannel.port1.close()),this.handlers.delete(e)}async _send(e,t,r=50){const s=typeof MessageChannel<"u"?new MessageChannel:null;if(!s)throw new Error("connection_unavailable");let i,a;return new Promise((c,l)=>{const d=Ho("",20);s.port1.start();const p=setTimeout(()=>{l(new Error("unsupported_event"))},r);a={messageChannel:s,onMessage(m){const E=m;if(E.data.eventId===d)switch(E.data.status){case"ack":clearTimeout(p),i=setTimeout(()=>{l(new Error("timeout"))},3e3);break;case"done":clearTimeout(i),c(E.data.response);break;default:clearTimeout(p),clearTimeout(i),l(new Error("invalid_response"));break}}},this.handlers.add(a),s.port1.addEventListener("message",a.onMessage),this.target.postMessage({eventType:e,eventId:d,data:t},[s.port2])}).finally(()=>{a&&this.removeMessageHandler(a)})}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Qe(){return window}function Fg(n){Qe().location.href=n}/**
 * @license
 * Copyright 2020 Google LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function uh(){return typeof Qe().WorkerGlobalScope<"u"&&typeof Qe().importScripts=="function"}async function Bg(){if(!(navigator!=null&&navigator.serviceWorker))return null;try{return(await navigator.serviceWorker.ready).active}catch{return null}}function jg(){var n;return((n=navigator==null?void 0:navigator.serviceWorker)===null||n===void 0?void 0:n.controller)||null}function qg(){return uh()?self:null}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const lh="firebaseLocalStorageDb",$g=1,Ds="firebaseLocalStorage",hh="fbase_key";class Dr{constructor(e){this.request=e}toPromise(){return new Promise((e,t)=>{this.request.addEventListener("success",()=>{e(this.request.result)}),this.request.addEventListener("error",()=>{t(this.request.error)})})}}function Gs(n,e){return n.transaction([Ds],e?"readwrite":"readonly").objectStore(Ds)}function zg(){const n=indexedDB.deleteDatabase(lh);return new Dr(n).toPromise()}function ho(){const n=indexedDB.open(lh,$g);return new Promise((e,t)=>{n.addEventListener("error",()=>{t(n.error)}),n.addEventListener("upgradeneeded",()=>{const r=n.result;try{r.createObjectStore(Ds,{keyPath:hh})}catch(s){t(s)}}),n.addEventListener("success",async()=>{const r=n.result;r.objectStoreNames.contains(Ds)?e(r):(r.close(),await zg(),e(await ho()))})})}async function ou(n,e,t){const r=Gs(n,!0).put({[hh]:e,value:t});return new Dr(r).toPromise()}async function Hg(n,e){const t=Gs(n,!1).get(e),r=await new Dr(t).toPromise();return r===void 0?null:r.value}function au(n,e){const t=Gs(n,!0).delete(e);return new Dr(t).toPromise()}const Wg=800,Gg=3;class dh{constructor(){this.type="LOCAL",this._shouldAllowMigration=!0,this.listeners={},this.localCache={},this.pollTimer=null,this.pendingWrites=0,this.receiver=null,this.sender=null,this.serviceWorkerReceiverAvailable=!1,this.activeServiceWorker=null,this._workerInitializationPromise=this.initializeServiceWorkerMessaging().then(()=>{},()=>{})}async _openDb(){return this.db?this.db:(this.db=await ho(),this.db)}async _withRetries(e){let t=0;for(;;)try{const r=await this._openDb();return await e(r)}catch(r){if(t++>Gg)throw r;this.db&&(this.db.close(),this.db=void 0)}}async initializeServiceWorkerMessaging(){return uh()?this.initializeReceiver():this.initializeSender()}async initializeReceiver(){this.receiver=Ws._getInstance(qg()),this.receiver._subscribe("keyChanged",async(e,t)=>({keyProcessed:(await this._poll()).includes(t.key)})),this.receiver._subscribe("ping",async(e,t)=>["keyChanged"])}async initializeSender(){var e,t;if(this.activeServiceWorker=await Bg(),!this.activeServiceWorker)return;this.sender=new Ug(this.activeServiceWorker);const r=await this.sender._send("ping",{},800);r&&!((e=r[0])===null||e===void 0)&&e.fulfilled&&!((t=r[0])===null||t===void 0)&&t.value.includes("keyChanged")&&(this.serviceWorkerReceiverAvailable=!0)}async notifyServiceWorker(e){if(!(!this.sender||!this.activeServiceWorker||jg()!==this.activeServiceWorker))try{await this.sender._send("keyChanged",{key:e},this.serviceWorkerReceiverAvailable?800:50)}catch{}}async _isAvailable(){try{if(!indexedDB)return!1;const e=await ho();return await ou(e,ks,"1"),await au(e,ks),!0}catch{}return!1}async _withPendingWrite(e){this.pendingWrites++;try{await e()}finally{this.pendingWrites--}}async _set(e,t){return this._withPendingWrite(async()=>(await this._withRetries(r=>ou(r,e,t)),this.localCache[e]=t,this.notifyServiceWorker(e)))}async _get(e){const t=await this._withRetries(r=>Hg(r,e));return this.localCache[e]=t,t}async _remove(e){return this._withPendingWrite(async()=>(await this._withRetries(t=>au(t,e)),delete this.localCache[e],this.notifyServiceWorker(e)))}async _poll(){const e=await this._withRetries(s=>{const i=Gs(s,!1).getAll();return new Dr(i).toPromise()});if(!e)return[];if(this.pendingWrites!==0)return[];const t=[],r=new Set;if(e.length!==0)for(const{fbase_key:s,value:i}of e)r.add(s),JSON.stringify(this.localCache[s])!==JSON.stringify(i)&&(this.notifyListeners(s,i),t.push(s));for(const s of Object.keys(this.localCache))this.localCache[s]&&!r.has(s)&&(this.notifyListeners(s,null),t.push(s));return t}notifyListeners(e,t){this.localCache[e]=t;const r=this.listeners[e];if(r)for(const s of Array.from(r))s(t)}startPolling(){this.stopPolling(),this.pollTimer=setInterval(async()=>this._poll(),Wg)}stopPolling(){this.pollTimer&&(clearInterval(this.pollTimer),this.pollTimer=null)}_addListener(e,t){Object.keys(this.listeners).length===0&&this.startPolling(),this.listeners[e]||(this.listeners[e]=new Set,this._get(e)),this.listeners[e].add(t)}_removeListener(e,t){this.listeners[e]&&(this.listeners[e].delete(t),this.listeners[e].size===0&&delete this.listeners[e]),Object.keys(this.listeners).length===0&&this.stopPolling()}}dh.type="LOCAL";const Kg=dh;new Pr(3e4,6e4);/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Qg(n,e){return e?it(e):(M(n._popupRedirectResolver,n,"argument-error"),n._popupRedirectResolver)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Wo extends $o{constructor(e){super("custom","custom"),this.params=e}_getIdTokenResponse(e){return In(e,this._buildIdpRequest())}_linkToIdToken(e,t){return In(e,this._buildIdpRequest(t))}_getReauthenticationResolver(e){return In(e,this._buildIdpRequest())}_buildIdpRequest(e){const t={requestUri:this.params.requestUri,sessionId:this.params.sessionId,postBody:this.params.postBody,tenantId:this.params.tenantId,pendingToken:this.params.pendingToken,returnSecureToken:!0,returnIdpCredential:!0};return e&&(t.idToken=e),t}}function Jg(n){return rh(n.auth,new Wo(n),n.bypassAuthState)}function Xg(n){const{auth:e,user:t}=n;return M(t,e,"internal-error"),Cg(t,new Wo(n),n.bypassAuthState)}async function Yg(n){const{auth:e,user:t}=n;return M(t,e,"internal-error"),Pg(t,new Wo(n),n.bypassAuthState)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class fh{constructor(e,t,r,s,i=!1){this.auth=e,this.resolver=r,this.user=s,this.bypassAuthState=i,this.pendingPromise=null,this.eventManager=null,this.filter=Array.isArray(t)?t:[t]}execute(){return new Promise(async(e,t)=>{this.pendingPromise={resolve:e,reject:t};try{this.eventManager=await this.resolver._initialize(this.auth),await this.onExecution(),this.eventManager.registerConsumer(this)}catch(r){this.reject(r)}})}async onAuthEvent(e){const{urlResponse:t,sessionId:r,postBody:s,tenantId:i,error:a,type:c}=e;if(a){this.reject(a);return}const l={auth:this.auth,requestUri:t,sessionId:r,tenantId:i||void 0,postBody:s||void 0,user:this.user,bypassAuthState:this.bypassAuthState};try{this.resolve(await this.getIdpTask(c)(l))}catch(d){this.reject(d)}}onError(e){this.reject(e)}getIdpTask(e){switch(e){case"signInViaPopup":case"signInViaRedirect":return Jg;case"linkViaPopup":case"linkViaRedirect":return Yg;case"reauthViaPopup":case"reauthViaRedirect":return Xg;default:qe(this.auth,"internal-error")}}resolve(e){dt(this.pendingPromise,"Pending promise was never set"),this.pendingPromise.resolve(e),this.unregisterAndCleanUp()}reject(e){dt(this.pendingPromise,"Pending promise was never set"),this.pendingPromise.reject(e),this.unregisterAndCleanUp()}unregisterAndCleanUp(){this.eventManager&&this.eventManager.unregisterConsumer(this),this.pendingPromise=null,this.cleanUp()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Zg=new Pr(2e3,1e4);class yn extends fh{constructor(e,t,r,s,i){super(e,t,s,i),this.provider=r,this.authWindow=null,this.pollId=null,yn.currentPopupAction&&yn.currentPopupAction.cancel(),yn.currentPopupAction=this}async executeNotNull(){const e=await this.execute();return M(e,this.auth,"internal-error"),e}async onExecution(){dt(this.filter.length===1,"Popup operations only handle one event");const e=Ho();this.authWindow=await this.resolver._openPopup(this.auth,this.provider,this.filter[0],e),this.authWindow.associatedEvent=e,this.resolver._originValidation(this.auth).catch(t=>{this.reject(t)}),this.resolver._isIframeWebStorageSupported(this.auth,t=>{t||this.reject(Ke(this.auth,"web-storage-unsupported"))}),this.pollUserCancellation()}get eventId(){var e;return((e=this.authWindow)===null||e===void 0?void 0:e.associatedEvent)||null}cancel(){this.reject(Ke(this.auth,"cancelled-popup-request"))}cleanUp(){this.authWindow&&this.authWindow.close(),this.pollId&&window.clearTimeout(this.pollId),this.authWindow=null,this.pollId=null,yn.currentPopupAction=null}pollUserCancellation(){const e=()=>{var t,r;if(!((r=(t=this.authWindow)===null||t===void 0?void 0:t.window)===null||r===void 0)&&r.closed){this.pollId=window.setTimeout(()=>{this.pollId=null,this.reject(Ke(this.auth,"popup-closed-by-user"))},8e3);return}this.pollId=window.setTimeout(e,Zg.get())};e()}}yn.currentPopupAction=null;/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const e_="pendingRedirect",gs=new Map;class t_ extends fh{constructor(e,t,r=!1){super(e,["signInViaRedirect","linkViaRedirect","reauthViaRedirect","unknown"],t,void 0,r),this.eventId=null}async execute(){let e=gs.get(this.auth._key());if(!e){try{const r=await n_(this.resolver,this.auth)?await super.execute():null;e=()=>Promise.resolve(r)}catch(t){e=()=>Promise.reject(t)}gs.set(this.auth._key(),e)}return this.bypassAuthState||gs.set(this.auth._key(),()=>Promise.resolve(null)),e()}async onAuthEvent(e){if(e.type==="signInViaRedirect")return super.onAuthEvent(e);if(e.type==="unknown"){this.resolve(null);return}if(e.eventId){const t=await this.auth._redirectUserForId(e.eventId);if(t)return this.user=t,super.onAuthEvent(e);this.resolve(null)}}async onExecution(){}cleanUp(){}}async function n_(n,e){const t=i_(e),r=s_(n);if(!await r._isAvailable())return!1;const s=await r._get(t)==="true";return await r._remove(t),s}function r_(n,e){gs.set(n._key(),e)}function s_(n){return it(n._redirectPersistence)}function i_(n){return ms(e_,n.config.apiKey,n.name)}async function o_(n,e,t=!1){if(Le(n.app))return Promise.reject(at(n));const r=sn(n),s=Qg(r,e),a=await new t_(r,s,t).execute();return a&&!t&&(delete a.user._redirectEventId,await r._persistUserIfCurrent(a.user),await r._setRedirectUser(null,e)),a}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const a_=600*1e3;class c_{constructor(e){this.auth=e,this.cachedEventUids=new Set,this.consumers=new Set,this.queuedRedirectEvent=null,this.hasHandledPotentialRedirect=!1,this.lastProcessedEventTime=Date.now()}registerConsumer(e){this.consumers.add(e),this.queuedRedirectEvent&&this.isEventForConsumer(this.queuedRedirectEvent,e)&&(this.sendToConsumer(this.queuedRedirectEvent,e),this.saveEventToCache(this.queuedRedirectEvent),this.queuedRedirectEvent=null)}unregisterConsumer(e){this.consumers.delete(e)}onEvent(e){if(this.hasEventBeenHandled(e))return!1;let t=!1;return this.consumers.forEach(r=>{this.isEventForConsumer(e,r)&&(t=!0,this.sendToConsumer(e,r),this.saveEventToCache(e))}),this.hasHandledPotentialRedirect||!u_(e)||(this.hasHandledPotentialRedirect=!0,t||(this.queuedRedirectEvent=e,t=!0)),t}sendToConsumer(e,t){var r;if(e.error&&!ph(e)){const s=((r=e.error.code)===null||r===void 0?void 0:r.split("auth/")[1])||"internal-error";t.onError(Ke(this.auth,s))}else t.onAuthEvent(e)}isEventForConsumer(e,t){const r=t.eventId===null||!!e.eventId&&e.eventId===t.eventId;return t.filter.includes(e.type)&&r}hasEventBeenHandled(e){return Date.now()-this.lastProcessedEventTime>=a_&&this.cachedEventUids.clear(),this.cachedEventUids.has(cu(e))}saveEventToCache(e){this.cachedEventUids.add(cu(e)),this.lastProcessedEventTime=Date.now()}}function cu(n){return[n.type,n.eventId,n.sessionId,n.tenantId].filter(e=>e).join("-")}function ph({type:n,error:e}){return n==="unknown"&&(e==null?void 0:e.code)==="auth/no-auth-event"}function u_(n){switch(n.type){case"signInViaRedirect":case"linkViaRedirect":case"reauthViaRedirect":return!0;case"unknown":return ph(n);default:return!1}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function l_(n,e={}){return gt(n,"GET","/v1/projects",e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const h_=/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,d_=/^https?/;async function f_(n){if(n.config.emulator)return;const{authorizedDomains:e}=await l_(n);for(const t of e)try{if(p_(t))return}catch{}qe(n,"unauthorized-domain")}function p_(n){const e=co(),{protocol:t,hostname:r}=new URL(e);if(n.startsWith("chrome-extension://")){const a=new URL(n);return a.hostname===""&&r===""?t==="chrome-extension:"&&n.replace("chrome-extension://","")===e.replace("chrome-extension://",""):t==="chrome-extension:"&&a.hostname===r}if(!d_.test(t))return!1;if(h_.test(n))return r===n;const s=n.replace(/\./g,"\\.");return new RegExp("^(.+\\."+s+"|"+s+")$","i").test(r)}/**
 * @license
 * Copyright 2020 Google LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const m_=new Pr(3e4,6e4);function uu(){const n=Qe().___jsl;if(n!=null&&n.H){for(const e of Object.keys(n.H))if(n.H[e].r=n.H[e].r||[],n.H[e].L=n.H[e].L||[],n.H[e].r=[...n.H[e].L],n.CP)for(let t=0;t<n.CP.length;t++)n.CP[t]=null}}function g_(n){return new Promise((e,t)=>{var r,s,i;function a(){uu(),gapi.load("gapi.iframes",{callback:()=>{e(gapi.iframes.getContext())},ontimeout:()=>{uu(),t(Ke(n,"network-request-failed"))},timeout:m_.get()})}if(!((s=(r=Qe().gapi)===null||r===void 0?void 0:r.iframes)===null||s===void 0)&&s.Iframe)e(gapi.iframes.getContext());else if(!((i=Qe().gapi)===null||i===void 0)&&i.load)a();else{const c=lg("iframefcb");return Qe()[c]=()=>{gapi.load?a():t(Ke(n,"network-request-failed"))},Yl(`${ug()}?onload=${c}`).catch(l=>t(l))}}).catch(e=>{throw _s=null,e})}let _s=null;function __(n){return _s=_s||g_(n),_s}/**
 * @license
 * Copyright 2020 Google LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const y_=new Pr(5e3,15e3),E_="__/auth/iframe",v_="emulator/auth/iframe",T_={style:{position:"absolute",top:"-100px",width:"1px",height:"1px"},"aria-hidden":"true",tabindex:"-1"},I_=new Map([["identitytoolkit.googleapis.com","p"],["staging-identitytoolkit.sandbox.googleapis.com","s"],["test-identitytoolkit.sandbox.googleapis.com","t"]]);function w_(n){const e=n.config;M(e.authDomain,n,"auth-domain-config-required");const t=e.emulator?Bo(e,v_):`https://${n.config.authDomain}/${E_}`,r={apiKey:e.apiKey,appName:n.name,v:rn},s=I_.get(n.config.apiHost);s&&(r.eid=s);const i=n._getFrameworks();return i.length&&(r.fw=i.join(",")),`${t}?${Sr(r).slice(1)}`}async function A_(n){const e=await __(n),t=Qe().gapi;return M(t,n,"internal-error"),e.open({where:document.body,url:w_(n),messageHandlersFilter:t.iframes.CROSS_ORIGIN_IFRAMES_FILTER,attributes:T_,dontclear:!0},r=>new Promise(async(s,i)=>{await r.restyle({setHideOnLeave:!1});const a=Ke(n,"network-request-failed"),c=Qe().setTimeout(()=>{i(a)},y_.get());function l(){Qe().clearTimeout(c),s(r)}r.ping(l).then(l,()=>{i(a)})}))}/**
 * @license
 * Copyright 2020 Google LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const R_={location:"yes",resizable:"yes",statusbar:"yes",toolbar:"no"},b_=500,S_=600,P_="_blank",C_="http://localhost";class lu{constructor(e){this.window=e,this.associatedEvent=null}close(){if(this.window)try{this.window.close()}catch{}}}function k_(n,e,t,r=b_,s=S_){const i=Math.max((window.screen.availHeight-s)/2,0).toString(),a=Math.max((window.screen.availWidth-r)/2,0).toString();let c="";const l=Object.assign(Object.assign({},R_),{width:r.toString(),height:s.toString(),top:i,left:a}),d=be().toLowerCase();t&&(c=Hl(d)?P_:t),$l(d)&&(e=e||C_,l.scrollbars="yes");const p=Object.entries(l).reduce((E,[b,C])=>`${E}${b}=${C},`,"");if(eg(d)&&c!=="_self")return D_(e||"",c),new lu(null);const m=window.open(e||"",c,p);M(m,n,"popup-blocked");try{m.focus()}catch{}return new lu(m)}function D_(n,e){const t=document.createElement("a");t.href=n,t.target=e;const r=document.createEvent("MouseEvent");r.initMouseEvent("click",!0,!0,window,1,0,0,0,0,!1,!1,!1,!1,1,null),t.dispatchEvent(r)}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const N_="__/auth/handler",V_="emulator/auth/handler",O_=encodeURIComponent("fac");async function hu(n,e,t,r,s,i){M(n.config.authDomain,n,"auth-domain-config-required"),M(n.config.apiKey,n,"invalid-api-key");const a={apiKey:n.config.apiKey,appName:n.name,authType:t,redirectUrl:r,v:rn,eventId:s};if(e instanceof th){e.setDefaultLanguage(n.languageCode),a.providerId=e.providerId||"",Tp(e.getCustomParameters())||(a.customParameters=JSON.stringify(e.getCustomParameters()));for(const[p,m]of Object.entries({}))a[p]=m}if(e instanceof kr){const p=e.getScopes().filter(m=>m!=="");p.length>0&&(a.scopes=p.join(","))}n.tenantId&&(a.tid=n.tenantId);const c=a;for(const p of Object.keys(c))c[p]===void 0&&delete c[p];const l=await n._getAppCheckToken(),d=l?`#${O_}=${encodeURIComponent(l)}`:"";return`${L_(n)}?${Sr(c).slice(1)}${d}`}function L_({config:n}){return n.emulator?Bo(n,V_):`https://${n.authDomain}/${N_}`}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Qi="webStorageSupport";class M_{constructor(){this.eventManagers={},this.iframes={},this.originValidationPromises={},this._redirectPersistence=ch,this._completeRedirectFn=o_,this._overrideRedirectResult=r_}async _openPopup(e,t,r,s){var i;dt((i=this.eventManagers[e._key()])===null||i===void 0?void 0:i.manager,"_initialize() not called before _openPopup()");const a=await hu(e,t,r,co(),s);return k_(e,a,Ho())}async _openRedirect(e,t,r,s){await this._originValidation(e);const i=await hu(e,t,r,co(),s);return Fg(i),new Promise(()=>{})}_initialize(e){const t=e._key();if(this.eventManagers[t]){const{manager:s,promise:i}=this.eventManagers[t];return s?Promise.resolve(s):(dt(i,"If manager is not set, promise should be"),i)}const r=this.initAndGetManager(e);return this.eventManagers[t]={promise:r},r.catch(()=>{delete this.eventManagers[t]}),r}async initAndGetManager(e){const t=await A_(e),r=new c_(e);return t.register("authEvent",s=>(M(s==null?void 0:s.authEvent,e,"invalid-auth-event"),{status:r.onEvent(s.authEvent)?"ACK":"ERROR"}),gapi.iframes.CROSS_ORIGIN_IFRAMES_FILTER),this.eventManagers[e._key()]={manager:r},this.iframes[e._key()]=t,r}_isIframeWebStorageSupported(e,t){this.iframes[e._key()].send(Qi,{type:Qi},s=>{var i;const a=(i=s==null?void 0:s[0])===null||i===void 0?void 0:i[Qi];a!==void 0&&t(!!a),qe(e,"internal-error")},gapi.iframes.CROSS_ORIGIN_IFRAMES_FILTER)}_originValidation(e){const t=e._key();return this.originValidationPromises[t]||(this.originValidationPromises[t]=f_(e)),this.originValidationPromises[t]}get _shouldInitProactively(){return Jl()||zl()||qo()}}const x_=M_;var du="@firebase/auth",fu="1.10.8";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class U_{constructor(e){this.auth=e,this.internalListeners=new Map}getUid(){var e;return this.assertAuthConfigured(),((e=this.auth.currentUser)===null||e===void 0?void 0:e.uid)||null}async getToken(e){return this.assertAuthConfigured(),await this.auth._initializationPromise,this.auth.currentUser?{accessToken:await this.auth.currentUser.getIdToken(e)}:null}addAuthTokenListener(e){if(this.assertAuthConfigured(),this.internalListeners.has(e))return;const t=this.auth.onIdTokenChanged(r=>{e((r==null?void 0:r.stsTokenManager.accessToken)||null)});this.internalListeners.set(e,t),this.updateProactiveRefresh()}removeAuthTokenListener(e){this.assertAuthConfigured();const t=this.internalListeners.get(e);t&&(this.internalListeners.delete(e),t(),this.updateProactiveRefresh())}assertAuthConfigured(){M(this.auth._initializationPromise,"dependent-sdk-initialized-before-auth")}updateProactiveRefresh(){this.internalListeners.size>0?this.auth._startProactiveRefresh():this.auth._stopProactiveRefresh()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function F_(n){switch(n){case"Node":return"node";case"ReactNative":return"rn";case"Worker":return"webworker";case"Cordova":return"cordova";case"WebExtension":return"web-extension";default:return}}function B_(n){Xt(new Nt("auth",(e,{options:t})=>{const r=e.getProvider("app").getImmediate(),s=e.getProvider("heartbeat"),i=e.getProvider("app-check-internal"),{apiKey:a,authDomain:c}=r.options;M(a&&!a.includes(":"),"invalid-api-key",{appName:r.name});const l={apiKey:a,authDomain:c,clientPlatform:n,apiHost:"identitytoolkit.googleapis.com",tokenApiHost:"securetoken.googleapis.com",apiScheme:"https",sdkClientVersion:Xl(n)},d=new og(r,s,i,l);return gg(d,t),d},"PUBLIC").setInstantiationMode("EXPLICIT").setInstanceCreatedCallback((e,t,r)=>{e.getProvider("auth-internal").initialize()})),Xt(new Nt("auth-internal",e=>{const t=sn(e.getProvider("auth").getImmediate());return(r=>new U_(r))(t)},"PRIVATE").setInstantiationMode("EXPLICIT")),Ge(du,fu,F_(n)),Ge(du,fu,"esm2017")}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const j_=300,q_=Pl("authIdTokenMaxAge")||j_;let pu=null;const $_=n=>async e=>{const t=e&&await e.getIdTokenResult(),r=t&&(new Date().getTime()-Date.parse(t.issuedAtTime))/1e3;if(r&&r>q_)return;const s=t==null?void 0:t.token;pu!==s&&(pu=s,await fetch(n,{method:s?"POST":"DELETE",headers:s?{Authorization:`Bearer ${s}`}:{}}))};function QI(n=xo()){const e=zs(n,"auth");if(e.isInitialized())return e.getImmediate();const t=mg(n,{popupRedirectResolver:x_,persistence:[Kg,Mg,ch]}),r=Pl("authTokenSyncURL");if(r&&typeof isSecureContext=="boolean"&&isSecureContext){const i=new URL(r,location.origin);if(location.origin===i.origin){const a=$_(i.toString());Vg(t,a,()=>a(t.currentUser)),Ng(t,c=>a(c))}}const s=Rl("auth");return s&&_g(t,`http://${s}`),t}function z_(){var n,e;return(e=(n=document.getElementsByTagName("head"))===null||n===void 0?void 0:n[0])!==null&&e!==void 0?e:document}ag({loadJS(n){return new Promise((e,t)=>{const r=document.createElement("script");r.setAttribute("src",n),r.onload=e,r.onerror=s=>{const i=Ke("internal-error");i.customData=s,t(i)},r.type="text/javascript",r.charset="UTF-8",z_().appendChild(r)})},gapiScript:"https://apis.google.com/js/api.js",recaptchaV2Script:"https://www.google.com/recaptcha/api.js",recaptchaEnterpriseScript:"https://www.google.com/recaptcha/enterprise.js?render="});B_("Browser");var mu=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{};/** @license
Copyright The Closure Library Authors.
SPDX-License-Identifier: Apache-2.0
*/var Ct,mh;(function(){var n;/** @license

 Copyright The Closure Library Authors.
 SPDX-License-Identifier: Apache-2.0
*/function e(T,g){function y(){}y.prototype=g.prototype,T.D=g.prototype,T.prototype=new y,T.prototype.constructor=T,T.C=function(v,I,A){for(var _=Array(arguments.length-2),tt=2;tt<arguments.length;tt++)_[tt-2]=arguments[tt];return g.prototype[I].apply(v,_)}}function t(){this.blockSize=-1}function r(){this.blockSize=-1,this.blockSize=64,this.g=Array(4),this.B=Array(this.blockSize),this.o=this.h=0,this.s()}e(r,t),r.prototype.s=function(){this.g[0]=1732584193,this.g[1]=4023233417,this.g[2]=2562383102,this.g[3]=271733878,this.o=this.h=0};function s(T,g,y){y||(y=0);var v=Array(16);if(typeof g=="string")for(var I=0;16>I;++I)v[I]=g.charCodeAt(y++)|g.charCodeAt(y++)<<8|g.charCodeAt(y++)<<16|g.charCodeAt(y++)<<24;else for(I=0;16>I;++I)v[I]=g[y++]|g[y++]<<8|g[y++]<<16|g[y++]<<24;g=T.g[0],y=T.g[1],I=T.g[2];var A=T.g[3],_=g+(A^y&(I^A))+v[0]+3614090360&4294967295;g=y+(_<<7&4294967295|_>>>25),_=A+(I^g&(y^I))+v[1]+3905402710&4294967295,A=g+(_<<12&4294967295|_>>>20),_=I+(y^A&(g^y))+v[2]+606105819&4294967295,I=A+(_<<17&4294967295|_>>>15),_=y+(g^I&(A^g))+v[3]+3250441966&4294967295,y=I+(_<<22&4294967295|_>>>10),_=g+(A^y&(I^A))+v[4]+4118548399&4294967295,g=y+(_<<7&4294967295|_>>>25),_=A+(I^g&(y^I))+v[5]+1200080426&4294967295,A=g+(_<<12&4294967295|_>>>20),_=I+(y^A&(g^y))+v[6]+2821735955&4294967295,I=A+(_<<17&4294967295|_>>>15),_=y+(g^I&(A^g))+v[7]+4249261313&4294967295,y=I+(_<<22&4294967295|_>>>10),_=g+(A^y&(I^A))+v[8]+1770035416&4294967295,g=y+(_<<7&4294967295|_>>>25),_=A+(I^g&(y^I))+v[9]+2336552879&4294967295,A=g+(_<<12&4294967295|_>>>20),_=I+(y^A&(g^y))+v[10]+4294925233&4294967295,I=A+(_<<17&4294967295|_>>>15),_=y+(g^I&(A^g))+v[11]+2304563134&4294967295,y=I+(_<<22&4294967295|_>>>10),_=g+(A^y&(I^A))+v[12]+1804603682&4294967295,g=y+(_<<7&4294967295|_>>>25),_=A+(I^g&(y^I))+v[13]+4254626195&4294967295,A=g+(_<<12&4294967295|_>>>20),_=I+(y^A&(g^y))+v[14]+2792965006&4294967295,I=A+(_<<17&4294967295|_>>>15),_=y+(g^I&(A^g))+v[15]+1236535329&4294967295,y=I+(_<<22&4294967295|_>>>10),_=g+(I^A&(y^I))+v[1]+4129170786&4294967295,g=y+(_<<5&4294967295|_>>>27),_=A+(y^I&(g^y))+v[6]+3225465664&4294967295,A=g+(_<<9&4294967295|_>>>23),_=I+(g^y&(A^g))+v[11]+643717713&4294967295,I=A+(_<<14&4294967295|_>>>18),_=y+(A^g&(I^A))+v[0]+3921069994&4294967295,y=I+(_<<20&4294967295|_>>>12),_=g+(I^A&(y^I))+v[5]+3593408605&4294967295,g=y+(_<<5&4294967295|_>>>27),_=A+(y^I&(g^y))+v[10]+38016083&4294967295,A=g+(_<<9&4294967295|_>>>23),_=I+(g^y&(A^g))+v[15]+3634488961&4294967295,I=A+(_<<14&4294967295|_>>>18),_=y+(A^g&(I^A))+v[4]+3889429448&4294967295,y=I+(_<<20&4294967295|_>>>12),_=g+(I^A&(y^I))+v[9]+568446438&4294967295,g=y+(_<<5&4294967295|_>>>27),_=A+(y^I&(g^y))+v[14]+3275163606&4294967295,A=g+(_<<9&4294967295|_>>>23),_=I+(g^y&(A^g))+v[3]+4107603335&4294967295,I=A+(_<<14&4294967295|_>>>18),_=y+(A^g&(I^A))+v[8]+1163531501&4294967295,y=I+(_<<20&4294967295|_>>>12),_=g+(I^A&(y^I))+v[13]+2850285829&4294967295,g=y+(_<<5&4294967295|_>>>27),_=A+(y^I&(g^y))+v[2]+4243563512&4294967295,A=g+(_<<9&4294967295|_>>>23),_=I+(g^y&(A^g))+v[7]+1735328473&4294967295,I=A+(_<<14&4294967295|_>>>18),_=y+(A^g&(I^A))+v[12]+2368359562&4294967295,y=I+(_<<20&4294967295|_>>>12),_=g+(y^I^A)+v[5]+4294588738&4294967295,g=y+(_<<4&4294967295|_>>>28),_=A+(g^y^I)+v[8]+2272392833&4294967295,A=g+(_<<11&4294967295|_>>>21),_=I+(A^g^y)+v[11]+1839030562&4294967295,I=A+(_<<16&4294967295|_>>>16),_=y+(I^A^g)+v[14]+4259657740&4294967295,y=I+(_<<23&4294967295|_>>>9),_=g+(y^I^A)+v[1]+2763975236&4294967295,g=y+(_<<4&4294967295|_>>>28),_=A+(g^y^I)+v[4]+1272893353&4294967295,A=g+(_<<11&4294967295|_>>>21),_=I+(A^g^y)+v[7]+4139469664&4294967295,I=A+(_<<16&4294967295|_>>>16),_=y+(I^A^g)+v[10]+3200236656&4294967295,y=I+(_<<23&4294967295|_>>>9),_=g+(y^I^A)+v[13]+681279174&4294967295,g=y+(_<<4&4294967295|_>>>28),_=A+(g^y^I)+v[0]+3936430074&4294967295,A=g+(_<<11&4294967295|_>>>21),_=I+(A^g^y)+v[3]+3572445317&4294967295,I=A+(_<<16&4294967295|_>>>16),_=y+(I^A^g)+v[6]+76029189&4294967295,y=I+(_<<23&4294967295|_>>>9),_=g+(y^I^A)+v[9]+3654602809&4294967295,g=y+(_<<4&4294967295|_>>>28),_=A+(g^y^I)+v[12]+3873151461&4294967295,A=g+(_<<11&4294967295|_>>>21),_=I+(A^g^y)+v[15]+530742520&4294967295,I=A+(_<<16&4294967295|_>>>16),_=y+(I^A^g)+v[2]+3299628645&4294967295,y=I+(_<<23&4294967295|_>>>9),_=g+(I^(y|~A))+v[0]+4096336452&4294967295,g=y+(_<<6&4294967295|_>>>26),_=A+(y^(g|~I))+v[7]+1126891415&4294967295,A=g+(_<<10&4294967295|_>>>22),_=I+(g^(A|~y))+v[14]+2878612391&4294967295,I=A+(_<<15&4294967295|_>>>17),_=y+(A^(I|~g))+v[5]+4237533241&4294967295,y=I+(_<<21&4294967295|_>>>11),_=g+(I^(y|~A))+v[12]+1700485571&4294967295,g=y+(_<<6&4294967295|_>>>26),_=A+(y^(g|~I))+v[3]+2399980690&4294967295,A=g+(_<<10&4294967295|_>>>22),_=I+(g^(A|~y))+v[10]+4293915773&4294967295,I=A+(_<<15&4294967295|_>>>17),_=y+(A^(I|~g))+v[1]+2240044497&4294967295,y=I+(_<<21&4294967295|_>>>11),_=g+(I^(y|~A))+v[8]+1873313359&4294967295,g=y+(_<<6&4294967295|_>>>26),_=A+(y^(g|~I))+v[15]+4264355552&4294967295,A=g+(_<<10&4294967295|_>>>22),_=I+(g^(A|~y))+v[6]+2734768916&4294967295,I=A+(_<<15&4294967295|_>>>17),_=y+(A^(I|~g))+v[13]+1309151649&4294967295,y=I+(_<<21&4294967295|_>>>11),_=g+(I^(y|~A))+v[4]+4149444226&4294967295,g=y+(_<<6&4294967295|_>>>26),_=A+(y^(g|~I))+v[11]+3174756917&4294967295,A=g+(_<<10&4294967295|_>>>22),_=I+(g^(A|~y))+v[2]+718787259&4294967295,I=A+(_<<15&4294967295|_>>>17),_=y+(A^(I|~g))+v[9]+3951481745&4294967295,T.g[0]=T.g[0]+g&4294967295,T.g[1]=T.g[1]+(I+(_<<21&4294967295|_>>>11))&4294967295,T.g[2]=T.g[2]+I&4294967295,T.g[3]=T.g[3]+A&4294967295}r.prototype.u=function(T,g){g===void 0&&(g=T.length);for(var y=g-this.blockSize,v=this.B,I=this.h,A=0;A<g;){if(I==0)for(;A<=y;)s(this,T,A),A+=this.blockSize;if(typeof T=="string"){for(;A<g;)if(v[I++]=T.charCodeAt(A++),I==this.blockSize){s(this,v),I=0;break}}else for(;A<g;)if(v[I++]=T[A++],I==this.blockSize){s(this,v),I=0;break}}this.h=I,this.o+=g},r.prototype.v=function(){var T=Array((56>this.h?this.blockSize:2*this.blockSize)-this.h);T[0]=128;for(var g=1;g<T.length-8;++g)T[g]=0;var y=8*this.o;for(g=T.length-8;g<T.length;++g)T[g]=y&255,y/=256;for(this.u(T),T=Array(16),g=y=0;4>g;++g)for(var v=0;32>v;v+=8)T[y++]=this.g[g]>>>v&255;return T};function i(T,g){var y=c;return Object.prototype.hasOwnProperty.call(y,T)?y[T]:y[T]=g(T)}function a(T,g){this.h=g;for(var y=[],v=!0,I=T.length-1;0<=I;I--){var A=T[I]|0;v&&A==g||(y[I]=A,v=!1)}this.g=y}var c={};function l(T){return-128<=T&&128>T?i(T,function(g){return new a([g|0],0>g?-1:0)}):new a([T|0],0>T?-1:0)}function d(T){if(isNaN(T)||!isFinite(T))return m;if(0>T)return k(d(-T));for(var g=[],y=1,v=0;T>=y;v++)g[v]=T/y|0,y*=4294967296;return new a(g,0)}function p(T,g){if(T.length==0)throw Error("number format error: empty string");if(g=g||10,2>g||36<g)throw Error("radix out of range: "+g);if(T.charAt(0)=="-")return k(p(T.substring(1),g));if(0<=T.indexOf("-"))throw Error('number format error: interior "-" character');for(var y=d(Math.pow(g,8)),v=m,I=0;I<T.length;I+=8){var A=Math.min(8,T.length-I),_=parseInt(T.substring(I,I+A),g);8>A?(A=d(Math.pow(g,A)),v=v.j(A).add(d(_))):(v=v.j(y),v=v.add(d(_)))}return v}var m=l(0),E=l(1),b=l(16777216);n=a.prototype,n.m=function(){if(V(this))return-k(this).m();for(var T=0,g=1,y=0;y<this.g.length;y++){var v=this.i(y);T+=(0<=v?v:4294967296+v)*g,g*=4294967296}return T},n.toString=function(T){if(T=T||10,2>T||36<T)throw Error("radix out of range: "+T);if(C(this))return"0";if(V(this))return"-"+k(this).toString(T);for(var g=d(Math.pow(T,6)),y=this,v="";;){var I=z(y,g).g;y=q(y,I.j(g));var A=((0<y.g.length?y.g[0]:y.h)>>>0).toString(T);if(y=I,C(y))return A+v;for(;6>A.length;)A="0"+A;v=A+v}},n.i=function(T){return 0>T?0:T<this.g.length?this.g[T]:this.h};function C(T){if(T.h!=0)return!1;for(var g=0;g<T.g.length;g++)if(T.g[g]!=0)return!1;return!0}function V(T){return T.h==-1}n.l=function(T){return T=q(this,T),V(T)?-1:C(T)?0:1};function k(T){for(var g=T.g.length,y=[],v=0;v<g;v++)y[v]=~T.g[v];return new a(y,~T.h).add(E)}n.abs=function(){return V(this)?k(this):this},n.add=function(T){for(var g=Math.max(this.g.length,T.g.length),y=[],v=0,I=0;I<=g;I++){var A=v+(this.i(I)&65535)+(T.i(I)&65535),_=(A>>>16)+(this.i(I)>>>16)+(T.i(I)>>>16);v=_>>>16,A&=65535,_&=65535,y[I]=_<<16|A}return new a(y,y[y.length-1]&-2147483648?-1:0)};function q(T,g){return T.add(k(g))}n.j=function(T){if(C(this)||C(T))return m;if(V(this))return V(T)?k(this).j(k(T)):k(k(this).j(T));if(V(T))return k(this.j(k(T)));if(0>this.l(b)&&0>T.l(b))return d(this.m()*T.m());for(var g=this.g.length+T.g.length,y=[],v=0;v<2*g;v++)y[v]=0;for(v=0;v<this.g.length;v++)for(var I=0;I<T.g.length;I++){var A=this.i(v)>>>16,_=this.i(v)&65535,tt=T.i(I)>>>16,jn=T.i(I)&65535;y[2*v+2*I]+=_*jn,U(y,2*v+2*I),y[2*v+2*I+1]+=A*jn,U(y,2*v+2*I+1),y[2*v+2*I+1]+=_*tt,U(y,2*v+2*I+1),y[2*v+2*I+2]+=A*tt,U(y,2*v+2*I+2)}for(v=0;v<g;v++)y[v]=y[2*v+1]<<16|y[2*v];for(v=g;v<2*g;v++)y[v]=0;return new a(y,0)};function U(T,g){for(;(T[g]&65535)!=T[g];)T[g+1]+=T[g]>>>16,T[g]&=65535,g++}function F(T,g){this.g=T,this.h=g}function z(T,g){if(C(g))throw Error("division by zero");if(C(T))return new F(m,m);if(V(T))return g=z(k(T),g),new F(k(g.g),k(g.h));if(V(g))return g=z(T,k(g)),new F(k(g.g),g.h);if(30<T.g.length){if(V(T)||V(g))throw Error("slowDivide_ only works with positive integers.");for(var y=E,v=g;0>=v.l(T);)y=me(y),v=me(v);var I=ee(y,1),A=ee(v,1);for(v=ee(v,2),y=ee(y,2);!C(v);){var _=A.add(v);0>=_.l(T)&&(I=I.add(y),A=_),v=ee(v,1),y=ee(y,1)}return g=q(T,I.j(g)),new F(I,g)}for(I=m;0<=T.l(g);){for(y=Math.max(1,Math.floor(T.m()/g.m())),v=Math.ceil(Math.log(y)/Math.LN2),v=48>=v?1:Math.pow(2,v-48),A=d(y),_=A.j(g);V(_)||0<_.l(T);)y-=v,A=d(y),_=A.j(g);C(A)&&(A=E),I=I.add(A),T=q(T,_)}return new F(I,T)}n.A=function(T){return z(this,T).h},n.and=function(T){for(var g=Math.max(this.g.length,T.g.length),y=[],v=0;v<g;v++)y[v]=this.i(v)&T.i(v);return new a(y,this.h&T.h)},n.or=function(T){for(var g=Math.max(this.g.length,T.g.length),y=[],v=0;v<g;v++)y[v]=this.i(v)|T.i(v);return new a(y,this.h|T.h)},n.xor=function(T){for(var g=Math.max(this.g.length,T.g.length),y=[],v=0;v<g;v++)y[v]=this.i(v)^T.i(v);return new a(y,this.h^T.h)};function me(T){for(var g=T.g.length+1,y=[],v=0;v<g;v++)y[v]=T.i(v)<<1|T.i(v-1)>>>31;return new a(y,T.h)}function ee(T,g){var y=g>>5;g%=32;for(var v=T.g.length-y,I=[],A=0;A<v;A++)I[A]=0<g?T.i(A+y)>>>g|T.i(A+y+1)<<32-g:T.i(A+y);return new a(I,T.h)}r.prototype.digest=r.prototype.v,r.prototype.reset=r.prototype.s,r.prototype.update=r.prototype.u,mh=r,a.prototype.add=a.prototype.add,a.prototype.multiply=a.prototype.j,a.prototype.modulo=a.prototype.A,a.prototype.compare=a.prototype.l,a.prototype.toNumber=a.prototype.m,a.prototype.toString=a.prototype.toString,a.prototype.getBits=a.prototype.i,a.fromNumber=d,a.fromString=p,Ct=a}).apply(typeof mu<"u"?mu:typeof self<"u"?self:typeof window<"u"?window:{});var as=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{};/** @license
Copyright The Closure Library Authors.
SPDX-License-Identifier: Apache-2.0
*/var gh,ar,_h,ys,fo,yh,Eh,vh;(function(){var n,e=typeof Object.defineProperties=="function"?Object.defineProperty:function(o,u,h){return o==Array.prototype||o==Object.prototype||(o[u]=h.value),o};function t(o){o=[typeof globalThis=="object"&&globalThis,o,typeof window=="object"&&window,typeof self=="object"&&self,typeof as=="object"&&as];for(var u=0;u<o.length;++u){var h=o[u];if(h&&h.Math==Math)return h}throw Error("Cannot find global object")}var r=t(this);function s(o,u){if(u)e:{var h=r;o=o.split(".");for(var f=0;f<o.length-1;f++){var w=o[f];if(!(w in h))break e;h=h[w]}o=o[o.length-1],f=h[o],u=u(f),u!=f&&u!=null&&e(h,o,{configurable:!0,writable:!0,value:u})}}function i(o,u){o instanceof String&&(o+="");var h=0,f=!1,w={next:function(){if(!f&&h<o.length){var R=h++;return{value:u(R,o[R]),done:!1}}return f=!0,{done:!0,value:void 0}}};return w[Symbol.iterator]=function(){return w},w}s("Array.prototype.values",function(o){return o||function(){return i(this,function(u,h){return h})}});/** @license

 Copyright The Closure Library Authors.
 SPDX-License-Identifier: Apache-2.0
*/var a=a||{},c=this||self;function l(o){var u=typeof o;return u=u!="object"?u:o?Array.isArray(o)?"array":u:"null",u=="array"||u=="object"&&typeof o.length=="number"}function d(o){var u=typeof o;return u=="object"&&o!=null||u=="function"}function p(o,u,h){return o.call.apply(o.bind,arguments)}function m(o,u,h){if(!o)throw Error();if(2<arguments.length){var f=Array.prototype.slice.call(arguments,2);return function(){var w=Array.prototype.slice.call(arguments);return Array.prototype.unshift.apply(w,f),o.apply(u,w)}}return function(){return o.apply(u,arguments)}}function E(o,u,h){return E=Function.prototype.bind&&Function.prototype.bind.toString().indexOf("native code")!=-1?p:m,E.apply(null,arguments)}function b(o,u){var h=Array.prototype.slice.call(arguments,1);return function(){var f=h.slice();return f.push.apply(f,arguments),o.apply(this,f)}}function C(o,u){function h(){}h.prototype=u.prototype,o.aa=u.prototype,o.prototype=new h,o.prototype.constructor=o,o.Qb=function(f,w,R){for(var D=Array(arguments.length-2),X=2;X<arguments.length;X++)D[X-2]=arguments[X];return u.prototype[w].apply(f,D)}}function V(o){const u=o.length;if(0<u){const h=Array(u);for(let f=0;f<u;f++)h[f]=o[f];return h}return[]}function k(o,u){for(let h=1;h<arguments.length;h++){const f=arguments[h];if(l(f)){const w=o.length||0,R=f.length||0;o.length=w+R;for(let D=0;D<R;D++)o[w+D]=f[D]}else o.push(f)}}class q{constructor(u,h){this.i=u,this.j=h,this.h=0,this.g=null}get(){let u;return 0<this.h?(this.h--,u=this.g,this.g=u.next,u.next=null):u=this.i(),u}}function U(o){return/^[\s\xa0]*$/.test(o)}function F(){var o=c.navigator;return o&&(o=o.userAgent)?o:""}function z(o){return z[" "](o),o}z[" "]=function(){};var me=F().indexOf("Gecko")!=-1&&!(F().toLowerCase().indexOf("webkit")!=-1&&F().indexOf("Edge")==-1)&&!(F().indexOf("Trident")!=-1||F().indexOf("MSIE")!=-1)&&F().indexOf("Edge")==-1;function ee(o,u,h){for(const f in o)u.call(h,o[f],f,o)}function T(o,u){for(const h in o)u.call(void 0,o[h],h,o)}function g(o){const u={};for(const h in o)u[h]=o[h];return u}const y="constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" ");function v(o,u){let h,f;for(let w=1;w<arguments.length;w++){f=arguments[w];for(h in f)o[h]=f[h];for(let R=0;R<y.length;R++)h=y[R],Object.prototype.hasOwnProperty.call(f,h)&&(o[h]=f[h])}}function I(o){var u=1;o=o.split(":");const h=[];for(;0<u&&o.length;)h.push(o.shift()),u--;return o.length&&h.push(o.join(":")),h}function A(o){c.setTimeout(()=>{throw o},0)}function _(){var o=Ei;let u=null;return o.g&&(u=o.g,o.g=o.g.next,o.g||(o.h=null),u.next=null),u}class tt{constructor(){this.h=this.g=null}add(u,h){const f=jn.get();f.set(u,h),this.h?this.h.next=f:this.g=f,this.h=f}}var jn=new q(()=>new pf,o=>o.reset());class pf{constructor(){this.next=this.g=this.h=null}set(u,h){this.h=u,this.g=h,this.next=null}reset(){this.next=this.g=this.h=null}}let qn,$n=!1,Ei=new tt,xa=()=>{const o=c.Promise.resolve(void 0);qn=()=>{o.then(mf)}};var mf=()=>{for(var o;o=_();){try{o.h.call(o.g)}catch(h){A(h)}var u=jn;u.j(o),100>u.h&&(u.h++,o.next=u.g,u.g=o)}$n=!1};function _t(){this.s=this.s,this.C=this.C}_t.prototype.s=!1,_t.prototype.ma=function(){this.s||(this.s=!0,this.N())},_t.prototype.N=function(){if(this.C)for(;this.C.length;)this.C.shift()()};function ye(o,u){this.type=o,this.g=this.target=u,this.defaultPrevented=!1}ye.prototype.h=function(){this.defaultPrevented=!0};var gf=(function(){if(!c.addEventListener||!Object.defineProperty)return!1;var o=!1,u=Object.defineProperty({},"passive",{get:function(){o=!0}});try{const h=()=>{};c.addEventListener("test",h,u),c.removeEventListener("test",h,u)}catch{}return o})();function zn(o,u){if(ye.call(this,o?o.type:""),this.relatedTarget=this.g=this.target=null,this.button=this.screenY=this.screenX=this.clientY=this.clientX=0,this.key="",this.metaKey=this.shiftKey=this.altKey=this.ctrlKey=!1,this.state=null,this.pointerId=0,this.pointerType="",this.i=null,o){var h=this.type=o.type,f=o.changedTouches&&o.changedTouches.length?o.changedTouches[0]:null;if(this.target=o.target||o.srcElement,this.g=u,u=o.relatedTarget){if(me){e:{try{z(u.nodeName);var w=!0;break e}catch{}w=!1}w||(u=null)}}else h=="mouseover"?u=o.fromElement:h=="mouseout"&&(u=o.toElement);this.relatedTarget=u,f?(this.clientX=f.clientX!==void 0?f.clientX:f.pageX,this.clientY=f.clientY!==void 0?f.clientY:f.pageY,this.screenX=f.screenX||0,this.screenY=f.screenY||0):(this.clientX=o.clientX!==void 0?o.clientX:o.pageX,this.clientY=o.clientY!==void 0?o.clientY:o.pageY,this.screenX=o.screenX||0,this.screenY=o.screenY||0),this.button=o.button,this.key=o.key||"",this.ctrlKey=o.ctrlKey,this.altKey=o.altKey,this.shiftKey=o.shiftKey,this.metaKey=o.metaKey,this.pointerId=o.pointerId||0,this.pointerType=typeof o.pointerType=="string"?o.pointerType:_f[o.pointerType]||"",this.state=o.state,this.i=o,o.defaultPrevented&&zn.aa.h.call(this)}}C(zn,ye);var _f={2:"touch",3:"pen",4:"mouse"};zn.prototype.h=function(){zn.aa.h.call(this);var o=this.i;o.preventDefault?o.preventDefault():o.returnValue=!1};var jr="closure_listenable_"+(1e6*Math.random()|0),yf=0;function Ef(o,u,h,f,w){this.listener=o,this.proxy=null,this.src=u,this.type=h,this.capture=!!f,this.ha=w,this.key=++yf,this.da=this.fa=!1}function qr(o){o.da=!0,o.listener=null,o.proxy=null,o.src=null,o.ha=null}function $r(o){this.src=o,this.g={},this.h=0}$r.prototype.add=function(o,u,h,f,w){var R=o.toString();o=this.g[R],o||(o=this.g[R]=[],this.h++);var D=Ti(o,u,f,w);return-1<D?(u=o[D],h||(u.fa=!1)):(u=new Ef(u,this.src,R,!!f,w),u.fa=h,o.push(u)),u};function vi(o,u){var h=u.type;if(h in o.g){var f=o.g[h],w=Array.prototype.indexOf.call(f,u,void 0),R;(R=0<=w)&&Array.prototype.splice.call(f,w,1),R&&(qr(u),o.g[h].length==0&&(delete o.g[h],o.h--))}}function Ti(o,u,h,f){for(var w=0;w<o.length;++w){var R=o[w];if(!R.da&&R.listener==u&&R.capture==!!h&&R.ha==f)return w}return-1}var Ii="closure_lm_"+(1e6*Math.random()|0),wi={};function Ua(o,u,h,f,w){if(Array.isArray(u)){for(var R=0;R<u.length;R++)Ua(o,u[R],h,f,w);return null}return h=ja(h),o&&o[jr]?o.K(u,h,d(f)?!!f.capture:!1,w):vf(o,u,h,!1,f,w)}function vf(o,u,h,f,w,R){if(!u)throw Error("Invalid event type");var D=d(w)?!!w.capture:!!w,X=Ri(o);if(X||(o[Ii]=X=new $r(o)),h=X.add(u,h,f,D,R),h.proxy)return h;if(f=Tf(),h.proxy=f,f.src=o,f.listener=h,o.addEventListener)gf||(w=D),w===void 0&&(w=!1),o.addEventListener(u.toString(),f,w);else if(o.attachEvent)o.attachEvent(Ba(u.toString()),f);else if(o.addListener&&o.removeListener)o.addListener(f);else throw Error("addEventListener and attachEvent are unavailable.");return h}function Tf(){function o(h){return u.call(o.src,o.listener,h)}const u=If;return o}function Fa(o,u,h,f,w){if(Array.isArray(u))for(var R=0;R<u.length;R++)Fa(o,u[R],h,f,w);else f=d(f)?!!f.capture:!!f,h=ja(h),o&&o[jr]?(o=o.i,u=String(u).toString(),u in o.g&&(R=o.g[u],h=Ti(R,h,f,w),-1<h&&(qr(R[h]),Array.prototype.splice.call(R,h,1),R.length==0&&(delete o.g[u],o.h--)))):o&&(o=Ri(o))&&(u=o.g[u.toString()],o=-1,u&&(o=Ti(u,h,f,w)),(h=-1<o?u[o]:null)&&Ai(h))}function Ai(o){if(typeof o!="number"&&o&&!o.da){var u=o.src;if(u&&u[jr])vi(u.i,o);else{var h=o.type,f=o.proxy;u.removeEventListener?u.removeEventListener(h,f,o.capture):u.detachEvent?u.detachEvent(Ba(h),f):u.addListener&&u.removeListener&&u.removeListener(f),(h=Ri(u))?(vi(h,o),h.h==0&&(h.src=null,u[Ii]=null)):qr(o)}}}function Ba(o){return o in wi?wi[o]:wi[o]="on"+o}function If(o,u){if(o.da)o=!0;else{u=new zn(u,this);var h=o.listener,f=o.ha||o.src;o.fa&&Ai(o),o=h.call(f,u)}return o}function Ri(o){return o=o[Ii],o instanceof $r?o:null}var bi="__closure_events_fn_"+(1e9*Math.random()>>>0);function ja(o){return typeof o=="function"?o:(o[bi]||(o[bi]=function(u){return o.handleEvent(u)}),o[bi])}function Ee(){_t.call(this),this.i=new $r(this),this.M=this,this.F=null}C(Ee,_t),Ee.prototype[jr]=!0,Ee.prototype.removeEventListener=function(o,u,h,f){Fa(this,o,u,h,f)};function Se(o,u){var h,f=o.F;if(f)for(h=[];f;f=f.F)h.push(f);if(o=o.M,f=u.type||u,typeof u=="string")u=new ye(u,o);else if(u instanceof ye)u.target=u.target||o;else{var w=u;u=new ye(f,o),v(u,w)}if(w=!0,h)for(var R=h.length-1;0<=R;R--){var D=u.g=h[R];w=zr(D,f,!0,u)&&w}if(D=u.g=o,w=zr(D,f,!0,u)&&w,w=zr(D,f,!1,u)&&w,h)for(R=0;R<h.length;R++)D=u.g=h[R],w=zr(D,f,!1,u)&&w}Ee.prototype.N=function(){if(Ee.aa.N.call(this),this.i){var o=this.i,u;for(u in o.g){for(var h=o.g[u],f=0;f<h.length;f++)qr(h[f]);delete o.g[u],o.h--}}this.F=null},Ee.prototype.K=function(o,u,h,f){return this.i.add(String(o),u,!1,h,f)},Ee.prototype.L=function(o,u,h,f){return this.i.add(String(o),u,!0,h,f)};function zr(o,u,h,f){if(u=o.i.g[String(u)],!u)return!0;u=u.concat();for(var w=!0,R=0;R<u.length;++R){var D=u[R];if(D&&!D.da&&D.capture==h){var X=D.listener,ge=D.ha||D.src;D.fa&&vi(o.i,D),w=X.call(ge,f)!==!1&&w}}return w&&!f.defaultPrevented}function qa(o,u,h){if(typeof o=="function")h&&(o=E(o,h));else if(o&&typeof o.handleEvent=="function")o=E(o.handleEvent,o);else throw Error("Invalid listener argument");return 2147483647<Number(u)?-1:c.setTimeout(o,u||0)}function $a(o){o.g=qa(()=>{o.g=null,o.i&&(o.i=!1,$a(o))},o.l);const u=o.h;o.h=null,o.m.apply(null,u)}class wf extends _t{constructor(u,h){super(),this.m=u,this.l=h,this.h=null,this.i=!1,this.g=null}j(u){this.h=arguments,this.g?this.i=!0:$a(this)}N(){super.N(),this.g&&(c.clearTimeout(this.g),this.g=null,this.i=!1,this.h=null)}}function Hn(o){_t.call(this),this.h=o,this.g={}}C(Hn,_t);var za=[];function Ha(o){ee(o.g,function(u,h){this.g.hasOwnProperty(h)&&Ai(u)},o),o.g={}}Hn.prototype.N=function(){Hn.aa.N.call(this),Ha(this)},Hn.prototype.handleEvent=function(){throw Error("EventHandler.handleEvent not implemented")};var Si=c.JSON.stringify,Af=c.JSON.parse,Rf=class{stringify(o){return c.JSON.stringify(o,void 0)}parse(o){return c.JSON.parse(o,void 0)}};function Pi(){}Pi.prototype.h=null;function Wa(o){return o.h||(o.h=o.i())}function Ga(){}var Wn={OPEN:"a",kb:"b",Ja:"c",wb:"d"};function Ci(){ye.call(this,"d")}C(Ci,ye);function ki(){ye.call(this,"c")}C(ki,ye);var zt={},Ka=null;function Hr(){return Ka=Ka||new Ee}zt.La="serverreachability";function Qa(o){ye.call(this,zt.La,o)}C(Qa,ye);function Gn(o){const u=Hr();Se(u,new Qa(u))}zt.STAT_EVENT="statevent";function Ja(o,u){ye.call(this,zt.STAT_EVENT,o),this.stat=u}C(Ja,ye);function Pe(o){const u=Hr();Se(u,new Ja(u,o))}zt.Ma="timingevent";function Xa(o,u){ye.call(this,zt.Ma,o),this.size=u}C(Xa,ye);function Kn(o,u){if(typeof o!="function")throw Error("Fn must not be null and must be a function");return c.setTimeout(function(){o()},u)}function Qn(){this.g=!0}Qn.prototype.xa=function(){this.g=!1};function bf(o,u,h,f,w,R){o.info(function(){if(o.g)if(R)for(var D="",X=R.split("&"),ge=0;ge<X.length;ge++){var K=X[ge].split("=");if(1<K.length){var ve=K[0];K=K[1];var Te=ve.split("_");D=2<=Te.length&&Te[1]=="type"?D+(ve+"="+K+"&"):D+(ve+"=redacted&")}}else D=null;else D=R;return"XMLHTTP REQ ("+f+") [attempt "+w+"]: "+u+`
`+h+`
`+D})}function Sf(o,u,h,f,w,R,D){o.info(function(){return"XMLHTTP RESP ("+f+") [ attempt "+w+"]: "+u+`
`+h+`
`+R+" "+D})}function ln(o,u,h,f){o.info(function(){return"XMLHTTP TEXT ("+u+"): "+Cf(o,h)+(f?" "+f:"")})}function Pf(o,u){o.info(function(){return"TIMEOUT: "+u})}Qn.prototype.info=function(){};function Cf(o,u){if(!o.g)return u;if(!u)return null;try{var h=JSON.parse(u);if(h){for(o=0;o<h.length;o++)if(Array.isArray(h[o])){var f=h[o];if(!(2>f.length)){var w=f[1];if(Array.isArray(w)&&!(1>w.length)){var R=w[0];if(R!="noop"&&R!="stop"&&R!="close")for(var D=1;D<w.length;D++)w[D]=""}}}}return Si(h)}catch{return u}}var Wr={NO_ERROR:0,gb:1,tb:2,sb:3,nb:4,rb:5,ub:6,Ia:7,TIMEOUT:8,xb:9},Ya={lb:"complete",Hb:"success",Ja:"error",Ia:"abort",zb:"ready",Ab:"readystatechange",TIMEOUT:"timeout",vb:"incrementaldata",yb:"progress",ob:"downloadprogress",Pb:"uploadprogress"},Di;function Gr(){}C(Gr,Pi),Gr.prototype.g=function(){return new XMLHttpRequest},Gr.prototype.i=function(){return{}},Di=new Gr;function yt(o,u,h,f){this.j=o,this.i=u,this.l=h,this.R=f||1,this.U=new Hn(this),this.I=45e3,this.H=null,this.o=!1,this.m=this.A=this.v=this.L=this.F=this.S=this.B=null,this.D=[],this.g=null,this.C=0,this.s=this.u=null,this.X=-1,this.J=!1,this.O=0,this.M=null,this.W=this.K=this.T=this.P=!1,this.h=new Za}function Za(){this.i=null,this.g="",this.h=!1}var ec={},Ni={};function Vi(o,u,h){o.L=1,o.v=Xr(nt(u)),o.m=h,o.P=!0,tc(o,null)}function tc(o,u){o.F=Date.now(),Kr(o),o.A=nt(o.v);var h=o.A,f=o.R;Array.isArray(f)||(f=[String(f)]),mc(h.i,"t",f),o.C=0,h=o.j.J,o.h=new Za,o.g=Vc(o.j,h?u:null,!o.m),0<o.O&&(o.M=new wf(E(o.Y,o,o.g),o.O)),u=o.U,h=o.g,f=o.ca;var w="readystatechange";Array.isArray(w)||(w&&(za[0]=w.toString()),w=za);for(var R=0;R<w.length;R++){var D=Ua(h,w[R],f||u.handleEvent,!1,u.h||u);if(!D)break;u.g[D.key]=D}u=o.H?g(o.H):{},o.m?(o.u||(o.u="POST"),u["Content-Type"]="application/x-www-form-urlencoded",o.g.ea(o.A,o.u,o.m,u)):(o.u="GET",o.g.ea(o.A,o.u,null,u)),Gn(),bf(o.i,o.u,o.A,o.l,o.R,o.m)}yt.prototype.ca=function(o){o=o.target;const u=this.M;u&&rt(o)==3?u.j():this.Y(o)},yt.prototype.Y=function(o){try{if(o==this.g)e:{const Te=rt(this.g);var u=this.g.Ba();const fn=this.g.Z();if(!(3>Te)&&(Te!=3||this.g&&(this.h.h||this.g.oa()||Ic(this.g)))){this.J||Te!=4||u==7||(u==8||0>=fn?Gn(3):Gn(2)),Oi(this);var h=this.g.Z();this.X=h;t:if(nc(this)){var f=Ic(this.g);o="";var w=f.length,R=rt(this.g)==4;if(!this.h.i){if(typeof TextDecoder>"u"){Ht(this),Jn(this);var D="";break t}this.h.i=new c.TextDecoder}for(u=0;u<w;u++)this.h.h=!0,o+=this.h.i.decode(f[u],{stream:!(R&&u==w-1)});f.length=0,this.h.g+=o,this.C=0,D=this.h.g}else D=this.g.oa();if(this.o=h==200,Sf(this.i,this.u,this.A,this.l,this.R,Te,h),this.o){if(this.T&&!this.K){t:{if(this.g){var X,ge=this.g;if((X=ge.g?ge.g.getResponseHeader("X-HTTP-Initial-Response"):null)&&!U(X)){var K=X;break t}}K=null}if(h=K)ln(this.i,this.l,h,"Initial handshake response via X-HTTP-Initial-Response"),this.K=!0,Li(this,h);else{this.o=!1,this.s=3,Pe(12),Ht(this),Jn(this);break e}}if(this.P){h=!0;let Ue;for(;!this.J&&this.C<D.length;)if(Ue=kf(this,D),Ue==Ni){Te==4&&(this.s=4,Pe(14),h=!1),ln(this.i,this.l,null,"[Incomplete Response]");break}else if(Ue==ec){this.s=4,Pe(15),ln(this.i,this.l,D,"[Invalid Chunk]"),h=!1;break}else ln(this.i,this.l,Ue,null),Li(this,Ue);if(nc(this)&&this.C!=0&&(this.h.g=this.h.g.slice(this.C),this.C=0),Te!=4||D.length!=0||this.h.h||(this.s=1,Pe(16),h=!1),this.o=this.o&&h,!h)ln(this.i,this.l,D,"[Invalid Chunked Response]"),Ht(this),Jn(this);else if(0<D.length&&!this.W){this.W=!0;var ve=this.j;ve.g==this&&ve.ba&&!ve.M&&(ve.j.info("Great, no buffering proxy detected. Bytes received: "+D.length),ji(ve),ve.M=!0,Pe(11))}}else ln(this.i,this.l,D,null),Li(this,D);Te==4&&Ht(this),this.o&&!this.J&&(Te==4?Cc(this.j,this):(this.o=!1,Kr(this)))}else Gf(this.g),h==400&&0<D.indexOf("Unknown SID")?(this.s=3,Pe(12)):(this.s=0,Pe(13)),Ht(this),Jn(this)}}}catch{}finally{}};function nc(o){return o.g?o.u=="GET"&&o.L!=2&&o.j.Ca:!1}function kf(o,u){var h=o.C,f=u.indexOf(`
`,h);return f==-1?Ni:(h=Number(u.substring(h,f)),isNaN(h)?ec:(f+=1,f+h>u.length?Ni:(u=u.slice(f,f+h),o.C=f+h,u)))}yt.prototype.cancel=function(){this.J=!0,Ht(this)};function Kr(o){o.S=Date.now()+o.I,rc(o,o.I)}function rc(o,u){if(o.B!=null)throw Error("WatchDog timer not null");o.B=Kn(E(o.ba,o),u)}function Oi(o){o.B&&(c.clearTimeout(o.B),o.B=null)}yt.prototype.ba=function(){this.B=null;const o=Date.now();0<=o-this.S?(Pf(this.i,this.A),this.L!=2&&(Gn(),Pe(17)),Ht(this),this.s=2,Jn(this)):rc(this,this.S-o)};function Jn(o){o.j.G==0||o.J||Cc(o.j,o)}function Ht(o){Oi(o);var u=o.M;u&&typeof u.ma=="function"&&u.ma(),o.M=null,Ha(o.U),o.g&&(u=o.g,o.g=null,u.abort(),u.ma())}function Li(o,u){try{var h=o.j;if(h.G!=0&&(h.g==o||Mi(h.h,o))){if(!o.K&&Mi(h.h,o)&&h.G==3){try{var f=h.Da.g.parse(u)}catch{f=null}if(Array.isArray(f)&&f.length==3){var w=f;if(w[0]==0){e:if(!h.u){if(h.g)if(h.g.F+3e3<o.F)rs(h),ts(h);else break e;Bi(h),Pe(18)}}else h.za=w[1],0<h.za-h.T&&37500>w[2]&&h.F&&h.v==0&&!h.C&&(h.C=Kn(E(h.Za,h),6e3));if(1>=oc(h.h)&&h.ca){try{h.ca()}catch{}h.ca=void 0}}else Gt(h,11)}else if((o.K||h.g==o)&&rs(h),!U(u))for(w=h.Da.g.parse(u),u=0;u<w.length;u++){let K=w[u];if(h.T=K[0],K=K[1],h.G==2)if(K[0]=="c"){h.K=K[1],h.ia=K[2];const ve=K[3];ve!=null&&(h.la=ve,h.j.info("VER="+h.la));const Te=K[4];Te!=null&&(h.Aa=Te,h.j.info("SVER="+h.Aa));const fn=K[5];fn!=null&&typeof fn=="number"&&0<fn&&(f=1.5*fn,h.L=f,h.j.info("backChannelRequestTimeoutMs_="+f)),f=h;const Ue=o.g;if(Ue){const is=Ue.g?Ue.g.getResponseHeader("X-Client-Wire-Protocol"):null;if(is){var R=f.h;R.g||is.indexOf("spdy")==-1&&is.indexOf("quic")==-1&&is.indexOf("h2")==-1||(R.j=R.l,R.g=new Set,R.h&&(xi(R,R.h),R.h=null))}if(f.D){const qi=Ue.g?Ue.g.getResponseHeader("X-HTTP-Session-Id"):null;qi&&(f.ya=qi,te(f.I,f.D,qi))}}h.G=3,h.l&&h.l.ua(),h.ba&&(h.R=Date.now()-o.F,h.j.info("Handshake RTT: "+h.R+"ms")),f=h;var D=o;if(f.qa=Nc(f,f.J?f.ia:null,f.W),D.K){ac(f.h,D);var X=D,ge=f.L;ge&&(X.I=ge),X.B&&(Oi(X),Kr(X)),f.g=D}else Sc(f);0<h.i.length&&ns(h)}else K[0]!="stop"&&K[0]!="close"||Gt(h,7);else h.G==3&&(K[0]=="stop"||K[0]=="close"?K[0]=="stop"?Gt(h,7):Fi(h):K[0]!="noop"&&h.l&&h.l.ta(K),h.v=0)}}Gn(4)}catch{}}var Df=class{constructor(o,u){this.g=o,this.map=u}};function sc(o){this.l=o||10,c.PerformanceNavigationTiming?(o=c.performance.getEntriesByType("navigation"),o=0<o.length&&(o[0].nextHopProtocol=="hq"||o[0].nextHopProtocol=="h2")):o=!!(c.chrome&&c.chrome.loadTimes&&c.chrome.loadTimes()&&c.chrome.loadTimes().wasFetchedViaSpdy),this.j=o?this.l:1,this.g=null,1<this.j&&(this.g=new Set),this.h=null,this.i=[]}function ic(o){return o.h?!0:o.g?o.g.size>=o.j:!1}function oc(o){return o.h?1:o.g?o.g.size:0}function Mi(o,u){return o.h?o.h==u:o.g?o.g.has(u):!1}function xi(o,u){o.g?o.g.add(u):o.h=u}function ac(o,u){o.h&&o.h==u?o.h=null:o.g&&o.g.has(u)&&o.g.delete(u)}sc.prototype.cancel=function(){if(this.i=cc(this),this.h)this.h.cancel(),this.h=null;else if(this.g&&this.g.size!==0){for(const o of this.g.values())o.cancel();this.g.clear()}};function cc(o){if(o.h!=null)return o.i.concat(o.h.D);if(o.g!=null&&o.g.size!==0){let u=o.i;for(const h of o.g.values())u=u.concat(h.D);return u}return V(o.i)}function Nf(o){if(o.V&&typeof o.V=="function")return o.V();if(typeof Map<"u"&&o instanceof Map||typeof Set<"u"&&o instanceof Set)return Array.from(o.values());if(typeof o=="string")return o.split("");if(l(o)){for(var u=[],h=o.length,f=0;f<h;f++)u.push(o[f]);return u}u=[],h=0;for(f in o)u[h++]=o[f];return u}function Vf(o){if(o.na&&typeof o.na=="function")return o.na();if(!o.V||typeof o.V!="function"){if(typeof Map<"u"&&o instanceof Map)return Array.from(o.keys());if(!(typeof Set<"u"&&o instanceof Set)){if(l(o)||typeof o=="string"){var u=[];o=o.length;for(var h=0;h<o;h++)u.push(h);return u}u=[],h=0;for(const f in o)u[h++]=f;return u}}}function uc(o,u){if(o.forEach&&typeof o.forEach=="function")o.forEach(u,void 0);else if(l(o)||typeof o=="string")Array.prototype.forEach.call(o,u,void 0);else for(var h=Vf(o),f=Nf(o),w=f.length,R=0;R<w;R++)u.call(void 0,f[R],h&&h[R],o)}var lc=RegExp("^(?:([^:/?#.]+):)?(?://(?:([^\\\\/?#]*)@)?([^\\\\/?#]*?)(?::([0-9]+))?(?=[\\\\/?#]|$))?([^?#]+)?(?:\\?([^#]*))?(?:#([\\s\\S]*))?$");function Of(o,u){if(o){o=o.split("&");for(var h=0;h<o.length;h++){var f=o[h].indexOf("="),w=null;if(0<=f){var R=o[h].substring(0,f);w=o[h].substring(f+1)}else R=o[h];u(R,w?decodeURIComponent(w.replace(/\+/g," ")):"")}}}function Wt(o){if(this.g=this.o=this.j="",this.s=null,this.m=this.l="",this.h=!1,o instanceof Wt){this.h=o.h,Qr(this,o.j),this.o=o.o,this.g=o.g,Jr(this,o.s),this.l=o.l;var u=o.i,h=new Zn;h.i=u.i,u.g&&(h.g=new Map(u.g),h.h=u.h),hc(this,h),this.m=o.m}else o&&(u=String(o).match(lc))?(this.h=!1,Qr(this,u[1]||"",!0),this.o=Xn(u[2]||""),this.g=Xn(u[3]||"",!0),Jr(this,u[4]),this.l=Xn(u[5]||"",!0),hc(this,u[6]||"",!0),this.m=Xn(u[7]||"")):(this.h=!1,this.i=new Zn(null,this.h))}Wt.prototype.toString=function(){var o=[],u=this.j;u&&o.push(Yn(u,dc,!0),":");var h=this.g;return(h||u=="file")&&(o.push("//"),(u=this.o)&&o.push(Yn(u,dc,!0),"@"),o.push(encodeURIComponent(String(h)).replace(/%25([0-9a-fA-F]{2})/g,"%$1")),h=this.s,h!=null&&o.push(":",String(h))),(h=this.l)&&(this.g&&h.charAt(0)!="/"&&o.push("/"),o.push(Yn(h,h.charAt(0)=="/"?xf:Mf,!0))),(h=this.i.toString())&&o.push("?",h),(h=this.m)&&o.push("#",Yn(h,Ff)),o.join("")};function nt(o){return new Wt(o)}function Qr(o,u,h){o.j=h?Xn(u,!0):u,o.j&&(o.j=o.j.replace(/:$/,""))}function Jr(o,u){if(u){if(u=Number(u),isNaN(u)||0>u)throw Error("Bad port number "+u);o.s=u}else o.s=null}function hc(o,u,h){u instanceof Zn?(o.i=u,Bf(o.i,o.h)):(h||(u=Yn(u,Uf)),o.i=new Zn(u,o.h))}function te(o,u,h){o.i.set(u,h)}function Xr(o){return te(o,"zx",Math.floor(2147483648*Math.random()).toString(36)+Math.abs(Math.floor(2147483648*Math.random())^Date.now()).toString(36)),o}function Xn(o,u){return o?u?decodeURI(o.replace(/%25/g,"%2525")):decodeURIComponent(o):""}function Yn(o,u,h){return typeof o=="string"?(o=encodeURI(o).replace(u,Lf),h&&(o=o.replace(/%25([0-9a-fA-F]{2})/g,"%$1")),o):null}function Lf(o){return o=o.charCodeAt(0),"%"+(o>>4&15).toString(16)+(o&15).toString(16)}var dc=/[#\/\?@]/g,Mf=/[#\?:]/g,xf=/[#\?]/g,Uf=/[#\?@]/g,Ff=/#/g;function Zn(o,u){this.h=this.g=null,this.i=o||null,this.j=!!u}function Et(o){o.g||(o.g=new Map,o.h=0,o.i&&Of(o.i,function(u,h){o.add(decodeURIComponent(u.replace(/\+/g," ")),h)}))}n=Zn.prototype,n.add=function(o,u){Et(this),this.i=null,o=hn(this,o);var h=this.g.get(o);return h||this.g.set(o,h=[]),h.push(u),this.h+=1,this};function fc(o,u){Et(o),u=hn(o,u),o.g.has(u)&&(o.i=null,o.h-=o.g.get(u).length,o.g.delete(u))}function pc(o,u){return Et(o),u=hn(o,u),o.g.has(u)}n.forEach=function(o,u){Et(this),this.g.forEach(function(h,f){h.forEach(function(w){o.call(u,w,f,this)},this)},this)},n.na=function(){Et(this);const o=Array.from(this.g.values()),u=Array.from(this.g.keys()),h=[];for(let f=0;f<u.length;f++){const w=o[f];for(let R=0;R<w.length;R++)h.push(u[f])}return h},n.V=function(o){Et(this);let u=[];if(typeof o=="string")pc(this,o)&&(u=u.concat(this.g.get(hn(this,o))));else{o=Array.from(this.g.values());for(let h=0;h<o.length;h++)u=u.concat(o[h])}return u},n.set=function(o,u){return Et(this),this.i=null,o=hn(this,o),pc(this,o)&&(this.h-=this.g.get(o).length),this.g.set(o,[u]),this.h+=1,this},n.get=function(o,u){return o?(o=this.V(o),0<o.length?String(o[0]):u):u};function mc(o,u,h){fc(o,u),0<h.length&&(o.i=null,o.g.set(hn(o,u),V(h)),o.h+=h.length)}n.toString=function(){if(this.i)return this.i;if(!this.g)return"";const o=[],u=Array.from(this.g.keys());for(var h=0;h<u.length;h++){var f=u[h];const R=encodeURIComponent(String(f)),D=this.V(f);for(f=0;f<D.length;f++){var w=R;D[f]!==""&&(w+="="+encodeURIComponent(String(D[f]))),o.push(w)}}return this.i=o.join("&")};function hn(o,u){return u=String(u),o.j&&(u=u.toLowerCase()),u}function Bf(o,u){u&&!o.j&&(Et(o),o.i=null,o.g.forEach(function(h,f){var w=f.toLowerCase();f!=w&&(fc(this,f),mc(this,w,h))},o)),o.j=u}function jf(o,u){const h=new Qn;if(c.Image){const f=new Image;f.onload=b(vt,h,"TestLoadImage: loaded",!0,u,f),f.onerror=b(vt,h,"TestLoadImage: error",!1,u,f),f.onabort=b(vt,h,"TestLoadImage: abort",!1,u,f),f.ontimeout=b(vt,h,"TestLoadImage: timeout",!1,u,f),c.setTimeout(function(){f.ontimeout&&f.ontimeout()},1e4),f.src=o}else u(!1)}function qf(o,u){const h=new Qn,f=new AbortController,w=setTimeout(()=>{f.abort(),vt(h,"TestPingServer: timeout",!1,u)},1e4);fetch(o,{signal:f.signal}).then(R=>{clearTimeout(w),R.ok?vt(h,"TestPingServer: ok",!0,u):vt(h,"TestPingServer: server error",!1,u)}).catch(()=>{clearTimeout(w),vt(h,"TestPingServer: error",!1,u)})}function vt(o,u,h,f,w){try{w&&(w.onload=null,w.onerror=null,w.onabort=null,w.ontimeout=null),f(h)}catch{}}function $f(){this.g=new Rf}function zf(o,u,h){const f=h||"";try{uc(o,function(w,R){let D=w;d(w)&&(D=Si(w)),u.push(f+R+"="+encodeURIComponent(D))})}catch(w){throw u.push(f+"type="+encodeURIComponent("_badmap")),w}}function Yr(o){this.l=o.Ub||null,this.j=o.eb||!1}C(Yr,Pi),Yr.prototype.g=function(){return new Zr(this.l,this.j)},Yr.prototype.i=(function(o){return function(){return o}})({});function Zr(o,u){Ee.call(this),this.D=o,this.o=u,this.m=void 0,this.status=this.readyState=0,this.responseType=this.responseText=this.response=this.statusText="",this.onreadystatechange=null,this.u=new Headers,this.h=null,this.B="GET",this.A="",this.g=!1,this.v=this.j=this.l=null}C(Zr,Ee),n=Zr.prototype,n.open=function(o,u){if(this.readyState!=0)throw this.abort(),Error("Error reopening a connection");this.B=o,this.A=u,this.readyState=1,tr(this)},n.send=function(o){if(this.readyState!=1)throw this.abort(),Error("need to call open() first. ");this.g=!0;const u={headers:this.u,method:this.B,credentials:this.m,cache:void 0};o&&(u.body=o),(this.D||c).fetch(new Request(this.A,u)).then(this.Sa.bind(this),this.ga.bind(this))},n.abort=function(){this.response=this.responseText="",this.u=new Headers,this.status=0,this.j&&this.j.cancel("Request was aborted.").catch(()=>{}),1<=this.readyState&&this.g&&this.readyState!=4&&(this.g=!1,er(this)),this.readyState=0},n.Sa=function(o){if(this.g&&(this.l=o,this.h||(this.status=this.l.status,this.statusText=this.l.statusText,this.h=o.headers,this.readyState=2,tr(this)),this.g&&(this.readyState=3,tr(this),this.g)))if(this.responseType==="arraybuffer")o.arrayBuffer().then(this.Qa.bind(this),this.ga.bind(this));else if(typeof c.ReadableStream<"u"&&"body"in o){if(this.j=o.body.getReader(),this.o){if(this.responseType)throw Error('responseType must be empty for "streamBinaryChunks" mode responses.');this.response=[]}else this.response=this.responseText="",this.v=new TextDecoder;gc(this)}else o.text().then(this.Ra.bind(this),this.ga.bind(this))};function gc(o){o.j.read().then(o.Pa.bind(o)).catch(o.ga.bind(o))}n.Pa=function(o){if(this.g){if(this.o&&o.value)this.response.push(o.value);else if(!this.o){var u=o.value?o.value:new Uint8Array(0);(u=this.v.decode(u,{stream:!o.done}))&&(this.response=this.responseText+=u)}o.done?er(this):tr(this),this.readyState==3&&gc(this)}},n.Ra=function(o){this.g&&(this.response=this.responseText=o,er(this))},n.Qa=function(o){this.g&&(this.response=o,er(this))},n.ga=function(){this.g&&er(this)};function er(o){o.readyState=4,o.l=null,o.j=null,o.v=null,tr(o)}n.setRequestHeader=function(o,u){this.u.append(o,u)},n.getResponseHeader=function(o){return this.h&&this.h.get(o.toLowerCase())||""},n.getAllResponseHeaders=function(){if(!this.h)return"";const o=[],u=this.h.entries();for(var h=u.next();!h.done;)h=h.value,o.push(h[0]+": "+h[1]),h=u.next();return o.join(`\r
`)};function tr(o){o.onreadystatechange&&o.onreadystatechange.call(o)}Object.defineProperty(Zr.prototype,"withCredentials",{get:function(){return this.m==="include"},set:function(o){this.m=o?"include":"same-origin"}});function _c(o){let u="";return ee(o,function(h,f){u+=f,u+=":",u+=h,u+=`\r
`}),u}function Ui(o,u,h){e:{for(f in h){var f=!1;break e}f=!0}f||(h=_c(h),typeof o=="string"?h!=null&&encodeURIComponent(String(h)):te(o,u,h))}function se(o){Ee.call(this),this.headers=new Map,this.o=o||null,this.h=!1,this.v=this.g=null,this.D="",this.m=0,this.l="",this.j=this.B=this.u=this.A=!1,this.I=null,this.H="",this.J=!1}C(se,Ee);var Hf=/^https?$/i,Wf=["POST","PUT"];n=se.prototype,n.Ha=function(o){this.J=o},n.ea=function(o,u,h,f){if(this.g)throw Error("[goog.net.XhrIo] Object is active with another request="+this.D+"; newUri="+o);u=u?u.toUpperCase():"GET",this.D=o,this.l="",this.m=0,this.A=!1,this.h=!0,this.g=this.o?this.o.g():Di.g(),this.v=this.o?Wa(this.o):Wa(Di),this.g.onreadystatechange=E(this.Ea,this);try{this.B=!0,this.g.open(u,String(o),!0),this.B=!1}catch(R){yc(this,R);return}if(o=h||"",h=new Map(this.headers),f)if(Object.getPrototypeOf(f)===Object.prototype)for(var w in f)h.set(w,f[w]);else if(typeof f.keys=="function"&&typeof f.get=="function")for(const R of f.keys())h.set(R,f.get(R));else throw Error("Unknown input type for opt_headers: "+String(f));f=Array.from(h.keys()).find(R=>R.toLowerCase()=="content-type"),w=c.FormData&&o instanceof c.FormData,!(0<=Array.prototype.indexOf.call(Wf,u,void 0))||f||w||h.set("Content-Type","application/x-www-form-urlencoded;charset=utf-8");for(const[R,D]of h)this.g.setRequestHeader(R,D);this.H&&(this.g.responseType=this.H),"withCredentials"in this.g&&this.g.withCredentials!==this.J&&(this.g.withCredentials=this.J);try{Tc(this),this.u=!0,this.g.send(o),this.u=!1}catch(R){yc(this,R)}};function yc(o,u){o.h=!1,o.g&&(o.j=!0,o.g.abort(),o.j=!1),o.l=u,o.m=5,Ec(o),es(o)}function Ec(o){o.A||(o.A=!0,Se(o,"complete"),Se(o,"error"))}n.abort=function(o){this.g&&this.h&&(this.h=!1,this.j=!0,this.g.abort(),this.j=!1,this.m=o||7,Se(this,"complete"),Se(this,"abort"),es(this))},n.N=function(){this.g&&(this.h&&(this.h=!1,this.j=!0,this.g.abort(),this.j=!1),es(this,!0)),se.aa.N.call(this)},n.Ea=function(){this.s||(this.B||this.u||this.j?vc(this):this.bb())},n.bb=function(){vc(this)};function vc(o){if(o.h&&typeof a<"u"&&(!o.v[1]||rt(o)!=4||o.Z()!=2)){if(o.u&&rt(o)==4)qa(o.Ea,0,o);else if(Se(o,"readystatechange"),rt(o)==4){o.h=!1;try{const D=o.Z();e:switch(D){case 200:case 201:case 202:case 204:case 206:case 304:case 1223:var u=!0;break e;default:u=!1}var h;if(!(h=u)){var f;if(f=D===0){var w=String(o.D).match(lc)[1]||null;!w&&c.self&&c.self.location&&(w=c.self.location.protocol.slice(0,-1)),f=!Hf.test(w?w.toLowerCase():"")}h=f}if(h)Se(o,"complete"),Se(o,"success");else{o.m=6;try{var R=2<rt(o)?o.g.statusText:""}catch{R=""}o.l=R+" ["+o.Z()+"]",Ec(o)}}finally{es(o)}}}}function es(o,u){if(o.g){Tc(o);const h=o.g,f=o.v[0]?()=>{}:null;o.g=null,o.v=null,u||Se(o,"ready");try{h.onreadystatechange=f}catch{}}}function Tc(o){o.I&&(c.clearTimeout(o.I),o.I=null)}n.isActive=function(){return!!this.g};function rt(o){return o.g?o.g.readyState:0}n.Z=function(){try{return 2<rt(this)?this.g.status:-1}catch{return-1}},n.oa=function(){try{return this.g?this.g.responseText:""}catch{return""}},n.Oa=function(o){if(this.g){var u=this.g.responseText;return o&&u.indexOf(o)==0&&(u=u.substring(o.length)),Af(u)}};function Ic(o){try{if(!o.g)return null;if("response"in o.g)return o.g.response;switch(o.H){case"":case"text":return o.g.responseText;case"arraybuffer":if("mozResponseArrayBuffer"in o.g)return o.g.mozResponseArrayBuffer}return null}catch{return null}}function Gf(o){const u={};o=(o.g&&2<=rt(o)&&o.g.getAllResponseHeaders()||"").split(`\r
`);for(let f=0;f<o.length;f++){if(U(o[f]))continue;var h=I(o[f]);const w=h[0];if(h=h[1],typeof h!="string")continue;h=h.trim();const R=u[w]||[];u[w]=R,R.push(h)}T(u,function(f){return f.join(", ")})}n.Ba=function(){return this.m},n.Ka=function(){return typeof this.l=="string"?this.l:String(this.l)};function nr(o,u,h){return h&&h.internalChannelParams&&h.internalChannelParams[o]||u}function wc(o){this.Aa=0,this.i=[],this.j=new Qn,this.ia=this.qa=this.I=this.W=this.g=this.ya=this.D=this.H=this.m=this.S=this.o=null,this.Ya=this.U=0,this.Va=nr("failFast",!1,o),this.F=this.C=this.u=this.s=this.l=null,this.X=!0,this.za=this.T=-1,this.Y=this.v=this.B=0,this.Ta=nr("baseRetryDelayMs",5e3,o),this.cb=nr("retryDelaySeedMs",1e4,o),this.Wa=nr("forwardChannelMaxRetries",2,o),this.wa=nr("forwardChannelRequestTimeoutMs",2e4,o),this.pa=o&&o.xmlHttpFactory||void 0,this.Xa=o&&o.Tb||void 0,this.Ca=o&&o.useFetchStreams||!1,this.L=void 0,this.J=o&&o.supportsCrossDomainXhr||!1,this.K="",this.h=new sc(o&&o.concurrentRequestLimit),this.Da=new $f,this.P=o&&o.fastHandshake||!1,this.O=o&&o.encodeInitMessageHeaders||!1,this.P&&this.O&&(this.O=!1),this.Ua=o&&o.Rb||!1,o&&o.xa&&this.j.xa(),o&&o.forceLongPolling&&(this.X=!1),this.ba=!this.P&&this.X&&o&&o.detectBufferingProxy||!1,this.ja=void 0,o&&o.longPollingTimeout&&0<o.longPollingTimeout&&(this.ja=o.longPollingTimeout),this.ca=void 0,this.R=0,this.M=!1,this.ka=this.A=null}n=wc.prototype,n.la=8,n.G=1,n.connect=function(o,u,h,f){Pe(0),this.W=o,this.H=u||{},h&&f!==void 0&&(this.H.OSID=h,this.H.OAID=f),this.F=this.X,this.I=Nc(this,null,this.W),ns(this)};function Fi(o){if(Ac(o),o.G==3){var u=o.U++,h=nt(o.I);if(te(h,"SID",o.K),te(h,"RID",u),te(h,"TYPE","terminate"),rr(o,h),u=new yt(o,o.j,u),u.L=2,u.v=Xr(nt(h)),h=!1,c.navigator&&c.navigator.sendBeacon)try{h=c.navigator.sendBeacon(u.v.toString(),"")}catch{}!h&&c.Image&&(new Image().src=u.v,h=!0),h||(u.g=Vc(u.j,null),u.g.ea(u.v)),u.F=Date.now(),Kr(u)}Dc(o)}function ts(o){o.g&&(ji(o),o.g.cancel(),o.g=null)}function Ac(o){ts(o),o.u&&(c.clearTimeout(o.u),o.u=null),rs(o),o.h.cancel(),o.s&&(typeof o.s=="number"&&c.clearTimeout(o.s),o.s=null)}function ns(o){if(!ic(o.h)&&!o.s){o.s=!0;var u=o.Ga;qn||xa(),$n||(qn(),$n=!0),Ei.add(u,o),o.B=0}}function Kf(o,u){return oc(o.h)>=o.h.j-(o.s?1:0)?!1:o.s?(o.i=u.D.concat(o.i),!0):o.G==1||o.G==2||o.B>=(o.Va?0:o.Wa)?!1:(o.s=Kn(E(o.Ga,o,u),kc(o,o.B)),o.B++,!0)}n.Ga=function(o){if(this.s)if(this.s=null,this.G==1){if(!o){this.U=Math.floor(1e5*Math.random()),o=this.U++;const w=new yt(this,this.j,o);let R=this.o;if(this.S&&(R?(R=g(R),v(R,this.S)):R=this.S),this.m!==null||this.O||(w.H=R,R=null),this.P)e:{for(var u=0,h=0;h<this.i.length;h++){t:{var f=this.i[h];if("__data__"in f.map&&(f=f.map.__data__,typeof f=="string")){f=f.length;break t}f=void 0}if(f===void 0)break;if(u+=f,4096<u){u=h;break e}if(u===4096||h===this.i.length-1){u=h+1;break e}}u=1e3}else u=1e3;u=bc(this,w,u),h=nt(this.I),te(h,"RID",o),te(h,"CVER",22),this.D&&te(h,"X-HTTP-Session-Id",this.D),rr(this,h),R&&(this.O?u="headers="+encodeURIComponent(String(_c(R)))+"&"+u:this.m&&Ui(h,this.m,R)),xi(this.h,w),this.Ua&&te(h,"TYPE","init"),this.P?(te(h,"$req",u),te(h,"SID","null"),w.T=!0,Vi(w,h,null)):Vi(w,h,u),this.G=2}}else this.G==3&&(o?Rc(this,o):this.i.length==0||ic(this.h)||Rc(this))};function Rc(o,u){var h;u?h=u.l:h=o.U++;const f=nt(o.I);te(f,"SID",o.K),te(f,"RID",h),te(f,"AID",o.T),rr(o,f),o.m&&o.o&&Ui(f,o.m,o.o),h=new yt(o,o.j,h,o.B+1),o.m===null&&(h.H=o.o),u&&(o.i=u.D.concat(o.i)),u=bc(o,h,1e3),h.I=Math.round(.5*o.wa)+Math.round(.5*o.wa*Math.random()),xi(o.h,h),Vi(h,f,u)}function rr(o,u){o.H&&ee(o.H,function(h,f){te(u,f,h)}),o.l&&uc({},function(h,f){te(u,f,h)})}function bc(o,u,h){h=Math.min(o.i.length,h);var f=o.l?E(o.l.Na,o.l,o):null;e:{var w=o.i;let R=-1;for(;;){const D=["count="+h];R==-1?0<h?(R=w[0].g,D.push("ofs="+R)):R=0:D.push("ofs="+R);let X=!0;for(let ge=0;ge<h;ge++){let K=w[ge].g;const ve=w[ge].map;if(K-=R,0>K)R=Math.max(0,w[ge].g-100),X=!1;else try{zf(ve,D,"req"+K+"_")}catch{f&&f(ve)}}if(X){f=D.join("&");break e}}}return o=o.i.splice(0,h),u.D=o,f}function Sc(o){if(!o.g&&!o.u){o.Y=1;var u=o.Fa;qn||xa(),$n||(qn(),$n=!0),Ei.add(u,o),o.v=0}}function Bi(o){return o.g||o.u||3<=o.v?!1:(o.Y++,o.u=Kn(E(o.Fa,o),kc(o,o.v)),o.v++,!0)}n.Fa=function(){if(this.u=null,Pc(this),this.ba&&!(this.M||this.g==null||0>=this.R)){var o=2*this.R;this.j.info("BP detection timer enabled: "+o),this.A=Kn(E(this.ab,this),o)}},n.ab=function(){this.A&&(this.A=null,this.j.info("BP detection timeout reached."),this.j.info("Buffering proxy detected and switch to long-polling!"),this.F=!1,this.M=!0,Pe(10),ts(this),Pc(this))};function ji(o){o.A!=null&&(c.clearTimeout(o.A),o.A=null)}function Pc(o){o.g=new yt(o,o.j,"rpc",o.Y),o.m===null&&(o.g.H=o.o),o.g.O=0;var u=nt(o.qa);te(u,"RID","rpc"),te(u,"SID",o.K),te(u,"AID",o.T),te(u,"CI",o.F?"0":"1"),!o.F&&o.ja&&te(u,"TO",o.ja),te(u,"TYPE","xmlhttp"),rr(o,u),o.m&&o.o&&Ui(u,o.m,o.o),o.L&&(o.g.I=o.L);var h=o.g;o=o.ia,h.L=1,h.v=Xr(nt(u)),h.m=null,h.P=!0,tc(h,o)}n.Za=function(){this.C!=null&&(this.C=null,ts(this),Bi(this),Pe(19))};function rs(o){o.C!=null&&(c.clearTimeout(o.C),o.C=null)}function Cc(o,u){var h=null;if(o.g==u){rs(o),ji(o),o.g=null;var f=2}else if(Mi(o.h,u))h=u.D,ac(o.h,u),f=1;else return;if(o.G!=0){if(u.o)if(f==1){h=u.m?u.m.length:0,u=Date.now()-u.F;var w=o.B;f=Hr(),Se(f,new Xa(f,h)),ns(o)}else Sc(o);else if(w=u.s,w==3||w==0&&0<u.X||!(f==1&&Kf(o,u)||f==2&&Bi(o)))switch(h&&0<h.length&&(u=o.h,u.i=u.i.concat(h)),w){case 1:Gt(o,5);break;case 4:Gt(o,10);break;case 3:Gt(o,6);break;default:Gt(o,2)}}}function kc(o,u){let h=o.Ta+Math.floor(Math.random()*o.cb);return o.isActive()||(h*=2),h*u}function Gt(o,u){if(o.j.info("Error code "+u),u==2){var h=E(o.fb,o),f=o.Xa;const w=!f;f=new Wt(f||"//www.google.com/images/cleardot.gif"),c.location&&c.location.protocol=="http"||Qr(f,"https"),Xr(f),w?jf(f.toString(),h):qf(f.toString(),h)}else Pe(2);o.G=0,o.l&&o.l.sa(u),Dc(o),Ac(o)}n.fb=function(o){o?(this.j.info("Successfully pinged google.com"),Pe(2)):(this.j.info("Failed to ping google.com"),Pe(1))};function Dc(o){if(o.G=0,o.ka=[],o.l){const u=cc(o.h);(u.length!=0||o.i.length!=0)&&(k(o.ka,u),k(o.ka,o.i),o.h.i.length=0,V(o.i),o.i.length=0),o.l.ra()}}function Nc(o,u,h){var f=h instanceof Wt?nt(h):new Wt(h);if(f.g!="")u&&(f.g=u+"."+f.g),Jr(f,f.s);else{var w=c.location;f=w.protocol,u=u?u+"."+w.hostname:w.hostname,w=+w.port;var R=new Wt(null);f&&Qr(R,f),u&&(R.g=u),w&&Jr(R,w),h&&(R.l=h),f=R}return h=o.D,u=o.ya,h&&u&&te(f,h,u),te(f,"VER",o.la),rr(o,f),f}function Vc(o,u,h){if(u&&!o.J)throw Error("Can't create secondary domain capable XhrIo object.");return u=o.Ca&&!o.pa?new se(new Yr({eb:h})):new se(o.pa),u.Ha(o.J),u}n.isActive=function(){return!!this.l&&this.l.isActive(this)};function Oc(){}n=Oc.prototype,n.ua=function(){},n.ta=function(){},n.sa=function(){},n.ra=function(){},n.isActive=function(){return!0},n.Na=function(){};function ss(){}ss.prototype.g=function(o,u){return new Oe(o,u)};function Oe(o,u){Ee.call(this),this.g=new wc(u),this.l=o,this.h=u&&u.messageUrlParams||null,o=u&&u.messageHeaders||null,u&&u.clientProtocolHeaderRequired&&(o?o["X-Client-Protocol"]="webchannel":o={"X-Client-Protocol":"webchannel"}),this.g.o=o,o=u&&u.initMessageHeaders||null,u&&u.messageContentType&&(o?o["X-WebChannel-Content-Type"]=u.messageContentType:o={"X-WebChannel-Content-Type":u.messageContentType}),u&&u.va&&(o?o["X-WebChannel-Client-Profile"]=u.va:o={"X-WebChannel-Client-Profile":u.va}),this.g.S=o,(o=u&&u.Sb)&&!U(o)&&(this.g.m=o),this.v=u&&u.supportsCrossDomainXhr||!1,this.u=u&&u.sendRawJson||!1,(u=u&&u.httpSessionIdParam)&&!U(u)&&(this.g.D=u,o=this.h,o!==null&&u in o&&(o=this.h,u in o&&delete o[u])),this.j=new dn(this)}C(Oe,Ee),Oe.prototype.m=function(){this.g.l=this.j,this.v&&(this.g.J=!0),this.g.connect(this.l,this.h||void 0)},Oe.prototype.close=function(){Fi(this.g)},Oe.prototype.o=function(o){var u=this.g;if(typeof o=="string"){var h={};h.__data__=o,o=h}else this.u&&(h={},h.__data__=Si(o),o=h);u.i.push(new Df(u.Ya++,o)),u.G==3&&ns(u)},Oe.prototype.N=function(){this.g.l=null,delete this.j,Fi(this.g),delete this.g,Oe.aa.N.call(this)};function Lc(o){Ci.call(this),o.__headers__&&(this.headers=o.__headers__,this.statusCode=o.__status__,delete o.__headers__,delete o.__status__);var u=o.__sm__;if(u){e:{for(const h in u){o=h;break e}o=void 0}(this.i=o)&&(o=this.i,u=u!==null&&o in u?u[o]:void 0),this.data=u}else this.data=o}C(Lc,Ci);function Mc(){ki.call(this),this.status=1}C(Mc,ki);function dn(o){this.g=o}C(dn,Oc),dn.prototype.ua=function(){Se(this.g,"a")},dn.prototype.ta=function(o){Se(this.g,new Lc(o))},dn.prototype.sa=function(o){Se(this.g,new Mc)},dn.prototype.ra=function(){Se(this.g,"b")},ss.prototype.createWebChannel=ss.prototype.g,Oe.prototype.send=Oe.prototype.o,Oe.prototype.open=Oe.prototype.m,Oe.prototype.close=Oe.prototype.close,vh=function(){return new ss},Eh=function(){return Hr()},yh=zt,fo={mb:0,pb:1,qb:2,Jb:3,Ob:4,Lb:5,Mb:6,Kb:7,Ib:8,Nb:9,PROXY:10,NOPROXY:11,Gb:12,Cb:13,Db:14,Bb:15,Eb:16,Fb:17,ib:18,hb:19,jb:20},Wr.NO_ERROR=0,Wr.TIMEOUT=8,Wr.HTTP_ERROR=6,ys=Wr,Ya.COMPLETE="complete",_h=Ya,Ga.EventType=Wn,Wn.OPEN="a",Wn.CLOSE="b",Wn.ERROR="c",Wn.MESSAGE="d",Ee.prototype.listen=Ee.prototype.K,ar=Ga,se.prototype.listenOnce=se.prototype.L,se.prototype.getLastError=se.prototype.Ka,se.prototype.getLastErrorCode=se.prototype.Ba,se.prototype.getStatus=se.prototype.Z,se.prototype.getResponseJson=se.prototype.Oa,se.prototype.getResponseText=se.prototype.oa,se.prototype.send=se.prototype.ea,se.prototype.setWithCredentials=se.prototype.Ha,gh=se}).apply(typeof as<"u"?as:typeof self<"u"?self:typeof window<"u"?window:{});const gu="@firebase/firestore",_u="4.8.0";/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class we{constructor(e){this.uid=e}isAuthenticated(){return this.uid!=null}toKey(){return this.isAuthenticated()?"uid:"+this.uid:"anonymous-user"}isEqual(e){return e.uid===this.uid}}we.UNAUTHENTICATED=new we(null),we.GOOGLE_CREDENTIALS=new we("google-credentials-uid"),we.FIRST_PARTY=new we("first-party-uid"),we.MOCK_USER=new we("mock-user");/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let On="11.10.0";/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const en=new Lo("@firebase/firestore");function pn(){return en.logLevel}function O(n,...e){if(en.logLevel<=H.DEBUG){const t=e.map(Go);en.debug(`Firestore (${On}): ${n}`,...t)}}function ft(n,...e){if(en.logLevel<=H.ERROR){const t=e.map(Go);en.error(`Firestore (${On}): ${n}`,...t)}}function pt(n,...e){if(en.logLevel<=H.WARN){const t=e.map(Go);en.warn(`Firestore (${On}): ${n}`,...t)}}function Go(n){if(typeof n=="string")return n;try{/**
* @license
* Copyright 2020 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/return(function(t){return JSON.stringify(t)})(n)}catch{return n}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function x(n,e,t){let r="Unexpected state";typeof e=="string"?r=e:t=e,Th(n,r,t)}function Th(n,e,t){let r=`FIRESTORE (${On}) INTERNAL ASSERTION FAILED: ${e} (ID: ${n.toString(16)})`;if(t!==void 0)try{r+=" CONTEXT: "+JSON.stringify(t)}catch{r+=" CONTEXT: "+t}throw ft(r),new Error(r)}function Q(n,e,t,r){let s="Unexpected state";typeof t=="string"?s=t:r=t,n||Th(e,s,r)}function j(n,e){return n}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const S={OK:"ok",CANCELLED:"cancelled",UNKNOWN:"unknown",INVALID_ARGUMENT:"invalid-argument",DEADLINE_EXCEEDED:"deadline-exceeded",NOT_FOUND:"not-found",ALREADY_EXISTS:"already-exists",PERMISSION_DENIED:"permission-denied",UNAUTHENTICATED:"unauthenticated",RESOURCE_EXHAUSTED:"resource-exhausted",FAILED_PRECONDITION:"failed-precondition",ABORTED:"aborted",OUT_OF_RANGE:"out-of-range",UNIMPLEMENTED:"unimplemented",INTERNAL:"internal",UNAVAILABLE:"unavailable",DATA_LOSS:"data-loss"};class N extends Ze{constructor(e,t){super(e,t),this.code=e,this.message=t,this.toString=()=>`${this.name}: [code=${this.code}]: ${this.message}`}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ct{constructor(){this.promise=new Promise(((e,t)=>{this.resolve=e,this.reject=t}))}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ih{constructor(e,t){this.user=t,this.type="OAuth",this.headers=new Map,this.headers.set("Authorization",`Bearer ${e}`)}}class wh{getToken(){return Promise.resolve(null)}invalidateToken(){}start(e,t){e.enqueueRetryable((()=>t(we.UNAUTHENTICATED)))}shutdown(){}}class H_{constructor(e){this.token=e,this.changeListener=null}getToken(){return Promise.resolve(this.token)}invalidateToken(){}start(e,t){this.changeListener=t,e.enqueueRetryable((()=>t(this.token.user)))}shutdown(){this.changeListener=null}}class W_{constructor(e){this.t=e,this.currentUser=we.UNAUTHENTICATED,this.i=0,this.forceRefresh=!1,this.auth=null}start(e,t){Q(this.o===void 0,42304);let r=this.i;const s=l=>this.i!==r?(r=this.i,t(l)):Promise.resolve();let i=new ct;this.o=()=>{this.i++,this.currentUser=this.u(),i.resolve(),i=new ct,e.enqueueRetryable((()=>s(this.currentUser)))};const a=()=>{const l=i;e.enqueueRetryable((async()=>{await l.promise,await s(this.currentUser)}))},c=l=>{O("FirebaseAuthCredentialsProvider","Auth detected"),this.auth=l,this.o&&(this.auth.addAuthTokenListener(this.o),a())};this.t.onInit((l=>c(l))),setTimeout((()=>{if(!this.auth){const l=this.t.getImmediate({optional:!0});l?c(l):(O("FirebaseAuthCredentialsProvider","Auth not yet detected"),i.resolve(),i=new ct)}}),0),a()}getToken(){const e=this.i,t=this.forceRefresh;return this.forceRefresh=!1,this.auth?this.auth.getToken(t).then((r=>this.i!==e?(O("FirebaseAuthCredentialsProvider","getToken aborted due to token change."),this.getToken()):r?(Q(typeof r.accessToken=="string",31837,{l:r}),new Ih(r.accessToken,this.currentUser)):null)):Promise.resolve(null)}invalidateToken(){this.forceRefresh=!0}shutdown(){this.auth&&this.o&&this.auth.removeAuthTokenListener(this.o),this.o=void 0}u(){const e=this.auth&&this.auth.getUid();return Q(e===null||typeof e=="string",2055,{h:e}),new we(e)}}class G_{constructor(e,t,r){this.P=e,this.T=t,this.I=r,this.type="FirstParty",this.user=we.FIRST_PARTY,this.A=new Map}R(){return this.I?this.I():null}get headers(){this.A.set("X-Goog-AuthUser",this.P);const e=this.R();return e&&this.A.set("Authorization",e),this.T&&this.A.set("X-Goog-Iam-Authorization-Token",this.T),this.A}}class K_{constructor(e,t,r){this.P=e,this.T=t,this.I=r}getToken(){return Promise.resolve(new G_(this.P,this.T,this.I))}start(e,t){e.enqueueRetryable((()=>t(we.FIRST_PARTY)))}shutdown(){}invalidateToken(){}}class yu{constructor(e){this.value=e,this.type="AppCheck",this.headers=new Map,e&&e.length>0&&this.headers.set("x-firebase-appcheck",this.value)}}class Q_{constructor(e,t){this.V=t,this.forceRefresh=!1,this.appCheck=null,this.m=null,this.p=null,Le(e)&&e.settings.appCheckToken&&(this.p=e.settings.appCheckToken)}start(e,t){Q(this.o===void 0,3512);const r=i=>{i.error!=null&&O("FirebaseAppCheckTokenProvider",`Error getting App Check token; using placeholder token instead. Error: ${i.error.message}`);const a=i.token!==this.m;return this.m=i.token,O("FirebaseAppCheckTokenProvider",`Received ${a?"new":"existing"} token.`),a?t(i.token):Promise.resolve()};this.o=i=>{e.enqueueRetryable((()=>r(i)))};const s=i=>{O("FirebaseAppCheckTokenProvider","AppCheck detected"),this.appCheck=i,this.o&&this.appCheck.addTokenListener(this.o)};this.V.onInit((i=>s(i))),setTimeout((()=>{if(!this.appCheck){const i=this.V.getImmediate({optional:!0});i?s(i):O("FirebaseAppCheckTokenProvider","AppCheck not yet detected")}}),0)}getToken(){if(this.p)return Promise.resolve(new yu(this.p));const e=this.forceRefresh;return this.forceRefresh=!1,this.appCheck?this.appCheck.getToken(e).then((t=>t?(Q(typeof t.token=="string",44558,{tokenResult:t}),this.m=t.token,new yu(t.token)):null)):Promise.resolve(null)}invalidateToken(){this.forceRefresh=!0}shutdown(){this.appCheck&&this.o&&this.appCheck.removeTokenListener(this.o),this.o=void 0}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function J_(n){const e=typeof self<"u"&&(self.crypto||self.msCrypto),t=new Uint8Array(n);if(e&&typeof e.getRandomValues=="function")e.getRandomValues(t);else for(let r=0;r<n;r++)t[r]=Math.floor(256*Math.random());return t}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ah(){return new TextEncoder}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ks{static newId(){const e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",t=62*Math.floor(4.129032258064516);let r="";for(;r.length<20;){const s=J_(40);for(let i=0;i<s.length;++i)r.length<20&&s[i]<t&&(r+=e.charAt(s[i]%62))}return r}}function $(n,e){return n<e?-1:n>e?1:0}function po(n,e){let t=0;for(;t<n.length&&t<e.length;){const r=n.codePointAt(t),s=e.codePointAt(t);if(r!==s){if(r<128&&s<128)return $(r,s);{const i=Ah(),a=X_(i.encode(Eu(n,t)),i.encode(Eu(e,t)));return a!==0?a:$(r,s)}}t+=r>65535?2:1}return $(n.length,e.length)}function Eu(n,e){return n.codePointAt(e)>65535?n.substring(e,e+2):n.substring(e,e+1)}function X_(n,e){for(let t=0;t<n.length&&t<e.length;++t)if(n[t]!==e[t])return $(n[t],e[t]);return $(n.length,e.length)}function Rn(n,e,t){return n.length===e.length&&n.every(((r,s)=>t(r,e[s])))}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const mo="__name__";class He{constructor(e,t,r){t===void 0?t=0:t>e.length&&x(637,{offset:t,range:e.length}),r===void 0?r=e.length-t:r>e.length-t&&x(1746,{length:r,range:e.length-t}),this.segments=e,this.offset=t,this.len=r}get length(){return this.len}isEqual(e){return He.comparator(this,e)===0}child(e){const t=this.segments.slice(this.offset,this.limit());return e instanceof He?e.forEach((r=>{t.push(r)})):t.push(e),this.construct(t)}limit(){return this.offset+this.length}popFirst(e){return e=e===void 0?1:e,this.construct(this.segments,this.offset+e,this.length-e)}popLast(){return this.construct(this.segments,this.offset,this.length-1)}firstSegment(){return this.segments[this.offset]}lastSegment(){return this.get(this.length-1)}get(e){return this.segments[this.offset+e]}isEmpty(){return this.length===0}isPrefixOf(e){if(e.length<this.length)return!1;for(let t=0;t<this.length;t++)if(this.get(t)!==e.get(t))return!1;return!0}isImmediateParentOf(e){if(this.length+1!==e.length)return!1;for(let t=0;t<this.length;t++)if(this.get(t)!==e.get(t))return!1;return!0}forEach(e){for(let t=this.offset,r=this.limit();t<r;t++)e(this.segments[t])}toArray(){return this.segments.slice(this.offset,this.limit())}static comparator(e,t){const r=Math.min(e.length,t.length);for(let s=0;s<r;s++){const i=He.compareSegments(e.get(s),t.get(s));if(i!==0)return i}return $(e.length,t.length)}static compareSegments(e,t){const r=He.isNumericId(e),s=He.isNumericId(t);return r&&!s?-1:!r&&s?1:r&&s?He.extractNumericId(e).compare(He.extractNumericId(t)):po(e,t)}static isNumericId(e){return e.startsWith("__id")&&e.endsWith("__")}static extractNumericId(e){return Ct.fromString(e.substring(4,e.length-2))}}class Y extends He{construct(e,t,r){return new Y(e,t,r)}canonicalString(){return this.toArray().join("/")}toString(){return this.canonicalString()}toUriEncodedString(){return this.toArray().map(encodeURIComponent).join("/")}static fromString(...e){const t=[];for(const r of e){if(r.indexOf("//")>=0)throw new N(S.INVALID_ARGUMENT,`Invalid segment (${r}). Paths must not contain // in them.`);t.push(...r.split("/").filter((s=>s.length>0)))}return new Y(t)}static emptyPath(){return new Y([])}}const Y_=/^[_a-zA-Z][_a-zA-Z0-9]*$/;class fe extends He{construct(e,t,r){return new fe(e,t,r)}static isValidIdentifier(e){return Y_.test(e)}canonicalString(){return this.toArray().map((e=>(e=e.replace(/\\/g,"\\\\").replace(/`/g,"\\`"),fe.isValidIdentifier(e)||(e="`"+e+"`"),e))).join(".")}toString(){return this.canonicalString()}isKeyField(){return this.length===1&&this.get(0)===mo}static keyField(){return new fe([mo])}static fromServerFormat(e){const t=[];let r="",s=0;const i=()=>{if(r.length===0)throw new N(S.INVALID_ARGUMENT,`Invalid field path (${e}). Paths must not be empty, begin with '.', end with '.', or contain '..'`);t.push(r),r=""};let a=!1;for(;s<e.length;){const c=e[s];if(c==="\\"){if(s+1===e.length)throw new N(S.INVALID_ARGUMENT,"Path has trailing escape character: "+e);const l=e[s+1];if(l!=="\\"&&l!=="."&&l!=="`")throw new N(S.INVALID_ARGUMENT,"Path has invalid escape sequence: "+e);r+=l,s+=2}else c==="`"?(a=!a,s++):c!=="."||a?(r+=c,s++):(i(),s++)}if(i(),a)throw new N(S.INVALID_ARGUMENT,"Unterminated ` in path: "+e);return new fe(t)}static emptyPath(){return new fe([])}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class L{constructor(e){this.path=e}static fromPath(e){return new L(Y.fromString(e))}static fromName(e){return new L(Y.fromString(e).popFirst(5))}static empty(){return new L(Y.emptyPath())}get collectionGroup(){return this.path.popLast().lastSegment()}hasCollectionId(e){return this.path.length>=2&&this.path.get(this.path.length-2)===e}getCollectionGroup(){return this.path.get(this.path.length-2)}getCollectionPath(){return this.path.popLast()}isEqual(e){return e!==null&&Y.comparator(this.path,e.path)===0}toString(){return this.path.toString()}static comparator(e,t){return Y.comparator(e.path,t.path)}static isDocumentKey(e){return e.length%2==0}static fromSegments(e){return new L(new Y(e.slice()))}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Rh(n,e,t){if(!t)throw new N(S.INVALID_ARGUMENT,`Function ${n}() cannot be called with an empty ${e}.`)}function bh(n,e,t,r){if(e===!0&&r===!0)throw new N(S.INVALID_ARGUMENT,`${n} and ${t} cannot be used together.`)}function vu(n){if(!L.isDocumentKey(n))throw new N(S.INVALID_ARGUMENT,`Invalid document reference. Document references must have an even number of segments, but ${n} has ${n.length}.`)}function Tu(n){if(L.isDocumentKey(n))throw new N(S.INVALID_ARGUMENT,`Invalid collection reference. Collection references must have an odd number of segments, but ${n} has ${n.length}.`)}function Sh(n){return typeof n=="object"&&n!==null&&(Object.getPrototypeOf(n)===Object.prototype||Object.getPrototypeOf(n)===null)}function Qs(n){if(n===void 0)return"undefined";if(n===null)return"null";if(typeof n=="string")return n.length>20&&(n=`${n.substring(0,20)}...`),JSON.stringify(n);if(typeof n=="number"||typeof n=="boolean")return""+n;if(typeof n=="object"){if(n instanceof Array)return"an array";{const e=(function(r){return r.constructor?r.constructor.name:null})(n);return e?`a custom ${e} object`:"an object"}}return typeof n=="function"?"a function":x(12329,{type:typeof n})}function Re(n,e){if("_delegate"in n&&(n=n._delegate),!(n instanceof e)){if(e.name===n.constructor.name)throw new N(S.INVALID_ARGUMENT,"Type does not match the expected instance. Did you pass a reference from a different Firestore SDK?");{const t=Qs(n);throw new N(S.INVALID_ARGUMENT,`Expected type '${e.name}', but it was: ${t}`)}}return n}function Z_(n,e){if(e<=0)throw new N(S.INVALID_ARGUMENT,`Function ${n}() requires a positive number, but it was: ${e}.`)}/**
 * @license
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function le(n,e){const t={typeString:n};return e&&(t.value=e),t}function Nr(n,e){if(!Sh(n))throw new N(S.INVALID_ARGUMENT,"JSON must be an object");let t;for(const r in e)if(e[r]){const s=e[r].typeString,i="value"in e[r]?{value:e[r].value}:void 0;if(!(r in n)){t=`JSON missing required field: '${r}'`;break}const a=n[r];if(s&&typeof a!==s){t=`JSON field '${r}' must be a ${s}.`;break}if(i!==void 0&&a!==i.value){t=`Expected '${r}' field to equal '${i.value}'`;break}}if(t)throw new N(S.INVALID_ARGUMENT,t);return!0}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Iu=-62135596800,wu=1e6;class Z{static now(){return Z.fromMillis(Date.now())}static fromDate(e){return Z.fromMillis(e.getTime())}static fromMillis(e){const t=Math.floor(e/1e3),r=Math.floor((e-1e3*t)*wu);return new Z(t,r)}constructor(e,t){if(this.seconds=e,this.nanoseconds=t,t<0)throw new N(S.INVALID_ARGUMENT,"Timestamp nanoseconds out of range: "+t);if(t>=1e9)throw new N(S.INVALID_ARGUMENT,"Timestamp nanoseconds out of range: "+t);if(e<Iu)throw new N(S.INVALID_ARGUMENT,"Timestamp seconds out of range: "+e);if(e>=253402300800)throw new N(S.INVALID_ARGUMENT,"Timestamp seconds out of range: "+e)}toDate(){return new Date(this.toMillis())}toMillis(){return 1e3*this.seconds+this.nanoseconds/wu}_compareTo(e){return this.seconds===e.seconds?$(this.nanoseconds,e.nanoseconds):$(this.seconds,e.seconds)}isEqual(e){return e.seconds===this.seconds&&e.nanoseconds===this.nanoseconds}toString(){return"Timestamp(seconds="+this.seconds+", nanoseconds="+this.nanoseconds+")"}toJSON(){return{type:Z._jsonSchemaVersion,seconds:this.seconds,nanoseconds:this.nanoseconds}}static fromJSON(e){if(Nr(e,Z._jsonSchema))return new Z(e.seconds,e.nanoseconds)}valueOf(){const e=this.seconds-Iu;return String(e).padStart(12,"0")+"."+String(this.nanoseconds).padStart(9,"0")}}Z._jsonSchemaVersion="firestore/timestamp/1.0",Z._jsonSchema={type:le("string",Z._jsonSchemaVersion),seconds:le("number"),nanoseconds:le("number")};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class B{static fromTimestamp(e){return new B(e)}static min(){return new B(new Z(0,0))}static max(){return new B(new Z(253402300799,999999999))}constructor(e){this.timestamp=e}compareTo(e){return this.timestamp._compareTo(e.timestamp)}isEqual(e){return this.timestamp.isEqual(e.timestamp)}toMicroseconds(){return 1e6*this.timestamp.seconds+this.timestamp.nanoseconds/1e3}toString(){return"SnapshotVersion("+this.timestamp.toString()+")"}toTimestamp(){return this.timestamp}}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const vr=-1;function ey(n,e){const t=n.toTimestamp().seconds,r=n.toTimestamp().nanoseconds+1,s=B.fromTimestamp(r===1e9?new Z(t+1,0):new Z(t,r));return new Vt(s,L.empty(),e)}function ty(n){return new Vt(n.readTime,n.key,vr)}class Vt{constructor(e,t,r){this.readTime=e,this.documentKey=t,this.largestBatchId=r}static min(){return new Vt(B.min(),L.empty(),vr)}static max(){return new Vt(B.max(),L.empty(),vr)}}function ny(n,e){let t=n.readTime.compareTo(e.readTime);return t!==0?t:(t=L.comparator(n.documentKey,e.documentKey),t!==0?t:$(n.largestBatchId,e.largestBatchId))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ry="The current tab is not in the required state to perform this operation. It might be necessary to refresh the browser tab.";class sy{constructor(){this.onCommittedListeners=[]}addOnCommittedListener(e){this.onCommittedListeners.push(e)}raiseOnCommittedEvent(){this.onCommittedListeners.forEach((e=>e()))}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ln(n){if(n.code!==S.FAILED_PRECONDITION||n.message!==ry)throw n;O("LocalStore","Unexpectedly lost primary lease")}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class P{constructor(e){this.nextCallback=null,this.catchCallback=null,this.result=void 0,this.error=void 0,this.isDone=!1,this.callbackAttached=!1,e((t=>{this.isDone=!0,this.result=t,this.nextCallback&&this.nextCallback(t)}),(t=>{this.isDone=!0,this.error=t,this.catchCallback&&this.catchCallback(t)}))}catch(e){return this.next(void 0,e)}next(e,t){return this.callbackAttached&&x(59440),this.callbackAttached=!0,this.isDone?this.error?this.wrapFailure(t,this.error):this.wrapSuccess(e,this.result):new P(((r,s)=>{this.nextCallback=i=>{this.wrapSuccess(e,i).next(r,s)},this.catchCallback=i=>{this.wrapFailure(t,i).next(r,s)}}))}toPromise(){return new Promise(((e,t)=>{this.next(e,t)}))}wrapUserFunction(e){try{const t=e();return t instanceof P?t:P.resolve(t)}catch(t){return P.reject(t)}}wrapSuccess(e,t){return e?this.wrapUserFunction((()=>e(t))):P.resolve(t)}wrapFailure(e,t){return e?this.wrapUserFunction((()=>e(t))):P.reject(t)}static resolve(e){return new P(((t,r)=>{t(e)}))}static reject(e){return new P(((t,r)=>{r(e)}))}static waitFor(e){return new P(((t,r)=>{let s=0,i=0,a=!1;e.forEach((c=>{++s,c.next((()=>{++i,a&&i===s&&t()}),(l=>r(l)))})),a=!0,i===s&&t()}))}static or(e){let t=P.resolve(!1);for(const r of e)t=t.next((s=>s?P.resolve(s):r()));return t}static forEach(e,t){const r=[];return e.forEach(((s,i)=>{r.push(t.call(this,s,i))})),this.waitFor(r)}static mapArray(e,t){return new P(((r,s)=>{const i=e.length,a=new Array(i);let c=0;for(let l=0;l<i;l++){const d=l;t(e[d]).next((p=>{a[d]=p,++c,c===i&&r(a)}),(p=>s(p)))}}))}static doWhile(e,t){return new P(((r,s)=>{const i=()=>{e()===!0?t().next((()=>{i()}),s):r()};i()}))}}function iy(n){const e=n.match(/Android ([\d.]+)/i),t=e?e[1].split(".").slice(0,2).join("."):"-1";return Number(t)}function Mn(n){return n.name==="IndexedDbTransactionError"}/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Js{constructor(e,t){this.previousValue=e,t&&(t.sequenceNumberHandler=r=>this._e(r),this.ae=r=>t.writeSequenceNumber(r))}_e(e){return this.previousValue=Math.max(e,this.previousValue),this.previousValue}next(){const e=++this.previousValue;return this.ae&&this.ae(e),e}}Js.ue=-1;/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ko=-1;function Xs(n){return n==null}function Ns(n){return n===0&&1/n==-1/0}function oy(n){return typeof n=="number"&&Number.isInteger(n)&&!Ns(n)&&n<=Number.MAX_SAFE_INTEGER&&n>=Number.MIN_SAFE_INTEGER}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ph="";function ay(n){let e="";for(let t=0;t<n.length;t++)e.length>0&&(e=Au(e)),e=cy(n.get(t),e);return Au(e)}function cy(n,e){let t=e;const r=n.length;for(let s=0;s<r;s++){const i=n.charAt(s);switch(i){case"\0":t+="";break;case Ph:t+="";break;default:t+=i}}return t}function Au(n){return n+Ph+""}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ru(n){let e=0;for(const t in n)Object.prototype.hasOwnProperty.call(n,t)&&e++;return e}function jt(n,e){for(const t in n)Object.prototype.hasOwnProperty.call(n,t)&&e(t,n[t])}function Ch(n){for(const e in n)if(Object.prototype.hasOwnProperty.call(n,e))return!1;return!0}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class re{constructor(e,t){this.comparator=e,this.root=t||_e.EMPTY}insert(e,t){return new re(this.comparator,this.root.insert(e,t,this.comparator).copy(null,null,_e.BLACK,null,null))}remove(e){return new re(this.comparator,this.root.remove(e,this.comparator).copy(null,null,_e.BLACK,null,null))}get(e){let t=this.root;for(;!t.isEmpty();){const r=this.comparator(e,t.key);if(r===0)return t.value;r<0?t=t.left:r>0&&(t=t.right)}return null}indexOf(e){let t=0,r=this.root;for(;!r.isEmpty();){const s=this.comparator(e,r.key);if(s===0)return t+r.left.size;s<0?r=r.left:(t+=r.left.size+1,r=r.right)}return-1}isEmpty(){return this.root.isEmpty()}get size(){return this.root.size}minKey(){return this.root.minKey()}maxKey(){return this.root.maxKey()}inorderTraversal(e){return this.root.inorderTraversal(e)}forEach(e){this.inorderTraversal(((t,r)=>(e(t,r),!1)))}toString(){const e=[];return this.inorderTraversal(((t,r)=>(e.push(`${t}:${r}`),!1))),`{${e.join(", ")}}`}reverseTraversal(e){return this.root.reverseTraversal(e)}getIterator(){return new cs(this.root,null,this.comparator,!1)}getIteratorFrom(e){return new cs(this.root,e,this.comparator,!1)}getReverseIterator(){return new cs(this.root,null,this.comparator,!0)}getReverseIteratorFrom(e){return new cs(this.root,e,this.comparator,!0)}}class cs{constructor(e,t,r,s){this.isReverse=s,this.nodeStack=[];let i=1;for(;!e.isEmpty();)if(i=t?r(e.key,t):1,t&&s&&(i*=-1),i<0)e=this.isReverse?e.left:e.right;else{if(i===0){this.nodeStack.push(e);break}this.nodeStack.push(e),e=this.isReverse?e.right:e.left}}getNext(){let e=this.nodeStack.pop();const t={key:e.key,value:e.value};if(this.isReverse)for(e=e.left;!e.isEmpty();)this.nodeStack.push(e),e=e.right;else for(e=e.right;!e.isEmpty();)this.nodeStack.push(e),e=e.left;return t}hasNext(){return this.nodeStack.length>0}peek(){if(this.nodeStack.length===0)return null;const e=this.nodeStack[this.nodeStack.length-1];return{key:e.key,value:e.value}}}class _e{constructor(e,t,r,s,i){this.key=e,this.value=t,this.color=r??_e.RED,this.left=s??_e.EMPTY,this.right=i??_e.EMPTY,this.size=this.left.size+1+this.right.size}copy(e,t,r,s,i){return new _e(e??this.key,t??this.value,r??this.color,s??this.left,i??this.right)}isEmpty(){return!1}inorderTraversal(e){return this.left.inorderTraversal(e)||e(this.key,this.value)||this.right.inorderTraversal(e)}reverseTraversal(e){return this.right.reverseTraversal(e)||e(this.key,this.value)||this.left.reverseTraversal(e)}min(){return this.left.isEmpty()?this:this.left.min()}minKey(){return this.min().key}maxKey(){return this.right.isEmpty()?this.key:this.right.maxKey()}insert(e,t,r){let s=this;const i=r(e,s.key);return s=i<0?s.copy(null,null,null,s.left.insert(e,t,r),null):i===0?s.copy(null,t,null,null,null):s.copy(null,null,null,null,s.right.insert(e,t,r)),s.fixUp()}removeMin(){if(this.left.isEmpty())return _e.EMPTY;let e=this;return e.left.isRed()||e.left.left.isRed()||(e=e.moveRedLeft()),e=e.copy(null,null,null,e.left.removeMin(),null),e.fixUp()}remove(e,t){let r,s=this;if(t(e,s.key)<0)s.left.isEmpty()||s.left.isRed()||s.left.left.isRed()||(s=s.moveRedLeft()),s=s.copy(null,null,null,s.left.remove(e,t),null);else{if(s.left.isRed()&&(s=s.rotateRight()),s.right.isEmpty()||s.right.isRed()||s.right.left.isRed()||(s=s.moveRedRight()),t(e,s.key)===0){if(s.right.isEmpty())return _e.EMPTY;r=s.right.min(),s=s.copy(r.key,r.value,null,null,s.right.removeMin())}s=s.copy(null,null,null,null,s.right.remove(e,t))}return s.fixUp()}isRed(){return this.color}fixUp(){let e=this;return e.right.isRed()&&!e.left.isRed()&&(e=e.rotateLeft()),e.left.isRed()&&e.left.left.isRed()&&(e=e.rotateRight()),e.left.isRed()&&e.right.isRed()&&(e=e.colorFlip()),e}moveRedLeft(){let e=this.colorFlip();return e.right.left.isRed()&&(e=e.copy(null,null,null,null,e.right.rotateRight()),e=e.rotateLeft(),e=e.colorFlip()),e}moveRedRight(){let e=this.colorFlip();return e.left.left.isRed()&&(e=e.rotateRight(),e=e.colorFlip()),e}rotateLeft(){const e=this.copy(null,null,_e.RED,null,this.right.left);return this.right.copy(null,null,this.color,e,null)}rotateRight(){const e=this.copy(null,null,_e.RED,this.left.right,null);return this.left.copy(null,null,this.color,null,e)}colorFlip(){const e=this.left.copy(null,null,!this.left.color,null,null),t=this.right.copy(null,null,!this.right.color,null,null);return this.copy(null,null,!this.color,e,t)}checkMaxDepth(){const e=this.check();return Math.pow(2,e)<=this.size+1}check(){if(this.isRed()&&this.left.isRed())throw x(43730,{key:this.key,value:this.value});if(this.right.isRed())throw x(14113,{key:this.key,value:this.value});const e=this.left.check();if(e!==this.right.check())throw x(27949);return e+(this.isRed()?0:1)}}_e.EMPTY=null,_e.RED=!0,_e.BLACK=!1;_e.EMPTY=new class{constructor(){this.size=0}get key(){throw x(57766)}get value(){throw x(16141)}get color(){throw x(16727)}get left(){throw x(29726)}get right(){throw x(36894)}copy(e,t,r,s,i){return this}insert(e,t,r){return new _e(e,t)}remove(e,t){return this}isEmpty(){return!0}inorderTraversal(e){return!1}reverseTraversal(e){return!1}minKey(){return null}maxKey(){return null}isRed(){return!1}checkMaxDepth(){return!0}check(){return 0}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class he{constructor(e){this.comparator=e,this.data=new re(this.comparator)}has(e){return this.data.get(e)!==null}first(){return this.data.minKey()}last(){return this.data.maxKey()}get size(){return this.data.size}indexOf(e){return this.data.indexOf(e)}forEach(e){this.data.inorderTraversal(((t,r)=>(e(t),!1)))}forEachInRange(e,t){const r=this.data.getIteratorFrom(e[0]);for(;r.hasNext();){const s=r.getNext();if(this.comparator(s.key,e[1])>=0)return;t(s.key)}}forEachWhile(e,t){let r;for(r=t!==void 0?this.data.getIteratorFrom(t):this.data.getIterator();r.hasNext();)if(!e(r.getNext().key))return}firstAfterOrEqual(e){const t=this.data.getIteratorFrom(e);return t.hasNext()?t.getNext().key:null}getIterator(){return new bu(this.data.getIterator())}getIteratorFrom(e){return new bu(this.data.getIteratorFrom(e))}add(e){return this.copy(this.data.remove(e).insert(e,!0))}delete(e){return this.has(e)?this.copy(this.data.remove(e)):this}isEmpty(){return this.data.isEmpty()}unionWith(e){let t=this;return t.size<e.size&&(t=e,e=this),e.forEach((r=>{t=t.add(r)})),t}isEqual(e){if(!(e instanceof he)||this.size!==e.size)return!1;const t=this.data.getIterator(),r=e.data.getIterator();for(;t.hasNext();){const s=t.getNext().key,i=r.getNext().key;if(this.comparator(s,i)!==0)return!1}return!0}toArray(){const e=[];return this.forEach((t=>{e.push(t)})),e}toString(){const e=[];return this.forEach((t=>e.push(t))),"SortedSet("+e.toString()+")"}copy(e){const t=new he(this.comparator);return t.data=e,t}}class bu{constructor(e){this.iter=e}getNext(){return this.iter.getNext().key}hasNext(){return this.iter.hasNext()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class xe{constructor(e){this.fields=e,e.sort(fe.comparator)}static empty(){return new xe([])}unionWith(e){let t=new he(fe.comparator);for(const r of this.fields)t=t.add(r);for(const r of e)t=t.add(r);return new xe(t.toArray())}covers(e){for(const t of this.fields)if(t.isPrefixOf(e))return!0;return!1}isEqual(e){return Rn(this.fields,e.fields,((t,r)=>t.isEqual(r)))}}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class kh extends Error{constructor(){super(...arguments),this.name="Base64DecodeError"}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class pe{constructor(e){this.binaryString=e}static fromBase64String(e){const t=(function(s){try{return atob(s)}catch(i){throw typeof DOMException<"u"&&i instanceof DOMException?new kh("Invalid base64 string: "+i):i}})(e);return new pe(t)}static fromUint8Array(e){const t=(function(s){let i="";for(let a=0;a<s.length;++a)i+=String.fromCharCode(s[a]);return i})(e);return new pe(t)}[Symbol.iterator](){let e=0;return{next:()=>e<this.binaryString.length?{value:this.binaryString.charCodeAt(e++),done:!1}:{value:void 0,done:!0}}}toBase64(){return(function(t){return btoa(t)})(this.binaryString)}toUint8Array(){return(function(t){const r=new Uint8Array(t.length);for(let s=0;s<t.length;s++)r[s]=t.charCodeAt(s);return r})(this.binaryString)}approximateByteSize(){return 2*this.binaryString.length}compareTo(e){return $(this.binaryString,e.binaryString)}isEqual(e){return this.binaryString===e.binaryString}}pe.EMPTY_BYTE_STRING=new pe("");const uy=new RegExp(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.(\d+))?Z$/);function Ot(n){if(Q(!!n,39018),typeof n=="string"){let e=0;const t=uy.exec(n);if(Q(!!t,46558,{timestamp:n}),t[1]){let s=t[1];s=(s+"000000000").substr(0,9),e=Number(s)}const r=new Date(n);return{seconds:Math.floor(r.getTime()/1e3),nanos:e}}return{seconds:ae(n.seconds),nanos:ae(n.nanos)}}function ae(n){return typeof n=="number"?n:typeof n=="string"?Number(n):0}function Lt(n){return typeof n=="string"?pe.fromBase64String(n):pe.fromUint8Array(n)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Dh="server_timestamp",Nh="__type__",Vh="__previous_value__",Oh="__local_write_time__";function Qo(n){var e,t;return((t=(((e=n==null?void 0:n.mapValue)===null||e===void 0?void 0:e.fields)||{})[Nh])===null||t===void 0?void 0:t.stringValue)===Dh}function Ys(n){const e=n.mapValue.fields[Vh];return Qo(e)?Ys(e):e}function Tr(n){const e=Ot(n.mapValue.fields[Oh].timestampValue);return new Z(e.seconds,e.nanos)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ly{constructor(e,t,r,s,i,a,c,l,d,p){this.databaseId=e,this.appId=t,this.persistenceKey=r,this.host=s,this.ssl=i,this.forceLongPolling=a,this.autoDetectLongPolling=c,this.longPollingOptions=l,this.useFetchStreams=d,this.isUsingEmulator=p}}const Vs="(default)";class bn{constructor(e,t){this.projectId=e,this.database=t||Vs}static empty(){return new bn("","")}get isDefaultDatabase(){return this.database===Vs}isEqual(e){return e instanceof bn&&e.projectId===this.projectId&&e.database===this.database}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Lh="__type__",hy="__max__",us={mapValue:{}},Mh="__vector__",Os="value";function Mt(n){return"nullValue"in n?0:"booleanValue"in n?1:"integerValue"in n||"doubleValue"in n?2:"timestampValue"in n?3:"stringValue"in n?5:"bytesValue"in n?6:"referenceValue"in n?7:"geoPointValue"in n?8:"arrayValue"in n?9:"mapValue"in n?Qo(n)?4:fy(n)?9007199254740991:dy(n)?10:11:x(28295,{value:n})}function Ye(n,e){if(n===e)return!0;const t=Mt(n);if(t!==Mt(e))return!1;switch(t){case 0:case 9007199254740991:return!0;case 1:return n.booleanValue===e.booleanValue;case 4:return Tr(n).isEqual(Tr(e));case 3:return(function(s,i){if(typeof s.timestampValue=="string"&&typeof i.timestampValue=="string"&&s.timestampValue.length===i.timestampValue.length)return s.timestampValue===i.timestampValue;const a=Ot(s.timestampValue),c=Ot(i.timestampValue);return a.seconds===c.seconds&&a.nanos===c.nanos})(n,e);case 5:return n.stringValue===e.stringValue;case 6:return(function(s,i){return Lt(s.bytesValue).isEqual(Lt(i.bytesValue))})(n,e);case 7:return n.referenceValue===e.referenceValue;case 8:return(function(s,i){return ae(s.geoPointValue.latitude)===ae(i.geoPointValue.latitude)&&ae(s.geoPointValue.longitude)===ae(i.geoPointValue.longitude)})(n,e);case 2:return(function(s,i){if("integerValue"in s&&"integerValue"in i)return ae(s.integerValue)===ae(i.integerValue);if("doubleValue"in s&&"doubleValue"in i){const a=ae(s.doubleValue),c=ae(i.doubleValue);return a===c?Ns(a)===Ns(c):isNaN(a)&&isNaN(c)}return!1})(n,e);case 9:return Rn(n.arrayValue.values||[],e.arrayValue.values||[],Ye);case 10:case 11:return(function(s,i){const a=s.mapValue.fields||{},c=i.mapValue.fields||{};if(Ru(a)!==Ru(c))return!1;for(const l in a)if(a.hasOwnProperty(l)&&(c[l]===void 0||!Ye(a[l],c[l])))return!1;return!0})(n,e);default:return x(52216,{left:n})}}function Ir(n,e){return(n.values||[]).find((t=>Ye(t,e)))!==void 0}function Sn(n,e){if(n===e)return 0;const t=Mt(n),r=Mt(e);if(t!==r)return $(t,r);switch(t){case 0:case 9007199254740991:return 0;case 1:return $(n.booleanValue,e.booleanValue);case 2:return(function(i,a){const c=ae(i.integerValue||i.doubleValue),l=ae(a.integerValue||a.doubleValue);return c<l?-1:c>l?1:c===l?0:isNaN(c)?isNaN(l)?0:-1:1})(n,e);case 3:return Su(n.timestampValue,e.timestampValue);case 4:return Su(Tr(n),Tr(e));case 5:return po(n.stringValue,e.stringValue);case 6:return(function(i,a){const c=Lt(i),l=Lt(a);return c.compareTo(l)})(n.bytesValue,e.bytesValue);case 7:return(function(i,a){const c=i.split("/"),l=a.split("/");for(let d=0;d<c.length&&d<l.length;d++){const p=$(c[d],l[d]);if(p!==0)return p}return $(c.length,l.length)})(n.referenceValue,e.referenceValue);case 8:return(function(i,a){const c=$(ae(i.latitude),ae(a.latitude));return c!==0?c:$(ae(i.longitude),ae(a.longitude))})(n.geoPointValue,e.geoPointValue);case 9:return Pu(n.arrayValue,e.arrayValue);case 10:return(function(i,a){var c,l,d,p;const m=i.fields||{},E=a.fields||{},b=(c=m[Os])===null||c===void 0?void 0:c.arrayValue,C=(l=E[Os])===null||l===void 0?void 0:l.arrayValue,V=$(((d=b==null?void 0:b.values)===null||d===void 0?void 0:d.length)||0,((p=C==null?void 0:C.values)===null||p===void 0?void 0:p.length)||0);return V!==0?V:Pu(b,C)})(n.mapValue,e.mapValue);case 11:return(function(i,a){if(i===us.mapValue&&a===us.mapValue)return 0;if(i===us.mapValue)return 1;if(a===us.mapValue)return-1;const c=i.fields||{},l=Object.keys(c),d=a.fields||{},p=Object.keys(d);l.sort(),p.sort();for(let m=0;m<l.length&&m<p.length;++m){const E=po(l[m],p[m]);if(E!==0)return E;const b=Sn(c[l[m]],d[p[m]]);if(b!==0)return b}return $(l.length,p.length)})(n.mapValue,e.mapValue);default:throw x(23264,{le:t})}}function Su(n,e){if(typeof n=="string"&&typeof e=="string"&&n.length===e.length)return $(n,e);const t=Ot(n),r=Ot(e),s=$(t.seconds,r.seconds);return s!==0?s:$(t.nanos,r.nanos)}function Pu(n,e){const t=n.values||[],r=e.values||[];for(let s=0;s<t.length&&s<r.length;++s){const i=Sn(t[s],r[s]);if(i)return i}return $(t.length,r.length)}function Pn(n){return go(n)}function go(n){return"nullValue"in n?"null":"booleanValue"in n?""+n.booleanValue:"integerValue"in n?""+n.integerValue:"doubleValue"in n?""+n.doubleValue:"timestampValue"in n?(function(t){const r=Ot(t);return`time(${r.seconds},${r.nanos})`})(n.timestampValue):"stringValue"in n?n.stringValue:"bytesValue"in n?(function(t){return Lt(t).toBase64()})(n.bytesValue):"referenceValue"in n?(function(t){return L.fromName(t).toString()})(n.referenceValue):"geoPointValue"in n?(function(t){return`geo(${t.latitude},${t.longitude})`})(n.geoPointValue):"arrayValue"in n?(function(t){let r="[",s=!0;for(const i of t.values||[])s?s=!1:r+=",",r+=go(i);return r+"]"})(n.arrayValue):"mapValue"in n?(function(t){const r=Object.keys(t.fields||{}).sort();let s="{",i=!0;for(const a of r)i?i=!1:s+=",",s+=`${a}:${go(t.fields[a])}`;return s+"}"})(n.mapValue):x(61005,{value:n})}function Es(n){switch(Mt(n)){case 0:case 1:return 4;case 2:return 8;case 3:case 8:return 16;case 4:const e=Ys(n);return e?16+Es(e):16;case 5:return 2*n.stringValue.length;case 6:return Lt(n.bytesValue).approximateByteSize();case 7:return n.referenceValue.length;case 9:return(function(r){return(r.values||[]).reduce(((s,i)=>s+Es(i)),0)})(n.arrayValue);case 10:case 11:return(function(r){let s=0;return jt(r.fields,((i,a)=>{s+=i.length+Es(a)})),s})(n.mapValue);default:throw x(13486,{value:n})}}function Cu(n,e){return{referenceValue:`projects/${n.projectId}/databases/${n.database}/documents/${e.path.canonicalString()}`}}function _o(n){return!!n&&"integerValue"in n}function Jo(n){return!!n&&"arrayValue"in n}function ku(n){return!!n&&"nullValue"in n}function Du(n){return!!n&&"doubleValue"in n&&isNaN(Number(n.doubleValue))}function vs(n){return!!n&&"mapValue"in n}function dy(n){var e,t;return((t=(((e=n==null?void 0:n.mapValue)===null||e===void 0?void 0:e.fields)||{})[Lh])===null||t===void 0?void 0:t.stringValue)===Mh}function dr(n){if(n.geoPointValue)return{geoPointValue:Object.assign({},n.geoPointValue)};if(n.timestampValue&&typeof n.timestampValue=="object")return{timestampValue:Object.assign({},n.timestampValue)};if(n.mapValue){const e={mapValue:{fields:{}}};return jt(n.mapValue.fields,((t,r)=>e.mapValue.fields[t]=dr(r))),e}if(n.arrayValue){const e={arrayValue:{values:[]}};for(let t=0;t<(n.arrayValue.values||[]).length;++t)e.arrayValue.values[t]=dr(n.arrayValue.values[t]);return e}return Object.assign({},n)}function fy(n){return(((n.mapValue||{}).fields||{}).__type__||{}).stringValue===hy}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ve{constructor(e){this.value=e}static empty(){return new Ve({mapValue:{}})}field(e){if(e.isEmpty())return this.value;{let t=this.value;for(let r=0;r<e.length-1;++r)if(t=(t.mapValue.fields||{})[e.get(r)],!vs(t))return null;return t=(t.mapValue.fields||{})[e.lastSegment()],t||null}}set(e,t){this.getFieldsMap(e.popLast())[e.lastSegment()]=dr(t)}setAll(e){let t=fe.emptyPath(),r={},s=[];e.forEach(((a,c)=>{if(!t.isImmediateParentOf(c)){const l=this.getFieldsMap(t);this.applyChanges(l,r,s),r={},s=[],t=c.popLast()}a?r[c.lastSegment()]=dr(a):s.push(c.lastSegment())}));const i=this.getFieldsMap(t);this.applyChanges(i,r,s)}delete(e){const t=this.field(e.popLast());vs(t)&&t.mapValue.fields&&delete t.mapValue.fields[e.lastSegment()]}isEqual(e){return Ye(this.value,e.value)}getFieldsMap(e){let t=this.value;t.mapValue.fields||(t.mapValue={fields:{}});for(let r=0;r<e.length;++r){let s=t.mapValue.fields[e.get(r)];vs(s)&&s.mapValue.fields||(s={mapValue:{fields:{}}},t.mapValue.fields[e.get(r)]=s),t=s}return t.mapValue.fields}applyChanges(e,t,r){jt(t,((s,i)=>e[s]=i));for(const s of r)delete e[s]}clone(){return new Ve(dr(this.value))}}function xh(n){const e=[];return jt(n.fields,((t,r)=>{const s=new fe([t]);if(vs(r)){const i=xh(r.mapValue).fields;if(i.length===0)e.push(s);else for(const a of i)e.push(s.child(a))}else e.push(s)})),new xe(e)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ae{constructor(e,t,r,s,i,a,c){this.key=e,this.documentType=t,this.version=r,this.readTime=s,this.createTime=i,this.data=a,this.documentState=c}static newInvalidDocument(e){return new Ae(e,0,B.min(),B.min(),B.min(),Ve.empty(),0)}static newFoundDocument(e,t,r,s){return new Ae(e,1,t,B.min(),r,s,0)}static newNoDocument(e,t){return new Ae(e,2,t,B.min(),B.min(),Ve.empty(),0)}static newUnknownDocument(e,t){return new Ae(e,3,t,B.min(),B.min(),Ve.empty(),2)}convertToFoundDocument(e,t){return!this.createTime.isEqual(B.min())||this.documentType!==2&&this.documentType!==0||(this.createTime=e),this.version=e,this.documentType=1,this.data=t,this.documentState=0,this}convertToNoDocument(e){return this.version=e,this.documentType=2,this.data=Ve.empty(),this.documentState=0,this}convertToUnknownDocument(e){return this.version=e,this.documentType=3,this.data=Ve.empty(),this.documentState=2,this}setHasCommittedMutations(){return this.documentState=2,this}setHasLocalMutations(){return this.documentState=1,this.version=B.min(),this}setReadTime(e){return this.readTime=e,this}get hasLocalMutations(){return this.documentState===1}get hasCommittedMutations(){return this.documentState===2}get hasPendingWrites(){return this.hasLocalMutations||this.hasCommittedMutations}isValidDocument(){return this.documentType!==0}isFoundDocument(){return this.documentType===1}isNoDocument(){return this.documentType===2}isUnknownDocument(){return this.documentType===3}isEqual(e){return e instanceof Ae&&this.key.isEqual(e.key)&&this.version.isEqual(e.version)&&this.documentType===e.documentType&&this.documentState===e.documentState&&this.data.isEqual(e.data)}mutableCopy(){return new Ae(this.key,this.documentType,this.version,this.readTime,this.createTime,this.data.clone(),this.documentState)}toString(){return`Document(${this.key}, ${this.version}, ${JSON.stringify(this.data.value)}, {createTime: ${this.createTime}}), {documentType: ${this.documentType}}), {documentState: ${this.documentState}})`}}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ls{constructor(e,t){this.position=e,this.inclusive=t}}function Nu(n,e,t){let r=0;for(let s=0;s<n.position.length;s++){const i=e[s],a=n.position[s];if(i.field.isKeyField()?r=L.comparator(L.fromName(a.referenceValue),t.key):r=Sn(a,t.data.field(i.field)),i.dir==="desc"&&(r*=-1),r!==0)break}return r}function Vu(n,e){if(n===null)return e===null;if(e===null||n.inclusive!==e.inclusive||n.position.length!==e.position.length)return!1;for(let t=0;t<n.position.length;t++)if(!Ye(n.position[t],e.position[t]))return!1;return!0}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class wr{constructor(e,t="asc"){this.field=e,this.dir=t}}function py(n,e){return n.dir===e.dir&&n.field.isEqual(e.field)}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Uh{}class ue extends Uh{constructor(e,t,r){super(),this.field=e,this.op=t,this.value=r}static create(e,t,r){return e.isKeyField()?t==="in"||t==="not-in"?this.createKeyFieldInFilter(e,t,r):new gy(e,t,r):t==="array-contains"?new Ey(e,r):t==="in"?new vy(e,r):t==="not-in"?new Ty(e,r):t==="array-contains-any"?new Iy(e,r):new ue(e,t,r)}static createKeyFieldInFilter(e,t,r){return t==="in"?new _y(e,r):new yy(e,r)}matches(e){const t=e.data.field(this.field);return this.op==="!="?t!==null&&t.nullValue===void 0&&this.matchesComparison(Sn(t,this.value)):t!==null&&Mt(this.value)===Mt(t)&&this.matchesComparison(Sn(t,this.value))}matchesComparison(e){switch(this.op){case"<":return e<0;case"<=":return e<=0;case"==":return e===0;case"!=":return e!==0;case">":return e>0;case">=":return e>=0;default:return x(47266,{operator:this.op})}}isInequality(){return["<","<=",">",">=","!=","not-in"].indexOf(this.op)>=0}getFlattenedFilters(){return[this]}getFilters(){return[this]}}class $e extends Uh{constructor(e,t){super(),this.filters=e,this.op=t,this.he=null}static create(e,t){return new $e(e,t)}matches(e){return Fh(this)?this.filters.find((t=>!t.matches(e)))===void 0:this.filters.find((t=>t.matches(e)))!==void 0}getFlattenedFilters(){return this.he!==null||(this.he=this.filters.reduce(((e,t)=>e.concat(t.getFlattenedFilters())),[])),this.he}getFilters(){return Object.assign([],this.filters)}}function Fh(n){return n.op==="and"}function Bh(n){return my(n)&&Fh(n)}function my(n){for(const e of n.filters)if(e instanceof $e)return!1;return!0}function yo(n){if(n instanceof ue)return n.field.canonicalString()+n.op.toString()+Pn(n.value);if(Bh(n))return n.filters.map((e=>yo(e))).join(",");{const e=n.filters.map((t=>yo(t))).join(",");return`${n.op}(${e})`}}function jh(n,e){return n instanceof ue?(function(r,s){return s instanceof ue&&r.op===s.op&&r.field.isEqual(s.field)&&Ye(r.value,s.value)})(n,e):n instanceof $e?(function(r,s){return s instanceof $e&&r.op===s.op&&r.filters.length===s.filters.length?r.filters.reduce(((i,a,c)=>i&&jh(a,s.filters[c])),!0):!1})(n,e):void x(19439)}function qh(n){return n instanceof ue?(function(t){return`${t.field.canonicalString()} ${t.op} ${Pn(t.value)}`})(n):n instanceof $e?(function(t){return t.op.toString()+" {"+t.getFilters().map(qh).join(" ,")+"}"})(n):"Filter"}class gy extends ue{constructor(e,t,r){super(e,t,r),this.key=L.fromName(r.referenceValue)}matches(e){const t=L.comparator(e.key,this.key);return this.matchesComparison(t)}}class _y extends ue{constructor(e,t){super(e,"in",t),this.keys=$h("in",t)}matches(e){return this.keys.some((t=>t.isEqual(e.key)))}}class yy extends ue{constructor(e,t){super(e,"not-in",t),this.keys=$h("not-in",t)}matches(e){return!this.keys.some((t=>t.isEqual(e.key)))}}function $h(n,e){var t;return(((t=e.arrayValue)===null||t===void 0?void 0:t.values)||[]).map((r=>L.fromName(r.referenceValue)))}class Ey extends ue{constructor(e,t){super(e,"array-contains",t)}matches(e){const t=e.data.field(this.field);return Jo(t)&&Ir(t.arrayValue,this.value)}}class vy extends ue{constructor(e,t){super(e,"in",t)}matches(e){const t=e.data.field(this.field);return t!==null&&Ir(this.value.arrayValue,t)}}class Ty extends ue{constructor(e,t){super(e,"not-in",t)}matches(e){if(Ir(this.value.arrayValue,{nullValue:"NULL_VALUE"}))return!1;const t=e.data.field(this.field);return t!==null&&t.nullValue===void 0&&!Ir(this.value.arrayValue,t)}}class Iy extends ue{constructor(e,t){super(e,"array-contains-any",t)}matches(e){const t=e.data.field(this.field);return!(!Jo(t)||!t.arrayValue.values)&&t.arrayValue.values.some((r=>Ir(this.value.arrayValue,r)))}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class wy{constructor(e,t=null,r=[],s=[],i=null,a=null,c=null){this.path=e,this.collectionGroup=t,this.orderBy=r,this.filters=s,this.limit=i,this.startAt=a,this.endAt=c,this.Pe=null}}function Ou(n,e=null,t=[],r=[],s=null,i=null,a=null){return new wy(n,e,t,r,s,i,a)}function Xo(n){const e=j(n);if(e.Pe===null){let t=e.path.canonicalString();e.collectionGroup!==null&&(t+="|cg:"+e.collectionGroup),t+="|f:",t+=e.filters.map((r=>yo(r))).join(","),t+="|ob:",t+=e.orderBy.map((r=>(function(i){return i.field.canonicalString()+i.dir})(r))).join(","),Xs(e.limit)||(t+="|l:",t+=e.limit),e.startAt&&(t+="|lb:",t+=e.startAt.inclusive?"b:":"a:",t+=e.startAt.position.map((r=>Pn(r))).join(",")),e.endAt&&(t+="|ub:",t+=e.endAt.inclusive?"a:":"b:",t+=e.endAt.position.map((r=>Pn(r))).join(",")),e.Pe=t}return e.Pe}function Yo(n,e){if(n.limit!==e.limit||n.orderBy.length!==e.orderBy.length)return!1;for(let t=0;t<n.orderBy.length;t++)if(!py(n.orderBy[t],e.orderBy[t]))return!1;if(n.filters.length!==e.filters.length)return!1;for(let t=0;t<n.filters.length;t++)if(!jh(n.filters[t],e.filters[t]))return!1;return n.collectionGroup===e.collectionGroup&&!!n.path.isEqual(e.path)&&!!Vu(n.startAt,e.startAt)&&Vu(n.endAt,e.endAt)}function Eo(n){return L.isDocumentKey(n.path)&&n.collectionGroup===null&&n.filters.length===0}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class xn{constructor(e,t=null,r=[],s=[],i=null,a="F",c=null,l=null){this.path=e,this.collectionGroup=t,this.explicitOrderBy=r,this.filters=s,this.limit=i,this.limitType=a,this.startAt=c,this.endAt=l,this.Te=null,this.Ie=null,this.de=null,this.startAt,this.endAt}}function Ay(n,e,t,r,s,i,a,c){return new xn(n,e,t,r,s,i,a,c)}function Zs(n){return new xn(n)}function Lu(n){return n.filters.length===0&&n.limit===null&&n.startAt==null&&n.endAt==null&&(n.explicitOrderBy.length===0||n.explicitOrderBy.length===1&&n.explicitOrderBy[0].field.isKeyField())}function zh(n){return n.collectionGroup!==null}function fr(n){const e=j(n);if(e.Te===null){e.Te=[];const t=new Set;for(const i of e.explicitOrderBy)e.Te.push(i),t.add(i.field.canonicalString());const r=e.explicitOrderBy.length>0?e.explicitOrderBy[e.explicitOrderBy.length-1].dir:"asc";(function(a){let c=new he(fe.comparator);return a.filters.forEach((l=>{l.getFlattenedFilters().forEach((d=>{d.isInequality()&&(c=c.add(d.field))}))})),c})(e).forEach((i=>{t.has(i.canonicalString())||i.isKeyField()||e.Te.push(new wr(i,r))})),t.has(fe.keyField().canonicalString())||e.Te.push(new wr(fe.keyField(),r))}return e.Te}function Je(n){const e=j(n);return e.Ie||(e.Ie=Ry(e,fr(n))),e.Ie}function Ry(n,e){if(n.limitType==="F")return Ou(n.path,n.collectionGroup,e,n.filters,n.limit,n.startAt,n.endAt);{e=e.map((s=>{const i=s.dir==="desc"?"asc":"desc";return new wr(s.field,i)}));const t=n.endAt?new Ls(n.endAt.position,n.endAt.inclusive):null,r=n.startAt?new Ls(n.startAt.position,n.startAt.inclusive):null;return Ou(n.path,n.collectionGroup,e,n.filters,n.limit,t,r)}}function vo(n,e){const t=n.filters.concat([e]);return new xn(n.path,n.collectionGroup,n.explicitOrderBy.slice(),t,n.limit,n.limitType,n.startAt,n.endAt)}function Ms(n,e,t){return new xn(n.path,n.collectionGroup,n.explicitOrderBy.slice(),n.filters.slice(),e,t,n.startAt,n.endAt)}function ei(n,e){return Yo(Je(n),Je(e))&&n.limitType===e.limitType}function Hh(n){return`${Xo(Je(n))}|lt:${n.limitType}`}function mn(n){return`Query(target=${(function(t){let r=t.path.canonicalString();return t.collectionGroup!==null&&(r+=" collectionGroup="+t.collectionGroup),t.filters.length>0&&(r+=`, filters: [${t.filters.map((s=>qh(s))).join(", ")}]`),Xs(t.limit)||(r+=", limit: "+t.limit),t.orderBy.length>0&&(r+=`, orderBy: [${t.orderBy.map((s=>(function(a){return`${a.field.canonicalString()} (${a.dir})`})(s))).join(", ")}]`),t.startAt&&(r+=", startAt: ",r+=t.startAt.inclusive?"b:":"a:",r+=t.startAt.position.map((s=>Pn(s))).join(",")),t.endAt&&(r+=", endAt: ",r+=t.endAt.inclusive?"a:":"b:",r+=t.endAt.position.map((s=>Pn(s))).join(",")),`Target(${r})`})(Je(n))}; limitType=${n.limitType})`}function ti(n,e){return e.isFoundDocument()&&(function(r,s){const i=s.key.path;return r.collectionGroup!==null?s.key.hasCollectionId(r.collectionGroup)&&r.path.isPrefixOf(i):L.isDocumentKey(r.path)?r.path.isEqual(i):r.path.isImmediateParentOf(i)})(n,e)&&(function(r,s){for(const i of fr(r))if(!i.field.isKeyField()&&s.data.field(i.field)===null)return!1;return!0})(n,e)&&(function(r,s){for(const i of r.filters)if(!i.matches(s))return!1;return!0})(n,e)&&(function(r,s){return!(r.startAt&&!(function(a,c,l){const d=Nu(a,c,l);return a.inclusive?d<=0:d<0})(r.startAt,fr(r),s)||r.endAt&&!(function(a,c,l){const d=Nu(a,c,l);return a.inclusive?d>=0:d>0})(r.endAt,fr(r),s))})(n,e)}function by(n){return n.collectionGroup||(n.path.length%2==1?n.path.lastSegment():n.path.get(n.path.length-2))}function Wh(n){return(e,t)=>{let r=!1;for(const s of fr(n)){const i=Sy(s,e,t);if(i!==0)return i;r=r||s.field.isKeyField()}return 0}}function Sy(n,e,t){const r=n.field.isKeyField()?L.comparator(e.key,t.key):(function(i,a,c){const l=a.data.field(i),d=c.data.field(i);return l!==null&&d!==null?Sn(l,d):x(42886)})(n.field,e,t);switch(n.dir){case"asc":return r;case"desc":return-1*r;default:return x(19790,{direction:n.dir})}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class on{constructor(e,t){this.mapKeyFn=e,this.equalsFn=t,this.inner={},this.innerSize=0}get(e){const t=this.mapKeyFn(e),r=this.inner[t];if(r!==void 0){for(const[s,i]of r)if(this.equalsFn(s,e))return i}}has(e){return this.get(e)!==void 0}set(e,t){const r=this.mapKeyFn(e),s=this.inner[r];if(s===void 0)return this.inner[r]=[[e,t]],void this.innerSize++;for(let i=0;i<s.length;i++)if(this.equalsFn(s[i][0],e))return void(s[i]=[e,t]);s.push([e,t]),this.innerSize++}delete(e){const t=this.mapKeyFn(e),r=this.inner[t];if(r===void 0)return!1;for(let s=0;s<r.length;s++)if(this.equalsFn(r[s][0],e))return r.length===1?delete this.inner[t]:r.splice(s,1),this.innerSize--,!0;return!1}forEach(e){jt(this.inner,((t,r)=>{for(const[s,i]of r)e(s,i)}))}isEmpty(){return Ch(this.inner)}size(){return this.innerSize}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Py=new re(L.comparator);function mt(){return Py}const Gh=new re(L.comparator);function cr(...n){let e=Gh;for(const t of n)e=e.insert(t.key,t);return e}function Kh(n){let e=Gh;return n.forEach(((t,r)=>e=e.insert(t,r.overlayedDocument))),e}function Qt(){return pr()}function Qh(){return pr()}function pr(){return new on((n=>n.toString()),((n,e)=>n.isEqual(e)))}const Cy=new re(L.comparator),ky=new he(L.comparator);function W(...n){let e=ky;for(const t of n)e=e.add(t);return e}const Dy=new he($);function Ny(){return Dy}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Zo(n,e){if(n.useProto3Json){if(isNaN(e))return{doubleValue:"NaN"};if(e===1/0)return{doubleValue:"Infinity"};if(e===-1/0)return{doubleValue:"-Infinity"}}return{doubleValue:Ns(e)?"-0":e}}function Jh(n){return{integerValue:""+n}}function Xh(n,e){return oy(e)?Jh(e):Zo(n,e)}/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ni{constructor(){this._=void 0}}function Vy(n,e,t){return n instanceof Ar?(function(s,i){const a={fields:{[Nh]:{stringValue:Dh},[Oh]:{timestampValue:{seconds:s.seconds,nanos:s.nanoseconds}}}};return i&&Qo(i)&&(i=Ys(i)),i&&(a.fields[Vh]=i),{mapValue:a}})(t,e):n instanceof Cn?Zh(n,e):n instanceof kn?ed(n,e):(function(s,i){const a=Yh(s,i),c=Mu(a)+Mu(s.Ee);return _o(a)&&_o(s.Ee)?Jh(c):Zo(s.serializer,c)})(n,e)}function Oy(n,e,t){return n instanceof Cn?Zh(n,e):n instanceof kn?ed(n,e):t}function Yh(n,e){return n instanceof Rr?(function(r){return _o(r)||(function(i){return!!i&&"doubleValue"in i})(r)})(e)?e:{integerValue:0}:null}class Ar extends ni{}class Cn extends ni{constructor(e){super(),this.elements=e}}function Zh(n,e){const t=td(e);for(const r of n.elements)t.some((s=>Ye(s,r)))||t.push(r);return{arrayValue:{values:t}}}class kn extends ni{constructor(e){super(),this.elements=e}}function ed(n,e){let t=td(e);for(const r of n.elements)t=t.filter((s=>!Ye(s,r)));return{arrayValue:{values:t}}}class Rr extends ni{constructor(e,t){super(),this.serializer=e,this.Ee=t}}function Mu(n){return ae(n.integerValue||n.doubleValue)}function td(n){return Jo(n)&&n.arrayValue.values?n.arrayValue.values.slice():[]}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ri{constructor(e,t){this.field=e,this.transform=t}}function Ly(n,e){return n.field.isEqual(e.field)&&(function(r,s){return r instanceof Cn&&s instanceof Cn||r instanceof kn&&s instanceof kn?Rn(r.elements,s.elements,Ye):r instanceof Rr&&s instanceof Rr?Ye(r.Ee,s.Ee):r instanceof Ar&&s instanceof Ar})(n.transform,e.transform)}class My{constructor(e,t){this.version=e,this.transformResults=t}}class De{constructor(e,t){this.updateTime=e,this.exists=t}static none(){return new De}static exists(e){return new De(void 0,e)}static updateTime(e){return new De(e)}get isNone(){return this.updateTime===void 0&&this.exists===void 0}isEqual(e){return this.exists===e.exists&&(this.updateTime?!!e.updateTime&&this.updateTime.isEqual(e.updateTime):!e.updateTime)}}function Ts(n,e){return n.updateTime!==void 0?e.isFoundDocument()&&e.version.isEqual(n.updateTime):n.exists===void 0||n.exists===e.isFoundDocument()}class si{}function nd(n,e){if(!n.hasLocalMutations||e&&e.fields.length===0)return null;if(e===null)return n.isNoDocument()?new ii(n.key,De.none()):new Vr(n.key,n.data,De.none());{const t=n.data,r=Ve.empty();let s=new he(fe.comparator);for(let i of e.fields)if(!s.has(i)){let a=t.field(i);a===null&&i.length>1&&(i=i.popLast(),a=t.field(i)),a===null?r.delete(i):r.set(i,a),s=s.add(i)}return new qt(n.key,r,new xe(s.toArray()),De.none())}}function xy(n,e,t){n instanceof Vr?(function(s,i,a){const c=s.value.clone(),l=Uu(s.fieldTransforms,i,a.transformResults);c.setAll(l),i.convertToFoundDocument(a.version,c).setHasCommittedMutations()})(n,e,t):n instanceof qt?(function(s,i,a){if(!Ts(s.precondition,i))return void i.convertToUnknownDocument(a.version);const c=Uu(s.fieldTransforms,i,a.transformResults),l=i.data;l.setAll(rd(s)),l.setAll(c),i.convertToFoundDocument(a.version,l).setHasCommittedMutations()})(n,e,t):(function(s,i,a){i.convertToNoDocument(a.version).setHasCommittedMutations()})(0,e,t)}function mr(n,e,t,r){return n instanceof Vr?(function(i,a,c,l){if(!Ts(i.precondition,a))return c;const d=i.value.clone(),p=Fu(i.fieldTransforms,l,a);return d.setAll(p),a.convertToFoundDocument(a.version,d).setHasLocalMutations(),null})(n,e,t,r):n instanceof qt?(function(i,a,c,l){if(!Ts(i.precondition,a))return c;const d=Fu(i.fieldTransforms,l,a),p=a.data;return p.setAll(rd(i)),p.setAll(d),a.convertToFoundDocument(a.version,p).setHasLocalMutations(),c===null?null:c.unionWith(i.fieldMask.fields).unionWith(i.fieldTransforms.map((m=>m.field)))})(n,e,t,r):(function(i,a,c){return Ts(i.precondition,a)?(a.convertToNoDocument(a.version).setHasLocalMutations(),null):c})(n,e,t)}function Uy(n,e){let t=null;for(const r of n.fieldTransforms){const s=e.data.field(r.field),i=Yh(r.transform,s||null);i!=null&&(t===null&&(t=Ve.empty()),t.set(r.field,i))}return t||null}function xu(n,e){return n.type===e.type&&!!n.key.isEqual(e.key)&&!!n.precondition.isEqual(e.precondition)&&!!(function(r,s){return r===void 0&&s===void 0||!(!r||!s)&&Rn(r,s,((i,a)=>Ly(i,a)))})(n.fieldTransforms,e.fieldTransforms)&&(n.type===0?n.value.isEqual(e.value):n.type!==1||n.data.isEqual(e.data)&&n.fieldMask.isEqual(e.fieldMask))}class Vr extends si{constructor(e,t,r,s=[]){super(),this.key=e,this.value=t,this.precondition=r,this.fieldTransforms=s,this.type=0}getFieldMask(){return null}}class qt extends si{constructor(e,t,r,s,i=[]){super(),this.key=e,this.data=t,this.fieldMask=r,this.precondition=s,this.fieldTransforms=i,this.type=1}getFieldMask(){return this.fieldMask}}function rd(n){const e=new Map;return n.fieldMask.fields.forEach((t=>{if(!t.isEmpty()){const r=n.data.field(t);e.set(t,r)}})),e}function Uu(n,e,t){const r=new Map;Q(n.length===t.length,32656,{Ae:t.length,Re:n.length});for(let s=0;s<t.length;s++){const i=n[s],a=i.transform,c=e.data.field(i.field);r.set(i.field,Oy(a,c,t[s]))}return r}function Fu(n,e,t){const r=new Map;for(const s of n){const i=s.transform,a=t.data.field(s.field);r.set(s.field,Vy(i,a,e))}return r}class ii extends si{constructor(e,t){super(),this.key=e,this.precondition=t,this.type=2,this.fieldTransforms=[]}getFieldMask(){return null}}class Fy extends si{constructor(e,t){super(),this.key=e,this.precondition=t,this.type=3,this.fieldTransforms=[]}getFieldMask(){return null}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class By{constructor(e,t,r,s){this.batchId=e,this.localWriteTime=t,this.baseMutations=r,this.mutations=s}applyToRemoteDocument(e,t){const r=t.mutationResults;for(let s=0;s<this.mutations.length;s++){const i=this.mutations[s];i.key.isEqual(e.key)&&xy(i,e,r[s])}}applyToLocalView(e,t){for(const r of this.baseMutations)r.key.isEqual(e.key)&&(t=mr(r,e,t,this.localWriteTime));for(const r of this.mutations)r.key.isEqual(e.key)&&(t=mr(r,e,t,this.localWriteTime));return t}applyToLocalDocumentSet(e,t){const r=Qh();return this.mutations.forEach((s=>{const i=e.get(s.key),a=i.overlayedDocument;let c=this.applyToLocalView(a,i.mutatedFields);c=t.has(s.key)?null:c;const l=nd(a,c);l!==null&&r.set(s.key,l),a.isValidDocument()||a.convertToNoDocument(B.min())})),r}keys(){return this.mutations.reduce(((e,t)=>e.add(t.key)),W())}isEqual(e){return this.batchId===e.batchId&&Rn(this.mutations,e.mutations,((t,r)=>xu(t,r)))&&Rn(this.baseMutations,e.baseMutations,((t,r)=>xu(t,r)))}}class ea{constructor(e,t,r,s){this.batch=e,this.commitVersion=t,this.mutationResults=r,this.docVersions=s}static from(e,t,r){Q(e.mutations.length===r.length,58842,{Ve:e.mutations.length,me:r.length});let s=(function(){return Cy})();const i=e.mutations;for(let a=0;a<i.length;a++)s=s.insert(i[a].key,r[a].version);return new ea(e,t,r,s)}}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class jy{constructor(e,t){this.largestBatchId=e,this.mutation=t}getKey(){return this.mutation.key}isEqual(e){return e!==null&&this.mutation===e.mutation}toString(){return`Overlay{
      largestBatchId: ${this.largestBatchId},
      mutation: ${this.mutation.toString()}
    }`}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class qy{constructor(e,t){this.count=e,this.unchangedNames=t}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */var ce,G;function $y(n){switch(n){case S.OK:return x(64938);case S.CANCELLED:case S.UNKNOWN:case S.DEADLINE_EXCEEDED:case S.RESOURCE_EXHAUSTED:case S.INTERNAL:case S.UNAVAILABLE:case S.UNAUTHENTICATED:return!1;case S.INVALID_ARGUMENT:case S.NOT_FOUND:case S.ALREADY_EXISTS:case S.PERMISSION_DENIED:case S.FAILED_PRECONDITION:case S.ABORTED:case S.OUT_OF_RANGE:case S.UNIMPLEMENTED:case S.DATA_LOSS:return!0;default:return x(15467,{code:n})}}function sd(n){if(n===void 0)return ft("GRPC error has no .code"),S.UNKNOWN;switch(n){case ce.OK:return S.OK;case ce.CANCELLED:return S.CANCELLED;case ce.UNKNOWN:return S.UNKNOWN;case ce.DEADLINE_EXCEEDED:return S.DEADLINE_EXCEEDED;case ce.RESOURCE_EXHAUSTED:return S.RESOURCE_EXHAUSTED;case ce.INTERNAL:return S.INTERNAL;case ce.UNAVAILABLE:return S.UNAVAILABLE;case ce.UNAUTHENTICATED:return S.UNAUTHENTICATED;case ce.INVALID_ARGUMENT:return S.INVALID_ARGUMENT;case ce.NOT_FOUND:return S.NOT_FOUND;case ce.ALREADY_EXISTS:return S.ALREADY_EXISTS;case ce.PERMISSION_DENIED:return S.PERMISSION_DENIED;case ce.FAILED_PRECONDITION:return S.FAILED_PRECONDITION;case ce.ABORTED:return S.ABORTED;case ce.OUT_OF_RANGE:return S.OUT_OF_RANGE;case ce.UNIMPLEMENTED:return S.UNIMPLEMENTED;case ce.DATA_LOSS:return S.DATA_LOSS;default:return x(39323,{code:n})}}(G=ce||(ce={}))[G.OK=0]="OK",G[G.CANCELLED=1]="CANCELLED",G[G.UNKNOWN=2]="UNKNOWN",G[G.INVALID_ARGUMENT=3]="INVALID_ARGUMENT",G[G.DEADLINE_EXCEEDED=4]="DEADLINE_EXCEEDED",G[G.NOT_FOUND=5]="NOT_FOUND",G[G.ALREADY_EXISTS=6]="ALREADY_EXISTS",G[G.PERMISSION_DENIED=7]="PERMISSION_DENIED",G[G.UNAUTHENTICATED=16]="UNAUTHENTICATED",G[G.RESOURCE_EXHAUSTED=8]="RESOURCE_EXHAUSTED",G[G.FAILED_PRECONDITION=9]="FAILED_PRECONDITION",G[G.ABORTED=10]="ABORTED",G[G.OUT_OF_RANGE=11]="OUT_OF_RANGE",G[G.UNIMPLEMENTED=12]="UNIMPLEMENTED",G[G.INTERNAL=13]="INTERNAL",G[G.UNAVAILABLE=14]="UNAVAILABLE",G[G.DATA_LOSS=15]="DATA_LOSS";/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const zy=new Ct([4294967295,4294967295],0);function Bu(n){const e=Ah().encode(n),t=new mh;return t.update(e),new Uint8Array(t.digest())}function ju(n){const e=new DataView(n.buffer),t=e.getUint32(0,!0),r=e.getUint32(4,!0),s=e.getUint32(8,!0),i=e.getUint32(12,!0);return[new Ct([t,r],0),new Ct([s,i],0)]}class ta{constructor(e,t,r){if(this.bitmap=e,this.padding=t,this.hashCount=r,t<0||t>=8)throw new ur(`Invalid padding: ${t}`);if(r<0)throw new ur(`Invalid hash count: ${r}`);if(e.length>0&&this.hashCount===0)throw new ur(`Invalid hash count: ${r}`);if(e.length===0&&t!==0)throw new ur(`Invalid padding when bitmap length is 0: ${t}`);this.fe=8*e.length-t,this.ge=Ct.fromNumber(this.fe)}pe(e,t,r){let s=e.add(t.multiply(Ct.fromNumber(r)));return s.compare(zy)===1&&(s=new Ct([s.getBits(0),s.getBits(1)],0)),s.modulo(this.ge).toNumber()}ye(e){return!!(this.bitmap[Math.floor(e/8)]&1<<e%8)}mightContain(e){if(this.fe===0)return!1;const t=Bu(e),[r,s]=ju(t);for(let i=0;i<this.hashCount;i++){const a=this.pe(r,s,i);if(!this.ye(a))return!1}return!0}static create(e,t,r){const s=e%8==0?0:8-e%8,i=new Uint8Array(Math.ceil(e/8)),a=new ta(i,s,t);return r.forEach((c=>a.insert(c))),a}insert(e){if(this.fe===0)return;const t=Bu(e),[r,s]=ju(t);for(let i=0;i<this.hashCount;i++){const a=this.pe(r,s,i);this.we(a)}}we(e){const t=Math.floor(e/8),r=e%8;this.bitmap[t]|=1<<r}}class ur extends Error{constructor(){super(...arguments),this.name="BloomFilterError"}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class oi{constructor(e,t,r,s,i){this.snapshotVersion=e,this.targetChanges=t,this.targetMismatches=r,this.documentUpdates=s,this.resolvedLimboDocuments=i}static createSynthesizedRemoteEventForCurrentChange(e,t,r){const s=new Map;return s.set(e,Or.createSynthesizedTargetChangeForCurrentChange(e,t,r)),new oi(B.min(),s,new re($),mt(),W())}}class Or{constructor(e,t,r,s,i){this.resumeToken=e,this.current=t,this.addedDocuments=r,this.modifiedDocuments=s,this.removedDocuments=i}static createSynthesizedTargetChangeForCurrentChange(e,t,r){return new Or(r,t,W(),W(),W())}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Is{constructor(e,t,r,s){this.Se=e,this.removedTargetIds=t,this.key=r,this.be=s}}class id{constructor(e,t){this.targetId=e,this.De=t}}class od{constructor(e,t,r=pe.EMPTY_BYTE_STRING,s=null){this.state=e,this.targetIds=t,this.resumeToken=r,this.cause=s}}class qu{constructor(){this.ve=0,this.Ce=$u(),this.Fe=pe.EMPTY_BYTE_STRING,this.Me=!1,this.xe=!0}get current(){return this.Me}get resumeToken(){return this.Fe}get Oe(){return this.ve!==0}get Ne(){return this.xe}Be(e){e.approximateByteSize()>0&&(this.xe=!0,this.Fe=e)}Le(){let e=W(),t=W(),r=W();return this.Ce.forEach(((s,i)=>{switch(i){case 0:e=e.add(s);break;case 2:t=t.add(s);break;case 1:r=r.add(s);break;default:x(38017,{changeType:i})}})),new Or(this.Fe,this.Me,e,t,r)}ke(){this.xe=!1,this.Ce=$u()}qe(e,t){this.xe=!0,this.Ce=this.Ce.insert(e,t)}Qe(e){this.xe=!0,this.Ce=this.Ce.remove(e)}$e(){this.ve+=1}Ue(){this.ve-=1,Q(this.ve>=0,3241,{ve:this.ve})}Ke(){this.xe=!0,this.Me=!0}}class Hy{constructor(e){this.We=e,this.Ge=new Map,this.ze=mt(),this.je=ls(),this.Je=ls(),this.He=new re($)}Ye(e){for(const t of e.Se)e.be&&e.be.isFoundDocument()?this.Ze(t,e.be):this.Xe(t,e.key,e.be);for(const t of e.removedTargetIds)this.Xe(t,e.key,e.be)}et(e){this.forEachTarget(e,(t=>{const r=this.tt(t);switch(e.state){case 0:this.nt(t)&&r.Be(e.resumeToken);break;case 1:r.Ue(),r.Oe||r.ke(),r.Be(e.resumeToken);break;case 2:r.Ue(),r.Oe||this.removeTarget(t);break;case 3:this.nt(t)&&(r.Ke(),r.Be(e.resumeToken));break;case 4:this.nt(t)&&(this.rt(t),r.Be(e.resumeToken));break;default:x(56790,{state:e.state})}}))}forEachTarget(e,t){e.targetIds.length>0?e.targetIds.forEach(t):this.Ge.forEach(((r,s)=>{this.nt(s)&&t(s)}))}it(e){const t=e.targetId,r=e.De.count,s=this.st(t);if(s){const i=s.target;if(Eo(i))if(r===0){const a=new L(i.path);this.Xe(t,a,Ae.newNoDocument(a,B.min()))}else Q(r===1,20013,{expectedCount:r});else{const a=this.ot(t);if(a!==r){const c=this._t(e),l=c?this.ut(c,e,a):1;if(l!==0){this.rt(t);const d=l===2?"TargetPurposeExistenceFilterMismatchBloom":"TargetPurposeExistenceFilterMismatch";this.He=this.He.insert(t,d)}}}}}_t(e){const t=e.De.unchangedNames;if(!t||!t.bits)return null;const{bits:{bitmap:r="",padding:s=0},hashCount:i=0}=t;let a,c;try{a=Lt(r).toUint8Array()}catch(l){if(l instanceof kh)return pt("Decoding the base64 bloom filter in existence filter failed ("+l.message+"); ignoring the bloom filter and falling back to full re-query."),null;throw l}try{c=new ta(a,s,i)}catch(l){return pt(l instanceof ur?"BloomFilter error: ":"Applying bloom filter failed: ",l),null}return c.fe===0?null:c}ut(e,t,r){return t.De.count===r-this.ht(e,t.targetId)?0:2}ht(e,t){const r=this.We.getRemoteKeysForTarget(t);let s=0;return r.forEach((i=>{const a=this.We.lt(),c=`projects/${a.projectId}/databases/${a.database}/documents/${i.path.canonicalString()}`;e.mightContain(c)||(this.Xe(t,i,null),s++)})),s}Pt(e){const t=new Map;this.Ge.forEach(((i,a)=>{const c=this.st(a);if(c){if(i.current&&Eo(c.target)){const l=new L(c.target.path);this.Tt(l).has(a)||this.It(a,l)||this.Xe(a,l,Ae.newNoDocument(l,e))}i.Ne&&(t.set(a,i.Le()),i.ke())}}));let r=W();this.Je.forEach(((i,a)=>{let c=!0;a.forEachWhile((l=>{const d=this.st(l);return!d||d.purpose==="TargetPurposeLimboResolution"||(c=!1,!1)})),c&&(r=r.add(i))})),this.ze.forEach(((i,a)=>a.setReadTime(e)));const s=new oi(e,t,this.He,this.ze,r);return this.ze=mt(),this.je=ls(),this.Je=ls(),this.He=new re($),s}Ze(e,t){if(!this.nt(e))return;const r=this.It(e,t.key)?2:0;this.tt(e).qe(t.key,r),this.ze=this.ze.insert(t.key,t),this.je=this.je.insert(t.key,this.Tt(t.key).add(e)),this.Je=this.Je.insert(t.key,this.dt(t.key).add(e))}Xe(e,t,r){if(!this.nt(e))return;const s=this.tt(e);this.It(e,t)?s.qe(t,1):s.Qe(t),this.Je=this.Je.insert(t,this.dt(t).delete(e)),this.Je=this.Je.insert(t,this.dt(t).add(e)),r&&(this.ze=this.ze.insert(t,r))}removeTarget(e){this.Ge.delete(e)}ot(e){const t=this.tt(e).Le();return this.We.getRemoteKeysForTarget(e).size+t.addedDocuments.size-t.removedDocuments.size}$e(e){this.tt(e).$e()}tt(e){let t=this.Ge.get(e);return t||(t=new qu,this.Ge.set(e,t)),t}dt(e){let t=this.Je.get(e);return t||(t=new he($),this.Je=this.Je.insert(e,t)),t}Tt(e){let t=this.je.get(e);return t||(t=new he($),this.je=this.je.insert(e,t)),t}nt(e){const t=this.st(e)!==null;return t||O("WatchChangeAggregator","Detected inactive target",e),t}st(e){const t=this.Ge.get(e);return t&&t.Oe?null:this.We.Et(e)}rt(e){this.Ge.set(e,new qu),this.We.getRemoteKeysForTarget(e).forEach((t=>{this.Xe(e,t,null)}))}It(e,t){return this.We.getRemoteKeysForTarget(e).has(t)}}function ls(){return new re(L.comparator)}function $u(){return new re(L.comparator)}const Wy={asc:"ASCENDING",desc:"DESCENDING"},Gy={"<":"LESS_THAN","<=":"LESS_THAN_OR_EQUAL",">":"GREATER_THAN",">=":"GREATER_THAN_OR_EQUAL","==":"EQUAL","!=":"NOT_EQUAL","array-contains":"ARRAY_CONTAINS",in:"IN","not-in":"NOT_IN","array-contains-any":"ARRAY_CONTAINS_ANY"},Ky={and:"AND",or:"OR"};class Qy{constructor(e,t){this.databaseId=e,this.useProto3Json=t}}function To(n,e){return n.useProto3Json||Xs(e)?e:{value:e}}function xs(n,e){return n.useProto3Json?`${new Date(1e3*e.seconds).toISOString().replace(/\.\d*/,"").replace("Z","")}.${("000000000"+e.nanoseconds).slice(-9)}Z`:{seconds:""+e.seconds,nanos:e.nanoseconds}}function ad(n,e){return n.useProto3Json?e.toBase64():e.toUint8Array()}function Jy(n,e){return xs(n,e.toTimestamp())}function Xe(n){return Q(!!n,49232),B.fromTimestamp((function(t){const r=Ot(t);return new Z(r.seconds,r.nanos)})(n))}function na(n,e){return Io(n,e).canonicalString()}function Io(n,e){const t=(function(s){return new Y(["projects",s.projectId,"databases",s.database])})(n).child("documents");return e===void 0?t:t.child(e)}function cd(n){const e=Y.fromString(n);return Q(fd(e),10190,{key:e.toString()}),e}function wo(n,e){return na(n.databaseId,e.path)}function Ji(n,e){const t=cd(e);if(t.get(1)!==n.databaseId.projectId)throw new N(S.INVALID_ARGUMENT,"Tried to deserialize key from different project: "+t.get(1)+" vs "+n.databaseId.projectId);if(t.get(3)!==n.databaseId.database)throw new N(S.INVALID_ARGUMENT,"Tried to deserialize key from different database: "+t.get(3)+" vs "+n.databaseId.database);return new L(ld(t))}function ud(n,e){return na(n.databaseId,e)}function Xy(n){const e=cd(n);return e.length===4?Y.emptyPath():ld(e)}function Ao(n){return new Y(["projects",n.databaseId.projectId,"databases",n.databaseId.database]).canonicalString()}function ld(n){return Q(n.length>4&&n.get(4)==="documents",29091,{key:n.toString()}),n.popFirst(5)}function zu(n,e,t){return{name:wo(n,e),fields:t.value.mapValue.fields}}function Yy(n,e){let t;if("targetChange"in e){e.targetChange;const r=(function(d){return d==="NO_CHANGE"?0:d==="ADD"?1:d==="REMOVE"?2:d==="CURRENT"?3:d==="RESET"?4:x(39313,{state:d})})(e.targetChange.targetChangeType||"NO_CHANGE"),s=e.targetChange.targetIds||[],i=(function(d,p){return d.useProto3Json?(Q(p===void 0||typeof p=="string",58123),pe.fromBase64String(p||"")):(Q(p===void 0||p instanceof Buffer||p instanceof Uint8Array,16193),pe.fromUint8Array(p||new Uint8Array))})(n,e.targetChange.resumeToken),a=e.targetChange.cause,c=a&&(function(d){const p=d.code===void 0?S.UNKNOWN:sd(d.code);return new N(p,d.message||"")})(a);t=new od(r,s,i,c||null)}else if("documentChange"in e){e.documentChange;const r=e.documentChange;r.document,r.document.name,r.document.updateTime;const s=Ji(n,r.document.name),i=Xe(r.document.updateTime),a=r.document.createTime?Xe(r.document.createTime):B.min(),c=new Ve({mapValue:{fields:r.document.fields}}),l=Ae.newFoundDocument(s,i,a,c),d=r.targetIds||[],p=r.removedTargetIds||[];t=new Is(d,p,l.key,l)}else if("documentDelete"in e){e.documentDelete;const r=e.documentDelete;r.document;const s=Ji(n,r.document),i=r.readTime?Xe(r.readTime):B.min(),a=Ae.newNoDocument(s,i),c=r.removedTargetIds||[];t=new Is([],c,a.key,a)}else if("documentRemove"in e){e.documentRemove;const r=e.documentRemove;r.document;const s=Ji(n,r.document),i=r.removedTargetIds||[];t=new Is([],i,s,null)}else{if(!("filter"in e))return x(11601,{At:e});{e.filter;const r=e.filter;r.targetId;const{count:s=0,unchangedNames:i}=r,a=new qy(s,i),c=r.targetId;t=new id(c,a)}}return t}function Zy(n,e){let t;if(e instanceof Vr)t={update:zu(n,e.key,e.value)};else if(e instanceof ii)t={delete:wo(n,e.key)};else if(e instanceof qt)t={update:zu(n,e.key,e.data),updateMask:cE(e.fieldMask)};else{if(!(e instanceof Fy))return x(16599,{Rt:e.type});t={verify:wo(n,e.key)}}return e.fieldTransforms.length>0&&(t.updateTransforms=e.fieldTransforms.map((r=>(function(i,a){const c=a.transform;if(c instanceof Ar)return{fieldPath:a.field.canonicalString(),setToServerValue:"REQUEST_TIME"};if(c instanceof Cn)return{fieldPath:a.field.canonicalString(),appendMissingElements:{values:c.elements}};if(c instanceof kn)return{fieldPath:a.field.canonicalString(),removeAllFromArray:{values:c.elements}};if(c instanceof Rr)return{fieldPath:a.field.canonicalString(),increment:c.Ee};throw x(20930,{transform:a.transform})})(0,r)))),e.precondition.isNone||(t.currentDocument=(function(s,i){return i.updateTime!==void 0?{updateTime:Jy(s,i.updateTime)}:i.exists!==void 0?{exists:i.exists}:x(27497)})(n,e.precondition)),t}function eE(n,e){return n&&n.length>0?(Q(e!==void 0,14353),n.map((t=>(function(s,i){let a=s.updateTime?Xe(s.updateTime):Xe(i);return a.isEqual(B.min())&&(a=Xe(i)),new My(a,s.transformResults||[])})(t,e)))):[]}function tE(n,e){return{documents:[ud(n,e.path)]}}function nE(n,e){const t={structuredQuery:{}},r=e.path;let s;e.collectionGroup!==null?(s=r,t.structuredQuery.from=[{collectionId:e.collectionGroup,allDescendants:!0}]):(s=r.popLast(),t.structuredQuery.from=[{collectionId:r.lastSegment()}]),t.parent=ud(n,s);const i=(function(d){if(d.length!==0)return dd($e.create(d,"and"))})(e.filters);i&&(t.structuredQuery.where=i);const a=(function(d){if(d.length!==0)return d.map((p=>(function(E){return{field:gn(E.field),direction:iE(E.dir)}})(p)))})(e.orderBy);a&&(t.structuredQuery.orderBy=a);const c=To(n,e.limit);return c!==null&&(t.structuredQuery.limit=c),e.startAt&&(t.structuredQuery.startAt=(function(d){return{before:d.inclusive,values:d.position}})(e.startAt)),e.endAt&&(t.structuredQuery.endAt=(function(d){return{before:!d.inclusive,values:d.position}})(e.endAt)),{Vt:t,parent:s}}function rE(n){let e=Xy(n.parent);const t=n.structuredQuery,r=t.from?t.from.length:0;let s=null;if(r>0){Q(r===1,65062);const p=t.from[0];p.allDescendants?s=p.collectionId:e=e.child(p.collectionId)}let i=[];t.where&&(i=(function(m){const E=hd(m);return E instanceof $e&&Bh(E)?E.getFilters():[E]})(t.where));let a=[];t.orderBy&&(a=(function(m){return m.map((E=>(function(C){return new wr(_n(C.field),(function(k){switch(k){case"ASCENDING":return"asc";case"DESCENDING":return"desc";default:return}})(C.direction))})(E)))})(t.orderBy));let c=null;t.limit&&(c=(function(m){let E;return E=typeof m=="object"?m.value:m,Xs(E)?null:E})(t.limit));let l=null;t.startAt&&(l=(function(m){const E=!!m.before,b=m.values||[];return new Ls(b,E)})(t.startAt));let d=null;return t.endAt&&(d=(function(m){const E=!m.before,b=m.values||[];return new Ls(b,E)})(t.endAt)),Ay(e,s,a,i,c,"F",l,d)}function sE(n,e){const t=(function(s){switch(s){case"TargetPurposeListen":return null;case"TargetPurposeExistenceFilterMismatch":return"existence-filter-mismatch";case"TargetPurposeExistenceFilterMismatchBloom":return"existence-filter-mismatch-bloom";case"TargetPurposeLimboResolution":return"limbo-document";default:return x(28987,{purpose:s})}})(e.purpose);return t==null?null:{"goog-listen-tags":t}}function hd(n){return n.unaryFilter!==void 0?(function(t){switch(t.unaryFilter.op){case"IS_NAN":const r=_n(t.unaryFilter.field);return ue.create(r,"==",{doubleValue:NaN});case"IS_NULL":const s=_n(t.unaryFilter.field);return ue.create(s,"==",{nullValue:"NULL_VALUE"});case"IS_NOT_NAN":const i=_n(t.unaryFilter.field);return ue.create(i,"!=",{doubleValue:NaN});case"IS_NOT_NULL":const a=_n(t.unaryFilter.field);return ue.create(a,"!=",{nullValue:"NULL_VALUE"});case"OPERATOR_UNSPECIFIED":return x(61313);default:return x(60726)}})(n):n.fieldFilter!==void 0?(function(t){return ue.create(_n(t.fieldFilter.field),(function(s){switch(s){case"EQUAL":return"==";case"NOT_EQUAL":return"!=";case"GREATER_THAN":return">";case"GREATER_THAN_OR_EQUAL":return">=";case"LESS_THAN":return"<";case"LESS_THAN_OR_EQUAL":return"<=";case"ARRAY_CONTAINS":return"array-contains";case"IN":return"in";case"NOT_IN":return"not-in";case"ARRAY_CONTAINS_ANY":return"array-contains-any";case"OPERATOR_UNSPECIFIED":return x(58110);default:return x(50506)}})(t.fieldFilter.op),t.fieldFilter.value)})(n):n.compositeFilter!==void 0?(function(t){return $e.create(t.compositeFilter.filters.map((r=>hd(r))),(function(s){switch(s){case"AND":return"and";case"OR":return"or";default:return x(1026)}})(t.compositeFilter.op))})(n):x(30097,{filter:n})}function iE(n){return Wy[n]}function oE(n){return Gy[n]}function aE(n){return Ky[n]}function gn(n){return{fieldPath:n.canonicalString()}}function _n(n){return fe.fromServerFormat(n.fieldPath)}function dd(n){return n instanceof ue?(function(t){if(t.op==="=="){if(Du(t.value))return{unaryFilter:{field:gn(t.field),op:"IS_NAN"}};if(ku(t.value))return{unaryFilter:{field:gn(t.field),op:"IS_NULL"}}}else if(t.op==="!="){if(Du(t.value))return{unaryFilter:{field:gn(t.field),op:"IS_NOT_NAN"}};if(ku(t.value))return{unaryFilter:{field:gn(t.field),op:"IS_NOT_NULL"}}}return{fieldFilter:{field:gn(t.field),op:oE(t.op),value:t.value}}})(n):n instanceof $e?(function(t){const r=t.getFilters().map((s=>dd(s)));return r.length===1?r[0]:{compositeFilter:{op:aE(t.op),filters:r}}})(n):x(54877,{filter:n})}function cE(n){const e=[];return n.fields.forEach((t=>e.push(t.canonicalString()))),{fieldPaths:e}}function fd(n){return n.length>=4&&n.get(0)==="projects"&&n.get(2)==="databases"}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class St{constructor(e,t,r,s,i=B.min(),a=B.min(),c=pe.EMPTY_BYTE_STRING,l=null){this.target=e,this.targetId=t,this.purpose=r,this.sequenceNumber=s,this.snapshotVersion=i,this.lastLimboFreeSnapshotVersion=a,this.resumeToken=c,this.expectedCount=l}withSequenceNumber(e){return new St(this.target,this.targetId,this.purpose,e,this.snapshotVersion,this.lastLimboFreeSnapshotVersion,this.resumeToken,this.expectedCount)}withResumeToken(e,t){return new St(this.target,this.targetId,this.purpose,this.sequenceNumber,t,this.lastLimboFreeSnapshotVersion,e,null)}withExpectedCount(e){return new St(this.target,this.targetId,this.purpose,this.sequenceNumber,this.snapshotVersion,this.lastLimboFreeSnapshotVersion,this.resumeToken,e)}withLastLimboFreeSnapshotVersion(e){return new St(this.target,this.targetId,this.purpose,this.sequenceNumber,this.snapshotVersion,e,this.resumeToken,this.expectedCount)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class uE{constructor(e){this.gt=e}}function lE(n){const e=rE({parent:n.parent,structuredQuery:n.structuredQuery});return n.limitType==="LAST"?Ms(e,e.limit,"L"):e}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class hE{constructor(){this.Dn=new dE}addToCollectionParentIndex(e,t){return this.Dn.add(t),P.resolve()}getCollectionParents(e,t){return P.resolve(this.Dn.getEntries(t))}addFieldIndex(e,t){return P.resolve()}deleteFieldIndex(e,t){return P.resolve()}deleteAllFieldIndexes(e){return P.resolve()}createTargetIndexes(e,t){return P.resolve()}getDocumentsMatchingTarget(e,t){return P.resolve(null)}getIndexType(e,t){return P.resolve(0)}getFieldIndexes(e,t){return P.resolve([])}getNextCollectionGroupToUpdate(e){return P.resolve(null)}getMinOffset(e,t){return P.resolve(Vt.min())}getMinOffsetFromCollectionGroup(e,t){return P.resolve(Vt.min())}updateCollectionGroup(e,t,r){return P.resolve()}updateIndexEntries(e,t){return P.resolve()}}class dE{constructor(){this.index={}}add(e){const t=e.lastSegment(),r=e.popLast(),s=this.index[t]||new he(Y.comparator),i=!s.has(r);return this.index[t]=s.add(r),i}has(e){const t=e.lastSegment(),r=e.popLast(),s=this.index[t];return s&&s.has(r)}getEntries(e){return(this.index[e]||new he(Y.comparator)).toArray()}}/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Hu={didRun:!1,sequenceNumbersCollected:0,targetsRemoved:0,documentsRemoved:0},pd=41943040;class Ne{static withCacheSize(e){return new Ne(e,Ne.DEFAULT_COLLECTION_PERCENTILE,Ne.DEFAULT_MAX_SEQUENCE_NUMBERS_TO_COLLECT)}constructor(e,t,r){this.cacheSizeCollectionThreshold=e,this.percentileToCollect=t,this.maximumSequenceNumbersToCollect=r}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */Ne.DEFAULT_COLLECTION_PERCENTILE=10,Ne.DEFAULT_MAX_SEQUENCE_NUMBERS_TO_COLLECT=1e3,Ne.DEFAULT=new Ne(pd,Ne.DEFAULT_COLLECTION_PERCENTILE,Ne.DEFAULT_MAX_SEQUENCE_NUMBERS_TO_COLLECT),Ne.DISABLED=new Ne(-1,0,0);/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Dn{constructor(e){this._r=e}next(){return this._r+=2,this._r}static ar(){return new Dn(0)}static ur(){return new Dn(-1)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Wu="LruGarbageCollector",fE=1048576;function Gu([n,e],[t,r]){const s=$(n,t);return s===0?$(e,r):s}class pE{constructor(e){this.Tr=e,this.buffer=new he(Gu),this.Ir=0}dr(){return++this.Ir}Er(e){const t=[e,this.dr()];if(this.buffer.size<this.Tr)this.buffer=this.buffer.add(t);else{const r=this.buffer.last();Gu(t,r)<0&&(this.buffer=this.buffer.delete(r).add(t))}}get maxValue(){return this.buffer.last()[0]}}class mE{constructor(e,t,r){this.garbageCollector=e,this.asyncQueue=t,this.localStore=r,this.Ar=null}start(){this.garbageCollector.params.cacheSizeCollectionThreshold!==-1&&this.Rr(6e4)}stop(){this.Ar&&(this.Ar.cancel(),this.Ar=null)}get started(){return this.Ar!==null}Rr(e){O(Wu,`Garbage collection scheduled in ${e}ms`),this.Ar=this.asyncQueue.enqueueAfterDelay("lru_garbage_collection",e,(async()=>{this.Ar=null;try{await this.localStore.collectGarbage(this.garbageCollector)}catch(t){Mn(t)?O(Wu,"Ignoring IndexedDB error during garbage collection: ",t):await Ln(t)}await this.Rr(3e5)}))}}class gE{constructor(e,t){this.Vr=e,this.params=t}calculateTargetCount(e,t){return this.Vr.mr(e).next((r=>Math.floor(t/100*r)))}nthSequenceNumber(e,t){if(t===0)return P.resolve(Js.ue);const r=new pE(t);return this.Vr.forEachTarget(e,(s=>r.Er(s.sequenceNumber))).next((()=>this.Vr.gr(e,(s=>r.Er(s))))).next((()=>r.maxValue))}removeTargets(e,t,r){return this.Vr.removeTargets(e,t,r)}removeOrphanedDocuments(e,t){return this.Vr.removeOrphanedDocuments(e,t)}collect(e,t){return this.params.cacheSizeCollectionThreshold===-1?(O("LruGarbageCollector","Garbage collection skipped; disabled"),P.resolve(Hu)):this.getCacheSize(e).next((r=>r<this.params.cacheSizeCollectionThreshold?(O("LruGarbageCollector",`Garbage collection skipped; Cache size ${r} is lower than threshold ${this.params.cacheSizeCollectionThreshold}`),Hu):this.pr(e,t)))}getCacheSize(e){return this.Vr.getCacheSize(e)}pr(e,t){let r,s,i,a,c,l,d;const p=Date.now();return this.calculateTargetCount(e,this.params.percentileToCollect).next((m=>(m>this.params.maximumSequenceNumbersToCollect?(O("LruGarbageCollector",`Capping sequence numbers to collect down to the maximum of ${this.params.maximumSequenceNumbersToCollect} from ${m}`),s=this.params.maximumSequenceNumbersToCollect):s=m,a=Date.now(),this.nthSequenceNumber(e,s)))).next((m=>(r=m,c=Date.now(),this.removeTargets(e,r,t)))).next((m=>(i=m,l=Date.now(),this.removeOrphanedDocuments(e,r)))).next((m=>(d=Date.now(),pn()<=H.DEBUG&&O("LruGarbageCollector",`LRU Garbage Collection
	Counted targets in ${a-p}ms
	Determined least recently used ${s} in `+(c-a)+`ms
	Removed ${i} targets in `+(l-c)+`ms
	Removed ${m} documents in `+(d-l)+`ms
Total Duration: ${d-p}ms`),P.resolve({didRun:!0,sequenceNumbersCollected:s,targetsRemoved:i,documentsRemoved:m}))))}}function _E(n,e){return new gE(n,e)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class yE{constructor(){this.changes=new on((e=>e.toString()),((e,t)=>e.isEqual(t))),this.changesApplied=!1}addEntry(e){this.assertNotApplied(),this.changes.set(e.key,e)}removeEntry(e,t){this.assertNotApplied(),this.changes.set(e,Ae.newInvalidDocument(e).setReadTime(t))}getEntry(e,t){this.assertNotApplied();const r=this.changes.get(t);return r!==void 0?P.resolve(r):this.getFromCache(e,t)}getEntries(e,t){return this.getAllFromCache(e,t)}apply(e){return this.assertNotApplied(),this.changesApplied=!0,this.applyChanges(e)}assertNotApplied(){}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *//**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class EE{constructor(e,t){this.overlayedDocument=e,this.mutatedFields=t}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class vE{constructor(e,t,r,s){this.remoteDocumentCache=e,this.mutationQueue=t,this.documentOverlayCache=r,this.indexManager=s}getDocument(e,t){let r=null;return this.documentOverlayCache.getOverlay(e,t).next((s=>(r=s,this.remoteDocumentCache.getEntry(e,t)))).next((s=>(r!==null&&mr(r.mutation,s,xe.empty(),Z.now()),s)))}getDocuments(e,t){return this.remoteDocumentCache.getEntries(e,t).next((r=>this.getLocalViewOfDocuments(e,r,W()).next((()=>r))))}getLocalViewOfDocuments(e,t,r=W()){const s=Qt();return this.populateOverlays(e,s,t).next((()=>this.computeViews(e,t,s,r).next((i=>{let a=cr();return i.forEach(((c,l)=>{a=a.insert(c,l.overlayedDocument)})),a}))))}getOverlayedDocuments(e,t){const r=Qt();return this.populateOverlays(e,r,t).next((()=>this.computeViews(e,t,r,W())))}populateOverlays(e,t,r){const s=[];return r.forEach((i=>{t.has(i)||s.push(i)})),this.documentOverlayCache.getOverlays(e,s).next((i=>{i.forEach(((a,c)=>{t.set(a,c)}))}))}computeViews(e,t,r,s){let i=mt();const a=pr(),c=(function(){return pr()})();return t.forEach(((l,d)=>{const p=r.get(d.key);s.has(d.key)&&(p===void 0||p.mutation instanceof qt)?i=i.insert(d.key,d):p!==void 0?(a.set(d.key,p.mutation.getFieldMask()),mr(p.mutation,d,p.mutation.getFieldMask(),Z.now())):a.set(d.key,xe.empty())})),this.recalculateAndSaveOverlays(e,i).next((l=>(l.forEach(((d,p)=>a.set(d,p))),t.forEach(((d,p)=>{var m;return c.set(d,new EE(p,(m=a.get(d))!==null&&m!==void 0?m:null))})),c)))}recalculateAndSaveOverlays(e,t){const r=pr();let s=new re(((a,c)=>a-c)),i=W();return this.mutationQueue.getAllMutationBatchesAffectingDocumentKeys(e,t).next((a=>{for(const c of a)c.keys().forEach((l=>{const d=t.get(l);if(d===null)return;let p=r.get(l)||xe.empty();p=c.applyToLocalView(d,p),r.set(l,p);const m=(s.get(c.batchId)||W()).add(l);s=s.insert(c.batchId,m)}))})).next((()=>{const a=[],c=s.getReverseIterator();for(;c.hasNext();){const l=c.getNext(),d=l.key,p=l.value,m=Qh();p.forEach((E=>{if(!i.has(E)){const b=nd(t.get(E),r.get(E));b!==null&&m.set(E,b),i=i.add(E)}})),a.push(this.documentOverlayCache.saveOverlays(e,d,m))}return P.waitFor(a)})).next((()=>r))}recalculateAndSaveOverlaysForDocumentKeys(e,t){return this.remoteDocumentCache.getEntries(e,t).next((r=>this.recalculateAndSaveOverlays(e,r)))}getDocumentsMatchingQuery(e,t,r,s){return(function(a){return L.isDocumentKey(a.path)&&a.collectionGroup===null&&a.filters.length===0})(t)?this.getDocumentsMatchingDocumentQuery(e,t.path):zh(t)?this.getDocumentsMatchingCollectionGroupQuery(e,t,r,s):this.getDocumentsMatchingCollectionQuery(e,t,r,s)}getNextDocuments(e,t,r,s){return this.remoteDocumentCache.getAllFromCollectionGroup(e,t,r,s).next((i=>{const a=s-i.size>0?this.documentOverlayCache.getOverlaysForCollectionGroup(e,t,r.largestBatchId,s-i.size):P.resolve(Qt());let c=vr,l=i;return a.next((d=>P.forEach(d,((p,m)=>(c<m.largestBatchId&&(c=m.largestBatchId),i.get(p)?P.resolve():this.remoteDocumentCache.getEntry(e,p).next((E=>{l=l.insert(p,E)}))))).next((()=>this.populateOverlays(e,d,i))).next((()=>this.computeViews(e,l,d,W()))).next((p=>({batchId:c,changes:Kh(p)})))))}))}getDocumentsMatchingDocumentQuery(e,t){return this.getDocument(e,new L(t)).next((r=>{let s=cr();return r.isFoundDocument()&&(s=s.insert(r.key,r)),s}))}getDocumentsMatchingCollectionGroupQuery(e,t,r,s){const i=t.collectionGroup;let a=cr();return this.indexManager.getCollectionParents(e,i).next((c=>P.forEach(c,(l=>{const d=(function(m,E){return new xn(E,null,m.explicitOrderBy.slice(),m.filters.slice(),m.limit,m.limitType,m.startAt,m.endAt)})(t,l.child(i));return this.getDocumentsMatchingCollectionQuery(e,d,r,s).next((p=>{p.forEach(((m,E)=>{a=a.insert(m,E)}))}))})).next((()=>a))))}getDocumentsMatchingCollectionQuery(e,t,r,s){let i;return this.documentOverlayCache.getOverlaysForCollection(e,t.path,r.largestBatchId).next((a=>(i=a,this.remoteDocumentCache.getDocumentsMatchingQuery(e,t,r,i,s)))).next((a=>{i.forEach(((l,d)=>{const p=d.getKey();a.get(p)===null&&(a=a.insert(p,Ae.newInvalidDocument(p)))}));let c=cr();return a.forEach(((l,d)=>{const p=i.get(l);p!==void 0&&mr(p.mutation,d,xe.empty(),Z.now()),ti(t,d)&&(c=c.insert(l,d))})),c}))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class TE{constructor(e){this.serializer=e,this.Br=new Map,this.Lr=new Map}getBundleMetadata(e,t){return P.resolve(this.Br.get(t))}saveBundleMetadata(e,t){return this.Br.set(t.id,(function(s){return{id:s.id,version:s.version,createTime:Xe(s.createTime)}})(t)),P.resolve()}getNamedQuery(e,t){return P.resolve(this.Lr.get(t))}saveNamedQuery(e,t){return this.Lr.set(t.name,(function(s){return{name:s.name,query:lE(s.bundledQuery),readTime:Xe(s.readTime)}})(t)),P.resolve()}}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class IE{constructor(){this.overlays=new re(L.comparator),this.kr=new Map}getOverlay(e,t){return P.resolve(this.overlays.get(t))}getOverlays(e,t){const r=Qt();return P.forEach(t,(s=>this.getOverlay(e,s).next((i=>{i!==null&&r.set(s,i)})))).next((()=>r))}saveOverlays(e,t,r){return r.forEach(((s,i)=>{this.wt(e,t,i)})),P.resolve()}removeOverlaysForBatchId(e,t,r){const s=this.kr.get(r);return s!==void 0&&(s.forEach((i=>this.overlays=this.overlays.remove(i))),this.kr.delete(r)),P.resolve()}getOverlaysForCollection(e,t,r){const s=Qt(),i=t.length+1,a=new L(t.child("")),c=this.overlays.getIteratorFrom(a);for(;c.hasNext();){const l=c.getNext().value,d=l.getKey();if(!t.isPrefixOf(d.path))break;d.path.length===i&&l.largestBatchId>r&&s.set(l.getKey(),l)}return P.resolve(s)}getOverlaysForCollectionGroup(e,t,r,s){let i=new re(((d,p)=>d-p));const a=this.overlays.getIterator();for(;a.hasNext();){const d=a.getNext().value;if(d.getKey().getCollectionGroup()===t&&d.largestBatchId>r){let p=i.get(d.largestBatchId);p===null&&(p=Qt(),i=i.insert(d.largestBatchId,p)),p.set(d.getKey(),d)}}const c=Qt(),l=i.getIterator();for(;l.hasNext()&&(l.getNext().value.forEach(((d,p)=>c.set(d,p))),!(c.size()>=s)););return P.resolve(c)}wt(e,t,r){const s=this.overlays.get(r.key);if(s!==null){const a=this.kr.get(s.largestBatchId).delete(r.key);this.kr.set(s.largestBatchId,a)}this.overlays=this.overlays.insert(r.key,new jy(t,r));let i=this.kr.get(t);i===void 0&&(i=W(),this.kr.set(t,i)),this.kr.set(t,i.add(r.key))}}/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class wE{constructor(){this.sessionToken=pe.EMPTY_BYTE_STRING}getSessionToken(e){return P.resolve(this.sessionToken)}setSessionToken(e,t){return this.sessionToken=t,P.resolve()}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ra{constructor(){this.qr=new he(de.Qr),this.$r=new he(de.Ur)}isEmpty(){return this.qr.isEmpty()}addReference(e,t){const r=new de(e,t);this.qr=this.qr.add(r),this.$r=this.$r.add(r)}Kr(e,t){e.forEach((r=>this.addReference(r,t)))}removeReference(e,t){this.Wr(new de(e,t))}Gr(e,t){e.forEach((r=>this.removeReference(r,t)))}zr(e){const t=new L(new Y([])),r=new de(t,e),s=new de(t,e+1),i=[];return this.$r.forEachInRange([r,s],(a=>{this.Wr(a),i.push(a.key)})),i}jr(){this.qr.forEach((e=>this.Wr(e)))}Wr(e){this.qr=this.qr.delete(e),this.$r=this.$r.delete(e)}Jr(e){const t=new L(new Y([])),r=new de(t,e),s=new de(t,e+1);let i=W();return this.$r.forEachInRange([r,s],(a=>{i=i.add(a.key)})),i}containsKey(e){const t=new de(e,0),r=this.qr.firstAfterOrEqual(t);return r!==null&&e.isEqual(r.key)}}class de{constructor(e,t){this.key=e,this.Hr=t}static Qr(e,t){return L.comparator(e.key,t.key)||$(e.Hr,t.Hr)}static Ur(e,t){return $(e.Hr,t.Hr)||L.comparator(e.key,t.key)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class AE{constructor(e,t){this.indexManager=e,this.referenceDelegate=t,this.mutationQueue=[],this.er=1,this.Yr=new he(de.Qr)}checkEmpty(e){return P.resolve(this.mutationQueue.length===0)}addMutationBatch(e,t,r,s){const i=this.er;this.er++,this.mutationQueue.length>0&&this.mutationQueue[this.mutationQueue.length-1];const a=new By(i,t,r,s);this.mutationQueue.push(a);for(const c of s)this.Yr=this.Yr.add(new de(c.key,i)),this.indexManager.addToCollectionParentIndex(e,c.key.path.popLast());return P.resolve(a)}lookupMutationBatch(e,t){return P.resolve(this.Zr(t))}getNextMutationBatchAfterBatchId(e,t){const r=t+1,s=this.Xr(r),i=s<0?0:s;return P.resolve(this.mutationQueue.length>i?this.mutationQueue[i]:null)}getHighestUnacknowledgedBatchId(){return P.resolve(this.mutationQueue.length===0?Ko:this.er-1)}getAllMutationBatches(e){return P.resolve(this.mutationQueue.slice())}getAllMutationBatchesAffectingDocumentKey(e,t){const r=new de(t,0),s=new de(t,Number.POSITIVE_INFINITY),i=[];return this.Yr.forEachInRange([r,s],(a=>{const c=this.Zr(a.Hr);i.push(c)})),P.resolve(i)}getAllMutationBatchesAffectingDocumentKeys(e,t){let r=new he($);return t.forEach((s=>{const i=new de(s,0),a=new de(s,Number.POSITIVE_INFINITY);this.Yr.forEachInRange([i,a],(c=>{r=r.add(c.Hr)}))})),P.resolve(this.ei(r))}getAllMutationBatchesAffectingQuery(e,t){const r=t.path,s=r.length+1;let i=r;L.isDocumentKey(i)||(i=i.child(""));const a=new de(new L(i),0);let c=new he($);return this.Yr.forEachWhile((l=>{const d=l.key.path;return!!r.isPrefixOf(d)&&(d.length===s&&(c=c.add(l.Hr)),!0)}),a),P.resolve(this.ei(c))}ei(e){const t=[];return e.forEach((r=>{const s=this.Zr(r);s!==null&&t.push(s)})),t}removeMutationBatch(e,t){Q(this.ti(t.batchId,"removed")===0,55003),this.mutationQueue.shift();let r=this.Yr;return P.forEach(t.mutations,(s=>{const i=new de(s.key,t.batchId);return r=r.delete(i),this.referenceDelegate.markPotentiallyOrphaned(e,s.key)})).next((()=>{this.Yr=r}))}rr(e){}containsKey(e,t){const r=new de(t,0),s=this.Yr.firstAfterOrEqual(r);return P.resolve(t.isEqual(s&&s.key))}performConsistencyCheck(e){return this.mutationQueue.length,P.resolve()}ti(e,t){return this.Xr(e)}Xr(e){return this.mutationQueue.length===0?0:e-this.mutationQueue[0].batchId}Zr(e){const t=this.Xr(e);return t<0||t>=this.mutationQueue.length?null:this.mutationQueue[t]}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class RE{constructor(e){this.ni=e,this.docs=(function(){return new re(L.comparator)})(),this.size=0}setIndexManager(e){this.indexManager=e}addEntry(e,t){const r=t.key,s=this.docs.get(r),i=s?s.size:0,a=this.ni(t);return this.docs=this.docs.insert(r,{document:t.mutableCopy(),size:a}),this.size+=a-i,this.indexManager.addToCollectionParentIndex(e,r.path.popLast())}removeEntry(e){const t=this.docs.get(e);t&&(this.docs=this.docs.remove(e),this.size-=t.size)}getEntry(e,t){const r=this.docs.get(t);return P.resolve(r?r.document.mutableCopy():Ae.newInvalidDocument(t))}getEntries(e,t){let r=mt();return t.forEach((s=>{const i=this.docs.get(s);r=r.insert(s,i?i.document.mutableCopy():Ae.newInvalidDocument(s))})),P.resolve(r)}getDocumentsMatchingQuery(e,t,r,s){let i=mt();const a=t.path,c=new L(a.child("__id-9223372036854775808__")),l=this.docs.getIteratorFrom(c);for(;l.hasNext();){const{key:d,value:{document:p}}=l.getNext();if(!a.isPrefixOf(d.path))break;d.path.length>a.length+1||ny(ty(p),r)<=0||(s.has(p.key)||ti(t,p))&&(i=i.insert(p.key,p.mutableCopy()))}return P.resolve(i)}getAllFromCollectionGroup(e,t,r,s){x(9500)}ri(e,t){return P.forEach(this.docs,(r=>t(r)))}newChangeBuffer(e){return new bE(this)}getSize(e){return P.resolve(this.size)}}class bE extends yE{constructor(e){super(),this.Or=e}applyChanges(e){const t=[];return this.changes.forEach(((r,s)=>{s.isValidDocument()?t.push(this.Or.addEntry(e,s)):this.Or.removeEntry(r)})),P.waitFor(t)}getFromCache(e,t){return this.Or.getEntry(e,t)}getAllFromCache(e,t){return this.Or.getEntries(e,t)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class SE{constructor(e){this.persistence=e,this.ii=new on((t=>Xo(t)),Yo),this.lastRemoteSnapshotVersion=B.min(),this.highestTargetId=0,this.si=0,this.oi=new ra,this.targetCount=0,this._i=Dn.ar()}forEachTarget(e,t){return this.ii.forEach(((r,s)=>t(s))),P.resolve()}getLastRemoteSnapshotVersion(e){return P.resolve(this.lastRemoteSnapshotVersion)}getHighestSequenceNumber(e){return P.resolve(this.si)}allocateTargetId(e){return this.highestTargetId=this._i.next(),P.resolve(this.highestTargetId)}setTargetsMetadata(e,t,r){return r&&(this.lastRemoteSnapshotVersion=r),t>this.si&&(this.si=t),P.resolve()}hr(e){this.ii.set(e.target,e);const t=e.targetId;t>this.highestTargetId&&(this._i=new Dn(t),this.highestTargetId=t),e.sequenceNumber>this.si&&(this.si=e.sequenceNumber)}addTargetData(e,t){return this.hr(t),this.targetCount+=1,P.resolve()}updateTargetData(e,t){return this.hr(t),P.resolve()}removeTargetData(e,t){return this.ii.delete(t.target),this.oi.zr(t.targetId),this.targetCount-=1,P.resolve()}removeTargets(e,t,r){let s=0;const i=[];return this.ii.forEach(((a,c)=>{c.sequenceNumber<=t&&r.get(c.targetId)===null&&(this.ii.delete(a),i.push(this.removeMatchingKeysForTargetId(e,c.targetId)),s++)})),P.waitFor(i).next((()=>s))}getTargetCount(e){return P.resolve(this.targetCount)}getTargetData(e,t){const r=this.ii.get(t)||null;return P.resolve(r)}addMatchingKeys(e,t,r){return this.oi.Kr(t,r),P.resolve()}removeMatchingKeys(e,t,r){this.oi.Gr(t,r);const s=this.persistence.referenceDelegate,i=[];return s&&t.forEach((a=>{i.push(s.markPotentiallyOrphaned(e,a))})),P.waitFor(i)}removeMatchingKeysForTargetId(e,t){return this.oi.zr(t),P.resolve()}getMatchingKeysForTargetId(e,t){const r=this.oi.Jr(t);return P.resolve(r)}containsKey(e,t){return P.resolve(this.oi.containsKey(t))}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class md{constructor(e,t){this.ai={},this.overlays={},this.ui=new Js(0),this.ci=!1,this.ci=!0,this.li=new wE,this.referenceDelegate=e(this),this.hi=new SE(this),this.indexManager=new hE,this.remoteDocumentCache=(function(s){return new RE(s)})((r=>this.referenceDelegate.Pi(r))),this.serializer=new uE(t),this.Ti=new TE(this.serializer)}start(){return Promise.resolve()}shutdown(){return this.ci=!1,Promise.resolve()}get started(){return this.ci}setDatabaseDeletedListener(){}setNetworkEnabled(){}getIndexManager(e){return this.indexManager}getDocumentOverlayCache(e){let t=this.overlays[e.toKey()];return t||(t=new IE,this.overlays[e.toKey()]=t),t}getMutationQueue(e,t){let r=this.ai[e.toKey()];return r||(r=new AE(t,this.referenceDelegate),this.ai[e.toKey()]=r),r}getGlobalsCache(){return this.li}getTargetCache(){return this.hi}getRemoteDocumentCache(){return this.remoteDocumentCache}getBundleCache(){return this.Ti}runTransaction(e,t,r){O("MemoryPersistence","Starting transaction:",e);const s=new PE(this.ui.next());return this.referenceDelegate.Ii(),r(s).next((i=>this.referenceDelegate.di(s).next((()=>i)))).toPromise().then((i=>(s.raiseOnCommittedEvent(),i)))}Ei(e,t){return P.or(Object.values(this.ai).map((r=>()=>r.containsKey(e,t))))}}class PE extends sy{constructor(e){super(),this.currentSequenceNumber=e}}class sa{constructor(e){this.persistence=e,this.Ai=new ra,this.Ri=null}static Vi(e){return new sa(e)}get mi(){if(this.Ri)return this.Ri;throw x(60996)}addReference(e,t,r){return this.Ai.addReference(r,t),this.mi.delete(r.toString()),P.resolve()}removeReference(e,t,r){return this.Ai.removeReference(r,t),this.mi.add(r.toString()),P.resolve()}markPotentiallyOrphaned(e,t){return this.mi.add(t.toString()),P.resolve()}removeTarget(e,t){this.Ai.zr(t.targetId).forEach((s=>this.mi.add(s.toString())));const r=this.persistence.getTargetCache();return r.getMatchingKeysForTargetId(e,t.targetId).next((s=>{s.forEach((i=>this.mi.add(i.toString())))})).next((()=>r.removeTargetData(e,t)))}Ii(){this.Ri=new Set}di(e){const t=this.persistence.getRemoteDocumentCache().newChangeBuffer();return P.forEach(this.mi,(r=>{const s=L.fromPath(r);return this.fi(e,s).next((i=>{i||t.removeEntry(s,B.min())}))})).next((()=>(this.Ri=null,t.apply(e))))}updateLimboDocument(e,t){return this.fi(e,t).next((r=>{r?this.mi.delete(t.toString()):this.mi.add(t.toString())}))}Pi(e){return 0}fi(e,t){return P.or([()=>P.resolve(this.Ai.containsKey(t)),()=>this.persistence.getTargetCache().containsKey(e,t),()=>this.persistence.Ei(e,t)])}}class Us{constructor(e,t){this.persistence=e,this.gi=new on((r=>ay(r.path)),((r,s)=>r.isEqual(s))),this.garbageCollector=_E(this,t)}static Vi(e,t){return new Us(e,t)}Ii(){}di(e){return P.resolve()}forEachTarget(e,t){return this.persistence.getTargetCache().forEachTarget(e,t)}mr(e){const t=this.yr(e);return this.persistence.getTargetCache().getTargetCount(e).next((r=>t.next((s=>r+s))))}yr(e){let t=0;return this.gr(e,(r=>{t++})).next((()=>t))}gr(e,t){return P.forEach(this.gi,((r,s)=>this.Sr(e,r,s).next((i=>i?P.resolve():t(s)))))}removeTargets(e,t,r){return this.persistence.getTargetCache().removeTargets(e,t,r)}removeOrphanedDocuments(e,t){let r=0;const s=this.persistence.getRemoteDocumentCache(),i=s.newChangeBuffer();return s.ri(e,(a=>this.Sr(e,a,t).next((c=>{c||(r++,i.removeEntry(a,B.min()))})))).next((()=>i.apply(e))).next((()=>r))}markPotentiallyOrphaned(e,t){return this.gi.set(t,e.currentSequenceNumber),P.resolve()}removeTarget(e,t){const r=t.withSequenceNumber(e.currentSequenceNumber);return this.persistence.getTargetCache().updateTargetData(e,r)}addReference(e,t,r){return this.gi.set(r,e.currentSequenceNumber),P.resolve()}removeReference(e,t,r){return this.gi.set(r,e.currentSequenceNumber),P.resolve()}updateLimboDocument(e,t){return this.gi.set(t,e.currentSequenceNumber),P.resolve()}Pi(e){let t=e.key.toString().length;return e.isFoundDocument()&&(t+=Es(e.data.value)),t}Sr(e,t,r){return P.or([()=>this.persistence.Ei(e,t),()=>this.persistence.getTargetCache().containsKey(e,t),()=>{const s=this.gi.get(t);return P.resolve(s!==void 0&&s>r)}])}getCacheSize(e){return this.persistence.getRemoteDocumentCache().getSize(e)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ia{constructor(e,t,r,s){this.targetId=e,this.fromCache=t,this.Is=r,this.ds=s}static Es(e,t){let r=W(),s=W();for(const i of t.docChanges)switch(i.type){case 0:r=r.add(i.doc.key);break;case 1:s=s.add(i.doc.key)}return new ia(e,t.fromCache,r,s)}}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class CE{constructor(){this._documentReadCount=0}get documentReadCount(){return this._documentReadCount}incrementDocumentReadCount(e){this._documentReadCount+=e}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class kE{constructor(){this.As=!1,this.Rs=!1,this.Vs=100,this.fs=(function(){return mp()?8:iy(be())>0?6:4})()}initialize(e,t){this.gs=e,this.indexManager=t,this.As=!0}getDocumentsMatchingQuery(e,t,r,s){const i={result:null};return this.ps(e,t).next((a=>{i.result=a})).next((()=>{if(!i.result)return this.ys(e,t,s,r).next((a=>{i.result=a}))})).next((()=>{if(i.result)return;const a=new CE;return this.ws(e,t,a).next((c=>{if(i.result=c,this.Rs)return this.Ss(e,t,a,c.size)}))})).next((()=>i.result))}Ss(e,t,r,s){return r.documentReadCount<this.Vs?(pn()<=H.DEBUG&&O("QueryEngine","SDK will not create cache indexes for query:",mn(t),"since it only creates cache indexes for collection contains","more than or equal to",this.Vs,"documents"),P.resolve()):(pn()<=H.DEBUG&&O("QueryEngine","Query:",mn(t),"scans",r.documentReadCount,"local documents and returns",s,"documents as results."),r.documentReadCount>this.fs*s?(pn()<=H.DEBUG&&O("QueryEngine","The SDK decides to create cache indexes for query:",mn(t),"as using cache indexes may help improve performance."),this.indexManager.createTargetIndexes(e,Je(t))):P.resolve())}ps(e,t){if(Lu(t))return P.resolve(null);let r=Je(t);return this.indexManager.getIndexType(e,r).next((s=>s===0?null:(t.limit!==null&&s===1&&(t=Ms(t,null,"F"),r=Je(t)),this.indexManager.getDocumentsMatchingTarget(e,r).next((i=>{const a=W(...i);return this.gs.getDocuments(e,a).next((c=>this.indexManager.getMinOffset(e,r).next((l=>{const d=this.bs(t,c);return this.Ds(t,d,a,l.readTime)?this.ps(e,Ms(t,null,"F")):this.vs(e,d,t,l)}))))})))))}ys(e,t,r,s){return Lu(t)||s.isEqual(B.min())?P.resolve(null):this.gs.getDocuments(e,r).next((i=>{const a=this.bs(t,i);return this.Ds(t,a,r,s)?P.resolve(null):(pn()<=H.DEBUG&&O("QueryEngine","Re-using previous result from %s to execute query: %s",s.toString(),mn(t)),this.vs(e,a,t,ey(s,vr)).next((c=>c)))}))}bs(e,t){let r=new he(Wh(e));return t.forEach(((s,i)=>{ti(e,i)&&(r=r.add(i))})),r}Ds(e,t,r,s){if(e.limit===null)return!1;if(r.size!==t.size)return!0;const i=e.limitType==="F"?t.last():t.first();return!!i&&(i.hasPendingWrites||i.version.compareTo(s)>0)}ws(e,t,r){return pn()<=H.DEBUG&&O("QueryEngine","Using full collection scan to execute query:",mn(t)),this.gs.getDocumentsMatchingQuery(e,t,Vt.min(),r)}vs(e,t,r,s){return this.gs.getDocumentsMatchingQuery(e,r,s).next((i=>(t.forEach((a=>{i=i.insert(a.key,a)})),i)))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const oa="LocalStore",DE=3e8;class NE{constructor(e,t,r,s){this.persistence=e,this.Cs=t,this.serializer=s,this.Fs=new re($),this.Ms=new on((i=>Xo(i)),Yo),this.xs=new Map,this.Os=e.getRemoteDocumentCache(),this.hi=e.getTargetCache(),this.Ti=e.getBundleCache(),this.Ns(r)}Ns(e){this.documentOverlayCache=this.persistence.getDocumentOverlayCache(e),this.indexManager=this.persistence.getIndexManager(e),this.mutationQueue=this.persistence.getMutationQueue(e,this.indexManager),this.localDocuments=new vE(this.Os,this.mutationQueue,this.documentOverlayCache,this.indexManager),this.Os.setIndexManager(this.indexManager),this.Cs.initialize(this.localDocuments,this.indexManager)}collectGarbage(e){return this.persistence.runTransaction("Collect garbage","readwrite-primary",(t=>e.collect(t,this.Fs)))}}function VE(n,e,t,r){return new NE(n,e,t,r)}async function gd(n,e){const t=j(n);return await t.persistence.runTransaction("Handle user change","readonly",(r=>{let s;return t.mutationQueue.getAllMutationBatches(r).next((i=>(s=i,t.Ns(e),t.mutationQueue.getAllMutationBatches(r)))).next((i=>{const a=[],c=[];let l=W();for(const d of s){a.push(d.batchId);for(const p of d.mutations)l=l.add(p.key)}for(const d of i){c.push(d.batchId);for(const p of d.mutations)l=l.add(p.key)}return t.localDocuments.getDocuments(r,l).next((d=>({Bs:d,removedBatchIds:a,addedBatchIds:c})))}))}))}function OE(n,e){const t=j(n);return t.persistence.runTransaction("Acknowledge batch","readwrite-primary",(r=>{const s=e.batch.keys(),i=t.Os.newChangeBuffer({trackRemovals:!0});return(function(c,l,d,p){const m=d.batch,E=m.keys();let b=P.resolve();return E.forEach((C=>{b=b.next((()=>p.getEntry(l,C))).next((V=>{const k=d.docVersions.get(C);Q(k!==null,48541),V.version.compareTo(k)<0&&(m.applyToRemoteDocument(V,d),V.isValidDocument()&&(V.setReadTime(d.commitVersion),p.addEntry(V)))}))})),b.next((()=>c.mutationQueue.removeMutationBatch(l,m)))})(t,r,e,i).next((()=>i.apply(r))).next((()=>t.mutationQueue.performConsistencyCheck(r))).next((()=>t.documentOverlayCache.removeOverlaysForBatchId(r,s,e.batch.batchId))).next((()=>t.localDocuments.recalculateAndSaveOverlaysForDocumentKeys(r,(function(c){let l=W();for(let d=0;d<c.mutationResults.length;++d)c.mutationResults[d].transformResults.length>0&&(l=l.add(c.batch.mutations[d].key));return l})(e)))).next((()=>t.localDocuments.getDocuments(r,s)))}))}function _d(n){const e=j(n);return e.persistence.runTransaction("Get last remote snapshot version","readonly",(t=>e.hi.getLastRemoteSnapshotVersion(t)))}function LE(n,e){const t=j(n),r=e.snapshotVersion;let s=t.Fs;return t.persistence.runTransaction("Apply remote event","readwrite-primary",(i=>{const a=t.Os.newChangeBuffer({trackRemovals:!0});s=t.Fs;const c=[];e.targetChanges.forEach(((p,m)=>{const E=s.get(m);if(!E)return;c.push(t.hi.removeMatchingKeys(i,p.removedDocuments,m).next((()=>t.hi.addMatchingKeys(i,p.addedDocuments,m))));let b=E.withSequenceNumber(i.currentSequenceNumber);e.targetMismatches.get(m)!==null?b=b.withResumeToken(pe.EMPTY_BYTE_STRING,B.min()).withLastLimboFreeSnapshotVersion(B.min()):p.resumeToken.approximateByteSize()>0&&(b=b.withResumeToken(p.resumeToken,r)),s=s.insert(m,b),(function(V,k,q){return V.resumeToken.approximateByteSize()===0||k.snapshotVersion.toMicroseconds()-V.snapshotVersion.toMicroseconds()>=DE?!0:q.addedDocuments.size+q.modifiedDocuments.size+q.removedDocuments.size>0})(E,b,p)&&c.push(t.hi.updateTargetData(i,b))}));let l=mt(),d=W();if(e.documentUpdates.forEach((p=>{e.resolvedLimboDocuments.has(p)&&c.push(t.persistence.referenceDelegate.updateLimboDocument(i,p))})),c.push(ME(i,a,e.documentUpdates).next((p=>{l=p.Ls,d=p.ks}))),!r.isEqual(B.min())){const p=t.hi.getLastRemoteSnapshotVersion(i).next((m=>t.hi.setTargetsMetadata(i,i.currentSequenceNumber,r)));c.push(p)}return P.waitFor(c).next((()=>a.apply(i))).next((()=>t.localDocuments.getLocalViewOfDocuments(i,l,d))).next((()=>l))})).then((i=>(t.Fs=s,i)))}function ME(n,e,t){let r=W(),s=W();return t.forEach((i=>r=r.add(i))),e.getEntries(n,r).next((i=>{let a=mt();return t.forEach(((c,l)=>{const d=i.get(c);l.isFoundDocument()!==d.isFoundDocument()&&(s=s.add(c)),l.isNoDocument()&&l.version.isEqual(B.min())?(e.removeEntry(c,l.readTime),a=a.insert(c,l)):!d.isValidDocument()||l.version.compareTo(d.version)>0||l.version.compareTo(d.version)===0&&d.hasPendingWrites?(e.addEntry(l),a=a.insert(c,l)):O(oa,"Ignoring outdated watch update for ",c,". Current version:",d.version," Watch version:",l.version)})),{Ls:a,ks:s}}))}function xE(n,e){const t=j(n);return t.persistence.runTransaction("Get next mutation batch","readonly",(r=>(e===void 0&&(e=Ko),t.mutationQueue.getNextMutationBatchAfterBatchId(r,e))))}function UE(n,e){const t=j(n);return t.persistence.runTransaction("Allocate target","readwrite",(r=>{let s;return t.hi.getTargetData(r,e).next((i=>i?(s=i,P.resolve(s)):t.hi.allocateTargetId(r).next((a=>(s=new St(e,a,"TargetPurposeListen",r.currentSequenceNumber),t.hi.addTargetData(r,s).next((()=>s)))))))})).then((r=>{const s=t.Fs.get(r.targetId);return(s===null||r.snapshotVersion.compareTo(s.snapshotVersion)>0)&&(t.Fs=t.Fs.insert(r.targetId,r),t.Ms.set(e,r.targetId)),r}))}async function Ro(n,e,t){const r=j(n),s=r.Fs.get(e),i=t?"readwrite":"readwrite-primary";try{t||await r.persistence.runTransaction("Release target",i,(a=>r.persistence.referenceDelegate.removeTarget(a,s)))}catch(a){if(!Mn(a))throw a;O(oa,`Failed to update sequence numbers for target ${e}: ${a}`)}r.Fs=r.Fs.remove(e),r.Ms.delete(s.target)}function Ku(n,e,t){const r=j(n);let s=B.min(),i=W();return r.persistence.runTransaction("Execute query","readwrite",(a=>(function(l,d,p){const m=j(l),E=m.Ms.get(p);return E!==void 0?P.resolve(m.Fs.get(E)):m.hi.getTargetData(d,p)})(r,a,Je(e)).next((c=>{if(c)return s=c.lastLimboFreeSnapshotVersion,r.hi.getMatchingKeysForTargetId(a,c.targetId).next((l=>{i=l}))})).next((()=>r.Cs.getDocumentsMatchingQuery(a,e,t?s:B.min(),t?i:W()))).next((c=>(FE(r,by(e),c),{documents:c,qs:i})))))}function FE(n,e,t){let r=n.xs.get(e)||B.min();t.forEach(((s,i)=>{i.readTime.compareTo(r)>0&&(r=i.readTime)})),n.xs.set(e,r)}class Qu{constructor(){this.activeTargetIds=Ny()}Gs(e){this.activeTargetIds=this.activeTargetIds.add(e)}zs(e){this.activeTargetIds=this.activeTargetIds.delete(e)}Ws(){const e={activeTargetIds:this.activeTargetIds.toArray(),updateTimeMs:Date.now()};return JSON.stringify(e)}}class BE{constructor(){this.Fo=new Qu,this.Mo={},this.onlineStateHandler=null,this.sequenceNumberHandler=null}addPendingMutation(e){}updateMutationState(e,t,r){}addLocalQueryTarget(e,t=!0){return t&&this.Fo.Gs(e),this.Mo[e]||"not-current"}updateQueryState(e,t,r){this.Mo[e]=t}removeLocalQueryTarget(e){this.Fo.zs(e)}isLocalQueryTarget(e){return this.Fo.activeTargetIds.has(e)}clearQueryState(e){delete this.Mo[e]}getAllActiveQueryTargets(){return this.Fo.activeTargetIds}isActiveQueryTarget(e){return this.Fo.activeTargetIds.has(e)}start(){return this.Fo=new Qu,Promise.resolve()}handleUserChange(e,t,r){}setOnlineState(e){}shutdown(){}writeSequenceNumber(e){}notifyBundleLoaded(e){}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class jE{xo(e){}shutdown(){}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ju="ConnectivityMonitor";class Xu{constructor(){this.Oo=()=>this.No(),this.Bo=()=>this.Lo(),this.ko=[],this.qo()}xo(e){this.ko.push(e)}shutdown(){window.removeEventListener("online",this.Oo),window.removeEventListener("offline",this.Bo)}qo(){window.addEventListener("online",this.Oo),window.addEventListener("offline",this.Bo)}No(){O(Ju,"Network connectivity changed: AVAILABLE");for(const e of this.ko)e(0)}Lo(){O(Ju,"Network connectivity changed: UNAVAILABLE");for(const e of this.ko)e(1)}static C(){return typeof window<"u"&&window.addEventListener!==void 0&&window.removeEventListener!==void 0}}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let hs=null;function bo(){return hs===null?hs=(function(){return 268435456+Math.round(2147483648*Math.random())})():hs++,"0x"+hs.toString(16)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Xi="RestConnection",qE={BatchGetDocuments:"batchGet",Commit:"commit",RunQuery:"runQuery",RunAggregationQuery:"runAggregationQuery"};class $E{get Qo(){return!1}constructor(e){this.databaseInfo=e,this.databaseId=e.databaseId;const t=e.ssl?"https":"http",r=encodeURIComponent(this.databaseId.projectId),s=encodeURIComponent(this.databaseId.database);this.$o=t+"://"+e.host,this.Uo=`projects/${r}/databases/${s}`,this.Ko=this.databaseId.database===Vs?`project_id=${r}`:`project_id=${r}&database_id=${s}`}Wo(e,t,r,s,i){const a=bo(),c=this.Go(e,t.toUriEncodedString());O(Xi,`Sending RPC '${e}' ${a}:`,c,r);const l={"google-cloud-resource-prefix":this.Uo,"x-goog-request-params":this.Ko};this.zo(l,s,i);const{host:d}=new URL(c),p=Ft(d);return this.jo(e,c,l,r,p).then((m=>(O(Xi,`Received RPC '${e}' ${a}: `,m),m)),(m=>{throw pt(Xi,`RPC '${e}' ${a} failed with error: `,m,"url: ",c,"request:",r),m}))}Jo(e,t,r,s,i,a){return this.Wo(e,t,r,s,i)}zo(e,t,r){e["X-Goog-Api-Client"]=(function(){return"gl-js/ fire/"+On})(),e["Content-Type"]="text/plain",this.databaseInfo.appId&&(e["X-Firebase-GMPID"]=this.databaseInfo.appId),t&&t.headers.forEach(((s,i)=>e[i]=s)),r&&r.headers.forEach(((s,i)=>e[i]=s))}Go(e,t){const r=qE[e];return`${this.$o}/v1/${t}:${r}`}terminate(){}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class zE{constructor(e){this.Ho=e.Ho,this.Yo=e.Yo}Zo(e){this.Xo=e}e_(e){this.t_=e}n_(e){this.r_=e}onMessage(e){this.i_=e}close(){this.Yo()}send(e){this.Ho(e)}s_(){this.Xo()}o_(){this.t_()}__(e){this.r_(e)}a_(e){this.i_(e)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ie="WebChannelConnection";class HE extends $E{constructor(e){super(e),this.u_=[],this.forceLongPolling=e.forceLongPolling,this.autoDetectLongPolling=e.autoDetectLongPolling,this.useFetchStreams=e.useFetchStreams,this.longPollingOptions=e.longPollingOptions}jo(e,t,r,s,i){const a=bo();return new Promise(((c,l)=>{const d=new gh;d.setWithCredentials(!0),d.listenOnce(_h.COMPLETE,(()=>{try{switch(d.getLastErrorCode()){case ys.NO_ERROR:const m=d.getResponseJson();O(Ie,`XHR for RPC '${e}' ${a} received:`,JSON.stringify(m)),c(m);break;case ys.TIMEOUT:O(Ie,`RPC '${e}' ${a} timed out`),l(new N(S.DEADLINE_EXCEEDED,"Request time out"));break;case ys.HTTP_ERROR:const E=d.getStatus();if(O(Ie,`RPC '${e}' ${a} failed with status:`,E,"response text:",d.getResponseText()),E>0){let b=d.getResponseJson();Array.isArray(b)&&(b=b[0]);const C=b==null?void 0:b.error;if(C&&C.status&&C.message){const V=(function(q){const U=q.toLowerCase().replace(/_/g,"-");return Object.values(S).indexOf(U)>=0?U:S.UNKNOWN})(C.status);l(new N(V,C.message))}else l(new N(S.UNKNOWN,"Server responded with status "+d.getStatus()))}else l(new N(S.UNAVAILABLE,"Connection failed."));break;default:x(9055,{c_:e,streamId:a,l_:d.getLastErrorCode(),h_:d.getLastError()})}}finally{O(Ie,`RPC '${e}' ${a} completed.`)}}));const p=JSON.stringify(s);O(Ie,`RPC '${e}' ${a} sending request:`,s),d.send(t,"POST",p,r,15)}))}P_(e,t,r){const s=bo(),i=[this.$o,"/","google.firestore.v1.Firestore","/",e,"/channel"],a=vh(),c=Eh(),l={httpSessionIdParam:"gsessionid",initMessageHeaders:{},messageUrlParams:{database:`projects/${this.databaseId.projectId}/databases/${this.databaseId.database}`},sendRawJson:!0,supportsCrossDomainXhr:!0,internalChannelParams:{forwardChannelRequestTimeoutMs:6e5},forceLongPolling:this.forceLongPolling,detectBufferingProxy:this.autoDetectLongPolling},d=this.longPollingOptions.timeoutSeconds;d!==void 0&&(l.longPollingTimeout=Math.round(1e3*d)),this.useFetchStreams&&(l.useFetchStreams=!0),this.zo(l.initMessageHeaders,t,r),l.encodeInitMessageHeaders=!0;const p=i.join("");O(Ie,`Creating RPC '${e}' stream ${s}: ${p}`,l);const m=a.createWebChannel(p,l);this.T_(m);let E=!1,b=!1;const C=new zE({Ho:k=>{b?O(Ie,`Not sending because RPC '${e}' stream ${s} is closed:`,k):(E||(O(Ie,`Opening RPC '${e}' stream ${s} transport.`),m.open(),E=!0),O(Ie,`RPC '${e}' stream ${s} sending:`,k),m.send(k))},Yo:()=>m.close()}),V=(k,q,U)=>{k.listen(q,(F=>{try{U(F)}catch(z){setTimeout((()=>{throw z}),0)}}))};return V(m,ar.EventType.OPEN,(()=>{b||(O(Ie,`RPC '${e}' stream ${s} transport opened.`),C.s_())})),V(m,ar.EventType.CLOSE,(()=>{b||(b=!0,O(Ie,`RPC '${e}' stream ${s} transport closed`),C.__(),this.I_(m))})),V(m,ar.EventType.ERROR,(k=>{b||(b=!0,pt(Ie,`RPC '${e}' stream ${s} transport errored. Name:`,k.name,"Message:",k.message),C.__(new N(S.UNAVAILABLE,"The operation could not be completed")))})),V(m,ar.EventType.MESSAGE,(k=>{var q;if(!b){const U=k.data[0];Q(!!U,16349);const F=U,z=(F==null?void 0:F.error)||((q=F[0])===null||q===void 0?void 0:q.error);if(z){O(Ie,`RPC '${e}' stream ${s} received error:`,z);const me=z.status;let ee=(function(y){const v=ce[y];if(v!==void 0)return sd(v)})(me),T=z.message;ee===void 0&&(ee=S.INTERNAL,T="Unknown error status: "+me+" with message "+z.message),b=!0,C.__(new N(ee,T)),m.close()}else O(Ie,`RPC '${e}' stream ${s} received:`,U),C.a_(U)}})),V(c,yh.STAT_EVENT,(k=>{k.stat===fo.PROXY?O(Ie,`RPC '${e}' stream ${s} detected buffering proxy`):k.stat===fo.NOPROXY&&O(Ie,`RPC '${e}' stream ${s} detected no buffering proxy`)})),setTimeout((()=>{C.o_()}),0),C}terminate(){this.u_.forEach((e=>e.close())),this.u_=[]}T_(e){this.u_.push(e)}I_(e){this.u_=this.u_.filter((t=>t===e))}}function Yi(){return typeof document<"u"?document:null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ai(n){return new Qy(n,!0)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class yd{constructor(e,t,r=1e3,s=1.5,i=6e4){this.Fi=e,this.timerId=t,this.d_=r,this.E_=s,this.A_=i,this.R_=0,this.V_=null,this.m_=Date.now(),this.reset()}reset(){this.R_=0}f_(){this.R_=this.A_}g_(e){this.cancel();const t=Math.floor(this.R_+this.p_()),r=Math.max(0,Date.now()-this.m_),s=Math.max(0,t-r);s>0&&O("ExponentialBackoff",`Backing off for ${s} ms (base delay: ${this.R_} ms, delay with jitter: ${t} ms, last attempt: ${r} ms ago)`),this.V_=this.Fi.enqueueAfterDelay(this.timerId,s,(()=>(this.m_=Date.now(),e()))),this.R_*=this.E_,this.R_<this.d_&&(this.R_=this.d_),this.R_>this.A_&&(this.R_=this.A_)}y_(){this.V_!==null&&(this.V_.skipDelay(),this.V_=null)}cancel(){this.V_!==null&&(this.V_.cancel(),this.V_=null)}p_(){return(Math.random()-.5)*this.R_}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Yu="PersistentStream";class Ed{constructor(e,t,r,s,i,a,c,l){this.Fi=e,this.w_=r,this.S_=s,this.connection=i,this.authCredentialsProvider=a,this.appCheckCredentialsProvider=c,this.listener=l,this.state=0,this.b_=0,this.D_=null,this.v_=null,this.stream=null,this.C_=0,this.F_=new yd(e,t)}M_(){return this.state===1||this.state===5||this.x_()}x_(){return this.state===2||this.state===3}start(){this.C_=0,this.state!==4?this.auth():this.O_()}async stop(){this.M_()&&await this.close(0)}N_(){this.state=0,this.F_.reset()}B_(){this.x_()&&this.D_===null&&(this.D_=this.Fi.enqueueAfterDelay(this.w_,6e4,(()=>this.L_())))}k_(e){this.q_(),this.stream.send(e)}async L_(){if(this.x_())return this.close(0)}q_(){this.D_&&(this.D_.cancel(),this.D_=null)}Q_(){this.v_&&(this.v_.cancel(),this.v_=null)}async close(e,t){this.q_(),this.Q_(),this.F_.cancel(),this.b_++,e!==4?this.F_.reset():t&&t.code===S.RESOURCE_EXHAUSTED?(ft(t.toString()),ft("Using maximum backoff delay to prevent overloading the backend."),this.F_.f_()):t&&t.code===S.UNAUTHENTICATED&&this.state!==3&&(this.authCredentialsProvider.invalidateToken(),this.appCheckCredentialsProvider.invalidateToken()),this.stream!==null&&(this.U_(),this.stream.close(),this.stream=null),this.state=e,await this.listener.n_(t)}U_(){}auth(){this.state=1;const e=this.K_(this.b_),t=this.b_;Promise.all([this.authCredentialsProvider.getToken(),this.appCheckCredentialsProvider.getToken()]).then((([r,s])=>{this.b_===t&&this.W_(r,s)}),(r=>{e((()=>{const s=new N(S.UNKNOWN,"Fetching auth token failed: "+r.message);return this.G_(s)}))}))}W_(e,t){const r=this.K_(this.b_);this.stream=this.z_(e,t),this.stream.Zo((()=>{r((()=>this.listener.Zo()))})),this.stream.e_((()=>{r((()=>(this.state=2,this.v_=this.Fi.enqueueAfterDelay(this.S_,1e4,(()=>(this.x_()&&(this.state=3),Promise.resolve()))),this.listener.e_())))})),this.stream.n_((s=>{r((()=>this.G_(s)))})),this.stream.onMessage((s=>{r((()=>++this.C_==1?this.j_(s):this.onNext(s)))}))}O_(){this.state=5,this.F_.g_((async()=>{this.state=0,this.start()}))}G_(e){return O(Yu,`close with error: ${e}`),this.stream=null,this.close(4,e)}K_(e){return t=>{this.Fi.enqueueAndForget((()=>this.b_===e?t():(O(Yu,"stream callback skipped by getCloseGuardedDispatcher."),Promise.resolve())))}}}class WE extends Ed{constructor(e,t,r,s,i,a){super(e,"listen_stream_connection_backoff","listen_stream_idle","health_check_timeout",t,r,s,a),this.serializer=i}z_(e,t){return this.connection.P_("Listen",e,t)}j_(e){return this.onNext(e)}onNext(e){this.F_.reset();const t=Yy(this.serializer,e),r=(function(i){if(!("targetChange"in i))return B.min();const a=i.targetChange;return a.targetIds&&a.targetIds.length?B.min():a.readTime?Xe(a.readTime):B.min()})(e);return this.listener.J_(t,r)}H_(e){const t={};t.database=Ao(this.serializer),t.addTarget=(function(i,a){let c;const l=a.target;if(c=Eo(l)?{documents:tE(i,l)}:{query:nE(i,l).Vt},c.targetId=a.targetId,a.resumeToken.approximateByteSize()>0){c.resumeToken=ad(i,a.resumeToken);const d=To(i,a.expectedCount);d!==null&&(c.expectedCount=d)}else if(a.snapshotVersion.compareTo(B.min())>0){c.readTime=xs(i,a.snapshotVersion.toTimestamp());const d=To(i,a.expectedCount);d!==null&&(c.expectedCount=d)}return c})(this.serializer,e);const r=sE(this.serializer,e);r&&(t.labels=r),this.k_(t)}Y_(e){const t={};t.database=Ao(this.serializer),t.removeTarget=e,this.k_(t)}}class GE extends Ed{constructor(e,t,r,s,i,a){super(e,"write_stream_connection_backoff","write_stream_idle","health_check_timeout",t,r,s,a),this.serializer=i}get Z_(){return this.C_>0}start(){this.lastStreamToken=void 0,super.start()}U_(){this.Z_&&this.X_([])}z_(e,t){return this.connection.P_("Write",e,t)}j_(e){return Q(!!e.streamToken,31322),this.lastStreamToken=e.streamToken,Q(!e.writeResults||e.writeResults.length===0,55816),this.listener.ea()}onNext(e){Q(!!e.streamToken,12678),this.lastStreamToken=e.streamToken,this.F_.reset();const t=eE(e.writeResults,e.commitTime),r=Xe(e.commitTime);return this.listener.ta(r,t)}na(){const e={};e.database=Ao(this.serializer),this.k_(e)}X_(e){const t={streamToken:this.lastStreamToken,writes:e.map((r=>Zy(this.serializer,r)))};this.k_(t)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class KE{}class QE extends KE{constructor(e,t,r,s){super(),this.authCredentials=e,this.appCheckCredentials=t,this.connection=r,this.serializer=s,this.ra=!1}ia(){if(this.ra)throw new N(S.FAILED_PRECONDITION,"The client has already been terminated.")}Wo(e,t,r,s){return this.ia(),Promise.all([this.authCredentials.getToken(),this.appCheckCredentials.getToken()]).then((([i,a])=>this.connection.Wo(e,Io(t,r),s,i,a))).catch((i=>{throw i.name==="FirebaseError"?(i.code===S.UNAUTHENTICATED&&(this.authCredentials.invalidateToken(),this.appCheckCredentials.invalidateToken()),i):new N(S.UNKNOWN,i.toString())}))}Jo(e,t,r,s,i){return this.ia(),Promise.all([this.authCredentials.getToken(),this.appCheckCredentials.getToken()]).then((([a,c])=>this.connection.Jo(e,Io(t,r),s,a,c,i))).catch((a=>{throw a.name==="FirebaseError"?(a.code===S.UNAUTHENTICATED&&(this.authCredentials.invalidateToken(),this.appCheckCredentials.invalidateToken()),a):new N(S.UNKNOWN,a.toString())}))}terminate(){this.ra=!0,this.connection.terminate()}}class JE{constructor(e,t){this.asyncQueue=e,this.onlineStateHandler=t,this.state="Unknown",this.sa=0,this.oa=null,this._a=!0}aa(){this.sa===0&&(this.ua("Unknown"),this.oa=this.asyncQueue.enqueueAfterDelay("online_state_timeout",1e4,(()=>(this.oa=null,this.ca("Backend didn't respond within 10 seconds."),this.ua("Offline"),Promise.resolve()))))}la(e){this.state==="Online"?this.ua("Unknown"):(this.sa++,this.sa>=1&&(this.ha(),this.ca(`Connection failed 1 times. Most recent error: ${e.toString()}`),this.ua("Offline")))}set(e){this.ha(),this.sa=0,e==="Online"&&(this._a=!1),this.ua(e)}ua(e){e!==this.state&&(this.state=e,this.onlineStateHandler(e))}ca(e){const t=`Could not reach Cloud Firestore backend. ${e}
This typically indicates that your device does not have a healthy Internet connection at the moment. The client will operate in offline mode until it is able to successfully connect to the backend.`;this._a?(ft(t),this._a=!1):O("OnlineStateTracker",t)}ha(){this.oa!==null&&(this.oa.cancel(),this.oa=null)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const tn="RemoteStore";class XE{constructor(e,t,r,s,i){this.localStore=e,this.datastore=t,this.asyncQueue=r,this.remoteSyncer={},this.Pa=[],this.Ta=new Map,this.Ia=new Set,this.da=[],this.Ea=i,this.Ea.xo((a=>{r.enqueueAndForget((async()=>{an(this)&&(O(tn,"Restarting streams for network reachability change."),await(async function(l){const d=j(l);d.Ia.add(4),await Lr(d),d.Aa.set("Unknown"),d.Ia.delete(4),await ci(d)})(this))}))})),this.Aa=new JE(r,s)}}async function ci(n){if(an(n))for(const e of n.da)await e(!0)}async function Lr(n){for(const e of n.da)await e(!1)}function vd(n,e){const t=j(n);t.Ta.has(e.targetId)||(t.Ta.set(e.targetId,e),la(t)?ua(t):Un(t).x_()&&ca(t,e))}function aa(n,e){const t=j(n),r=Un(t);t.Ta.delete(e),r.x_()&&Td(t,e),t.Ta.size===0&&(r.x_()?r.B_():an(t)&&t.Aa.set("Unknown"))}function ca(n,e){if(n.Ra.$e(e.targetId),e.resumeToken.approximateByteSize()>0||e.snapshotVersion.compareTo(B.min())>0){const t=n.remoteSyncer.getRemoteKeysForTarget(e.targetId).size;e=e.withExpectedCount(t)}Un(n).H_(e)}function Td(n,e){n.Ra.$e(e),Un(n).Y_(e)}function ua(n){n.Ra=new Hy({getRemoteKeysForTarget:e=>n.remoteSyncer.getRemoteKeysForTarget(e),Et:e=>n.Ta.get(e)||null,lt:()=>n.datastore.serializer.databaseId}),Un(n).start(),n.Aa.aa()}function la(n){return an(n)&&!Un(n).M_()&&n.Ta.size>0}function an(n){return j(n).Ia.size===0}function Id(n){n.Ra=void 0}async function YE(n){n.Aa.set("Online")}async function ZE(n){n.Ta.forEach(((e,t)=>{ca(n,e)}))}async function ev(n,e){Id(n),la(n)?(n.Aa.la(e),ua(n)):n.Aa.set("Unknown")}async function tv(n,e,t){if(n.Aa.set("Online"),e instanceof od&&e.state===2&&e.cause)try{await(async function(s,i){const a=i.cause;for(const c of i.targetIds)s.Ta.has(c)&&(await s.remoteSyncer.rejectListen(c,a),s.Ta.delete(c),s.Ra.removeTarget(c))})(n,e)}catch(r){O(tn,"Failed to remove targets %s: %s ",e.targetIds.join(","),r),await Fs(n,r)}else if(e instanceof Is?n.Ra.Ye(e):e instanceof id?n.Ra.it(e):n.Ra.et(e),!t.isEqual(B.min()))try{const r=await _d(n.localStore);t.compareTo(r)>=0&&await(function(i,a){const c=i.Ra.Pt(a);return c.targetChanges.forEach(((l,d)=>{if(l.resumeToken.approximateByteSize()>0){const p=i.Ta.get(d);p&&i.Ta.set(d,p.withResumeToken(l.resumeToken,a))}})),c.targetMismatches.forEach(((l,d)=>{const p=i.Ta.get(l);if(!p)return;i.Ta.set(l,p.withResumeToken(pe.EMPTY_BYTE_STRING,p.snapshotVersion)),Td(i,l);const m=new St(p.target,l,d,p.sequenceNumber);ca(i,m)})),i.remoteSyncer.applyRemoteEvent(c)})(n,t)}catch(r){O(tn,"Failed to raise snapshot:",r),await Fs(n,r)}}async function Fs(n,e,t){if(!Mn(e))throw e;n.Ia.add(1),await Lr(n),n.Aa.set("Offline"),t||(t=()=>_d(n.localStore)),n.asyncQueue.enqueueRetryable((async()=>{O(tn,"Retrying IndexedDB access"),await t(),n.Ia.delete(1),await ci(n)}))}function wd(n,e){return e().catch((t=>Fs(n,t,e)))}async function ui(n){const e=j(n),t=xt(e);let r=e.Pa.length>0?e.Pa[e.Pa.length-1].batchId:Ko;for(;nv(e);)try{const s=await xE(e.localStore,r);if(s===null){e.Pa.length===0&&t.B_();break}r=s.batchId,rv(e,s)}catch(s){await Fs(e,s)}Ad(e)&&Rd(e)}function nv(n){return an(n)&&n.Pa.length<10}function rv(n,e){n.Pa.push(e);const t=xt(n);t.x_()&&t.Z_&&t.X_(e.mutations)}function Ad(n){return an(n)&&!xt(n).M_()&&n.Pa.length>0}function Rd(n){xt(n).start()}async function sv(n){xt(n).na()}async function iv(n){const e=xt(n);for(const t of n.Pa)e.X_(t.mutations)}async function ov(n,e,t){const r=n.Pa.shift(),s=ea.from(r,e,t);await wd(n,(()=>n.remoteSyncer.applySuccessfulWrite(s))),await ui(n)}async function av(n,e){e&&xt(n).Z_&&await(async function(r,s){if((function(a){return $y(a)&&a!==S.ABORTED})(s.code)){const i=r.Pa.shift();xt(r).N_(),await wd(r,(()=>r.remoteSyncer.rejectFailedWrite(i.batchId,s))),await ui(r)}})(n,e),Ad(n)&&Rd(n)}async function Zu(n,e){const t=j(n);t.asyncQueue.verifyOperationInProgress(),O(tn,"RemoteStore received new credentials");const r=an(t);t.Ia.add(3),await Lr(t),r&&t.Aa.set("Unknown"),await t.remoteSyncer.handleCredentialChange(e),t.Ia.delete(3),await ci(t)}async function cv(n,e){const t=j(n);e?(t.Ia.delete(2),await ci(t)):e||(t.Ia.add(2),await Lr(t),t.Aa.set("Unknown"))}function Un(n){return n.Va||(n.Va=(function(t,r,s){const i=j(t);return i.ia(),new WE(r,i.connection,i.authCredentials,i.appCheckCredentials,i.serializer,s)})(n.datastore,n.asyncQueue,{Zo:YE.bind(null,n),e_:ZE.bind(null,n),n_:ev.bind(null,n),J_:tv.bind(null,n)}),n.da.push((async e=>{e?(n.Va.N_(),la(n)?ua(n):n.Aa.set("Unknown")):(await n.Va.stop(),Id(n))}))),n.Va}function xt(n){return n.ma||(n.ma=(function(t,r,s){const i=j(t);return i.ia(),new GE(r,i.connection,i.authCredentials,i.appCheckCredentials,i.serializer,s)})(n.datastore,n.asyncQueue,{Zo:()=>Promise.resolve(),e_:sv.bind(null,n),n_:av.bind(null,n),ea:iv.bind(null,n),ta:ov.bind(null,n)}),n.da.push((async e=>{e?(n.ma.N_(),await ui(n)):(await n.ma.stop(),n.Pa.length>0&&(O(tn,`Stopping write stream with ${n.Pa.length} pending writes`),n.Pa=[]))}))),n.ma}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ha{constructor(e,t,r,s,i){this.asyncQueue=e,this.timerId=t,this.targetTimeMs=r,this.op=s,this.removalCallback=i,this.deferred=new ct,this.then=this.deferred.promise.then.bind(this.deferred.promise),this.deferred.promise.catch((a=>{}))}get promise(){return this.deferred.promise}static createAndSchedule(e,t,r,s,i){const a=Date.now()+r,c=new ha(e,t,a,s,i);return c.start(r),c}start(e){this.timerHandle=setTimeout((()=>this.handleDelayElapsed()),e)}skipDelay(){return this.handleDelayElapsed()}cancel(e){this.timerHandle!==null&&(this.clearTimeout(),this.deferred.reject(new N(S.CANCELLED,"Operation cancelled"+(e?": "+e:""))))}handleDelayElapsed(){this.asyncQueue.enqueueAndForget((()=>this.timerHandle!==null?(this.clearTimeout(),this.op().then((e=>this.deferred.resolve(e)))):Promise.resolve()))}clearTimeout(){this.timerHandle!==null&&(this.removalCallback(this),clearTimeout(this.timerHandle),this.timerHandle=null)}}function da(n,e){if(ft("AsyncQueue",`${e}: ${n}`),Mn(n))return new N(S.UNAVAILABLE,`${e}: ${n}`);throw n}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class wn{static emptySet(e){return new wn(e.comparator)}constructor(e){this.comparator=e?(t,r)=>e(t,r)||L.comparator(t.key,r.key):(t,r)=>L.comparator(t.key,r.key),this.keyedMap=cr(),this.sortedSet=new re(this.comparator)}has(e){return this.keyedMap.get(e)!=null}get(e){return this.keyedMap.get(e)}first(){return this.sortedSet.minKey()}last(){return this.sortedSet.maxKey()}isEmpty(){return this.sortedSet.isEmpty()}indexOf(e){const t=this.keyedMap.get(e);return t?this.sortedSet.indexOf(t):-1}get size(){return this.sortedSet.size}forEach(e){this.sortedSet.inorderTraversal(((t,r)=>(e(t),!1)))}add(e){const t=this.delete(e.key);return t.copy(t.keyedMap.insert(e.key,e),t.sortedSet.insert(e,null))}delete(e){const t=this.get(e);return t?this.copy(this.keyedMap.remove(e),this.sortedSet.remove(t)):this}isEqual(e){if(!(e instanceof wn)||this.size!==e.size)return!1;const t=this.sortedSet.getIterator(),r=e.sortedSet.getIterator();for(;t.hasNext();){const s=t.getNext().key,i=r.getNext().key;if(!s.isEqual(i))return!1}return!0}toString(){const e=[];return this.forEach((t=>{e.push(t.toString())})),e.length===0?"DocumentSet ()":`DocumentSet (
  `+e.join(`  
`)+`
)`}copy(e,t){const r=new wn;return r.comparator=this.comparator,r.keyedMap=e,r.sortedSet=t,r}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class el{constructor(){this.fa=new re(L.comparator)}track(e){const t=e.doc.key,r=this.fa.get(t);r?e.type!==0&&r.type===3?this.fa=this.fa.insert(t,e):e.type===3&&r.type!==1?this.fa=this.fa.insert(t,{type:r.type,doc:e.doc}):e.type===2&&r.type===2?this.fa=this.fa.insert(t,{type:2,doc:e.doc}):e.type===2&&r.type===0?this.fa=this.fa.insert(t,{type:0,doc:e.doc}):e.type===1&&r.type===0?this.fa=this.fa.remove(t):e.type===1&&r.type===2?this.fa=this.fa.insert(t,{type:1,doc:r.doc}):e.type===0&&r.type===1?this.fa=this.fa.insert(t,{type:2,doc:e.doc}):x(63341,{At:e,ga:r}):this.fa=this.fa.insert(t,e)}pa(){const e=[];return this.fa.inorderTraversal(((t,r)=>{e.push(r)})),e}}class Nn{constructor(e,t,r,s,i,a,c,l,d){this.query=e,this.docs=t,this.oldDocs=r,this.docChanges=s,this.mutatedKeys=i,this.fromCache=a,this.syncStateChanged=c,this.excludesMetadataChanges=l,this.hasCachedResults=d}static fromInitialDocuments(e,t,r,s,i){const a=[];return t.forEach((c=>{a.push({type:0,doc:c})})),new Nn(e,t,wn.emptySet(t),a,r,s,!0,!1,i)}get hasPendingWrites(){return!this.mutatedKeys.isEmpty()}isEqual(e){if(!(this.fromCache===e.fromCache&&this.hasCachedResults===e.hasCachedResults&&this.syncStateChanged===e.syncStateChanged&&this.mutatedKeys.isEqual(e.mutatedKeys)&&ei(this.query,e.query)&&this.docs.isEqual(e.docs)&&this.oldDocs.isEqual(e.oldDocs)))return!1;const t=this.docChanges,r=e.docChanges;if(t.length!==r.length)return!1;for(let s=0;s<t.length;s++)if(t[s].type!==r[s].type||!t[s].doc.isEqual(r[s].doc))return!1;return!0}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class uv{constructor(){this.ya=void 0,this.wa=[]}Sa(){return this.wa.some((e=>e.ba()))}}class lv{constructor(){this.queries=tl(),this.onlineState="Unknown",this.Da=new Set}terminate(){(function(t,r){const s=j(t),i=s.queries;s.queries=tl(),i.forEach(((a,c)=>{for(const l of c.wa)l.onError(r)}))})(this,new N(S.ABORTED,"Firestore shutting down"))}}function tl(){return new on((n=>Hh(n)),ei)}async function fa(n,e){const t=j(n);let r=3;const s=e.query;let i=t.queries.get(s);i?!i.Sa()&&e.ba()&&(r=2):(i=new uv,r=e.ba()?0:1);try{switch(r){case 0:i.ya=await t.onListen(s,!0);break;case 1:i.ya=await t.onListen(s,!1);break;case 2:await t.onFirstRemoteStoreListen(s)}}catch(a){const c=da(a,`Initialization of query '${mn(e.query)}' failed`);return void e.onError(c)}t.queries.set(s,i),i.wa.push(e),e.va(t.onlineState),i.ya&&e.Ca(i.ya)&&ma(t)}async function pa(n,e){const t=j(n),r=e.query;let s=3;const i=t.queries.get(r);if(i){const a=i.wa.indexOf(e);a>=0&&(i.wa.splice(a,1),i.wa.length===0?s=e.ba()?0:1:!i.Sa()&&e.ba()&&(s=2))}switch(s){case 0:return t.queries.delete(r),t.onUnlisten(r,!0);case 1:return t.queries.delete(r),t.onUnlisten(r,!1);case 2:return t.onLastRemoteStoreUnlisten(r);default:return}}function hv(n,e){const t=j(n);let r=!1;for(const s of e){const i=s.query,a=t.queries.get(i);if(a){for(const c of a.wa)c.Ca(s)&&(r=!0);a.ya=s}}r&&ma(t)}function dv(n,e,t){const r=j(n),s=r.queries.get(e);if(s)for(const i of s.wa)i.onError(t);r.queries.delete(e)}function ma(n){n.Da.forEach((e=>{e.next()}))}var So,nl;(nl=So||(So={})).Fa="default",nl.Cache="cache";class ga{constructor(e,t,r){this.query=e,this.Ma=t,this.xa=!1,this.Oa=null,this.onlineState="Unknown",this.options=r||{}}Ca(e){if(!this.options.includeMetadataChanges){const r=[];for(const s of e.docChanges)s.type!==3&&r.push(s);e=new Nn(e.query,e.docs,e.oldDocs,r,e.mutatedKeys,e.fromCache,e.syncStateChanged,!0,e.hasCachedResults)}let t=!1;return this.xa?this.Na(e)&&(this.Ma.next(e),t=!0):this.Ba(e,this.onlineState)&&(this.La(e),t=!0),this.Oa=e,t}onError(e){this.Ma.error(e)}va(e){this.onlineState=e;let t=!1;return this.Oa&&!this.xa&&this.Ba(this.Oa,e)&&(this.La(this.Oa),t=!0),t}Ba(e,t){if(!e.fromCache||!this.ba())return!0;const r=t!=="Offline";return(!this.options.ka||!r)&&(!e.docs.isEmpty()||e.hasCachedResults||t==="Offline")}Na(e){if(e.docChanges.length>0)return!0;const t=this.Oa&&this.Oa.hasPendingWrites!==e.hasPendingWrites;return!(!e.syncStateChanged&&!t)&&this.options.includeMetadataChanges===!0}La(e){e=Nn.fromInitialDocuments(e.query,e.docs,e.mutatedKeys,e.fromCache,e.hasCachedResults),this.xa=!0,this.Ma.next(e)}ba(){return this.options.source!==So.Cache}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class bd{constructor(e){this.key=e}}class Sd{constructor(e){this.key=e}}class fv{constructor(e,t){this.query=e,this.Ha=t,this.Ya=null,this.hasCachedResults=!1,this.current=!1,this.Za=W(),this.mutatedKeys=W(),this.Xa=Wh(e),this.eu=new wn(this.Xa)}get tu(){return this.Ha}nu(e,t){const r=t?t.ru:new el,s=t?t.eu:this.eu;let i=t?t.mutatedKeys:this.mutatedKeys,a=s,c=!1;const l=this.query.limitType==="F"&&s.size===this.query.limit?s.last():null,d=this.query.limitType==="L"&&s.size===this.query.limit?s.first():null;if(e.inorderTraversal(((p,m)=>{const E=s.get(p),b=ti(this.query,m)?m:null,C=!!E&&this.mutatedKeys.has(E.key),V=!!b&&(b.hasLocalMutations||this.mutatedKeys.has(b.key)&&b.hasCommittedMutations);let k=!1;E&&b?E.data.isEqual(b.data)?C!==V&&(r.track({type:3,doc:b}),k=!0):this.iu(E,b)||(r.track({type:2,doc:b}),k=!0,(l&&this.Xa(b,l)>0||d&&this.Xa(b,d)<0)&&(c=!0)):!E&&b?(r.track({type:0,doc:b}),k=!0):E&&!b&&(r.track({type:1,doc:E}),k=!0,(l||d)&&(c=!0)),k&&(b?(a=a.add(b),i=V?i.add(p):i.delete(p)):(a=a.delete(p),i=i.delete(p)))})),this.query.limit!==null)for(;a.size>this.query.limit;){const p=this.query.limitType==="F"?a.last():a.first();a=a.delete(p.key),i=i.delete(p.key),r.track({type:1,doc:p})}return{eu:a,ru:r,Ds:c,mutatedKeys:i}}iu(e,t){return e.hasLocalMutations&&t.hasCommittedMutations&&!t.hasLocalMutations}applyChanges(e,t,r,s){const i=this.eu;this.eu=e.eu,this.mutatedKeys=e.mutatedKeys;const a=e.ru.pa();a.sort(((p,m)=>(function(b,C){const V=k=>{switch(k){case 0:return 1;case 2:case 3:return 2;case 1:return 0;default:return x(20277,{At:k})}};return V(b)-V(C)})(p.type,m.type)||this.Xa(p.doc,m.doc))),this.su(r),s=s!=null&&s;const c=t&&!s?this.ou():[],l=this.Za.size===0&&this.current&&!s?1:0,d=l!==this.Ya;return this.Ya=l,a.length!==0||d?{snapshot:new Nn(this.query,e.eu,i,a,e.mutatedKeys,l===0,d,!1,!!r&&r.resumeToken.approximateByteSize()>0),_u:c}:{_u:c}}va(e){return this.current&&e==="Offline"?(this.current=!1,this.applyChanges({eu:this.eu,ru:new el,mutatedKeys:this.mutatedKeys,Ds:!1},!1)):{_u:[]}}au(e){return!this.Ha.has(e)&&!!this.eu.has(e)&&!this.eu.get(e).hasLocalMutations}su(e){e&&(e.addedDocuments.forEach((t=>this.Ha=this.Ha.add(t))),e.modifiedDocuments.forEach((t=>{})),e.removedDocuments.forEach((t=>this.Ha=this.Ha.delete(t))),this.current=e.current)}ou(){if(!this.current)return[];const e=this.Za;this.Za=W(),this.eu.forEach((r=>{this.au(r.key)&&(this.Za=this.Za.add(r.key))}));const t=[];return e.forEach((r=>{this.Za.has(r)||t.push(new Sd(r))})),this.Za.forEach((r=>{e.has(r)||t.push(new bd(r))})),t}uu(e){this.Ha=e.qs,this.Za=W();const t=this.nu(e.documents);return this.applyChanges(t,!0)}cu(){return Nn.fromInitialDocuments(this.query,this.eu,this.mutatedKeys,this.Ya===0,this.hasCachedResults)}}const _a="SyncEngine";class pv{constructor(e,t,r){this.query=e,this.targetId=t,this.view=r}}class mv{constructor(e){this.key=e,this.lu=!1}}class gv{constructor(e,t,r,s,i,a){this.localStore=e,this.remoteStore=t,this.eventManager=r,this.sharedClientState=s,this.currentUser=i,this.maxConcurrentLimboResolutions=a,this.hu={},this.Pu=new on((c=>Hh(c)),ei),this.Tu=new Map,this.Iu=new Set,this.du=new re(L.comparator),this.Eu=new Map,this.Au=new ra,this.Ru={},this.Vu=new Map,this.mu=Dn.ur(),this.onlineState="Unknown",this.fu=void 0}get isPrimaryClient(){return this.fu===!0}}async function _v(n,e,t=!0){const r=Vd(n);let s;const i=r.Pu.get(e);return i?(r.sharedClientState.addLocalQueryTarget(i.targetId),s=i.view.cu()):s=await Pd(r,e,t,!0),s}async function yv(n,e){const t=Vd(n);await Pd(t,e,!0,!1)}async function Pd(n,e,t,r){const s=await UE(n.localStore,Je(e)),i=s.targetId,a=n.sharedClientState.addLocalQueryTarget(i,t);let c;return r&&(c=await Ev(n,e,i,a==="current",s.resumeToken)),n.isPrimaryClient&&t&&vd(n.remoteStore,s),c}async function Ev(n,e,t,r,s){n.gu=(m,E,b)=>(async function(V,k,q,U){let F=k.view.nu(q);F.Ds&&(F=await Ku(V.localStore,k.query,!1).then((({documents:T})=>k.view.nu(T,F))));const z=U&&U.targetChanges.get(k.targetId),me=U&&U.targetMismatches.get(k.targetId)!=null,ee=k.view.applyChanges(F,V.isPrimaryClient,z,me);return sl(V,k.targetId,ee._u),ee.snapshot})(n,m,E,b);const i=await Ku(n.localStore,e,!0),a=new fv(e,i.qs),c=a.nu(i.documents),l=Or.createSynthesizedTargetChangeForCurrentChange(t,r&&n.onlineState!=="Offline",s),d=a.applyChanges(c,n.isPrimaryClient,l);sl(n,t,d._u);const p=new pv(e,t,a);return n.Pu.set(e,p),n.Tu.has(t)?n.Tu.get(t).push(e):n.Tu.set(t,[e]),d.snapshot}async function vv(n,e,t){const r=j(n),s=r.Pu.get(e),i=r.Tu.get(s.targetId);if(i.length>1)return r.Tu.set(s.targetId,i.filter((a=>!ei(a,e)))),void r.Pu.delete(e);r.isPrimaryClient?(r.sharedClientState.removeLocalQueryTarget(s.targetId),r.sharedClientState.isActiveQueryTarget(s.targetId)||await Ro(r.localStore,s.targetId,!1).then((()=>{r.sharedClientState.clearQueryState(s.targetId),t&&aa(r.remoteStore,s.targetId),Po(r,s.targetId)})).catch(Ln)):(Po(r,s.targetId),await Ro(r.localStore,s.targetId,!0))}async function Tv(n,e){const t=j(n),r=t.Pu.get(e),s=t.Tu.get(r.targetId);t.isPrimaryClient&&s.length===1&&(t.sharedClientState.removeLocalQueryTarget(r.targetId),aa(t.remoteStore,r.targetId))}async function Iv(n,e,t){const r=Cv(n);try{const s=await(function(a,c){const l=j(a),d=Z.now(),p=c.reduce(((b,C)=>b.add(C.key)),W());let m,E;return l.persistence.runTransaction("Locally write mutations","readwrite",(b=>{let C=mt(),V=W();return l.Os.getEntries(b,p).next((k=>{C=k,C.forEach(((q,U)=>{U.isValidDocument()||(V=V.add(q))}))})).next((()=>l.localDocuments.getOverlayedDocuments(b,C))).next((k=>{m=k;const q=[];for(const U of c){const F=Uy(U,m.get(U.key).overlayedDocument);F!=null&&q.push(new qt(U.key,F,xh(F.value.mapValue),De.exists(!0)))}return l.mutationQueue.addMutationBatch(b,d,q,c)})).next((k=>{E=k;const q=k.applyToLocalDocumentSet(m,V);return l.documentOverlayCache.saveOverlays(b,k.batchId,q)}))})).then((()=>({batchId:E.batchId,changes:Kh(m)})))})(r.localStore,e);r.sharedClientState.addPendingMutation(s.batchId),(function(a,c,l){let d=a.Ru[a.currentUser.toKey()];d||(d=new re($)),d=d.insert(c,l),a.Ru[a.currentUser.toKey()]=d})(r,s.batchId,t),await Mr(r,s.changes),await ui(r.remoteStore)}catch(s){const i=da(s,"Failed to persist write");t.reject(i)}}async function Cd(n,e){const t=j(n);try{const r=await LE(t.localStore,e);e.targetChanges.forEach(((s,i)=>{const a=t.Eu.get(i);a&&(Q(s.addedDocuments.size+s.modifiedDocuments.size+s.removedDocuments.size<=1,22616),s.addedDocuments.size>0?a.lu=!0:s.modifiedDocuments.size>0?Q(a.lu,14607):s.removedDocuments.size>0&&(Q(a.lu,42227),a.lu=!1))})),await Mr(t,r,e)}catch(r){await Ln(r)}}function rl(n,e,t){const r=j(n);if(r.isPrimaryClient&&t===0||!r.isPrimaryClient&&t===1){const s=[];r.Pu.forEach(((i,a)=>{const c=a.view.va(e);c.snapshot&&s.push(c.snapshot)})),(function(a,c){const l=j(a);l.onlineState=c;let d=!1;l.queries.forEach(((p,m)=>{for(const E of m.wa)E.va(c)&&(d=!0)})),d&&ma(l)})(r.eventManager,e),s.length&&r.hu.J_(s),r.onlineState=e,r.isPrimaryClient&&r.sharedClientState.setOnlineState(e)}}async function wv(n,e,t){const r=j(n);r.sharedClientState.updateQueryState(e,"rejected",t);const s=r.Eu.get(e),i=s&&s.key;if(i){let a=new re(L.comparator);a=a.insert(i,Ae.newNoDocument(i,B.min()));const c=W().add(i),l=new oi(B.min(),new Map,new re($),a,c);await Cd(r,l),r.du=r.du.remove(i),r.Eu.delete(e),ya(r)}else await Ro(r.localStore,e,!1).then((()=>Po(r,e,t))).catch(Ln)}async function Av(n,e){const t=j(n),r=e.batch.batchId;try{const s=await OE(t.localStore,e);Dd(t,r,null),kd(t,r),t.sharedClientState.updateMutationState(r,"acknowledged"),await Mr(t,s)}catch(s){await Ln(s)}}async function Rv(n,e,t){const r=j(n);try{const s=await(function(a,c){const l=j(a);return l.persistence.runTransaction("Reject batch","readwrite-primary",(d=>{let p;return l.mutationQueue.lookupMutationBatch(d,c).next((m=>(Q(m!==null,37113),p=m.keys(),l.mutationQueue.removeMutationBatch(d,m)))).next((()=>l.mutationQueue.performConsistencyCheck(d))).next((()=>l.documentOverlayCache.removeOverlaysForBatchId(d,p,c))).next((()=>l.localDocuments.recalculateAndSaveOverlaysForDocumentKeys(d,p))).next((()=>l.localDocuments.getDocuments(d,p)))}))})(r.localStore,e);Dd(r,e,t),kd(r,e),r.sharedClientState.updateMutationState(e,"rejected",t),await Mr(r,s)}catch(s){await Ln(s)}}function kd(n,e){(n.Vu.get(e)||[]).forEach((t=>{t.resolve()})),n.Vu.delete(e)}function Dd(n,e,t){const r=j(n);let s=r.Ru[r.currentUser.toKey()];if(s){const i=s.get(e);i&&(t?i.reject(t):i.resolve(),s=s.remove(e)),r.Ru[r.currentUser.toKey()]=s}}function Po(n,e,t=null){n.sharedClientState.removeLocalQueryTarget(e);for(const r of n.Tu.get(e))n.Pu.delete(r),t&&n.hu.pu(r,t);n.Tu.delete(e),n.isPrimaryClient&&n.Au.zr(e).forEach((r=>{n.Au.containsKey(r)||Nd(n,r)}))}function Nd(n,e){n.Iu.delete(e.path.canonicalString());const t=n.du.get(e);t!==null&&(aa(n.remoteStore,t),n.du=n.du.remove(e),n.Eu.delete(t),ya(n))}function sl(n,e,t){for(const r of t)r instanceof bd?(n.Au.addReference(r.key,e),bv(n,r)):r instanceof Sd?(O(_a,"Document no longer in limbo: "+r.key),n.Au.removeReference(r.key,e),n.Au.containsKey(r.key)||Nd(n,r.key)):x(19791,{yu:r})}function bv(n,e){const t=e.key,r=t.path.canonicalString();n.du.get(t)||n.Iu.has(r)||(O(_a,"New document in limbo: "+t),n.Iu.add(r),ya(n))}function ya(n){for(;n.Iu.size>0&&n.du.size<n.maxConcurrentLimboResolutions;){const e=n.Iu.values().next().value;n.Iu.delete(e);const t=new L(Y.fromString(e)),r=n.mu.next();n.Eu.set(r,new mv(t)),n.du=n.du.insert(t,r),vd(n.remoteStore,new St(Je(Zs(t.path)),r,"TargetPurposeLimboResolution",Js.ue))}}async function Mr(n,e,t){const r=j(n),s=[],i=[],a=[];r.Pu.isEmpty()||(r.Pu.forEach(((c,l)=>{a.push(r.gu(l,e,t).then((d=>{var p;if((d||t)&&r.isPrimaryClient){const m=d?!d.fromCache:(p=t==null?void 0:t.targetChanges.get(l.targetId))===null||p===void 0?void 0:p.current;r.sharedClientState.updateQueryState(l.targetId,m?"current":"not-current")}if(d){s.push(d);const m=ia.Es(l.targetId,d);i.push(m)}})))})),await Promise.all(a),r.hu.J_(s),await(async function(l,d){const p=j(l);try{await p.persistence.runTransaction("notifyLocalViewChanges","readwrite",(m=>P.forEach(d,(E=>P.forEach(E.Is,(b=>p.persistence.referenceDelegate.addReference(m,E.targetId,b))).next((()=>P.forEach(E.ds,(b=>p.persistence.referenceDelegate.removeReference(m,E.targetId,b)))))))))}catch(m){if(!Mn(m))throw m;O(oa,"Failed to update sequence numbers: "+m)}for(const m of d){const E=m.targetId;if(!m.fromCache){const b=p.Fs.get(E),C=b.snapshotVersion,V=b.withLastLimboFreeSnapshotVersion(C);p.Fs=p.Fs.insert(E,V)}}})(r.localStore,i))}async function Sv(n,e){const t=j(n);if(!t.currentUser.isEqual(e)){O(_a,"User change. New user:",e.toKey());const r=await gd(t.localStore,e);t.currentUser=e,(function(i,a){i.Vu.forEach((c=>{c.forEach((l=>{l.reject(new N(S.CANCELLED,a))}))})),i.Vu.clear()})(t,"'waitForPendingWrites' promise is rejected due to a user change."),t.sharedClientState.handleUserChange(e,r.removedBatchIds,r.addedBatchIds),await Mr(t,r.Bs)}}function Pv(n,e){const t=j(n),r=t.Eu.get(e);if(r&&r.lu)return W().add(r.key);{let s=W();const i=t.Tu.get(e);if(!i)return s;for(const a of i){const c=t.Pu.get(a);s=s.unionWith(c.view.tu)}return s}}function Vd(n){const e=j(n);return e.remoteStore.remoteSyncer.applyRemoteEvent=Cd.bind(null,e),e.remoteStore.remoteSyncer.getRemoteKeysForTarget=Pv.bind(null,e),e.remoteStore.remoteSyncer.rejectListen=wv.bind(null,e),e.hu.J_=hv.bind(null,e.eventManager),e.hu.pu=dv.bind(null,e.eventManager),e}function Cv(n){const e=j(n);return e.remoteStore.remoteSyncer.applySuccessfulWrite=Av.bind(null,e),e.remoteStore.remoteSyncer.rejectFailedWrite=Rv.bind(null,e),e}class Bs{constructor(){this.kind="memory",this.synchronizeTabs=!1}async initialize(e){this.serializer=ai(e.databaseInfo.databaseId),this.sharedClientState=this.bu(e),this.persistence=this.Du(e),await this.persistence.start(),this.localStore=this.vu(e),this.gcScheduler=this.Cu(e,this.localStore),this.indexBackfillerScheduler=this.Fu(e,this.localStore)}Cu(e,t){return null}Fu(e,t){return null}vu(e){return VE(this.persistence,new kE,e.initialUser,this.serializer)}Du(e){return new md(sa.Vi,this.serializer)}bu(e){return new BE}async terminate(){var e,t;(e=this.gcScheduler)===null||e===void 0||e.stop(),(t=this.indexBackfillerScheduler)===null||t===void 0||t.stop(),this.sharedClientState.shutdown(),await this.persistence.shutdown()}}Bs.provider={build:()=>new Bs};class kv extends Bs{constructor(e){super(),this.cacheSizeBytes=e}Cu(e,t){Q(this.persistence.referenceDelegate instanceof Us,46915);const r=this.persistence.referenceDelegate.garbageCollector;return new mE(r,e.asyncQueue,t)}Du(e){const t=this.cacheSizeBytes!==void 0?Ne.withCacheSize(this.cacheSizeBytes):Ne.DEFAULT;return new md((r=>Us.Vi(r,t)),this.serializer)}}class Co{async initialize(e,t){this.localStore||(this.localStore=e.localStore,this.sharedClientState=e.sharedClientState,this.datastore=this.createDatastore(t),this.remoteStore=this.createRemoteStore(t),this.eventManager=this.createEventManager(t),this.syncEngine=this.createSyncEngine(t,!e.synchronizeTabs),this.sharedClientState.onlineStateHandler=r=>rl(this.syncEngine,r,1),this.remoteStore.remoteSyncer.handleCredentialChange=Sv.bind(null,this.syncEngine),await cv(this.remoteStore,this.syncEngine.isPrimaryClient))}createEventManager(e){return(function(){return new lv})()}createDatastore(e){const t=ai(e.databaseInfo.databaseId),r=(function(i){return new HE(i)})(e.databaseInfo);return(function(i,a,c,l){return new QE(i,a,c,l)})(e.authCredentials,e.appCheckCredentials,r,t)}createRemoteStore(e){return(function(r,s,i,a,c){return new XE(r,s,i,a,c)})(this.localStore,this.datastore,e.asyncQueue,(t=>rl(this.syncEngine,t,0)),(function(){return Xu.C()?new Xu:new jE})())}createSyncEngine(e,t){return(function(s,i,a,c,l,d,p){const m=new gv(s,i,a,c,l,d);return p&&(m.fu=!0),m})(this.localStore,this.remoteStore,this.eventManager,this.sharedClientState,e.initialUser,e.maxConcurrentLimboResolutions,t)}async terminate(){var e,t;await(async function(s){const i=j(s);O(tn,"RemoteStore shutting down."),i.Ia.add(5),await Lr(i),i.Ea.shutdown(),i.Aa.set("Unknown")})(this.remoteStore),(e=this.datastore)===null||e===void 0||e.terminate(),(t=this.eventManager)===null||t===void 0||t.terminate()}}Co.provider={build:()=>new Co};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *//**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ea{constructor(e){this.observer=e,this.muted=!1}next(e){this.muted||this.observer.next&&this.xu(this.observer.next,e)}error(e){this.muted||(this.observer.error?this.xu(this.observer.error,e):ft("Uncaught Error in snapshot listener:",e.toString()))}Ou(){this.muted=!0}xu(e,t){setTimeout((()=>{this.muted||e(t)}),0)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ut="FirestoreClient";class Dv{constructor(e,t,r,s,i){this.authCredentials=e,this.appCheckCredentials=t,this.asyncQueue=r,this.databaseInfo=s,this.user=we.UNAUTHENTICATED,this.clientId=Ks.newId(),this.authCredentialListener=()=>Promise.resolve(),this.appCheckCredentialListener=()=>Promise.resolve(),this._uninitializedComponentsProvider=i,this.authCredentials.start(r,(async a=>{O(Ut,"Received user=",a.uid),await this.authCredentialListener(a),this.user=a})),this.appCheckCredentials.start(r,(a=>(O(Ut,"Received new app check token=",a),this.appCheckCredentialListener(a,this.user))))}get configuration(){return{asyncQueue:this.asyncQueue,databaseInfo:this.databaseInfo,clientId:this.clientId,authCredentials:this.authCredentials,appCheckCredentials:this.appCheckCredentials,initialUser:this.user,maxConcurrentLimboResolutions:100}}setCredentialChangeListener(e){this.authCredentialListener=e}setAppCheckTokenChangeListener(e){this.appCheckCredentialListener=e}terminate(){this.asyncQueue.enterRestrictedMode();const e=new ct;return this.asyncQueue.enqueueAndForgetEvenWhileRestricted((async()=>{try{this._onlineComponents&&await this._onlineComponents.terminate(),this._offlineComponents&&await this._offlineComponents.terminate(),this.authCredentials.shutdown(),this.appCheckCredentials.shutdown(),e.resolve()}catch(t){const r=da(t,"Failed to shutdown persistence");e.reject(r)}})),e.promise}}async function Zi(n,e){n.asyncQueue.verifyOperationInProgress(),O(Ut,"Initializing OfflineComponentProvider");const t=n.configuration;await e.initialize(t);let r=t.initialUser;n.setCredentialChangeListener((async s=>{r.isEqual(s)||(await gd(e.localStore,s),r=s)})),e.persistence.setDatabaseDeletedListener((()=>{pt("Terminating Firestore due to IndexedDb database deletion"),n.terminate().then((()=>{O("Terminating Firestore due to IndexedDb database deletion completed successfully")})).catch((s=>{pt("Terminating Firestore due to IndexedDb database deletion failed",s)}))})),n._offlineComponents=e}async function il(n,e){n.asyncQueue.verifyOperationInProgress();const t=await Nv(n);O(Ut,"Initializing OnlineComponentProvider"),await e.initialize(t,n.configuration),n.setCredentialChangeListener((r=>Zu(e.remoteStore,r))),n.setAppCheckTokenChangeListener(((r,s)=>Zu(e.remoteStore,s))),n._onlineComponents=e}async function Nv(n){if(!n._offlineComponents)if(n._uninitializedComponentsProvider){O(Ut,"Using user provided OfflineComponentProvider");try{await Zi(n,n._uninitializedComponentsProvider._offline)}catch(e){const t=e;if(!(function(s){return s.name==="FirebaseError"?s.code===S.FAILED_PRECONDITION||s.code===S.UNIMPLEMENTED:!(typeof DOMException<"u"&&s instanceof DOMException)||s.code===22||s.code===20||s.code===11})(t))throw t;pt("Error using user provided cache. Falling back to memory cache: "+t),await Zi(n,new Bs)}}else O(Ut,"Using default OfflineComponentProvider"),await Zi(n,new kv(void 0));return n._offlineComponents}async function Od(n){return n._onlineComponents||(n._uninitializedComponentsProvider?(O(Ut,"Using user provided OnlineComponentProvider"),await il(n,n._uninitializedComponentsProvider._online)):(O(Ut,"Using default OnlineComponentProvider"),await il(n,new Co))),n._onlineComponents}function Vv(n){return Od(n).then((e=>e.syncEngine))}async function js(n){const e=await Od(n),t=e.eventManager;return t.onListen=_v.bind(null,e.syncEngine),t.onUnlisten=vv.bind(null,e.syncEngine),t.onFirstRemoteStoreListen=yv.bind(null,e.syncEngine),t.onLastRemoteStoreUnlisten=Tv.bind(null,e.syncEngine),t}function Ov(n,e,t={}){const r=new ct;return n.asyncQueue.enqueueAndForget((async()=>(function(i,a,c,l,d){const p=new Ea({next:E=>{p.Ou(),a.enqueueAndForget((()=>pa(i,m)));const b=E.docs.has(c);!b&&E.fromCache?d.reject(new N(S.UNAVAILABLE,"Failed to get document because the client is offline.")):b&&E.fromCache&&l&&l.source==="server"?d.reject(new N(S.UNAVAILABLE,'Failed to get document from server. (However, this document does exist in the local cache. Run again without setting source to "server" to retrieve the cached document.)')):d.resolve(E)},error:E=>d.reject(E)}),m=new ga(Zs(c.path),p,{includeMetadataChanges:!0,ka:!0});return fa(i,m)})(await js(n),n.asyncQueue,e,t,r))),r.promise}function Lv(n,e,t={}){const r=new ct;return n.asyncQueue.enqueueAndForget((async()=>(function(i,a,c,l,d){const p=new Ea({next:E=>{p.Ou(),a.enqueueAndForget((()=>pa(i,m))),E.fromCache&&l.source==="server"?d.reject(new N(S.UNAVAILABLE,'Failed to get documents from server. (However, these documents may exist in the local cache. Run again without setting source to "server" to retrieve the cached documents.)')):d.resolve(E)},error:E=>d.reject(E)}),m=new ga(c,p,{includeMetadataChanges:!0,ka:!0});return fa(i,m)})(await js(n),n.asyncQueue,e,t,r))),r.promise}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ld(n){const e={};return n.timeoutSeconds!==void 0&&(e.timeoutSeconds=n.timeoutSeconds),e}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ol=new Map;/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Md="firestore.googleapis.com",al=!0;class cl{constructor(e){var t,r;if(e.host===void 0){if(e.ssl!==void 0)throw new N(S.INVALID_ARGUMENT,"Can't provide ssl option if host option is not set");this.host=Md,this.ssl=al}else this.host=e.host,this.ssl=(t=e.ssl)!==null&&t!==void 0?t:al;if(this.isUsingEmulator=e.emulatorOptions!==void 0,this.credentials=e.credentials,this.ignoreUndefinedProperties=!!e.ignoreUndefinedProperties,this.localCache=e.localCache,e.cacheSizeBytes===void 0)this.cacheSizeBytes=pd;else{if(e.cacheSizeBytes!==-1&&e.cacheSizeBytes<fE)throw new N(S.INVALID_ARGUMENT,"cacheSizeBytes must be at least 1048576");this.cacheSizeBytes=e.cacheSizeBytes}bh("experimentalForceLongPolling",e.experimentalForceLongPolling,"experimentalAutoDetectLongPolling",e.experimentalAutoDetectLongPolling),this.experimentalForceLongPolling=!!e.experimentalForceLongPolling,this.experimentalForceLongPolling?this.experimentalAutoDetectLongPolling=!1:e.experimentalAutoDetectLongPolling===void 0?this.experimentalAutoDetectLongPolling=!0:this.experimentalAutoDetectLongPolling=!!e.experimentalAutoDetectLongPolling,this.experimentalLongPollingOptions=Ld((r=e.experimentalLongPollingOptions)!==null&&r!==void 0?r:{}),(function(i){if(i.timeoutSeconds!==void 0){if(isNaN(i.timeoutSeconds))throw new N(S.INVALID_ARGUMENT,`invalid long polling timeout: ${i.timeoutSeconds} (must not be NaN)`);if(i.timeoutSeconds<5)throw new N(S.INVALID_ARGUMENT,`invalid long polling timeout: ${i.timeoutSeconds} (minimum allowed value is 5)`);if(i.timeoutSeconds>30)throw new N(S.INVALID_ARGUMENT,`invalid long polling timeout: ${i.timeoutSeconds} (maximum allowed value is 30)`)}})(this.experimentalLongPollingOptions),this.useFetchStreams=!!e.useFetchStreams}isEqual(e){return this.host===e.host&&this.ssl===e.ssl&&this.credentials===e.credentials&&this.cacheSizeBytes===e.cacheSizeBytes&&this.experimentalForceLongPolling===e.experimentalForceLongPolling&&this.experimentalAutoDetectLongPolling===e.experimentalAutoDetectLongPolling&&(function(r,s){return r.timeoutSeconds===s.timeoutSeconds})(this.experimentalLongPollingOptions,e.experimentalLongPollingOptions)&&this.ignoreUndefinedProperties===e.ignoreUndefinedProperties&&this.useFetchStreams===e.useFetchStreams}}class li{constructor(e,t,r,s){this._authCredentials=e,this._appCheckCredentials=t,this._databaseId=r,this._app=s,this.type="firestore-lite",this._persistenceKey="(lite)",this._settings=new cl({}),this._settingsFrozen=!1,this._emulatorOptions={},this._terminateTask="notTerminated"}get app(){if(!this._app)throw new N(S.FAILED_PRECONDITION,"Firestore was not initialized using the Firebase SDK. 'app' is not available");return this._app}get _initialized(){return this._settingsFrozen}get _terminated(){return this._terminateTask!=="notTerminated"}_setSettings(e){if(this._settingsFrozen)throw new N(S.FAILED_PRECONDITION,"Firestore has already been started and its settings can no longer be changed. You can only modify settings before calling any other methods on a Firestore object.");this._settings=new cl(e),this._emulatorOptions=e.emulatorOptions||{},e.credentials!==void 0&&(this._authCredentials=(function(r){if(!r)return new wh;switch(r.type){case"firstParty":return new K_(r.sessionIndex||"0",r.iamToken||null,r.authTokenFactory||null);case"provider":return r.client;default:throw new N(S.INVALID_ARGUMENT,"makeAuthCredentialsProvider failed due to invalid credential type")}})(e.credentials))}_getSettings(){return this._settings}_getEmulatorOptions(){return this._emulatorOptions}_freezeSettings(){return this._settingsFrozen=!0,this._settings}_delete(){return this._terminateTask==="notTerminated"&&(this._terminateTask=this._terminate()),this._terminateTask}async _restart(){this._terminateTask==="notTerminated"?await this._terminate():this._terminateTask="notTerminated"}toJSON(){return{app:this._app,databaseId:this._databaseId,settings:this._settings}}_terminate(){return(function(t){const r=ol.get(t);r&&(O("ComponentProvider","Removing Datastore"),ol.delete(t),r.terminate())})(this),Promise.resolve()}}function xd(n,e,t,r={}){var s;n=Re(n,li);const i=Ft(e),a=n._getSettings(),c=Object.assign(Object.assign({},a),{emulatorOptions:n._getEmulatorOptions()}),l=`${e}:${t}`;i&&(Vo(`https://${l}`),Oo("Firestore",!0)),a.host!==Md&&a.host!==l&&pt("Host has been set in both settings() and connectFirestoreEmulator(), emulator host will be used.");const d=Object.assign(Object.assign({},a),{host:l,ssl:i,emulatorOptions:r});if(!lt(d,c)&&(n._setSettings(d),r.mockUserToken)){let p,m;if(typeof r.mockUserToken=="string")p=r.mockUserToken,m=we.MOCK_USER;else{p=Cl(r.mockUserToken,(s=n._app)===null||s===void 0?void 0:s.options.projectId);const E=r.mockUserToken.sub||r.mockUserToken.user_id;if(!E)throw new N(S.INVALID_ARGUMENT,"mockUserToken must contain 'sub' or 'user_id' field!");m=new we(E)}n._authCredentials=new H_(new Ih(p,m))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class et{constructor(e,t,r){this.converter=t,this._query=r,this.type="query",this.firestore=e}withConverter(e){return new et(this.firestore,e,this._query)}}class ne{constructor(e,t,r){this.converter=t,this._key=r,this.type="document",this.firestore=e}get _path(){return this._key.path}get id(){return this._key.path.lastSegment()}get path(){return this._key.path.canonicalString()}get parent(){return new ut(this.firestore,this.converter,this._key.path.popLast())}withConverter(e){return new ne(this.firestore,e,this._key)}toJSON(){return{type:ne._jsonSchemaVersion,referencePath:this._key.toString()}}static fromJSON(e,t,r){if(Nr(t,ne._jsonSchema))return new ne(e,r||null,new L(Y.fromString(t.referencePath)))}}ne._jsonSchemaVersion="firestore/documentReference/1.0",ne._jsonSchema={type:le("string",ne._jsonSchemaVersion),referencePath:le("string")};class ut extends et{constructor(e,t,r){super(e,t,Zs(r)),this._path=r,this.type="collection"}get id(){return this._query.path.lastSegment()}get path(){return this._query.path.canonicalString()}get parent(){const e=this._path.popLast();return e.isEmpty()?null:new ne(this.firestore,null,new L(e))}withConverter(e){return new ut(this.firestore,e,this._path)}}function Mv(n,e,...t){if(n=J(n),Rh("collection","path",e),n instanceof li){const r=Y.fromString(e,...t);return Tu(r),new ut(n,null,r)}{if(!(n instanceof ne||n instanceof ut))throw new N(S.INVALID_ARGUMENT,"Expected first argument to collection() to be a CollectionReference, a DocumentReference or FirebaseFirestore");const r=n._path.child(Y.fromString(e,...t));return Tu(r),new ut(n.firestore,null,r)}}function Ud(n,e,...t){if(n=J(n),arguments.length===1&&(e=Ks.newId()),Rh("doc","path",e),n instanceof li){const r=Y.fromString(e,...t);return vu(r),new ne(n,null,new L(r))}{if(!(n instanceof ne||n instanceof ut))throw new N(S.INVALID_ARGUMENT,"Expected first argument to collection() to be a CollectionReference, a DocumentReference or FirebaseFirestore");const r=n._path.child(Y.fromString(e,...t));return vu(r),new ne(n.firestore,n instanceof ut?n.converter:null,new L(r))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ul="AsyncQueue";class ll{constructor(e=Promise.resolve()){this.Zu=[],this.Xu=!1,this.ec=[],this.tc=null,this.nc=!1,this.rc=!1,this.sc=[],this.F_=new yd(this,"async_queue_retry"),this.oc=()=>{const r=Yi();r&&O(ul,"Visibility state changed to "+r.visibilityState),this.F_.y_()},this._c=e;const t=Yi();t&&typeof t.addEventListener=="function"&&t.addEventListener("visibilitychange",this.oc)}get isShuttingDown(){return this.Xu}enqueueAndForget(e){this.enqueue(e)}enqueueAndForgetEvenWhileRestricted(e){this.ac(),this.uc(e)}enterRestrictedMode(e){if(!this.Xu){this.Xu=!0,this.rc=e||!1;const t=Yi();t&&typeof t.removeEventListener=="function"&&t.removeEventListener("visibilitychange",this.oc)}}enqueue(e){if(this.ac(),this.Xu)return new Promise((()=>{}));const t=new ct;return this.uc((()=>this.Xu&&this.rc?Promise.resolve():(e().then(t.resolve,t.reject),t.promise))).then((()=>t.promise))}enqueueRetryable(e){this.enqueueAndForget((()=>(this.Zu.push(e),this.cc())))}async cc(){if(this.Zu.length!==0){try{await this.Zu[0](),this.Zu.shift(),this.F_.reset()}catch(e){if(!Mn(e))throw e;O(ul,"Operation failed with retryable error: "+e)}this.Zu.length>0&&this.F_.g_((()=>this.cc()))}}uc(e){const t=this._c.then((()=>(this.nc=!0,e().catch((r=>{throw this.tc=r,this.nc=!1,ft("INTERNAL UNHANDLED ERROR: ",hl(r)),r})).then((r=>(this.nc=!1,r))))));return this._c=t,t}enqueueAfterDelay(e,t,r){this.ac(),this.sc.indexOf(e)>-1&&(t=0);const s=ha.createAndSchedule(this,e,t,r,(i=>this.lc(i)));return this.ec.push(s),s}ac(){this.tc&&x(47125,{hc:hl(this.tc)})}verifyOperationInProgress(){}async Pc(){let e;do e=this._c,await e;while(e!==this._c)}Tc(e){for(const t of this.ec)if(t.timerId===e)return!0;return!1}Ic(e){return this.Pc().then((()=>{this.ec.sort(((t,r)=>t.targetTimeMs-r.targetTimeMs));for(const t of this.ec)if(t.skipDelay(),e!=="all"&&t.timerId===e)break;return this.Pc()}))}dc(e){this.sc.push(e)}lc(e){const t=this.ec.indexOf(e);this.ec.splice(t,1)}}function hl(n){let e=n.message||"";return n.stack&&(e=n.stack.includes(n.message)?n.stack:n.message+`
`+n.stack),e}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function dl(n){return(function(t,r){if(typeof t!="object"||t===null)return!1;const s=t;for(const i of r)if(i in s&&typeof s[i]=="function")return!0;return!1})(n,["next","error","complete"])}class ze extends li{constructor(e,t,r,s){super(e,t,r,s),this.type="firestore",this._queue=new ll,this._persistenceKey=(s==null?void 0:s.name)||"[DEFAULT]"}async _terminate(){if(this._firestoreClient){const e=this._firestoreClient.terminate();this._queue=new ll(e),this._firestoreClient=void 0,await e}}}function xv(n,e){const t=typeof n=="object"?n:xo(),r=typeof n=="string"?n:Vs,s=zs(t,"firestore").getImmediate({identifier:r});if(!s._initialized){const i=bl("firestore");i&&xd(s,...i)}return s}function Fn(n){if(n._terminated)throw new N(S.FAILED_PRECONDITION,"The client has already been terminated.");return n._firestoreClient||Uv(n),n._firestoreClient}function Uv(n){var e,t,r;const s=n._freezeSettings(),i=(function(c,l,d,p){return new ly(c,l,d,p.host,p.ssl,p.experimentalForceLongPolling,p.experimentalAutoDetectLongPolling,Ld(p.experimentalLongPollingOptions),p.useFetchStreams,p.isUsingEmulator)})(n._databaseId,((e=n._app)===null||e===void 0?void 0:e.options.appId)||"",n._persistenceKey,s);n._componentsProvider||!((t=s.localCache)===null||t===void 0)&&t._offlineComponentProvider&&(!((r=s.localCache)===null||r===void 0)&&r._onlineComponentProvider)&&(n._componentsProvider={_offline:s.localCache._offlineComponentProvider,_online:s.localCache._onlineComponentProvider}),n._firestoreClient=new Dv(n._authCredentials,n._appCheckCredentials,n._queue,i,n._componentsProvider&&(function(c){const l=c==null?void 0:c._online.build();return{_offline:c==null?void 0:c._offline.build(l),_online:l}})(n._componentsProvider))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Me{constructor(e){this._byteString=e}static fromBase64String(e){try{return new Me(pe.fromBase64String(e))}catch(t){throw new N(S.INVALID_ARGUMENT,"Failed to construct data from Base64 string: "+t)}}static fromUint8Array(e){return new Me(pe.fromUint8Array(e))}toBase64(){return this._byteString.toBase64()}toUint8Array(){return this._byteString.toUint8Array()}toString(){return"Bytes(base64: "+this.toBase64()+")"}isEqual(e){return this._byteString.isEqual(e._byteString)}toJSON(){return{type:Me._jsonSchemaVersion,bytes:this.toBase64()}}static fromJSON(e){if(Nr(e,Me._jsonSchema))return Me.fromBase64String(e.bytes)}}Me._jsonSchemaVersion="firestore/bytes/1.0",Me._jsonSchema={type:le("string",Me._jsonSchemaVersion),bytes:le("string")};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class cn{constructor(...e){for(let t=0;t<e.length;++t)if(e[t].length===0)throw new N(S.INVALID_ARGUMENT,"Invalid field name at argument $(i + 1). Field names must not be empty.");this._internalPath=new fe(e)}isEqual(e){return this._internalPath.isEqual(e._internalPath)}}function Fv(){return new cn(mo)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class $t{constructor(e){this._methodName=e}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Be{constructor(e,t){if(!isFinite(e)||e<-90||e>90)throw new N(S.INVALID_ARGUMENT,"Latitude must be a number between -90 and 90, but was: "+e);if(!isFinite(t)||t<-180||t>180)throw new N(S.INVALID_ARGUMENT,"Longitude must be a number between -180 and 180, but was: "+t);this._lat=e,this._long=t}get latitude(){return this._lat}get longitude(){return this._long}isEqual(e){return this._lat===e._lat&&this._long===e._long}_compareTo(e){return $(this._lat,e._lat)||$(this._long,e._long)}toJSON(){return{latitude:this._lat,longitude:this._long,type:Be._jsonSchemaVersion}}static fromJSON(e){if(Nr(e,Be._jsonSchema))return new Be(e.latitude,e.longitude)}}Be._jsonSchemaVersion="firestore/geoPoint/1.0",Be._jsonSchema={type:le("string",Be._jsonSchemaVersion),latitude:le("number"),longitude:le("number")};/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class je{constructor(e){this._values=(e||[]).map((t=>t))}toArray(){return this._values.map((e=>e))}isEqual(e){return(function(r,s){if(r.length!==s.length)return!1;for(let i=0;i<r.length;++i)if(r[i]!==s[i])return!1;return!0})(this._values,e._values)}toJSON(){return{type:je._jsonSchemaVersion,vectorValues:this._values}}static fromJSON(e){if(Nr(e,je._jsonSchema)){if(Array.isArray(e.vectorValues)&&e.vectorValues.every((t=>typeof t=="number")))return new je(e.vectorValues);throw new N(S.INVALID_ARGUMENT,"Expected 'vectorValues' field to be a number array")}}}je._jsonSchemaVersion="firestore/vectorValue/1.0",je._jsonSchema={type:le("string",je._jsonSchemaVersion),vectorValues:le("object")};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Bv=/^__.*__$/;class jv{constructor(e,t,r){this.data=e,this.fieldMask=t,this.fieldTransforms=r}toMutation(e,t){return this.fieldMask!==null?new qt(e,this.data,this.fieldMask,t,this.fieldTransforms):new Vr(e,this.data,t,this.fieldTransforms)}}class Fd{constructor(e,t,r){this.data=e,this.fieldMask=t,this.fieldTransforms=r}toMutation(e,t){return new qt(e,this.data,this.fieldMask,t,this.fieldTransforms)}}function Bd(n){switch(n){case 0:case 2:case 1:return!0;case 3:case 4:return!1;default:throw x(40011,{Ec:n})}}class hi{constructor(e,t,r,s,i,a){this.settings=e,this.databaseId=t,this.serializer=r,this.ignoreUndefinedProperties=s,i===void 0&&this.Ac(),this.fieldTransforms=i||[],this.fieldMask=a||[]}get path(){return this.settings.path}get Ec(){return this.settings.Ec}Rc(e){return new hi(Object.assign(Object.assign({},this.settings),e),this.databaseId,this.serializer,this.ignoreUndefinedProperties,this.fieldTransforms,this.fieldMask)}Vc(e){var t;const r=(t=this.path)===null||t===void 0?void 0:t.child(e),s=this.Rc({path:r,mc:!1});return s.fc(e),s}gc(e){var t;const r=(t=this.path)===null||t===void 0?void 0:t.child(e),s=this.Rc({path:r,mc:!1});return s.Ac(),s}yc(e){return this.Rc({path:void 0,mc:!0})}wc(e){return qs(e,this.settings.methodName,this.settings.Sc||!1,this.path,this.settings.bc)}contains(e){return this.fieldMask.find((t=>e.isPrefixOf(t)))!==void 0||this.fieldTransforms.find((t=>e.isPrefixOf(t.field)))!==void 0}Ac(){if(this.path)for(let e=0;e<this.path.length;e++)this.fc(this.path.get(e))}fc(e){if(e.length===0)throw this.wc("Document fields must not be empty");if(Bd(this.Ec)&&Bv.test(e))throw this.wc('Document fields cannot begin and end with "__"')}}class qv{constructor(e,t,r){this.databaseId=e,this.ignoreUndefinedProperties=t,this.serializer=r||ai(e)}Dc(e,t,r,s=!1){return new hi({Ec:e,methodName:t,bc:r,path:fe.emptyPath(),mc:!1,Sc:s},this.databaseId,this.serializer,this.ignoreUndefinedProperties)}}function xr(n){const e=n._freezeSettings(),t=ai(n._databaseId);return new qv(n._databaseId,!!e.ignoreUndefinedProperties,t)}function va(n,e,t,r,s,i={}){const a=n.Dc(i.merge||i.mergeFields?2:0,e,t,s);Ra("Data must be an object, but it was:",a,r);const c=zd(r,a);let l,d;if(i.merge)l=new xe(a.fieldMask),d=a.fieldTransforms;else if(i.mergeFields){const p=[];for(const m of i.mergeFields){const E=ko(e,m,t);if(!a.contains(E))throw new N(S.INVALID_ARGUMENT,`Field '${E}' is specified in your field mask but missing from your input data.`);Wd(p,E)||p.push(E)}l=new xe(p),d=a.fieldTransforms.filter((m=>l.covers(m.field)))}else l=null,d=a.fieldTransforms;return new jv(new Ve(c),l,d)}class Ur extends $t{_toFieldTransform(e){if(e.Ec!==2)throw e.Ec===1?e.wc(`${this._methodName}() can only appear at the top level of your update data`):e.wc(`${this._methodName}() cannot be used with set() unless you pass {merge:true}`);return e.fieldMask.push(e.path),null}isEqual(e){return e instanceof Ur}}function jd(n,e,t){return new hi({Ec:3,bc:e.settings.bc,methodName:n._methodName,mc:t},e.databaseId,e.serializer,e.ignoreUndefinedProperties)}class Ta extends $t{_toFieldTransform(e){return new ri(e.path,new Ar)}isEqual(e){return e instanceof Ta}}class Ia extends $t{constructor(e,t){super(e),this.vc=t}_toFieldTransform(e){const t=jd(this,e,!0),r=this.vc.map((i=>un(i,t))),s=new Cn(r);return new ri(e.path,s)}isEqual(e){return e instanceof Ia&&lt(this.vc,e.vc)}}class wa extends $t{constructor(e,t){super(e),this.vc=t}_toFieldTransform(e){const t=jd(this,e,!0),r=this.vc.map((i=>un(i,t))),s=new kn(r);return new ri(e.path,s)}isEqual(e){return e instanceof wa&&lt(this.vc,e.vc)}}class Aa extends $t{constructor(e,t){super(e),this.Cc=t}_toFieldTransform(e){const t=new Rr(e.serializer,Xh(e.serializer,this.Cc));return new ri(e.path,t)}isEqual(e){return e instanceof Aa&&this.Cc===e.Cc}}function qd(n,e,t,r){const s=n.Dc(1,e,t);Ra("Data must be an object, but it was:",s,r);const i=[],a=Ve.empty();jt(r,((l,d)=>{const p=ba(e,l,t);d=J(d);const m=s.gc(p);if(d instanceof Ur)i.push(p);else{const E=un(d,m);E!=null&&(i.push(p),a.set(p,E))}}));const c=new xe(i);return new Fd(a,c,s.fieldTransforms)}function $d(n,e,t,r,s,i){const a=n.Dc(1,e,t),c=[ko(e,r,t)],l=[s];if(i.length%2!=0)throw new N(S.INVALID_ARGUMENT,`Function ${e}() needs to be called with an even number of arguments that alternate between field names and values.`);for(let E=0;E<i.length;E+=2)c.push(ko(e,i[E])),l.push(i[E+1]);const d=[],p=Ve.empty();for(let E=c.length-1;E>=0;--E)if(!Wd(d,c[E])){const b=c[E];let C=l[E];C=J(C);const V=a.gc(b);if(C instanceof Ur)d.push(b);else{const k=un(C,V);k!=null&&(d.push(b),p.set(b,k))}}const m=new xe(d);return new Fd(p,m,a.fieldTransforms)}function $v(n,e,t,r=!1){return un(t,n.Dc(r?4:3,e))}function un(n,e){if(Hd(n=J(n)))return Ra("Unsupported field value:",e,n),zd(n,e);if(n instanceof $t)return(function(r,s){if(!Bd(s.Ec))throw s.wc(`${r._methodName}() can only be used with update() and set()`);if(!s.path)throw s.wc(`${r._methodName}() is not currently supported inside arrays`);const i=r._toFieldTransform(s);i&&s.fieldTransforms.push(i)})(n,e),null;if(n===void 0&&e.ignoreUndefinedProperties)return null;if(e.path&&e.fieldMask.push(e.path),n instanceof Array){if(e.settings.mc&&e.Ec!==4)throw e.wc("Nested arrays are not supported");return(function(r,s){const i=[];let a=0;for(const c of r){let l=un(c,s.yc(a));l==null&&(l={nullValue:"NULL_VALUE"}),i.push(l),a++}return{arrayValue:{values:i}}})(n,e)}return(function(r,s){if((r=J(r))===null)return{nullValue:"NULL_VALUE"};if(typeof r=="number")return Xh(s.serializer,r);if(typeof r=="boolean")return{booleanValue:r};if(typeof r=="string")return{stringValue:r};if(r instanceof Date){const i=Z.fromDate(r);return{timestampValue:xs(s.serializer,i)}}if(r instanceof Z){const i=new Z(r.seconds,1e3*Math.floor(r.nanoseconds/1e3));return{timestampValue:xs(s.serializer,i)}}if(r instanceof Be)return{geoPointValue:{latitude:r.latitude,longitude:r.longitude}};if(r instanceof Me)return{bytesValue:ad(s.serializer,r._byteString)};if(r instanceof ne){const i=s.databaseId,a=r.firestore._databaseId;if(!a.isEqual(i))throw s.wc(`Document reference is for database ${a.projectId}/${a.database} but should be for database ${i.projectId}/${i.database}`);return{referenceValue:na(r.firestore._databaseId||s.databaseId,r._key.path)}}if(r instanceof je)return(function(a,c){return{mapValue:{fields:{[Lh]:{stringValue:Mh},[Os]:{arrayValue:{values:a.toArray().map((d=>{if(typeof d!="number")throw c.wc("VectorValues must only contain numeric values.");return Zo(c.serializer,d)}))}}}}}})(r,s);throw s.wc(`Unsupported field value: ${Qs(r)}`)})(n,e)}function zd(n,e){const t={};return Ch(n)?e.path&&e.path.length>0&&e.fieldMask.push(e.path):jt(n,((r,s)=>{const i=un(s,e.Vc(r));i!=null&&(t[r]=i)})),{mapValue:{fields:t}}}function Hd(n){return!(typeof n!="object"||n===null||n instanceof Array||n instanceof Date||n instanceof Z||n instanceof Be||n instanceof Me||n instanceof ne||n instanceof $t||n instanceof je)}function Ra(n,e,t){if(!Hd(t)||!Sh(t)){const r=Qs(t);throw r==="an object"?e.wc(n+" a custom object"):e.wc(n+" "+r)}}function ko(n,e,t){if((e=J(e))instanceof cn)return e._internalPath;if(typeof e=="string")return ba(n,e);throw qs("Field path arguments must be of type string or ",n,!1,void 0,t)}const zv=new RegExp("[~\\*/\\[\\]]");function ba(n,e,t){if(e.search(zv)>=0)throw qs(`Invalid field path (${e}). Paths must not contain '~', '*', '/', '[', or ']'`,n,!1,void 0,t);try{return new cn(...e.split("."))._internalPath}catch{throw qs(`Invalid field path (${e}). Paths must not be empty, begin with '.', end with '.', or contain '..'`,n,!1,void 0,t)}}function qs(n,e,t,r,s){const i=r&&!r.isEmpty(),a=s!==void 0;let c=`Function ${e}() called with invalid data`;t&&(c+=" (via `toFirestore()`)"),c+=". ";let l="";return(i||a)&&(l+=" (found",i&&(l+=` in field ${r}`),a&&(l+=` in document ${s}`),l+=")"),new N(S.INVALID_ARGUMENT,c+n+l)}function Wd(n,e){return n.some((t=>t.isEqual(e)))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Gd{constructor(e,t,r,s,i){this._firestore=e,this._userDataWriter=t,this._key=r,this._document=s,this._converter=i}get id(){return this._key.path.lastSegment()}get ref(){return new ne(this._firestore,this._converter,this._key)}exists(){return this._document!==null}data(){if(this._document){if(this._converter){const e=new Hv(this._firestore,this._userDataWriter,this._key,this._document,null);return this._converter.fromFirestore(e)}return this._userDataWriter.convertValue(this._document.data.value)}}get(e){if(this._document){const t=this._document.data.field(di("DocumentSnapshot.get",e));if(t!==null)return this._userDataWriter.convertValue(t)}}}class Hv extends Gd{data(){return super.data()}}function di(n,e){return typeof e=="string"?ba(n,e):e instanceof cn?e._internalPath:e._delegate._internalPath}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Kd(n){if(n.limitType==="L"&&n.explicitOrderBy.length===0)throw new N(S.UNIMPLEMENTED,"limitToLast() queries require specifying at least one orderBy() clause")}class Sa{}class fi extends Sa{}function Wv(n,e,...t){let r=[];e instanceof Sa&&r.push(e),r=r.concat(t),(function(i){const a=i.filter((l=>l instanceof pi)).length,c=i.filter((l=>l instanceof Fr)).length;if(a>1||a>0&&c>0)throw new N(S.INVALID_ARGUMENT,"InvalidQuery. When using composite filters, you cannot use more than one filter at the top level. Consider nesting the multiple filters within an `and(...)` statement. For example: change `query(query, where(...), or(...))` to `query(query, and(where(...), or(...)))`.")})(r);for(const s of r)n=s._apply(n);return n}class Fr extends fi{constructor(e,t,r){super(),this._field=e,this._op=t,this._value=r,this.type="where"}static _create(e,t,r){return new Fr(e,t,r)}_apply(e){const t=this._parse(e);return Qd(e._query,t),new et(e.firestore,e.converter,vo(e._query,t))}_parse(e){const t=xr(e.firestore);return(function(i,a,c,l,d,p,m){let E;if(d.isKeyField()){if(p==="array-contains"||p==="array-contains-any")throw new N(S.INVALID_ARGUMENT,`Invalid Query. You can't perform '${p}' queries on documentId().`);if(p==="in"||p==="not-in"){pl(m,p);const C=[];for(const V of m)C.push(fl(l,i,V));E={arrayValue:{values:C}}}else E=fl(l,i,m)}else p!=="in"&&p!=="not-in"&&p!=="array-contains-any"||pl(m,p),E=$v(c,a,m,p==="in"||p==="not-in");return ue.create(d,p,E)})(e._query,"where",t,e.firestore._databaseId,this._field,this._op,this._value)}}function Gv(n,e,t){const r=e,s=di("where",n);return Fr._create(s,r,t)}class pi extends Sa{constructor(e,t){super(),this.type=e,this._queryConstraints=t}static _create(e,t){return new pi(e,t)}_parse(e){const t=this._queryConstraints.map((r=>r._parse(e))).filter((r=>r.getFilters().length>0));return t.length===1?t[0]:$e.create(t,this._getOperator())}_apply(e){const t=this._parse(e);return t.getFilters().length===0?e:((function(s,i){let a=s;const c=i.getFlattenedFilters();for(const l of c)Qd(a,l),a=vo(a,l)})(e._query,t),new et(e.firestore,e.converter,vo(e._query,t)))}_getQueryConstraints(){return this._queryConstraints}_getOperator(){return this.type==="and"?"and":"or"}}class mi extends fi{constructor(e,t){super(),this._field=e,this._direction=t,this.type="orderBy"}static _create(e,t){return new mi(e,t)}_apply(e){const t=(function(s,i,a){if(s.startAt!==null)throw new N(S.INVALID_ARGUMENT,"Invalid query. You must not call startAt() or startAfter() before calling orderBy().");if(s.endAt!==null)throw new N(S.INVALID_ARGUMENT,"Invalid query. You must not call endAt() or endBefore() before calling orderBy().");return new wr(i,a)})(e._query,this._field,this._direction);return new et(e.firestore,e.converter,(function(s,i){const a=s.explicitOrderBy.concat([i]);return new xn(s.path,s.collectionGroup,a,s.filters.slice(),s.limit,s.limitType,s.startAt,s.endAt)})(e._query,t))}}function Kv(n,e="asc"){const t=e,r=di("orderBy",n);return mi._create(r,t)}class gi extends fi{constructor(e,t,r){super(),this.type=e,this._limit=t,this._limitType=r}static _create(e,t,r){return new gi(e,t,r)}_apply(e){return new et(e.firestore,e.converter,Ms(e._query,this._limit,this._limitType))}}function Qv(n){return Z_("limit",n),gi._create("limit",n,"F")}function fl(n,e,t){if(typeof(t=J(t))=="string"){if(t==="")throw new N(S.INVALID_ARGUMENT,"Invalid query. When querying with documentId(), you must provide a valid document ID, but it was an empty string.");if(!zh(e)&&t.indexOf("/")!==-1)throw new N(S.INVALID_ARGUMENT,`Invalid query. When querying a collection by documentId(), you must provide a plain document ID, but '${t}' contains a '/' character.`);const r=e.path.child(Y.fromString(t));if(!L.isDocumentKey(r))throw new N(S.INVALID_ARGUMENT,`Invalid query. When querying a collection group by documentId(), the value provided must result in a valid document path, but '${r}' is not because it has an odd number of segments (${r.length}).`);return Cu(n,new L(r))}if(t instanceof ne)return Cu(n,t._key);throw new N(S.INVALID_ARGUMENT,`Invalid query. When querying with documentId(), you must provide a valid string or a DocumentReference, but it was: ${Qs(t)}.`)}function pl(n,e){if(!Array.isArray(n)||n.length===0)throw new N(S.INVALID_ARGUMENT,`Invalid Query. A non-empty array is required for '${e.toString()}' filters.`)}function Qd(n,e){const t=(function(s,i){for(const a of s)for(const c of a.getFlattenedFilters())if(i.indexOf(c.op)>=0)return c.op;return null})(n.filters,(function(s){switch(s){case"!=":return["!=","not-in"];case"array-contains-any":case"in":return["not-in"];case"not-in":return["array-contains-any","in","not-in","!="];default:return[]}})(e.op));if(t!==null)throw t===e.op?new N(S.INVALID_ARGUMENT,`Invalid query. You cannot use more than one '${e.op.toString()}' filter.`):new N(S.INVALID_ARGUMENT,`Invalid query. You cannot use '${e.op.toString()}' filters with '${t.toString()}' filters.`)}class Jd{convertValue(e,t="none"){switch(Mt(e)){case 0:return null;case 1:return e.booleanValue;case 2:return ae(e.integerValue||e.doubleValue);case 3:return this.convertTimestamp(e.timestampValue);case 4:return this.convertServerTimestamp(e,t);case 5:return e.stringValue;case 6:return this.convertBytes(Lt(e.bytesValue));case 7:return this.convertReference(e.referenceValue);case 8:return this.convertGeoPoint(e.geoPointValue);case 9:return this.convertArray(e.arrayValue,t);case 11:return this.convertObject(e.mapValue,t);case 10:return this.convertVectorValue(e.mapValue);default:throw x(62114,{value:e})}}convertObject(e,t){return this.convertObjectMap(e.fields,t)}convertObjectMap(e,t="none"){const r={};return jt(e,((s,i)=>{r[s]=this.convertValue(i,t)})),r}convertVectorValue(e){var t,r,s;const i=(s=(r=(t=e.fields)===null||t===void 0?void 0:t[Os].arrayValue)===null||r===void 0?void 0:r.values)===null||s===void 0?void 0:s.map((a=>ae(a.doubleValue)));return new je(i)}convertGeoPoint(e){return new Be(ae(e.latitude),ae(e.longitude))}convertArray(e,t){return(e.values||[]).map((r=>this.convertValue(r,t)))}convertServerTimestamp(e,t){switch(t){case"previous":const r=Ys(e);return r==null?null:this.convertValue(r,t);case"estimate":return this.convertTimestamp(Tr(e));default:return null}}convertTimestamp(e){const t=Ot(e);return new Z(t.seconds,t.nanos)}convertDocumentKey(e,t){const r=Y.fromString(e);Q(fd(r),9688,{name:e});const s=new bn(r.get(1),r.get(3)),i=new L(r.popFirst(5));return s.isEqual(t)||ft(`Document ${i} contains a document reference within a different database (${s.projectId}/${s.database}) which is not supported. It will be treated as a reference in the current database (${t.projectId}/${t.database}) instead.`),i}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Pa(n,e,t){let r;return r=n?t&&(t.merge||t.mergeFields)?n.toFirestore(e,t):n.toFirestore(e):e,r}class En{constructor(e,t){this.hasPendingWrites=e,this.fromCache=t}isEqual(e){return this.hasPendingWrites===e.hasPendingWrites&&this.fromCache===e.fromCache}}class kt extends Gd{constructor(e,t,r,s,i,a){super(e,t,r,s,a),this._firestore=e,this._firestoreImpl=e,this.metadata=i}exists(){return super.exists()}data(e={}){if(this._document){if(this._converter){const t=new gr(this._firestore,this._userDataWriter,this._key,this._document,this.metadata,null);return this._converter.fromFirestore(t,e)}return this._userDataWriter.convertValue(this._document.data.value,e.serverTimestamps)}}get(e,t={}){if(this._document){const r=this._document.data.field(di("DocumentSnapshot.get",e));if(r!==null)return this._userDataWriter.convertValue(r,t.serverTimestamps)}}toJSON(){if(this.metadata.hasPendingWrites)throw new N(S.FAILED_PRECONDITION,"DocumentSnapshot.toJSON() attempted to serialize a document with pending writes. Await waitForPendingWrites() before invoking toJSON().");const e=this._document,t={};return t.type=kt._jsonSchemaVersion,t.bundle="",t.bundleSource="DocumentSnapshot",t.bundleName=this._key.toString(),!e||!e.isValidDocument()||!e.isFoundDocument()?t:(this._userDataWriter.convertObjectMap(e.data.value.mapValue.fields,"previous"),t.bundle=(this._firestore,this.ref.path,"NOT SUPPORTED"),t)}}kt._jsonSchemaVersion="firestore/documentSnapshot/1.0",kt._jsonSchema={type:le("string",kt._jsonSchemaVersion),bundleSource:le("string","DocumentSnapshot"),bundleName:le("string"),bundle:le("string")};class gr extends kt{data(e={}){return super.data(e)}}class Dt{constructor(e,t,r,s){this._firestore=e,this._userDataWriter=t,this._snapshot=s,this.metadata=new En(s.hasPendingWrites,s.fromCache),this.query=r}get docs(){const e=[];return this.forEach((t=>e.push(t))),e}get size(){return this._snapshot.docs.size}get empty(){return this.size===0}forEach(e,t){this._snapshot.docs.forEach((r=>{e.call(t,new gr(this._firestore,this._userDataWriter,r.key,r,new En(this._snapshot.mutatedKeys.has(r.key),this._snapshot.fromCache),this.query.converter))}))}docChanges(e={}){const t=!!e.includeMetadataChanges;if(t&&this._snapshot.excludesMetadataChanges)throw new N(S.INVALID_ARGUMENT,"To include metadata changes with your document changes, you must also pass { includeMetadataChanges:true } to onSnapshot().");return this._cachedChanges&&this._cachedChangesIncludeMetadataChanges===t||(this._cachedChanges=(function(s,i){if(s._snapshot.oldDocs.isEmpty()){let a=0;return s._snapshot.docChanges.map((c=>{const l=new gr(s._firestore,s._userDataWriter,c.doc.key,c.doc,new En(s._snapshot.mutatedKeys.has(c.doc.key),s._snapshot.fromCache),s.query.converter);return c.doc,{type:"added",doc:l,oldIndex:-1,newIndex:a++}}))}{let a=s._snapshot.oldDocs;return s._snapshot.docChanges.filter((c=>i||c.type!==3)).map((c=>{const l=new gr(s._firestore,s._userDataWriter,c.doc.key,c.doc,new En(s._snapshot.mutatedKeys.has(c.doc.key),s._snapshot.fromCache),s.query.converter);let d=-1,p=-1;return c.type!==0&&(d=a.indexOf(c.doc.key),a=a.delete(c.doc.key)),c.type!==1&&(a=a.add(c.doc),p=a.indexOf(c.doc.key)),{type:Jv(c.type),doc:l,oldIndex:d,newIndex:p}}))}})(this,t),this._cachedChangesIncludeMetadataChanges=t),this._cachedChanges}toJSON(){if(this.metadata.hasPendingWrites)throw new N(S.FAILED_PRECONDITION,"QuerySnapshot.toJSON() attempted to serialize a document with pending writes. Await waitForPendingWrites() before invoking toJSON().");const e={};e.type=Dt._jsonSchemaVersion,e.bundleSource="QuerySnapshot",e.bundleName=Ks.newId(),this._firestore._databaseId.database,this._firestore._databaseId.projectId;const t=[],r=[],s=[];return this.docs.forEach((i=>{i._document!==null&&(t.push(i._document),r.push(this._userDataWriter.convertObjectMap(i._document.data.value.mapValue.fields,"previous")),s.push(i.ref.path))})),e.bundle=(this._firestore,this.query._query,e.bundleName,"NOT SUPPORTED"),e}}function Jv(n){switch(n){case 0:return"added";case 2:case 3:return"modified";case 1:return"removed";default:return x(61501,{type:n})}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Xv(n){n=Re(n,ne);const e=Re(n.firestore,ze);return Ov(Fn(e),n._key).then((t=>Xd(e,n,t)))}Dt._jsonSchemaVersion="firestore/querySnapshot/1.0",Dt._jsonSchema={type:le("string",Dt._jsonSchemaVersion),bundleSource:le("string","QuerySnapshot"),bundleName:le("string"),bundle:le("string")};class Ca extends Jd{constructor(e){super(),this.firestore=e}convertBytes(e){return new Me(e)}convertReference(e){const t=this.convertDocumentKey(e,this.firestore._databaseId);return new ne(this.firestore,null,t)}}function Yv(n){n=Re(n,et);const e=Re(n.firestore,ze),t=Fn(e),r=new Ca(e);return Kd(n._query),Lv(t,n._query).then((s=>new Dt(e,r,n,s)))}function Zv(n,e,t){n=Re(n,ne);const r=Re(n.firestore,ze),s=Pa(n.converter,e,t);return Bn(r,[va(xr(r),"setDoc",n._key,s,n.converter!==null,t).toMutation(n._key,De.none())])}function eT(n,e,t,...r){n=Re(n,ne);const s=Re(n.firestore,ze),i=xr(s);let a;return a=typeof(e=J(e))=="string"||e instanceof cn?$d(i,"updateDoc",n._key,e,t,r):qd(i,"updateDoc",n._key,e),Bn(s,[a.toMutation(n._key,De.exists(!0))])}function tT(n){return Bn(Re(n.firestore,ze),[new ii(n._key,De.none())])}function nT(n,e){const t=Re(n.firestore,ze),r=Ud(n),s=Pa(n.converter,e);return Bn(t,[va(xr(n.firestore),"addDoc",r._key,s,n.converter!==null,{}).toMutation(r._key,De.exists(!1))]).then((()=>r))}function rT(n,...e){var t,r,s;n=J(n);let i={includeMetadataChanges:!1,source:"default"},a=0;typeof e[a]!="object"||dl(e[a])||(i=e[a++]);const c={includeMetadataChanges:i.includeMetadataChanges,source:i.source};if(dl(e[a])){const m=e[a];e[a]=(t=m.next)===null||t===void 0?void 0:t.bind(m),e[a+1]=(r=m.error)===null||r===void 0?void 0:r.bind(m),e[a+2]=(s=m.complete)===null||s===void 0?void 0:s.bind(m)}let l,d,p;if(n instanceof ne)d=Re(n.firestore,ze),p=Zs(n._key.path),l={next:m=>{e[a]&&e[a](Xd(d,n,m))},error:e[a+1],complete:e[a+2]};else{const m=Re(n,et);d=Re(m.firestore,ze),p=m._query;const E=new Ca(d);l={next:b=>{e[a]&&e[a](new Dt(d,E,m,b))},error:e[a+1],complete:e[a+2]},Kd(n._query)}return(function(E,b,C,V){const k=new Ea(V),q=new ga(b,k,C);return E.asyncQueue.enqueueAndForget((async()=>fa(await js(E),q))),()=>{k.Ou(),E.asyncQueue.enqueueAndForget((async()=>pa(await js(E),q)))}})(Fn(d),p,c,l)}function Bn(n,e){return(function(r,s){const i=new ct;return r.asyncQueue.enqueueAndForget((async()=>Iv(await Vv(r),s,i))),i.promise})(Fn(n),e)}function Xd(n,e,t){const r=t.docs.get(e._key),s=new Ca(n);return new kt(n,s,e._key,r,new En(t.hasPendingWrites,t.fromCache),e.converter)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Yd{constructor(e,t){this._firestore=e,this._commitHandler=t,this._mutations=[],this._committed=!1,this._dataReader=xr(e)}set(e,t,r){this._verifyNotCommitted();const s=eo(e,this._firestore),i=Pa(s.converter,t,r),a=va(this._dataReader,"WriteBatch.set",s._key,i,s.converter!==null,r);return this._mutations.push(a.toMutation(s._key,De.none())),this}update(e,t,r,...s){this._verifyNotCommitted();const i=eo(e,this._firestore);let a;return a=typeof(t=J(t))=="string"||t instanceof cn?$d(this._dataReader,"WriteBatch.update",i._key,t,r,s):qd(this._dataReader,"WriteBatch.update",i._key,t),this._mutations.push(a.toMutation(i._key,De.exists(!0))),this}delete(e){this._verifyNotCommitted();const t=eo(e,this._firestore);return this._mutations=this._mutations.concat(new ii(t._key,De.none())),this}commit(){return this._verifyNotCommitted(),this._committed=!0,this._mutations.length>0?this._commitHandler(this._mutations):Promise.resolve()}_verifyNotCommitted(){if(this._committed)throw new N(S.FAILED_PRECONDITION,"A write batch can no longer be used after commit() has been called.")}}function eo(n,e){if((n=J(n)).firestore!==e)throw new N(S.INVALID_ARGUMENT,"Provided document reference is from a different Firestore instance.");return n}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function sT(){return new Ur("deleteField")}function iT(){return new Ta("serverTimestamp")}function oT(...n){return new Ia("arrayUnion",n)}function aT(...n){return new wa("arrayRemove",n)}function cT(n){return new Aa("increment",n)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function uT(n){return Fn(n=Re(n,ze)),new Yd(n,(e=>Bn(n,e)))}(function(e,t=!0){(function(s){On=s})(rn),Xt(new Nt("firestore",((r,{instanceIdentifier:s,options:i})=>{const a=r.getProvider("app").getImmediate(),c=new ze(new W_(r.getProvider("auth-internal")),new Q_(a,r.getProvider("app-check-internal")),(function(d,p){if(!Object.prototype.hasOwnProperty.apply(d.options,["projectId"]))throw new N(S.INVALID_ARGUMENT,'"projectId" not provided in firebase.initializeApp.');return new bn(d.options.projectId,p)})(a,s),a);return i=Object.assign({useFetchStreams:t},i),c._setSettings(i),c}),"PUBLIC").setMultipleInstances(!0)),Ge(gu,_u,e),Ge(gu,_u,"esm2017")})();const XI=Object.freeze(Object.defineProperty({__proto__:null,AbstractUserDataWriter:Jd,Bytes:Me,CollectionReference:ut,DocumentReference:ne,DocumentSnapshot:kt,FieldPath:cn,FieldValue:$t,Firestore:ze,FirestoreError:N,GeoPoint:Be,Query:et,QueryCompositeFilterConstraint:pi,QueryConstraint:fi,QueryDocumentSnapshot:gr,QueryFieldFilterConstraint:Fr,QueryLimitConstraint:gi,QueryOrderByConstraint:mi,QuerySnapshot:Dt,SnapshotMetadata:En,Timestamp:Z,VectorValue:je,WriteBatch:Yd,_AutoId:Ks,_ByteString:pe,_DatabaseId:bn,_DocumentKey:L,_EmptyAuthCredentialsProvider:wh,_FieldPath:fe,_cast:Re,_logWarn:pt,_validateIsNotUsedTogether:bh,addDoc:nT,arrayRemove:aT,arrayUnion:oT,collection:Mv,connectFirestoreEmulator:xd,deleteDoc:tT,deleteField:sT,doc:Ud,documentId:Fv,ensureFirestoreConfigured:Fn,executeWrite:Bn,getDoc:Xv,getDocs:Yv,getFirestore:xv,increment:cT,limit:Qv,onSnapshot:rT,orderBy:Kv,query:Wv,serverTimestamp:iT,setDoc:Zv,updateDoc:eT,where:Gv,writeBatch:uT},Symbol.toStringTag,{value:"Module"}));var lT="firebase",hT="11.10.0";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */Ge(lT,hT,"app");/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Zd="firebasestorage.googleapis.com",ef="storageBucket",dT=120*1e3,fT=600*1e3;/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class oe extends Ze{constructor(e,t,r=0){super(to(e),`Firebase Storage: ${t} (${to(e)})`),this.status_=r,this.customData={serverResponse:null},this._baseMessage=this.message,Object.setPrototypeOf(this,oe.prototype)}get status(){return this.status_}set status(e){this.status_=e}_codeEquals(e){return to(e)===this.code}get serverResponse(){return this.customData.serverResponse}set serverResponse(e){this.customData.serverResponse=e,this.customData.serverResponse?this.message=`${this._baseMessage}
${this.customData.serverResponse}`:this.message=this._baseMessage}}var ie;(function(n){n.UNKNOWN="unknown",n.OBJECT_NOT_FOUND="object-not-found",n.BUCKET_NOT_FOUND="bucket-not-found",n.PROJECT_NOT_FOUND="project-not-found",n.QUOTA_EXCEEDED="quota-exceeded",n.UNAUTHENTICATED="unauthenticated",n.UNAUTHORIZED="unauthorized",n.UNAUTHORIZED_APP="unauthorized-app",n.RETRY_LIMIT_EXCEEDED="retry-limit-exceeded",n.INVALID_CHECKSUM="invalid-checksum",n.CANCELED="canceled",n.INVALID_EVENT_NAME="invalid-event-name",n.INVALID_URL="invalid-url",n.INVALID_DEFAULT_BUCKET="invalid-default-bucket",n.NO_DEFAULT_BUCKET="no-default-bucket",n.CANNOT_SLICE_BLOB="cannot-slice-blob",n.SERVER_FILE_WRONG_SIZE="server-file-wrong-size",n.NO_DOWNLOAD_URL="no-download-url",n.INVALID_ARGUMENT="invalid-argument",n.INVALID_ARGUMENT_COUNT="invalid-argument-count",n.APP_DELETED="app-deleted",n.INVALID_ROOT_OPERATION="invalid-root-operation",n.INVALID_FORMAT="invalid-format",n.INTERNAL_ERROR="internal-error",n.UNSUPPORTED_ENVIRONMENT="unsupported-environment"})(ie||(ie={}));function to(n){return"storage/"+n}function ka(){const n="An unknown error occurred, please check the error payload for server response.";return new oe(ie.UNKNOWN,n)}function pT(n){return new oe(ie.OBJECT_NOT_FOUND,"Object '"+n+"' does not exist.")}function mT(n){return new oe(ie.QUOTA_EXCEEDED,"Quota for bucket '"+n+"' exceeded, please view quota on https://firebase.google.com/pricing/.")}function gT(){const n="User is not authenticated, please authenticate using Firebase Authentication and try again.";return new oe(ie.UNAUTHENTICATED,n)}function _T(){return new oe(ie.UNAUTHORIZED_APP,"This app does not have permission to access Firebase Storage on this project.")}function yT(n){return new oe(ie.UNAUTHORIZED,"User does not have permission to access '"+n+"'.")}function ET(){return new oe(ie.RETRY_LIMIT_EXCEEDED,"Max retry time for operation exceeded, please try again.")}function vT(){return new oe(ie.CANCELED,"User canceled the upload/download.")}function TT(n){return new oe(ie.INVALID_URL,"Invalid URL '"+n+"'.")}function IT(n){return new oe(ie.INVALID_DEFAULT_BUCKET,"Invalid default bucket '"+n+"'.")}function wT(){return new oe(ie.NO_DEFAULT_BUCKET,"No default bucket found. Did you set the '"+ef+"' property when initializing the app?")}function AT(){return new oe(ie.CANNOT_SLICE_BLOB,"Cannot slice blob for upload. Please retry the upload.")}function RT(){return new oe(ie.NO_DOWNLOAD_URL,"The given file does not have any download URLs.")}function bT(n){return new oe(ie.UNSUPPORTED_ENVIRONMENT,`${n} is missing. Make sure to install the required polyfills. See https://firebase.google.com/docs/web/environments-js-sdk#polyfills for more information.`)}function Do(n){return new oe(ie.INVALID_ARGUMENT,n)}function tf(){return new oe(ie.APP_DELETED,"The Firebase app was deleted.")}function ST(n){return new oe(ie.INVALID_ROOT_OPERATION,"The operation '"+n+"' cannot be performed on a root reference, create a non-root reference using child, such as .child('file.png').")}function _r(n,e){return new oe(ie.INVALID_FORMAT,"String does not match format '"+n+"': "+e)}function sr(n){throw new oe(ie.INTERNAL_ERROR,"Internal error: "+n)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ke{constructor(e,t){this.bucket=e,this.path_=t}get path(){return this.path_}get isRoot(){return this.path.length===0}fullServerUrl(){const e=encodeURIComponent;return"/b/"+e(this.bucket)+"/o/"+e(this.path)}bucketOnlyServerUrl(){return"/b/"+encodeURIComponent(this.bucket)+"/o"}static makeFromBucketSpec(e,t){let r;try{r=ke.makeFromUrl(e,t)}catch{return new ke(e,"")}if(r.path==="")return r;throw IT(e)}static makeFromUrl(e,t){let r=null;const s="([A-Za-z0-9.\\-_]+)";function i(z){z.path.charAt(z.path.length-1)==="/"&&(z.path_=z.path_.slice(0,-1))}const a="(/(.*))?$",c=new RegExp("^gs://"+s+a,"i"),l={bucket:1,path:3};function d(z){z.path_=decodeURIComponent(z.path)}const p="v[A-Za-z0-9_]+",m=t.replace(/[.]/g,"\\."),E="(/([^?#]*).*)?$",b=new RegExp(`^https?://${m}/${p}/b/${s}/o${E}`,"i"),C={bucket:1,path:3},V=t===Zd?"(?:storage.googleapis.com|storage.cloud.google.com)":t,k="([^?#]*)",q=new RegExp(`^https?://${V}/${s}/${k}`,"i"),F=[{regex:c,indices:l,postModify:i},{regex:b,indices:C,postModify:d},{regex:q,indices:{bucket:1,path:2},postModify:d}];for(let z=0;z<F.length;z++){const me=F[z],ee=me.regex.exec(e);if(ee){const T=ee[me.indices.bucket];let g=ee[me.indices.path];g||(g=""),r=new ke(T,g),me.postModify(r);break}}if(r==null)throw TT(e);return r}}class PT{constructor(e){this.promise_=Promise.reject(e)}getPromise(){return this.promise_}cancel(e=!1){}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function CT(n,e,t){let r=1,s=null,i=null,a=!1,c=0;function l(){return c===2}let d=!1;function p(...k){d||(d=!0,e.apply(null,k))}function m(k){s=setTimeout(()=>{s=null,n(b,l())},k)}function E(){i&&clearTimeout(i)}function b(k,...q){if(d){E();return}if(k){E(),p.call(null,k,...q);return}if(l()||a){E(),p.call(null,k,...q);return}r<64&&(r*=2);let F;c===1?(c=2,F=0):F=(r+Math.random())*1e3,m(F)}let C=!1;function V(k){C||(C=!0,E(),!d&&(s!==null?(k||(c=2),clearTimeout(s),m(0)):k||(c=1)))}return m(0),i=setTimeout(()=>{a=!0,V(!0)},t),V}function kT(n){n(!1)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function DT(n){return n!==void 0}function NT(n){return typeof n=="object"&&!Array.isArray(n)}function Da(n){return typeof n=="string"||n instanceof String}function ml(n){return Na()&&n instanceof Blob}function Na(){return typeof Blob<"u"}function No(n,e,t,r){if(r<e)throw Do(`Invalid value for '${n}'. Expected ${e} or greater.`);if(r>t)throw Do(`Invalid value for '${n}'. Expected ${t} or less.`)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Br(n,e,t){let r=e;return t==null&&(r=`https://${e}`),`${t}://${r}/v0${n}`}function nf(n){const e=encodeURIComponent;let t="?";for(const r in n)if(n.hasOwnProperty(r)){const s=e(r)+"="+e(n[r]);t=t+s+"&"}return t=t.slice(0,-1),t}var Jt;(function(n){n[n.NO_ERROR=0]="NO_ERROR",n[n.NETWORK_ERROR=1]="NETWORK_ERROR",n[n.ABORT=2]="ABORT"})(Jt||(Jt={}));/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function VT(n,e){const t=n>=500&&n<600,s=[408,429].indexOf(n)!==-1,i=e.indexOf(n)!==-1;return t||s||i}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class OT{constructor(e,t,r,s,i,a,c,l,d,p,m,E=!0,b=!1){this.url_=e,this.method_=t,this.headers_=r,this.body_=s,this.successCodes_=i,this.additionalRetryCodes_=a,this.callback_=c,this.errorCallback_=l,this.timeout_=d,this.progressCallback_=p,this.connectionFactory_=m,this.retry=E,this.isUsingEmulator=b,this.pendingConnection_=null,this.backoffId_=null,this.canceled_=!1,this.appDelete_=!1,this.promise_=new Promise((C,V)=>{this.resolve_=C,this.reject_=V,this.start_()})}start_(){const e=(r,s)=>{if(s){r(!1,new ds(!1,null,!0));return}const i=this.connectionFactory_();this.pendingConnection_=i;const a=c=>{const l=c.loaded,d=c.lengthComputable?c.total:-1;this.progressCallback_!==null&&this.progressCallback_(l,d)};this.progressCallback_!==null&&i.addUploadProgressListener(a),i.send(this.url_,this.method_,this.isUsingEmulator,this.body_,this.headers_).then(()=>{this.progressCallback_!==null&&i.removeUploadProgressListener(a),this.pendingConnection_=null;const c=i.getErrorCode()===Jt.NO_ERROR,l=i.getStatus();if(!c||VT(l,this.additionalRetryCodes_)&&this.retry){const p=i.getErrorCode()===Jt.ABORT;r(!1,new ds(!1,null,p));return}const d=this.successCodes_.indexOf(l)!==-1;r(!0,new ds(d,i))})},t=(r,s)=>{const i=this.resolve_,a=this.reject_,c=s.connection;if(s.wasSuccessCode)try{const l=this.callback_(c,c.getResponse());DT(l)?i(l):i()}catch(l){a(l)}else if(c!==null){const l=ka();l.serverResponse=c.getErrorText(),this.errorCallback_?a(this.errorCallback_(c,l)):a(l)}else if(s.canceled){const l=this.appDelete_?tf():vT();a(l)}else{const l=ET();a(l)}};this.canceled_?t(!1,new ds(!1,null,!0)):this.backoffId_=CT(e,t,this.timeout_)}getPromise(){return this.promise_}cancel(e){this.canceled_=!0,this.appDelete_=e||!1,this.backoffId_!==null&&kT(this.backoffId_),this.pendingConnection_!==null&&this.pendingConnection_.abort()}}class ds{constructor(e,t,r){this.wasSuccessCode=e,this.connection=t,this.canceled=!!r}}function LT(n,e){e!==null&&e.length>0&&(n.Authorization="Firebase "+e)}function MT(n,e){n["X-Firebase-Storage-Version"]="webjs/"+(e??"AppManager")}function xT(n,e){e&&(n["X-Firebase-GMPID"]=e)}function UT(n,e){e!==null&&(n["X-Firebase-AppCheck"]=e)}function FT(n,e,t,r,s,i,a=!0,c=!1){const l=nf(n.urlParams),d=n.url+l,p=Object.assign({},n.headers);return xT(p,e),LT(p,t),MT(p,i),UT(p,r),new OT(d,n.method,p,n.body,n.successCodes,n.additionalRetryCodes,n.handler,n.errorHandler,n.timeout,n.progressCallback,s,a,c)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function BT(){return typeof BlobBuilder<"u"?BlobBuilder:typeof WebKitBlobBuilder<"u"?WebKitBlobBuilder:void 0}function jT(...n){const e=BT();if(e!==void 0){const t=new e;for(let r=0;r<n.length;r++)t.append(n[r]);return t.getBlob()}else{if(Na())return new Blob(n);throw new oe(ie.UNSUPPORTED_ENVIRONMENT,"This browser doesn't seem to support creating Blobs")}}function qT(n,e,t){return n.webkitSlice?n.webkitSlice(e,t):n.mozSlice?n.mozSlice(e,t):n.slice?n.slice(e,t):null}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function $T(n){if(typeof atob>"u")throw bT("base-64");return atob(n)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const We={RAW:"raw",BASE64:"base64",BASE64URL:"base64url",DATA_URL:"data_url"};class no{constructor(e,t){this.data=e,this.contentType=t||null}}function zT(n,e){switch(n){case We.RAW:return new no(rf(e));case We.BASE64:case We.BASE64URL:return new no(sf(n,e));case We.DATA_URL:return new no(WT(e),GT(e))}throw ka()}function rf(n){const e=[];for(let t=0;t<n.length;t++){let r=n.charCodeAt(t);if(r<=127)e.push(r);else if(r<=2047)e.push(192|r>>6,128|r&63);else if((r&64512)===55296)if(!(t<n.length-1&&(n.charCodeAt(t+1)&64512)===56320))e.push(239,191,189);else{const i=r,a=n.charCodeAt(++t);r=65536|(i&1023)<<10|a&1023,e.push(240|r>>18,128|r>>12&63,128|r>>6&63,128|r&63)}else(r&64512)===56320?e.push(239,191,189):e.push(224|r>>12,128|r>>6&63,128|r&63)}return new Uint8Array(e)}function HT(n){let e;try{e=decodeURIComponent(n)}catch{throw _r(We.DATA_URL,"Malformed data URL.")}return rf(e)}function sf(n,e){switch(n){case We.BASE64:{const s=e.indexOf("-")!==-1,i=e.indexOf("_")!==-1;if(s||i)throw _r(n,"Invalid character '"+(s?"-":"_")+"' found: is it base64url encoded?");break}case We.BASE64URL:{const s=e.indexOf("+")!==-1,i=e.indexOf("/")!==-1;if(s||i)throw _r(n,"Invalid character '"+(s?"+":"/")+"' found: is it base64 encoded?");e=e.replace(/-/g,"+").replace(/_/g,"/");break}}let t;try{t=$T(e)}catch(s){throw s.message.includes("polyfill")?s:_r(n,"Invalid character found")}const r=new Uint8Array(t.length);for(let s=0;s<t.length;s++)r[s]=t.charCodeAt(s);return r}class of{constructor(e){this.base64=!1,this.contentType=null;const t=e.match(/^data:([^,]+)?,/);if(t===null)throw _r(We.DATA_URL,"Must be formatted 'data:[<mediatype>][;base64],<data>");const r=t[1]||null;r!=null&&(this.base64=KT(r,";base64"),this.contentType=this.base64?r.substring(0,r.length-7):r),this.rest=e.substring(e.indexOf(",")+1)}}function WT(n){const e=new of(n);return e.base64?sf(We.BASE64,e.rest):HT(e.rest)}function GT(n){return new of(n).contentType}function KT(n,e){return n.length>=e.length?n.substring(n.length-e.length)===e:!1}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class bt{constructor(e,t){let r=0,s="";ml(e)?(this.data_=e,r=e.size,s=e.type):e instanceof ArrayBuffer?(t?this.data_=new Uint8Array(e):(this.data_=new Uint8Array(e.byteLength),this.data_.set(new Uint8Array(e))),r=this.data_.length):e instanceof Uint8Array&&(t?this.data_=e:(this.data_=new Uint8Array(e.length),this.data_.set(e)),r=e.length),this.size_=r,this.type_=s}size(){return this.size_}type(){return this.type_}slice(e,t){if(ml(this.data_)){const r=this.data_,s=qT(r,e,t);return s===null?null:new bt(s)}else{const r=new Uint8Array(this.data_.buffer,e,t-e);return new bt(r,!0)}}static getBlob(...e){if(Na()){const t=e.map(r=>r instanceof bt?r.data_:r);return new bt(jT.apply(null,t))}else{const t=e.map(a=>Da(a)?zT(We.RAW,a).data:a.data_);let r=0;t.forEach(a=>{r+=a.byteLength});const s=new Uint8Array(r);let i=0;return t.forEach(a=>{for(let c=0;c<a.length;c++)s[i++]=a[c]}),new bt(s,!0)}}uploadData(){return this.data_}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Va(n){let e;try{e=JSON.parse(n)}catch{return null}return NT(e)?e:null}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function QT(n){if(n.length===0)return null;const e=n.lastIndexOf("/");return e===-1?"":n.slice(0,e)}function JT(n,e){const t=e.split("/").filter(r=>r.length>0).join("/");return n.length===0?t:n+"/"+t}function af(n){const e=n.lastIndexOf("/",n.length-2);return e===-1?n:n.slice(e+1)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function XT(n,e){return e}class Ce{constructor(e,t,r,s){this.server=e,this.local=t||e,this.writable=!!r,this.xform=s||XT}}let fs=null;function YT(n){return!Da(n)||n.length<2?n:af(n)}function cf(){if(fs)return fs;const n=[];n.push(new Ce("bucket")),n.push(new Ce("generation")),n.push(new Ce("metageneration")),n.push(new Ce("name","fullPath",!0));function e(i,a){return YT(a)}const t=new Ce("name");t.xform=e,n.push(t);function r(i,a){return a!==void 0?Number(a):a}const s=new Ce("size");return s.xform=r,n.push(s),n.push(new Ce("timeCreated")),n.push(new Ce("updated")),n.push(new Ce("md5Hash",null,!0)),n.push(new Ce("cacheControl",null,!0)),n.push(new Ce("contentDisposition",null,!0)),n.push(new Ce("contentEncoding",null,!0)),n.push(new Ce("contentLanguage",null,!0)),n.push(new Ce("contentType",null,!0)),n.push(new Ce("metadata","customMetadata",!0)),fs=n,fs}function ZT(n,e){function t(){const r=n.bucket,s=n.fullPath,i=new ke(r,s);return e._makeStorageReference(i)}Object.defineProperty(n,"ref",{get:t})}function eI(n,e,t){const r={};r.type="file";const s=t.length;for(let i=0;i<s;i++){const a=t[i];r[a.local]=a.xform(r,e[a.server])}return ZT(r,n),r}function uf(n,e,t){const r=Va(e);return r===null?null:eI(n,r,t)}function tI(n,e,t,r){const s=Va(e);if(s===null||!Da(s.downloadTokens))return null;const i=s.downloadTokens;if(i.length===0)return null;const a=encodeURIComponent;return i.split(",").map(d=>{const p=n.bucket,m=n.fullPath,E="/b/"+a(p)+"/o/"+a(m),b=Br(E,t,r),C=nf({alt:"media",token:d});return b+C})[0]}function nI(n,e){const t={},r=e.length;for(let s=0;s<r;s++){const i=e[s];i.writable&&(t[i.server]=n[i.local])}return JSON.stringify(t)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const gl="prefixes",_l="items";function rI(n,e,t){const r={prefixes:[],items:[],nextPageToken:t.nextPageToken};if(t[gl])for(const s of t[gl]){const i=s.replace(/\/$/,""),a=n._makeStorageReference(new ke(e,i));r.prefixes.push(a)}if(t[_l])for(const s of t[_l]){const i=n._makeStorageReference(new ke(e,s.name));r.items.push(i)}return r}function sI(n,e,t){const r=Va(t);return r===null?null:rI(n,e,r)}class _i{constructor(e,t,r,s){this.url=e,this.method=t,this.handler=r,this.timeout=s,this.urlParams={},this.headers={},this.body=null,this.errorHandler=null,this.progressCallback=null,this.successCodes=[200],this.additionalRetryCodes=[]}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Oa(n){if(!n)throw ka()}function iI(n,e){function t(r,s){const i=uf(n,s,e);return Oa(i!==null),i}return t}function oI(n,e){function t(r,s){const i=sI(n,e,s);return Oa(i!==null),i}return t}function aI(n,e){function t(r,s){const i=uf(n,s,e);return Oa(i!==null),tI(i,s,n.host,n._protocol)}return t}function La(n){function e(t,r){let s;return t.getStatus()===401?t.getErrorText().includes("Firebase App Check token is invalid")?s=_T():s=gT():t.getStatus()===402?s=mT(n.bucket):t.getStatus()===403?s=yT(n.path):s=r,s.status=t.getStatus(),s.serverResponse=r.serverResponse,s}return e}function lf(n){const e=La(n);function t(r,s){let i=e(r,s);return r.getStatus()===404&&(i=pT(n.path)),i.serverResponse=s.serverResponse,i}return t}function cI(n,e,t,r,s){const i={};e.isRoot?i.prefix="":i.prefix=e.path+"/",t.length>0&&(i.delimiter=t),r&&(i.pageToken=r),s&&(i.maxResults=s);const a=e.bucketOnlyServerUrl(),c=Br(a,n.host,n._protocol),l="GET",d=n.maxOperationRetryTime,p=new _i(c,l,oI(n,e.bucket),d);return p.urlParams=i,p.errorHandler=La(e),p}function uI(n,e,t){const r=e.fullServerUrl(),s=Br(r,n.host,n._protocol),i="GET",a=n.maxOperationRetryTime,c=new _i(s,i,aI(n,t),a);return c.errorHandler=lf(e),c}function lI(n,e){const t=e.fullServerUrl(),r=Br(t,n.host,n._protocol),s="DELETE",i=n.maxOperationRetryTime;function a(l,d){}const c=new _i(r,s,a,i);return c.successCodes=[200,204],c.errorHandler=lf(e),c}function hI(n,e){return n&&n.contentType||e&&e.type()||"application/octet-stream"}function dI(n,e,t){const r=Object.assign({},t);return r.fullPath=n.path,r.size=e.size(),r.contentType||(r.contentType=hI(null,e)),r}function fI(n,e,t,r,s){const i=e.bucketOnlyServerUrl(),a={"X-Goog-Upload-Protocol":"multipart"};function c(){let F="";for(let z=0;z<2;z++)F=F+Math.random().toString().slice(2);return F}const l=c();a["Content-Type"]="multipart/related; boundary="+l;const d=dI(e,r,s),p=nI(d,t),m="--"+l+`\r
Content-Type: application/json; charset=utf-8\r
\r
`+p+`\r
--`+l+`\r
Content-Type: `+d.contentType+`\r
\r
`,E=`\r
--`+l+"--",b=bt.getBlob(m,r,E);if(b===null)throw AT();const C={name:d.fullPath},V=Br(i,n.host,n._protocol),k="POST",q=n.maxUploadRetryTime,U=new _i(V,k,iI(n,t),q);return U.urlParams=C,U.headers=a,U.body=b.uploadData(),U.errorHandler=La(e),U}class pI{constructor(){this.sent_=!1,this.xhr_=new XMLHttpRequest,this.initXhr(),this.errorCode_=Jt.NO_ERROR,this.sendPromise_=new Promise(e=>{this.xhr_.addEventListener("abort",()=>{this.errorCode_=Jt.ABORT,e()}),this.xhr_.addEventListener("error",()=>{this.errorCode_=Jt.NETWORK_ERROR,e()}),this.xhr_.addEventListener("load",()=>{e()})})}send(e,t,r,s,i){if(this.sent_)throw sr("cannot .send() more than once");if(Ft(e)&&r&&(this.xhr_.withCredentials=!0),this.sent_=!0,this.xhr_.open(t,e,!0),i!==void 0)for(const a in i)i.hasOwnProperty(a)&&this.xhr_.setRequestHeader(a,i[a].toString());return s!==void 0?this.xhr_.send(s):this.xhr_.send(),this.sendPromise_}getErrorCode(){if(!this.sent_)throw sr("cannot .getErrorCode() before sending");return this.errorCode_}getStatus(){if(!this.sent_)throw sr("cannot .getStatus() before sending");try{return this.xhr_.status}catch{return-1}}getResponse(){if(!this.sent_)throw sr("cannot .getResponse() before sending");return this.xhr_.response}getErrorText(){if(!this.sent_)throw sr("cannot .getErrorText() before sending");return this.xhr_.statusText}abort(){this.xhr_.abort()}getResponseHeader(e){return this.xhr_.getResponseHeader(e)}addUploadProgressListener(e){this.xhr_.upload!=null&&this.xhr_.upload.addEventListener("progress",e)}removeUploadProgressListener(e){this.xhr_.upload!=null&&this.xhr_.upload.removeEventListener("progress",e)}}class mI extends pI{initXhr(){this.xhr_.responseType="text"}}function yi(){return new mI}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class nn{constructor(e,t){this._service=e,t instanceof ke?this._location=t:this._location=ke.makeFromUrl(t,e.host)}toString(){return"gs://"+this._location.bucket+"/"+this._location.path}_newRef(e,t){return new nn(e,t)}get root(){const e=new ke(this._location.bucket,"");return this._newRef(this._service,e)}get bucket(){return this._location.bucket}get fullPath(){return this._location.path}get name(){return af(this._location.path)}get storage(){return this._service}get parent(){const e=QT(this._location.path);if(e===null)return null;const t=new ke(this._location.bucket,e);return new nn(this._service,t)}_throwIfRoot(e){if(this._location.path==="")throw ST(e)}}function gI(n,e,t){n._throwIfRoot("uploadBytes");const r=fI(n.storage,n._location,cf(),new bt(e,!0),t);return n.storage.makeRequestWithTokens(r,yi).then(s=>({metadata:s,ref:n}))}function _I(n){const e={prefixes:[],items:[]};return hf(n,e).then(()=>e)}async function hf(n,e,t){const s=await yI(n,{pageToken:t});e.prefixes.push(...s.prefixes),e.items.push(...s.items),s.nextPageToken!=null&&await hf(n,e,s.nextPageToken)}function yI(n,e){e!=null&&typeof e.maxResults=="number"&&No("options.maxResults",1,1e3,e.maxResults);const t=e||{},r=cI(n.storage,n._location,"/",t.pageToken,t.maxResults);return n.storage.makeRequestWithTokens(r,yi)}function EI(n){n._throwIfRoot("getDownloadURL");const e=uI(n.storage,n._location,cf());return n.storage.makeRequestWithTokens(e,yi).then(t=>{if(t===null)throw RT();return t})}function vI(n){n._throwIfRoot("deleteObject");const e=lI(n.storage,n._location);return n.storage.makeRequestWithTokens(e,yi)}function TI(n,e){const t=JT(n._location.path,e),r=new ke(n._location.bucket,t);return new nn(n.storage,r)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function II(n){return/^[A-Za-z]+:\/\//.test(n)}function wI(n,e){return new nn(n,e)}function df(n,e){if(n instanceof Ma){const t=n;if(t._bucket==null)throw wT();const r=new nn(t,t._bucket);return e!=null?df(r,e):r}else return e!==void 0?TI(n,e):n}function AI(n,e){if(e&&II(e)){if(n instanceof Ma)return wI(n,e);throw Do("To use ref(service, url), the first argument must be a Storage instance.")}else return df(n,e)}function yl(n,e){const t=e==null?void 0:e[ef];return t==null?null:ke.makeFromBucketSpec(t,n)}function RI(n,e,t,r={}){n.host=`${e}:${t}`;const s=Ft(e);s&&(Vo(`https://${n.host}/b`),Oo("Storage",!0)),n._isUsingEmulator=!0,n._protocol=s?"https":"http";const{mockUserToken:i}=r;i&&(n._overrideAuthToken=typeof i=="string"?i:Cl(i,n.app.options.projectId))}class Ma{constructor(e,t,r,s,i,a=!1){this.app=e,this._authProvider=t,this._appCheckProvider=r,this._url=s,this._firebaseVersion=i,this._isUsingEmulator=a,this._bucket=null,this._host=Zd,this._protocol="https",this._appId=null,this._deleted=!1,this._maxOperationRetryTime=dT,this._maxUploadRetryTime=fT,this._requests=new Set,s!=null?this._bucket=ke.makeFromBucketSpec(s,this._host):this._bucket=yl(this._host,this.app.options)}get host(){return this._host}set host(e){this._host=e,this._url!=null?this._bucket=ke.makeFromBucketSpec(this._url,e):this._bucket=yl(e,this.app.options)}get maxUploadRetryTime(){return this._maxUploadRetryTime}set maxUploadRetryTime(e){No("time",0,Number.POSITIVE_INFINITY,e),this._maxUploadRetryTime=e}get maxOperationRetryTime(){return this._maxOperationRetryTime}set maxOperationRetryTime(e){No("time",0,Number.POSITIVE_INFINITY,e),this._maxOperationRetryTime=e}async _getAuthToken(){if(this._overrideAuthToken)return this._overrideAuthToken;const e=this._authProvider.getImmediate({optional:!0});if(e){const t=await e.getToken();if(t!==null)return t.accessToken}return null}async _getAppCheckToken(){if(Le(this.app)&&this.app.settings.appCheckToken)return this.app.settings.appCheckToken;const e=this._appCheckProvider.getImmediate({optional:!0});return e?(await e.getToken()).token:null}_delete(){return this._deleted||(this._deleted=!0,this._requests.forEach(e=>e.cancel()),this._requests.clear()),Promise.resolve()}_makeStorageReference(e){return new nn(this,e)}_makeRequest(e,t,r,s,i=!0){if(this._deleted)return new PT(tf());{const a=FT(e,this._appId,r,s,t,this._firebaseVersion,i,this._isUsingEmulator);return this._requests.add(a),a.getPromise().then(()=>this._requests.delete(a),()=>this._requests.delete(a)),a}}async makeRequestWithTokens(e,t){const[r,s]=await Promise.all([this._getAuthToken(),this._getAppCheckToken()]);return this._makeRequest(e,t,r,s).getPromise()}}const El="@firebase/storage",vl="0.13.14";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ff="storage";function YI(n,e,t){return n=J(n),gI(n,e,t)}function ZI(n){return n=J(n),_I(n)}function ew(n){return n=J(n),EI(n)}function tw(n){return n=J(n),vI(n)}function nw(n,e){return n=J(n),AI(n,e)}function rw(n=xo(),e){n=J(n);const r=zs(n,ff).getImmediate({identifier:e}),s=bl("storage");return s&&bI(r,...s),r}function bI(n,e,t,r={}){RI(n,e,t,r)}function SI(n,{instanceIdentifier:e}){const t=n.getProvider("app").getImmediate(),r=n.getProvider("auth-internal"),s=n.getProvider("app-check-internal");return new Ma(t,r,s,e,rn)}function PI(){Xt(new Nt(ff,SI,"PUBLIC").setMultipleInstances(!0)),Ge(El,vl,""),Ge(El,vl,"esm2017")}PI();export{Mv as $,kI as A,xo as B,Nt as C,op as D,zs as E,bl as F,lt as G,Cl as H,Ft as I,Vo as J,Oo as K,Lo as L,rn as M,br as N,jp as O,Ze as P,qI as Q,_p as R,UI as S,gp as T,DI as U,wm as V,QI as W,xv as X,rw as Y,Yv as Z,Qc as _,Uo as a,Ud as a0,Zv as a1,iT as a2,GI as a3,HI as a4,KI as a5,zI as a6,WI as a7,eT as a8,cT as a9,Xv as aa,Wv as ab,Gv as ac,uT as ad,Z as ae,Kv as af,Qv as ag,rT as ah,tT as ai,nw as aj,ZI as ak,ew as al,tw as am,YI as an,nT as ao,aT as ap,oT as aq,sT as ar,Fv as as,XI as at,$I as b,Jf as c,Xt as d,LI as e,MI as f,BI as g,wl as h,Xf as i,Fc as j,FI as k,Le as l,xI as m,H as n,OI as o,VI as p,Sr as q,Ge as r,NI as s,Tp as t,up as u,fp as v,J as w,CI as x,jI as y,ep as z};
