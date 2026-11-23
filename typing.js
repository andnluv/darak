/** DARAK: typing indicator (design module ON, theme set).
 *  While the AI is writing and its message has not appeared yet, a message-shaped card sits at the bottom of the chat
 *  (cover + name + a motif that belongs to the current theme). It disappears as soon as the real message shows up,
 *  or when generation is stopped / fails / the chat changes. It only listens to events and adds one temporary node
 *  to #chat; it never touches SillyTavern's own elements. */
const EYEBROW={paper:'NOW WRITING',nocturne:'COMING UP',porcelain:'조판 중',studio:'IN PRODUCTION'};
const SKIP=new Set(['quiet','impersonate']);
let on=false,node=null,handlers=[],observer=null,failsafe=0;
const ctx=()=>window.SillyTavern?.getContext?.();

function coverUrl(c){
 const img=[...document.querySelectorAll('#chat .mes[is_user="false"] .mesAvatarWrapper .avatar img')].pop();
 const src=img?.currentSrc||img?.getAttribute('src');
 if(src)return src;
 const file=c?.characters?.[c?.characterId]?.avatar;
 return file?`/thumbnail?type=avatar&file=${encodeURIComponent(file)}`:'';
}
function build(){
 const el=document.createElement('div');el.className='ttk-typing';el.setAttribute('role','status');el.setAttribute('aria-live','polite');
 const cover=document.createElement('div');cover.className='ttk-typing-cover';
 const main=document.createElement('div');main.className='ttk-typing-main';
 const eyebrow=document.createElement('span');eyebrow.className='ttk-typing-eyebrow';
 const name=document.createElement('b');name.className='ttk-typing-name';
 const motif=document.createElement('div');motif.className='ttk-typing-motif';
 for(let i=0;i<6;i++)motif.append(document.createElement('i'));
 const sr=document.createElement('span');sr.className='ttk-typing-sr';sr.textContent='응답을 쓰는 중입니다';
 main.append(eyebrow,name,motif,sr);el.append(cover,main);return el;
}
function show(){
 const chat=document.getElementById('chat');const theme=document.documentElement.dataset.ttkTheme;
 if(!chat||!theme||node?.isConnected)return;
 const c=ctx();node=build();
 const url=coverUrl(c);if(url)node.firstChild.style.backgroundImage=`url("${url.replace(/["\\]/g,'\\$&')}")`;
 node.querySelector('.ttk-typing-eyebrow').textContent=EYEBROW[theme]||'';
 node.querySelector('.ttk-typing-name').textContent=c?.name2||'';
 chat.append(node);
 const sc=document.getElementById('chat');if(sc&&sc.scrollHeight-sc.scrollTop-sc.clientHeight<220)sc.scrollTop=sc.scrollHeight;
 clearTimeout(failsafe);failsafe=setTimeout(hide,10*60*1000);
}
function hide(){clearTimeout(failsafe);if(node){node.remove();node=null;}}
export function syncTyping(enabled){
 const c=ctx(),es=c?.eventSource,T=c?.eventTypes||c?.event_types||{};
 if(!enabled){
  if(on){for(const [t,f] of handlers)es?.removeListener?.(t,f);handlers=[];observer?.disconnect();observer=null;}
  on=false;hide();return;
 }
 if(on||!es)return;
 on=true;
 handlers=[
  [T.GENERATION_STARTED,(type,_p,dry)=>{if(dry||SKIP.has(type))return;show();}],
  [T.GENERATION_STOPPED,hide],[T.GENERATION_ENDED,hide],[T.MESSAGE_RECEIVED,hide],[T.CHARACTER_MESSAGE_RENDERED,hide],[T.CHAT_CHANGED,hide],
 ].filter(([t])=>t);
 for(const [t,f] of handlers)es.on(t,f);
 // The real message appearing (streaming starts) also ends the indicator.
 const chat=document.getElementById('chat');
 if(chat){observer=new MutationObserver(recs=>{if(!node)return;for(const r of recs)for(const n of r.addedNodes)if(n.nodeType===1&&n.matches?.('.mes'))return hide();});observer.observe(chat,{childList:true});}
}
