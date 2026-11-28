// DARAK v1.7.12 — 입력창 이모지 아이콘을 Lucide로.
// 다른 확장이 입력창(#send_form)에 이모지 한 글자만 넣은 버튼(예: 🔌)에 data-ttk-emoji-ic를 붙이면,
// css/ui/67-foreign-icons.css가 이모지를 크기 0으로 숨기고 같은 크기의 Lucide 선 아이콘을 그립니다.
// 버튼의 글자·동작은 바꾸지 않고 속성 두 개(data-ttk-emoji-ic, --ttk-emoji-fs)만 더합니다. 목록에 없는 이모지는 그대로 둡니다.
// 확장이 이모지를 바꾸면(켜짐/꺼짐 표시 등) 다시 읽어 맞춥니다. 디자인 모듈이 꺼지면 붙인 속성을 모두 지웁니다.
const EMOJI={"🔌": "plug", "📷": "camera", "📸": "camera", "🖼": "image", "🌐": "globe", "🌏": "globe", "🌍": "globe", "🌎": "globe", "🔤": "languages", "🈯": "languages", "🈂": "languages", "🪶": "feather", "✏": "pencil", "✍": "pencil", "🖊": "pencil", "🖋": "pencil", "📝": "notebook", "🗒": "notebook", "🎨": "palette", "⚙": "settings", "🔧": "wrench", "🛠": "wrench", "📖": "book", "📚": "book", "📕": "book", "📗": "book", "📘": "book", "📙": "book", "💬": "message", "🗨": "message", "🎲": "dice", "🎵": "music", "🎶": "music", "🎤": "mic", "🎙": "mic", "🔊": "volume", "🔉": "volume", "🎧": "volume", "🔍": "search", "🔎": "search", "⭐": "star", "🌟": "star", "❤": "heart", "💗": "heart", "💖": "heart", "🩷": "heart", "💜": "heart", "💙": "heart", "🧠": "brain", "🤖": "bot", "📋": "clipboard", "📌": "pin", "📍": "pin", "🔖": "bookmark", "🗑": "trash", "🔄": "refresh", "🔁": "refresh", "🔃": "refresh", "💡": "lightbulb", "📊": "chart", "📈": "chart", "🕐": "clock", "⏰": "clock", "⏱": "clock", "⌛": "clock", "⏳": "clock", "👤": "user", "👥": "users", "🎭": "drama", "🗺": "map", "📁": "folder", "📂": "folder", "💾": "save", "✨": "sparkles", "🪄": "wand", "📎": "clip", "🎬": "film", "🎥": "film", "📜": "scroll", "🧩": "puzzle", "👁": "eye", "👀": "eye", "⚡": "zap", "🔀": "shuffle", "👻": "ghost", "🧾": "list", "🔔": "bell", "🔑": "key", "🗝": "key", "🔒": "lock", "🔐": "lock", "🔗": "link", "🚩": "flag", "🏳": "flag", "🏠": "home", "🏡": "home", "📅": "calendar", "📆": "calendar", "✉": "mail", "📧": "mail", "📨": "mail", "🎁": "gift", "🔥": "flame", "🌙": "moon", "🌛": "moon", "☀": "sun", "🌞": "sun", "☁": "cloud", "😀": "smile", "🙂": "smile", "😊": "smile", "📱": "phone", "🧬": "cpu", "👕": "shirt", "👗": "shirt", "☕": "coffee", "🎛": "sliders", "🎚": "sliders", "📥": "download", "📤": "upload"};
const ATTR='data-ttk-emoji-ic';
const ONE=/^\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic}\uFE0F?)*$/u;
let obs=null,raf=0;
const keyOf=t=>{t=(t||'').trim();if(!t||!ONE.test(t))return null;const base=t.replace(/[\uFE0F\u200D]|\p{Emoji_Modifier}/gu,'');return EMOJI[t]||EMOJI[base]||EMOJI[[...base][0]]||null;};
function mark(el){
 // 이미지·SVG·Font Awesome 아이콘이 들어 있으면 이모지 버튼이 아니다.
 if(el.closest('[id^=ttk_],#ttk-panel'))return;
 const k=el.querySelector('img,svg,i,[class*=fa-]')?null:keyOf(el.textContent);
 if(k){
  if(el.getAttribute(ATTR)===k)return;
  if(!el.hasAttribute(ATTR))el.style.setProperty('--ttk-emoji-fs',getComputedStyle(el).fontSize);
  el.setAttribute(ATTR,k);
 }else if(el.hasAttribute(ATTR)){el.removeAttribute(ATTR);el.style.removeProperty('--ttk-emoji-fs');}
}
function scan(){
 raf=0;const form=document.getElementById('send_form');if(!form)return;
 // 글자를 직접 가진 가장 안쪽 요소만 본다(버튼 안에 span이 있으면 span).
 const seen=new Set();
 const walk=document.createTreeWalker(form,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeValue.trim()?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
 for(let n=walk.nextNode();n;n=walk.nextNode()){const p=n.parentElement;if(!p||seen.has(p)||p.closest('textarea,input,select,#send_textarea'))continue;seen.add(p);mark(p);}
 for(const el of form.querySelectorAll(`[${ATTR}]`))if(!seen.has(el)){el.removeAttribute(ATTR);el.style.removeProperty('--ttk-emoji-fs');}
}
const later=()=>{if(!raf)raf=requestAnimationFrame(scan);};
export function syncComposerIcons(on){
 if(!on){obs?.disconnect();obs=null;if(raf)cancelAnimationFrame(raf);raf=0;for(const el of document.querySelectorAll(`[${ATTR}]`)){el.removeAttribute(ATTR);el.style.removeProperty('--ttk-emoji-fs');}return;}
 if(obs)return later();
 const form=document.getElementById('send_form');if(!form||typeof MutationObserver==='undefined')return;
 obs=new MutationObserver(later);obs.observe(form,{childList:true,subtree:true,characterData:true});later();
}
