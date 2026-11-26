// 메시지 버튼 고르기 (v0.24.0)
// - 메시지 아래 버튼 중 어떤 것을 앞줄에 두고 어떤 것을 ⋯ 안에 접어 둘지 고릅니다.
// - 접힌 버튼은 display:none 대신 "크기 0 + 투명"으로 숨깁니다. 다른 확장(예: ST 재단사)이
//   버튼을 수집할 때 display:none인 것만 건너뛰기 때문에, 이렇게 하면 접힌 버튼도 계속 수집됩니다.
const STYLE_ID='darak-msgbtn-style';
// 처음 상태(고르기 전)의 앞줄 버튼. 기존 동작과 같습니다.
export const DEFAULT_FRONT=['.mes_copy','.mes_edit','.mes_bookmark','.mes_delete','.ttk-tr-button','.mes_translate','[class*=interpres i]','[id*=interpres i]','[title*=interpres i]'];
// 항상 앞줄에 있어야 하는 것(다락방 자체 버튼, 컨테이너).
const ALWAYS=['.ttk-bm','.ttk-more','.extraMesButtons','.mes_edit_buttons'];
const GENERIC=/^(mes_button|interactable|fa|fa-.+|fas|far|fab|ttk-.+|extraMesButton|list-group-item|menu_button)$/;
const MAX_SEEN=60;
const clean=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,40);

export function normalizeMsgButtons(raw){
 const front=Array.isArray(raw?.front)?raw.front.filter(k=>typeof k==='string'&&k.length<=120).slice(0,MAX_SEEN):null;
 const seen={};
 if(raw?.seen&&typeof raw.seen==='object')for(const [k,v] of Object.entries(raw.seen).slice(0,MAX_SEEN)){
  if(typeof k!=='string'||k.length>120)continue;
  seen[k]={label:clean(v?.label)||k,def:v?.def===true,ext:v?.ext!==false};
 }
 return {front,seen};
}
// 버튼 하나를 안정적인 CSS 선택자로 바꿉니다. (클래스 → id → title 순서)
export function keyOf(node){
 const cls=[...node.classList].filter(c=>!GENERIC.test(c));
 if(cls.length)return '.'+cls.slice(0,2).map(c=>CSS.escape(c)).join('.');
 if(node.id)return '#'+CSS.escape(node.id);
 const t=clean(node.getAttribute('title')||node.getAttribute('data-i18n')||node.getAttribute('aria-label'));
 if(t)return `[title="${t.replace(/["\\]/g,'')}"]`;
 return '';
}
const KNOWN={'.mes_edit':'편집','.mes_bookmark':'체크포인트 표시','.mes_copy':'복사','.mes_translate':'번역','.mes_narrate':'나레이션','.mes_hide':'메시지 숨기기','.mes_unhide':'메시지 보이기','.mes_create_bookmark':'체크포인트 만들기','.mes_create_branch':'분기 생성'};
const labelOf=(node,key)=>clean(node.getAttribute('title')||node.getAttribute('aria-label'))||clean(node.textContent)||KNOWN[key]||key.replace(/^[.#]/,'');
// 현재 화면에 있는 메시지 버튼을 훑어 목록(seen)에 더합니다. 바뀐 것이 있으면 true.
export function scanButtons(cfg){
 let dirty=false;
 const nodes=document.querySelectorAll('#chat .mes .mes_buttons > *, #chat .mes .extraMesButtons > *');
 for(const n of nodes){
  if(n.matches(ALWAYS.join(',')))continue;
  const key=keyOf(n);if(!key)continue;
  const def=DEFAULT_FRONT.some(s=>{try{return n.matches(s)}catch{return false}});
  const label=labelOf(n,key);
  const ext=!!n.closest('.extraMesButtons');
  const prev=cfg.seen[key];
  if(!prev){if(Object.keys(cfg.seen).length>=MAX_SEEN)continue;cfg.seen[key]={label,def,ext};dirty=true;}
  else{if(prev.label!==label&&label){prev.label=label;dirty=true;}if(prev.ext!==ext){prev.ext=ext;dirty=true;}}
 }
 return dirty;
}
const validSel=s=>{try{document.createDocumentFragment().querySelector(s);return true}catch{return false}};
export function frontSelectors(cfg){
 return (cfg.front||DEFAULT_FRONT).filter(validSel);
}
export function isFront(cfg,key){
 return cfg.front?cfg.front.includes(key):!!cfg.seen[key]?.def;
}
export function setFront(cfg,key,on){
 if(!cfg.front)cfg.front=Object.entries(cfg.seen).filter(([,v])=>v.def).map(([k])=>k);
 const has=cfg.front.includes(key);
 if(on&&!has)cfg.front.push(key);
 if(!on&&has)cfg.front=cfg.front.filter(k=>k!==key);
}
export function resetFront(cfg){cfg.front=null;}

// 접힌 버튼을 숨기는 규칙. display:none 을 쓰지 않는 것이 핵심입니다.
export function syncMessageButtons(enabled,cfg){
 let style=document.getElementById(STYLE_ID);
 if(!enabled){style?.remove();return;}
 if(!style){style=document.createElement('style');style.id=STYLE_ID;document.head.append(style);}
 const keep=[...ALWAYS,...frontSelectors(cfg)].join(',');
 style.textContent=
  `html[data-ttk-theme] body #chat#chat .mes.mes .ttk-foot-btn:not(.ttk-open) :is(.mes_buttons,.extraMesButtons) > :not(${keep}){`+
  'position:absolute!important;width:0!important;min-width:0!important;height:0!important;max-width:0!important;max-height:0!important;'+
  'margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;flex:0 0 0!important}';
}
