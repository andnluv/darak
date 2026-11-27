// v1.6.0 Studio 첫 글자 장식(::first-letter) 보조.
// ::first-letter는 앞의 기호까지 함께 키워서, 첫 문단이 `[이름]`·`"`·얼굴로 시작하면 `[강`, `"오`처럼 보인다.
// 첫 문단의 첫 글자가 글자·숫자가 아니면 그 메시지에만 장식을 끄도록 표시(data-ttk-nodrop)한다. 메시지 내용은 바꾸지 않는다.
const LEAD=/^[\p{L}\p{N}]/u;
export function markDropcap(host){
 if(!host?.isConnected)return;
 const p=host.querySelector(':scope > p');let off=false;
 if(p){
  const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let n;
  while((n=w.nextNode())){
   if(n.nodeType===1){if(n.matches('.ttk-face,.ttk-fl,img,br,.ttk-ftag')){off=true;break;}continue;}
   const t=n.nodeValue.replace(/^\s+/,'');if(!t)continue;
   off=!LEAD.test(t);break;
  }
 }
 if(off)host.setAttribute('data-ttk-nodrop','');else host.removeAttribute('data-ttk-nodrop');
}
