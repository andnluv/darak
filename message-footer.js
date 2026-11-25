/** DARAK: per-message layout helpers (design module ON only).
 *  1) Footer row: swipe controls (‹ 1/3 ›), token counter, bookmark button and action buttons are gathered into one
 *     row at the bottom of the message block. Nodes only move within the same .mes (SillyTavern's handlers are
 *     delegated) and are put back when the design is turned off.
 *  2) Head: every message gets the same head — photo, then eyebrow / name / byline / time (".ttk-now"), typeset by
 *     each theme. The original name/time elements are not touched.
 *  3) Bookmark shelf (v0.21): messages the user bookmarked stand on a shelf as books. The shelf appears only on the
 *     last message (SillyTavern marks it "last_mes"), scrolls sideways when full and disappears at zero books.
 *     Bookmarks are stored per chat in chat metadata (key darak_bookmarks), matched by the message's send date so
 *     deleting or inserting messages does not shift them. Messages always read top to bottom — no pages. */
const MOVES=[['nav','.swipe_left'],['nav','.swipeRightBlock'],['tok','.tokenCounterDisplay'],['btn','.mes_buttons']];
const OWN='.ttk-cap,.ttk-stub,.ttk-poster,.ttk-now,.ttk-shelf,.ttk-bm';
const BM_KEY='darak_bookmarks';
const SHELF_KEY='darak-shelf';
let hooks={};
let observer=null,timer=null;
const dirty=new Set();
const txt=node=>(node?.textContent||'').replace(/\s+/g,' ').trim();
const theme=()=>document.documentElement.dataset.ttkTheme||'';
const ctx=()=>window.SillyTavern?.getContext?.();

// ── bookmarks (chat metadata) ──
function keyOf(i){const m=ctx()?.chat?.[i];return m?String(m.send_date||`#${i}`):'';}
function bmList(){const l=ctx()?.chatMetadata?.[BM_KEY];return Array.isArray(l)?l:[];}
function bmSave(list){const c=ctx();if(!c?.chatMetadata)return;c.chatMetadata[BM_KEY]=list;try{c.saveMetadata?.();}catch{}}
function firstWords(s){return String(s||'').replace(/<[^>]*>/g,' ').replace(/[*_`#>~\[\]|]/g,'').replace(/\s+/g,' ').trim().slice(0,12);}
function books(){
 const chat=ctx()?.chat||[];const out=[];
 for(const b of bmList()){
  const i=chat.findIndex((m,idx)=>String(m.send_date||`#${idx}`)===b.d);
  if(i>=0)out.push({i,text:firstWords(chat[i].mes)});
 }
 return out.sort((a,b)=>a.i-b.i);
}
const marked=i=>bmList().some(b=>b.d===keyOf(i));
function toggleBm(i){
 const k=keyOf(i);if(!k)return;
 const l=bmList().slice();const j=l.findIndex(b=>b.d===k);
 if(j>=0)l.splice(j,1);else l.push({d:k});
 bmSave(l);refresh();
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function jump(i){
 const find=()=>document.querySelector(`#chat .mes[mesid="${i}"]`);
 let el=find();
 if(!el){try{await ctx()?.executeSlashCommandsWithOptions?.(`/chat-jump ${i}`);}catch{}await sleep(450);el=find();}
 if(!el)return;
 el.scrollIntoView({block:'start',behavior:'smooth'});
 el.classList.add('ttk-flash');setTimeout(()=>el.classList.remove('ttk-flash'),1800);
}

// ── shelf pref (◆ / ◇) ──
function shelfOff(){try{return localStorage.getItem(SHELF_KEY)==='off';}catch{return false;}}
function applyShelfPref(){document.documentElement.dataset.ttkShelf=shelfOff()?'off':'on';}

// ── head ──
function nowBlock(mes,vals){
 let now=mes.querySelector(':scope > .ttk-now');
 if(!now){
  now=document.createElement('div');now.className='ttk-now';
  for(const [tag,cls] of [['span','ttk-now-eyebrow'],['b','ttk-now-name'],['span','ttk-now-by'],['span','ttk-now-meta']]){const e=document.createElement(tag);e.className=cls;now.append(e);}
  const t=document.createElement('button');t.type='button';t.className='ttk-shelf-toggle';t.setAttribute('aria-label','책장 접기/펼치기');t.title='책장 접기/펼치기';
  t.addEventListener('click',e=>{e.stopPropagation();try{localStorage.setItem(SHELF_KEY,shelfOff()?'on':'off');}catch{}applyShelfPref();});
  now.append(t);mes.append(now);
 }
 const set=(e,v)=>{if(e&&e.textContent!==v)e.textContent=v;};
 set(now.children[0],vals.eyebrow);set(now.children[1],vals.name);set(now.children[2],vals.by);set(now.children[3],vals.meta);
}
function shelfBlock(mes,list){
 let shelf=mes.querySelector(':scope > .ttk-shelf');
 if(!list.length){shelf?.remove();delete mes.dataset.ttkBooks;return;}
 mes.dataset.ttkBooks=String(list.length);
 const sig=list.map(b=>`${b.i}|${b.text}`).join(';');
 if(shelf&&shelf.dataset.sig===sig)return;
 if(!shelf){shelf=document.createElement('div');shelf.className='ttk-shelf';mes.append(shelf);}
 shelf.dataset.sig=sig;shelf.replaceChildren();
 const row=document.createElement('div');row.className='ttk-shelf-row';
 list.forEach((b,n)=>{
  const s=document.createElement('button');s.type='button';s.className='ttk-spine';
  s.style.setProperty('--h',`${76+((n*7+3)%5)*5}px`);s.dataset.c=String(n%5);
  const l=document.createElement('i');l.textContent=String(b.i);s.append(l);
  s.setAttribute('aria-label',`북마크 ${b.i}번 메시지로 이동`);s.title=b.text?`#${b.i} ${b.text}`:`#${b.i}`;
  s.addEventListener('click',e=>{e.stopPropagation();jump(b.i);});
  row.append(s);
 });
 const deco=document.createElement('span');deco.className='ttk-shelf-deco';for(let i=0;i<3;i++)deco.append(document.createElement('i'));row.append(deco);
 shelf.append(row);
}
function head(mes){
 const wrap=mes.querySelector(':scope > .mesAvatarWrapper');if(!wrap)return;
 // Poster overlay (Nocturne): lives inside the photo box so it always matches the photo's size.
 const box=wrap.querySelector(':scope > .avatar');
 let poster=box?.querySelector(':scope > .ttk-poster');
 if(box&&!poster){poster=document.createElement('div');poster.className='ttk-poster';poster.setAttribute('aria-hidden','true');for(const k of ['top','title','bill']){const s=document.createElement('span');s.className=`ttk-poster-${k}`;poster.append(s);}box.append(poster);}
 const img=wrap.querySelector('.avatar img');const src=img?.currentSrc||img?.getAttribute('src')||'';
 const url=src?`url("${src.replace(/["\\]/g,'\\$&')}")`:'none';
 if(wrap.style.getPropertyValue('--ttk-av-url')!==url)wrap.style.setProperty('--ttk-av-url',url);
 const no=mes.getAttribute('mesid')??'';
 const name=txt(mes.querySelector('.ch_name .name_text'))||mes.getAttribute('ch_name')||'';
 const time=txt(mes.querySelector('.ch_name .timestamp'));
 const m=time.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*?\s+(.+)$/);
 const when=m?`${m[1]}.${m[2].padStart(2,'0')}.${m[3].padStart(2,'0')} ${m[4]}`:time;
 if(poster){const set=(el,v)=>{if(el&&el.textContent!==v)el.textContent=v;};set(poster.children[0],'');set(poster.children[1],no===''?'':`S#${no}`);set(poster.children[2],'');}
 const c=ctx();const isUser=mes.getAttribute('is_user')==='true';
 const th=theme();
 const byline=isUser?(c?.name2?`to ${c.name2}`:''):(c?.name1?`with ${c.name1}`:'');
 const eyebrow=th==='paper'?(isUser?'MY PAGE':'NOW READING'):no===''?'':th==='nocturne'?`S#${no}`:`No. ${no}`;
 nowBlock(mes,{eyebrow,name,by:th==='paper'?byline:'',meta:th==='paper'?[no===''?'':`#${no}`,when].filter(Boolean).join(' · '):when});
}
function footer(mes){
 const block=mes.querySelector(':scope > .mes_block');if(!block)return;
 let foot=block.querySelector(':scope > .ttk-foot');
 if(!foot){
  foot=document.createElement('div');foot.className='ttk-foot';
  const slots={nav:document.createElement('div'),tok:document.createElement('div'),btn:document.createElement('div')};
  slots.nav.className='ttk-foot-nav';slots.tok.className='ttk-foot-tok';slots.btn.className='ttk-foot-btn';
  foot._home=[];
  for(const [slot,sel] of MOVES){
   const node=mes.querySelector(sel);if(!node||node.closest('.ttk-foot'))continue;
   foot._home.push({node,parent:node.parentNode,next:node.nextSibling});
   slots[slot].append(node);
  }
  foot.append(slots.nav,slots.tok,slots.btn);
  block.append(foot);
 }
 // bookmark button — leftmost of the action buttons
 const btn=foot.querySelector('.ttk-foot-btn');
 if(btn&&!btn.querySelector(':scope > .ttk-bm')){
  const b=document.createElement('button');b.type='button';b.className='ttk-bm';b.title='이 메시지를 책장에 꽂기';b.setAttribute('aria-label','북마크');
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleBm(Number(mes.getAttribute('mesid')));});
  btn.prepend(b);
 }
}
function restore(foot){
 for(const {node,parent,next} of (foot._home||[]).reverse()){
  if(!parent?.isConnected)continue;
  if(next&&next.parentNode===parent)parent.insertBefore(node,next);else parent.append(node);
 }
 foot.remove();
}
// Bookmark states + the shelf (last message only). Cheap: runs after every layout pass.
function refresh(){
 const all=document.querySelectorAll('#chat .mes');
 const list=books();
 for(const mes of all){
  const i=Number(mes.getAttribute('mesid'));
  const b=mes.querySelector(':scope > .mes_block .ttk-bm');
  if(b){const on=marked(i);if(b.getAttribute('aria-pressed')!==String(on))b.setAttribute('aria-pressed',String(on));}
  shelfBlock(mes,mes.classList.contains('last_mes')?list:[]);
 }
}
function scan(){
 for(const mes of document.querySelectorAll('#chat .mes')){footer(mes);head(mes);}
 refresh();
}
function flush(){
 timer=null;
 const list=[...dirty].filter(m=>m.isConnected&&m.matches?.('.mes'));dirty.clear();
 for(const mes of list){footer(mes);head(mes);}
 refresh();
}
export function syncMessageFooters(enabled,h){hooks=h||hooks;applyShelfPref();
 if(!enabled){
  observer?.disconnect();observer=null;if(timer){clearTimeout(timer);timer=null;}dirty.clear();
  document.querySelectorAll('#chat .ttk-foot').forEach(restore);
  document.querySelectorAll('#chat .ttk-cap,#chat .ttk-stub,#chat .ttk-poster,#chat .ttk-now,#chat .ttk-shelf,#chat .ttk-bm').forEach(n=>n.remove());
  document.querySelectorAll('#chat .mesAvatarWrapper').forEach(w=>w.style.removeProperty('--ttk-av-url'));
  document.querySelectorAll('#chat .mes[data-ttk-books]').forEach(m=>delete m.dataset.ttkBooks);
  return;
 }
 const chat=document.querySelector('#chat');if(!chat)return;
 scan();
 if(observer)return;
 // New messages, streamed text, swipes and edits: only the touched messages are refreshed (debounced).
 observer=new MutationObserver(records=>{
  for(const r of records){
   const el=r.target.nodeType===1?r.target:r.target.parentElement;
   if(!el||el.closest?.(OWN))continue;
   if(r.target===chat){for(const n of r.addedNodes)if(n.nodeType===1&&n.matches?.('.mes'))dirty.add(n);if(r.removedNodes.length)dirty.add(chat);continue;}
   const mes=el.closest?.('.mes');if(mes)dirty.add(mes);
  }
  if(dirty.size&&!timer)timer=setTimeout(flush,150);
 });
 observer.observe(chat,{childList:true,subtree:true,characterData:true});
}
