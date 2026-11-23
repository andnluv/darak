/** DARAK: per-message layout helpers (design module ON only).
 *  1) Footer row: swipe controls (‹ 1/3 ›), token counter and action buttons are gathered into one row
 *     at the bottom of the message block. Nodes only move within the same .mes (SillyTavern's handlers are
 *     delegated) and are put back when the design is turned off.
 *  2) Caption: name / message number / time are mirrored (text only) so each theme can typeset them.
 *     The original name/time elements are not touched.
 *  3) Pages (Paper, Nocturne): like an e-book reader, a long message is laid out in columns inside a fixed-height
 *     page and turned sideways with « ‹ n/m › ». Short messages keep their natural height. Editing a message
 *     (textarea inside) always falls back to normal vertical layout. The chat's own vertical scroll is never hijacked. */
const MOVES=[['nav','.swipe_left'],['nav','.swipeRightBlock'],['tok','.tokenCounterDisplay'],['btn','.mes_buttons']];
const PAGED=new Set(['paper','nocturne']);
const OWN='.ttk-pager,.ttk-cap,.ttk-stub,.ttk-poster';
let observer=null,timer=null,resizeTimer=null;
const dirty=new Set();
const pages=new WeakMap();
const txt=node=>(node?.textContent||'').replace(/\s+/g,' ').trim();
const pagedTheme=()=>PAGED.has(document.documentElement.dataset.ttkTheme);

function caption(mes){
 const wrap=mes.querySelector(':scope > .mesAvatarWrapper');if(!wrap)return;
 let cap=wrap.querySelector(':scope > .ttk-cap');
 if(!cap){
  cap=document.createElement('div');cap.className='ttk-cap';cap.setAttribute('aria-hidden','true');
  for(const k of ['no','name','time','tok','clock']){const s=document.createElement('span');s.className=`ttk-cap-${k}`;cap.append(s);}
  wrap.append(cap);
 }
 // Poster overlay (Nocturne): lives inside the photo box so it always matches the photo's size.
 const box=wrap.querySelector(':scope > .avatar');
 let poster=box?.querySelector(':scope > .ttk-poster');
 if(box&&!poster){poster=document.createElement('div');poster.className='ttk-poster';poster.setAttribute('aria-hidden','true');for(const k of ['top','title','bill']){const s=document.createElement('span');s.className=`ttk-poster-${k}`;poster.append(s);}box.append(poster);}
 let stub=mes.querySelector(':scope > .ttk-stub');
 if(!stub){stub=document.createElement('div');stub.className='ttk-stub';stub.setAttribute('aria-hidden','true');stub.append(document.createElement('b'),document.createElement('i'));mes.append(stub);}
 const img=wrap.querySelector('.avatar img');const src=img?.currentSrc||img?.getAttribute('src')||'';
 const url=src?`url("${src.replace(/["\\]/g,'\\$&')}")`:'none';
 if(wrap.style.getPropertyValue('--ttk-av-url')!==url)wrap.style.setProperty('--ttk-av-url',url);
 const no=mes.getAttribute('mesid')??'';
 const name=txt(mes.querySelector('.ch_name .name_text'))||mes.getAttribute('ch_name')||'';
 const time=txt(mes.querySelector('.ch_name .timestamp'));
 const set=(el,v)=>{if(el&&el.textContent!==v)el.textContent=v;};
 const tokens=txt(mes.querySelector('.tokenCounterDisplay'));
 const m=time.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*?\s+(.+)$/);
 set(cap.children[0],no);set(cap.children[1],name);set(cap.children[2],time);set(cap.children[3],tokens);set(cap.children[4],m?m[4]:time);set(stub.children[0],no);set(stub.children[1],name);
 if(poster){
  set(poster.children[0],'');set(poster.children[1],no===''?'':`S#${no}`);set(poster.children[2],'');
 }
}
function footer(mes){
 if(mes.querySelector(':scope > .mes_block > .ttk-foot'))return;
 const block=mes.querySelector(':scope > .mes_block');if(!block)return;
 const foot=document.createElement('div');foot.className='ttk-foot';
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
function restore(foot){
 for(const {node,parent,next} of (foot._home||[]).reverse()){
  if(!parent?.isConnected)continue;
  if(next&&next.parentNode===parent)parent.insertBefore(node,next);else parent.append(node);
 }
 foot.remove();
}

// ── pages ──
function pager(mes){
 const block=mes.querySelector(':scope > .mes_block');if(!block)return null;
 let p=block.querySelector(':scope > .ttk-pager');
 if(p)return p;
 p=document.createElement('div');p.className='ttk-pager';
 const mk=(cls,label,icon,fn)=>{const b=document.createElement('button');b.type='button';b.className=`ttk-pager-btn ${cls}`;b.title=label;b.setAttribute('aria-label',label);b.textContent=icon;b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();fn();});return b;};
 const label=document.createElement('span');label.className='ttk-pager-label';
 p.append(mk('first','첫 페이지','«',()=>turn(mes,-Infinity)),mk('prev','이전 페이지','‹',()=>turn(mes,-1)),label,mk('next','다음 페이지','›',()=>turn(mes,1)),mk('last','마지막 페이지','»',()=>turn(mes,Infinity)));
 block.prepend(p);
 const text=block.querySelector(':scope > .mes_text');
 if(text&&!text._ttkTouch){
  text._ttkTouch=true;let sx=0,sy=0;
  text.addEventListener('touchstart',e=>{const t=e.touches[0];sx=t.clientX;sy=t.clientY;},{passive:true});
  text.addEventListener('touchend',e=>{if(!mes.classList.contains('ttk-paged'))return;const t=e.changedTouches[0];const dx=t.clientX-sx,dy=t.clientY-sy;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.4)turn(mes,dx<0?1:-1);},{passive:true});
 }
 return p;
}
function spread(text){const cs=getComputedStyle(text);return text.clientWidth-(parseFloat(cs.paddingLeft)||0)-(parseFloat(cs.paddingRight)||0)+(parseFloat(cs.columnGap)||0);}
function total(text){const w=spread(text);return w>0?Math.max(1,Math.ceil((text.scrollWidth-4)/w)):1;}
function show(mes,smooth){
 const text=mes.querySelector(':scope > .mes_block > .mes_text');const p=mes.querySelector(':scope > .mes_block > .ttk-pager');
 if(!text||!p)return;
 const n=total(text);let i=Math.min(Math.max(pages.get(mes)||0,0),n-1);pages.set(mes,i);
 const left=i*spread(text);
 if(smooth&&typeof text.scrollTo==='function')text.scrollTo({left,behavior:'smooth'});else text.scrollLeft=left;
 p.querySelector('.ttk-pager-label').textContent=`${i+1} / ${n}`;
 p.hidden=n<=1;
 p.querySelector('.prev').disabled=p.querySelector('.first').disabled=i<=0;
 p.querySelector('.next').disabled=p.querySelector('.last').disabled=i>=n-1;
}
function turn(mes,d){
 const text=mes.querySelector(':scope > .mes_block > .mes_text');if(!text||!mes.classList.contains('ttk-paged'))return;
 const n=total(text),cur=pages.get(mes)||0;
 pages.set(mes,d===-Infinity?0:d===Infinity?n-1:Math.min(Math.max(cur+d,0),n-1));
 show(mes,true);
}
// Messages that carry a layout of their own (status panel, table, image, <details>) are never cut into pages and
// get the full width instead of the narrow reading column, so nothing in them is clipped.
const RICH='div,table,details,pre,img,iframe,section,figure,video';
function rich(text){return !!text&&!!text.querySelector(RICH);}
function layout(mes){
 const text=mes.querySelector(':scope > .mes_block > .mes_text');
 const clear=()=>{mes.classList.remove('ttk-paged','ttk-spread','ttk-2col');const p=mes.querySelector(':scope > .mes_block > .ttk-pager');if(p)p.hidden=true;if(text){text.scrollLeft=0;text.style.removeProperty('height');text.style.removeProperty('flex');}};
 const themed=!!document.documentElement.dataset.ttkTheme&&document.documentElement.dataset.ttkTheme!=='studio';
 mes.classList.toggle('ttk-rich',themed&&rich(text));
 if(!text||!pagedTheme()||mes.classList.contains('ttk-rich')||text.querySelector('textarea,[contenteditable="true"]')){clear();return;}
 text.style.removeProperty('height');
 pager(mes);
 // Messages skipped by content-visibility (ours or another extension's) report 0 heights, so render them while measuring.
 mes.style.setProperty('content-visibility','visible','important');
 // Two columns only where a column still gets a readable width (open-book spread); otherwise one column per page.
 mes.classList.toggle('ttk-2col',text.clientWidth>=600);
 // 1) natural single-column height at full text width
 mes.classList.remove('ttk-paged','ttk-spread');
 const natural=text.scrollHeight;
 // 2) the text box height a fixed page leaves for the text
 mes.classList.add('ttk-paged');
 const box=text.clientHeight;
 mes.style.removeProperty('content-visibility');
 const wide=mes.classList.contains('ttk-2col');
 const line=parseFloat(getComputedStyle(text).lineHeight)||28;

 if(natural<=box){
  mes.classList.remove('ttk-paged');text.style.removeProperty('height');text.style.removeProperty('flex');
  // PC: medium-length text is set in two balanced columns, like an open spread; short text stays one column.
  if(wide&&natural>line*8)mes.classList.add('ttk-spread');
  const p=mes.querySelector(':scope > .mes_block > .ttk-pager');if(p)p.hidden=true;text.scrollLeft=0;
  return;
 }
 show(mes,false);
}
function scan(){
 for(const mes of document.querySelectorAll('#chat .mes')){footer(mes);caption(mes);}
 relayout(document.querySelectorAll('#chat .mes'));
}
function relayout(list){
 if(!pagedTheme()){for(const mes of list)layout(mes);return;}
 for(const mes of list)layout(mes);
}
function flush(){
 timer=null;
 const list=[...dirty].filter(m=>m.isConnected);dirty.clear();
 for(const mes of list){footer(mes);caption(mes);}
 relayout(list);
}
function onResize(){clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>relayout(document.querySelectorAll('#chat .mes')),200);}
export function syncMessageFooters(enabled){
 if(!enabled){
  observer?.disconnect();observer=null;if(timer){clearTimeout(timer);timer=null;}dirty.clear();
  window.removeEventListener('resize',onResize);
  document.querySelectorAll('#chat .ttk-foot').forEach(restore);
  document.querySelectorAll('#chat .ttk-cap,#chat .ttk-stub,#chat .ttk-pager,#chat .ttk-poster').forEach(n=>n.remove());
  document.querySelectorAll('#chat .mesAvatarWrapper').forEach(w=>w.style.removeProperty('--ttk-av-url'));
  document.querySelectorAll('#chat .mes.ttk-paged,#chat .mes.ttk-spread,#chat .mes.ttk-2col,#chat .mes.ttk-rich').forEach(m=>{m.classList.remove('ttk-paged','ttk-spread','ttk-2col','ttk-rich');const t=m.querySelector('.mes_text');if(t){t.scrollLeft=0;t.style.removeProperty('height');t.style.removeProperty('flex');}});
  return;
 }
 const chat=document.querySelector('#chat');if(!chat)return;
 scan();
 if(observer)return;
 window.addEventListener('resize',onResize);
 // New messages, streamed text, swipes and edits: only the touched messages are laid out again (debounced).
 observer=new MutationObserver(records=>{
  for(const r of records){
   const el=r.target.nodeType===1?r.target:r.target.parentElement;
   if(!el||el.closest?.(OWN))continue;
   if(r.target===chat){for(const n of r.addedNodes)if(n.nodeType===1&&n.matches?.('.mes'))dirty.add(n);continue;}
   const mes=el.closest?.('.mes');if(mes)dirty.add(mes);
  }
  if(dirty.size&&!timer)timer=setTimeout(flush,150);
 });
 observer.observe(chat,{childList:true,subtree:true,characterData:true});
}
