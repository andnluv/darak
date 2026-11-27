import {PromptNameTranslator,normalizePromptTranslation} from './prompt-localization.js';
import {normalizeLocalization,startReasoningLocalization,stopReasoningLocalization} from './localization.js';
import {MessageTranslator,normalizeTranslation,normalizeGlossary,GLOSSARY_MAX,INPUT_LANGUAGES,KOREAN_STYLE,CUSTOM_PROMPT_MAX} from './translation.js';
import {Ghostwriter,normalizeGhostwrite} from './ghostwrite.js';
import {QrVault,normalizeQrVault} from './qr-vault.js';
import {Inventory} from './inventory.js';
import {MobileOptimizer,normalizeOptimization} from './optimization.js';
import {Avatars,normalizeAvatars,MAX_PER_OWNER} from './avatars.js';
import {Faces,normalizeFaces} from './faces.js';
import {ThemeImages,normalizeThemeImages} from './theme-images.js';
import {Gallery,normalizeGallery} from './gallery.js';
import {Weather,normalizeWeather} from './weather.js';
import {confirmAsk} from './dialogs.js';
import {syncMessageFooters} from './message-footer.js';
import {normalizeMsgButtons,scanButtons,syncMessageButtons,isFront,setFront,resetFront} from './message-buttons.js';
import {syncTyping} from './typing.js';
import {applyDesign,teardownDesign,normalizeDesign,selectTheme,resetPalette,fontPreviewNode,THEMES,FONTS,FONT_GROUPS,PHOTO_SIZES,USER_FONT_MAX,normalizeUserFonts,setUserFonts,sanitizeFontFaceCode,userFontId,WEIGHT_STEPS,UNDERLINES,fontWeights,resolveWeight,emphasisOf} from './design.js';
const KEY='darak';
const LEGACY_KEY='tavern_toolkit_independent'; // 이전 이름(태번 도구함)의 설정 키 — 첫 실행 때 한 번 옮겨 옵니다.
const VERSION = '1.3.1';
const SELF_FOLDER=decodeURIComponent(new URL(import.meta.url).pathname.split('/third-party/')[1]?.split('/')[0]||'');
const DEFAULT_MODULES={design:true,localization:true,translation:false,qr:false,inventory:false,ghostwrite:false,optimization:false,avatars:false,faces:false,themeImages:false,gallery:false,weather:false};
let settings,save,promptTranslator,messageTranslator,ghostwriter,qrVault,inventory,optimizer,avatars,faces,themeImages,gallery,weather,conflictToastShown=false;
// v0.23: 확장 목록 제목의 작은 다락창(지붕 + 십자 창) 아이콘.
const ATTIC_SVG='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 3.5 21 11"/><path d="M5.5 9v11.5h13V9"/><rect x="9" y="10.5" width="6" height="6" rx=".6"/><path d="M12 10.5v6M9 13.5h6"/></svg>';
const el=(tag,cls='',text='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
const btn=(label,action,cls='')=>{const n=el('button',`ttk-button ${cls}`,label);n.type='button';n.addEventListener('click',action);return n;};
function merge(raw){const userFonts=normalizeUserFonts(raw?.userFonts);setUserFonts(userFonts);const modules={...DEFAULT_MODULES,...(raw?.modules||{})};const old=raw?.design||{};const migrated=old.theme==='midnight'?'nocturne':old.theme==='sage'?'studio':old.theme;return {modules,userFonts,design:normalizeDesign({...old,theme:migrated}),localization:normalizeLocalization(raw?.localization),promptTranslation:normalizePromptTranslation(raw?.promptTranslation),translation:normalizeTranslation(raw?.translation),glossary:normalizeGlossary(raw?.glossary),ghostwrite:normalizeGhostwrite(raw?.ghostwrite),qr:normalizeQrVault(raw?.qr),optimization:normalizeOptimization(raw?.optimization),avatars:normalizeAvatars(raw?.avatars),faces:normalizeFaces(raw?.faces),themeImages:normalizeThemeImages(raw?.themeImages),gallery:normalizeGallery(raw?.gallery),weather:normalizeWeather(raw?.weather),msgButtons:normalizeMsgButtons(raw?.msgButtons)};}
// One module failing must never stop the others: every module start/stop/apply runs inside guard().
const failed=new Map();
function guard(name,fn,cleanup){try{return fn();}catch(e){console.error(`[DARAK] ${name} 오류`,e);try{cleanup?.();}catch{}if(!failed.has(name)){failed.set(name,String(e?.message||e).slice(0,160));globalThis.toastr?.error?.(`${name}에서 오류가 나 이 모듈만 멈췄습니다. 다른 모듈은 계속 동작합니다. 자세한 내용은 다락방 설정 맨 위에 있습니다.`,'다락방',{timeOut:9000});}showFailures();}}
function showFailures(){const box=document.getElementById('ttk-failures');if(!box)return;box.hidden=!failed.size;if(!failed.size)return;box.replaceChildren(el('strong','','멈춘 모듈이 있습니다'),...[...failed].map(([n,m])=>el('p','',`${n}: ${m}`)),el('p','','나머지 모듈은 그대로 동작합니다. 브라우저 콘솔(F12)의 [DARAK] 줄에 자세한 오류가 있습니다. 페이지를 새로고침하면 다시 시도합니다.'));}
const footerHooks={shelf:id=>(settings?.modules?.avatars&&avatars)?avatars.shelfFor(id):null};
function applyModules(){guard('디자인',()=>{applyDesign(settings.modules.design,settings.design);syncDialogueHighlights(settings.modules.design);syncStyleMarks();syncMessageFooters(settings.modules.design,footerHooks);syncMessageButtons(settings.modules.design,settings.msgButtons);syncTyping(settings.modules.design&&settings.design.typing!==false);},()=>{teardownDesign();syncMessageFooters(false);syncMessageButtons(false);syncTyping(false);});guard('한글화',syncLocalization);guard('번역',syncTranslation);guard('대필',syncGhostwrite);guard('QR 보관함',syncQr);guard('통합 조회',syncInventory);guard('모바일 최적화',syncOptimization);guard('프로필 사진',syncAvatars);guard('화자 얼굴',syncFaces);guard('테마 이미지 교체',syncThemeImages);guard('이미지 모아보기',syncGallery);guard('날씨·분위기',syncWeather);}
function changed(){applyModules();save();}
function syncWeather(){if(!weather)return;if(settings.modules.weather)weather.start();else weather.stop();}
function syncFaces(){if(!faces)return;if(settings.modules.faces)faces.start();else faces.stop();}
function syncAvatars(){if(!avatars)return;if(settings.modules.avatars)avatars.start();else avatars.stop();}
function syncThemeImages(){if(!themeImages)return;if(settings.modules.themeImages)themeImages.start();else themeImages.stop();}
function syncGallery(){if(!gallery)return;if(settings.modules.gallery)gallery.start();else gallery.stop();}
function syncOptimization(){if(!optimizer)return;if(settings.modules.optimization)optimizer.start();else optimizer.stop();}
function syncInventory(){if(!inventory)return;if(settings.modules.inventory)inventory.start();else inventory.stop();}
function syncQr(){if(!qrVault)return;if(settings.modules.qr)qrVault.start();else qrVault.stop();}
function syncGhostwrite(){if(!ghostwriter)return;if(settings.modules.ghostwrite)ghostwriter.start();else ghostwriter.stop();}
function syncTranslation(){if(!messageTranslator)return;if(settings.modules.translation)messageTranslator.start();else messageTranslator.stop();}
function syncLocalization(){if(settings.modules.localization){startReasoningLocalization(settings.localization);promptTranslator?.start();}else{stopReasoningLocalization();promptTranslator?.stop();}}
let dialogueObserver=null, dialogueTimer=null, activeChat=null;
const QUOTES=/(“[^”\n]+”|「[^」\n]+」|『[^』\n]+』|\"[^\"\n]+\")/g;
function highlightDialogue(container){
 // Only wraps complete quotation pairs within a single text node. Never edits message data.
 const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);
 const targets=[];let node;
 while((node=walker.nextNode())){
   if(!node.nodeValue || !/[“「『\"]/.test(node.nodeValue))continue;
   if(node.parentElement?.closest('span.ttk-dialogue,pre,code,kbd,script,style,textarea,button,a,[contenteditable="true"],.mes_edit'))continue;
   if(!QUOTES.test(node.nodeValue)){QUOTES.lastIndex=0;continue;}QUOTES.lastIndex=0;
   targets.push(node);
 }
 for(const textNode of targets){
   if(!textNode.isConnected)continue;
   const text=textNode.nodeValue,fragment=document.createDocumentFragment();let cursor=0,m;
   QUOTES.lastIndex=0;
   while((m=QUOTES.exec(text))){
     if(m.index>cursor)fragment.append(document.createTextNode(text.slice(cursor,m.index)));
     const span=document.createElement('span');span.className='ttk-dialogue';span.textContent=m[0];fragment.append(span);
     cursor=m.index+m[0].length;
   }
   if(!cursor)continue;
   if(cursor<text.length)fragment.append(document.createTextNode(text.slice(cursor)));
   textNode.replaceWith(fragment);
 }
 QUOTES.lastIndex=0;
}
// v1.1.0: 지문 밑줄·강조 서식을 위한 표시. 메시지 데이터는 건드리지 않고 화면의 글자만 감싼다.
// 밑줄(text-decoration)은 자식 글자에서 끌 수 없어서, 지문 밑줄을 켰을 때만 지문 글자를 span.ttk-narr로 감싸 대사와 분리한다.
const OBSERVE={childList:true,characterData:true,subtree:true};
const SKIP_WRAP='span.ttk-dialogue,span.ttk-narr,q,pre,code,kbd,script,style,textarea,button,a,[contenteditable="true"],.mes_edit,.mes_reasoning';
function unwrapNarration(host){host.querySelectorAll('span.ttk-narr').forEach(n=>n.replaceWith(document.createTextNode(n.textContent)));host.normalize();}
function wrapNarration(host){
 const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT),targets=[];let node;
 while((node=walker.nextNode())){if(!node.nodeValue||!node.nodeValue.trim())continue;if(node.parentElement?.closest(SKIP_WRAP))continue;targets.push(node);}
 for(const t of targets){if(!t.isConnected)continue;const s=document.createElement('span');s.className='ttk-narr';t.replaceWith(s);s.append(t);}
}
// 지문 글자 수(대사 제외). 한 문단의 지문 80% 이상이 *…*로 감싸져 있으면 강조가 아니라 지문 서식으로 보고 강조 처리에서 뺀다.
function narrationChars(node){let c=0;const w=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let t;while((t=w.nextNode())){if(t.parentElement?.closest('.ttk-dialogue,q'))continue;c+=t.nodeValue.replace(/\s+/g,'').length;}return c;}
function markEmphasis(host){
 const seen=new Set();
 for(const em of host.querySelectorAll('em,i')){
  const block=em.closest('p,li,blockquote')||host;if(seen.has(block))continue;seen.add(block);
  const all=[...block.querySelectorAll('em,i')];
  const total=narrationChars(block),part=all.filter(e=>!e.parentElement?.closest('em,i')).reduce((n,e)=>n+narrationChars(e),0);
  const skip=total>0&&part/total>=.8;
  for(const e of all)skip?e.setAttribute('data-ttk-emph-skip',''):e.removeAttribute('data-ttk-emph-skip');
 }
}
function processHost(host){
 const d=settings?.design;
 if(host.querySelector('span.ttk-narr'))unwrapNarration(host);
 highlightDialogue(host);
 if(d?.narrationStyle?.underline&&d.narrationStyle.underline!=='none')wrapNarration(host);
 if(d?.emphasis)markEmphasis(host);
 if(settings?.modules?.faces&&faces)faces.process(host);
}
let styleMarkKey='';
// 설정이 바뀌면 이미 그려진 메시지에도 다시 반영한다(관찰을 잠시 멈춰 자기 변경에 반응하지 않게).
function syncStyleMarks(){
 const on=!!settings?.modules?.design,d=settings?.design;
 const key=on?`${d?.narrationStyle?.underline!=='none'}|${!!d?.emphasis}`:'off';
 if(key===styleMarkKey)return;styleMarkKey=key;
 const chat=document.querySelector('#chat');if(!chat||!dialogueObserver)return;
 dialogueObserver.disconnect();
 chat.querySelectorAll('.mes_text,.ttk-tr-text').forEach(host=>{if(!d.emphasis)host.querySelectorAll('[data-ttk-emph-skip]').forEach(e=>e.removeAttribute('data-ttk-emph-skip'));processHost(host);});
 dialogueObserver.observe(chat,OBSERVE);
}
function syncDialogueHighlights(enabled){
 if(enabled && dialogueObserver && activeChat===document.querySelector('#chat'))return;
 if(dialogueObserver){dialogueObserver.disconnect();dialogueObserver=null;}
 if(dialogueTimer){clearTimeout(dialogueTimer);dialogueTimer=null;}
 if(!enabled){activeChat=null;faces?.cleanup();document.querySelectorAll('#chat .ttk-dialogue,#chat .ttk-narr').forEach(node=>node.replaceWith(document.createTextNode(node.textContent)));document.querySelectorAll('#chat [data-ttk-emph-skip]').forEach(e=>e.removeAttribute('data-ttk-emph-skip'));styleMarkKey='';return;}
 const chat=document.querySelector('#chat');if(!chat)return;activeChat=chat;
 chat.querySelectorAll('.mes_text,.ttk-tr-text').forEach(processHost);
 // v0.3.14: only messages that actually changed are rescanned (streaming used to rescan the whole chat every 100ms).
 const dirty=new Set();
 const options=OBSERVE;
 dialogueObserver=new MutationObserver(records=>{
  for(const record of records){
   const origin=record.target.nodeType===1?record.target:record.target.parentElement;
   const host=origin?.closest?.('.mes_text,.ttk-tr-text');
   if(host)dirty.add(host);
   else for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches?.('.mes_text,.ttk-tr-text'))dirty.add(node);node.querySelectorAll?.('.mes_text,.ttk-tr-text').forEach(x=>dirty.add(x));}
  }
  if(!dirty.size||dialogueTimer)return;
  dialogueTimer=setTimeout(()=>{dialogueTimer=null;const batch=[...dirty];dirty.clear();dialogueObserver?.disconnect();for(const host of batch)if(host.isConnected)processHost(host);dialogueObserver?.observe(chat,options);},100);
 });
 dialogueObserver.observe(chat,options);
}

function info(label,detail){const n=el('span','ttk-option-label');n.append(el('strong','',label));if(detail)n.append(el('small','',detail));return n;}
function openDrawer(r){r.classList.add('open');const c=r.querySelector(':scope > .inline-drawer-content');if(c)c.style.display='block';const i=r.querySelector('.inline-drawer-icon');if(i){i.classList.remove('down','fa-circle-chevron-down');i.classList.add('up','fa-circle-chevron-up');}}
function syncGlossaryVisibility(){const g=document.getElementById('ttk-glossary-section');if(g)g.hidden=!(settings.modules.translation||settings.modules.ghostwrite);}
function switchRow(parent,label,desc,key,disabled=false){const row=el('label','ttk-module-row');row.append(info(label,desc));const check=el('input');check.type='checkbox';check.checked=!!settings.modules[key];check.disabled=disabled;check.addEventListener('change',()=>{settings.modules[key]=check.checked;changed();if(key==='design')document.getElementById('ttk-theme-section').hidden=!check.checked;if(key==='localization')document.getElementById('ttk-localization-section').hidden=!check.checked;if(key==='translation')document.getElementById('ttk-translation-section').hidden=!check.checked;if(key==='ghostwrite')document.getElementById('ttk-ghostwrite-section').hidden=!check.checked;if(key==='qr')document.getElementById('ttk-qr-section').hidden=!check.checked;if(key==='faces')document.getElementById('ttk-faces-section').hidden=!check.checked;if(key==='inventory')document.getElementById('ttk-inventory-section').hidden=!check.checked;if(key==='optimization')document.getElementById('ttk-optimization-section').hidden=!check.checked;if(key==='avatars')document.getElementById('ttk-avatars-section').hidden=!check.checked;if(key==='themeImages')document.getElementById('ttk-themeimg-section').hidden=!check.checked;if(key==='gallery')document.getElementById('ttk-gallery-section').hidden=!check.checked;if(key==='weather')document.getElementById('ttk-weather-section').hidden=!check.checked;if(key==='translation'||key==='ghostwrite')syncGlossaryVisibility();});row.append(check);parent.append(row);return row;}
function slider(parent,label,key,min,max,step,fmt,onUpdate){const row=el('label','ttk-slider');const line=el('span','ttk-slider-label');const out=el('output','',fmt(settings.design[key]));line.append(el('strong','',label),out);const input=el('input');input.type='range';Object.assign(input,{min,max,step,value:settings.design[key]});input.addEventListener('input',()=>{settings.design[key]=Number(input.value);out.textContent=fmt(settings.design[key]);onUpdate?.();changed();});row.append(line,input);parent.append(row);}
function build(){
 const root=el('div','inline-drawer ttk-settings');root.id='ttk-panel';const sum=el('div','inline-drawer-toggle inline-drawer-header');const title=el('b','ttk-panel-title');const mark=el('span','ttk-panel-mark');mark.setAttribute('aria-hidden','true');mark.innerHTML=ATTIC_SVG;title.append(mark,el('span','ttk-panel-name','다락방'),el('small','ttk-panel-version',`v${VERSION}`));sum.append(title,el('div','inline-drawer-icon fa-solid fa-circle-chevron-down down'));root.append(sum);
 const drawer=el('div','inline-drawer-content');root.append(drawer);const body=el('div','ttk-settings-body');drawer.append(body);
 const failBox=el('div','ttk-failures');failBox.id='ttk-failures';failBox.hidden=true;failBox.setAttribute('role','alert');body.append(failBox);
 body.append(el('p','ttk-note','모듈별 ON/OFF를 지원합니다. 디자인을 끄면 확장 스타일이 제거되고 원래 실리태번 테마가 표시됩니다.'));
 const modules=el('section','ttk-module-list');const rowOf={};const addModule=(...a)=>{rowOf[a[a.length-1]]=switchRow(modules,...a);};addModule('디자인','Paper · Nocturne · Studio · Porcelain 테마','design');addModule('한글화','추론 제목 및 프롬프트 토글 표시명','localization');addModule('번역','AI 응답 한국어 번역 · 입력 번역 · 다른 번역 확장과 함께 켜지 말고 하나만 쓰세요','translation');addModule('QR 보관함','버튼 하나로 여는 서랍에서 QR 실행 · 세트 켜기/가져오기/내보내기/백업','qr');addModule('통합 조회','테마·프롬프트·확장을 한 창에서 확인하고 오류·충돌을 점검합니다','inventory');addModule('유저 인풋 대필','현재 RP 연결로 내 다음 메시지를 입력창에 써 줍니다','ghostwrite');addModule('프로필 사진','봇 캐릭터·내 페르소나에 사진을 여러 장 등록하고, 새 메시지의 기본 사진과 메시지별 사진을 고릅니다','avatars');addModule('화자 얼굴','여러 인물이 나오는 봇에서 대사 옆에 말한 인물의 얼굴을 보여 줍니다 · 대사 인식에 디자인 모듈이 필요합니다','faces');addModule('테마 이미지 교체','테마 CSS 속 이미지를 내 파일로 바꾸고 프리셋으로 저장합니다','themeImages');addModule('이미지 모아보기','이 채팅과 서버 폴더의 생성 이미지를 한 창에서 봅니다','gallery');addModule('날씨·분위기','배경 위에 비·눈·안개·흐림·뇌우와 꽃잎·낙엽·반딧불·불똥·별빛을 깝니다 · 채팅마다 따로 고르며 다른 모듈과 독립','weather');addModule('모바일 최적화','독립 성능 모듈 · 긴 채팅과 무거운 효과의 부담을 줄입니다','optimization');
 const locPanel=el('details','ttk-section');locPanel.id='ttk-localization-section';locPanel.append(el('summary','ttk-section-summary','한글화 · 추론 제목 / 토글 이름'));
 const locBody=el('div','ttk-controls');locPanel.append(locBody);
 locBody.append(el('p','ttk-note','추론(Thought) 제목만 화면에서 변경합니다. 접기·펼치기 상태, 추론 원문, 채팅 저장 데이터는 변경하지 않습니다.'));
 const nameRow=el('label','ttk-field');nameRow.append(el('strong','','추론 제목'));const nameInput=el('input');nameInput.type='text';nameInput.maxLength=30;nameInput.placeholder='비우면 제목 없이 표시';nameInput.value=settings.localization.reasoningLabel;
 nameInput.addEventListener('change',()=>{settings.localization=normalizeLocalization({...settings.localization,reasoningLabel:nameInput.value});nameInput.value=settings.localization.reasoningLabel;changed();});nameRow.append(nameInput);locBody.append(nameRow);
 const timeRow=el('label','ttk-module-row');timeRow.append(info('소요 시간 표시','ON일 때 사유 · 1분 형태로 표시'));const timeCheck=el('input');timeCheck.type='checkbox';timeCheck.checked=settings.localization.showReasoningTime;
 timeCheck.addEventListener('change',()=>{settings.localization.showReasoningTime=timeCheck.checked;changed();});timeRow.append(timeCheck);locBody.append(timeRow);
 const transSection=el('details','ttk-subsection');transSection.append(el('summary','','프롬프트 토글 이름 자동 번역'));
 transSection.append(el('p','ttk-note','기본 번역 사전 없이 선택한 저장 연결 프로필로 이름만 번역합니다. RP 연결·프롬프트 데이터·활성화 상태는 변경하지 않습니다. 요청에 모델 비용이 발생할 수 있습니다.'));
 const profRow=el('label','ttk-field');profRow.append(el('strong','','번역용 연결 프로필'));const profileSelect=el('select');profRow.append(profileSelect);transSection.append(profRow);
 const profStatus=el('small','ttk-font-status');transSection.append(profStatus);
 const refreshProfiles=()=>{const profiles=promptTranslator.getProfiles();profileSelect.replaceChildren();const blank=el('option','','프로필 선택');blank.value='';profileSelect.append(blank);for(const profile of profiles){const o=el('option','',profile.name);o.value=profile.id;profileSelect.append(o);}profileSelect.value=profiles.some(p=>p.id===settings.promptTranslation.profileId)?settings.promptTranslation.profileId:'';profStatus.textContent=profiles.length?`${profiles.length}개 연결 프로필 사용 가능`:'지원되는 저장 연결 프로필이 없습니다. 연결 관리자를 확인하세요.';};
 profileSelect.addEventListener('change',()=>{settings.promptTranslation.profileId=profileSelect.value;save();promptTranslator.refresh();});
 const autoRow=el('label','ttk-module-row');autoRow.append(info('새 토글 이름 자동 번역','프롬프트를 전환하면 새 이름만 번역합니다.'));const autoCheck=el('input');autoCheck.type='checkbox';autoCheck.checked=settings.promptTranslation.autoTranslate;autoCheck.addEventListener('change',()=>{settings.promptTranslation.autoTranslate=autoCheck.checked;save();promptTranslator.refresh();});autoRow.append(autoCheck);transSection.append(autoRow);
 const status=el('p','ttk-note','번역용 프로필을 선택하세요.');status.setAttribute('aria-live','polite');transSection.append(status);
 const actionsRow=el('div','ttk-actions');actionsRow.append(btn('프로필 목록 새로고침',refreshProfiles));actionsRow.append(btn('현재 토글 번역',()=>promptTranslator.translateMissing(true)));transSection.append(actionsRow);
 const edits=el('details','ttk-subsection');edits.append(el('summary','','번역 결과 수정 및 캐시'));const editsBody=el('div','ttk-controls');edits.append(editsBody);transSection.append(edits);
 function renderEdits(){editsBody.replaceChildren();const items=Object.entries(settings.promptTranslation.cache).sort((a,b)=>a[0].localeCompare(b[0]));editsBody.append(el('p','ttk-note',`저장된 번역 ${items.length}개 · 원문 유지 ${settings.promptTranslation.kept.length}개 · 수정은 프롬프트 원본에 영향 없음`));for(const [original,value] of items){const row=el('label','ttk-field ttk-translation-edit');row.append(el('small','',original));const input=el('input');input.type='text';input.maxLength=100;input.value=value;const controls=el('div','ttk-actions');controls.append(btn('저장',()=>promptTranslator.setOverride(original,input.value)),btn('삭제',()=>promptTranslator.setOverride(original,'')));row.append(input,controls);editsBody.append(row);}editsBody.append(btn('번역 캐시 전체 삭제',async()=>{if(await confirmAsk('저장된 토글 번역을 모두 삭제할까요?',{ok:'삭제',danger:true}))promptTranslator.clearCache();}));}
 locBody.append(transSection);locPanel.hidden=!settings.modules.localization;body.append(locPanel);
 // Readonly rendering/translation controller; never writes the native preset.
 promptTranslator.onStatus=message=>{status.textContent=message;};promptTranslator.onCacheChanged=()=>{if(edits.open)renderEdits();};
 edits.addEventListener('toggle',()=>{if(edits.open)renderEdits();});refreshProfiles();

 // ---- 번역 ----
 const trPanel=el('details','ttk-section');trPanel.id='ttk-translation-section';trPanel.hidden=!settings.modules.translation;trPanel.append(el('summary','ttk-section-summary','번역 · AI 응답 / 내 입력'));
 const trBody=el('div','ttk-controls');trPanel.append(trBody);
 const conflictBox=el('div','ttk-conflict');conflictBox.setAttribute('role','alert');conflictBox.hidden=true;trBody.append(conflictBox);
 trBody.append(el('p','ttk-note','저장된 연결 프로필로 번역합니다. RP 연결은 바꾸지 않습니다. AI 응답의 번역은 화면에만 표시되고 모델에는 원문이 전달됩니다. 입력 번역을 쓰면 번역한 문장이 모델에 전달됩니다. 번역 결과는 채팅 파일에 함께 저장되어 다시 요청하지 않습니다.'));
 const T=()=>settings.translation;const trChanged=()=>{save();messageTranslator?.refresh();};
 const trProfRow=el('label','ttk-field');trProfRow.append(el('strong','','번역용 연결 프로필'));const trProfile=el('select');trProfRow.append(trProfile);trBody.append(trProfRow);
 const fillTrProfiles=()=>{const list=promptTranslator.getProfiles();trProfile.replaceChildren();const blank=el('option','','프로필 선택');blank.value='';trProfile.append(blank);for(const pf of list){const o=el('option','',pf.name);o.value=pf.id;trProfile.append(o);}trProfile.value=list.some(pf=>pf.id===T().profileId)?T().profileId:'';};
 trProfile.addEventListener('change',()=>{T().profileId=trProfile.value;trChanged();});
 const radioGroup=(title,name,options,key)=>{const box=el('fieldset','ttk-choice');box.append(el('legend','',title));for(const [value,label,desc] of options){const row=el('label','ttk-choice-row');const r=el('input');r.type='radio';r.name=name;r.value=value;r.checked=T()[key]===value;r.addEventListener('change',()=>{if(r.checked){T()[key]=value;trChanged();}});const text=el('span','ttk-option-label');text.append(el('strong','',label));if(desc)text.append(el('small','',desc));row.append(r,text);box.append(row);}trBody.append(box);return box;};
 radioGroup('AI 응답 표시','ttk-tr-display',[['replace','번역으로 교체','메시지에 번역만 보이고, 원문 보기로 전환합니다.'],['below','원문 아래에 번역 추가','원문을 테마에 맞춘 원문 칸에 두고 그 아래에 번역을 붙입니다.']],'display');
 const trAutoRow=el('label','ttk-module-row');trAutoRow.append(info('새 응답 자동 번역','끄면 메시지의 번역 버튼으로만 번역합니다. 지난 메시지는 자동 번역하지 않습니다.'));const autoBox=el('input');autoBox.type='checkbox';autoBox.checked=T().autoOutput;autoBox.addEventListener('change',()=>{T().autoOutput=autoBox.checked;trChanged();});trAutoRow.append(autoBox);trBody.append(trAutoRow);
 radioGroup('내 입력 번역','ttk-tr-input',[['auto','보낼 때 자동','한국어로 쓴 메시지를 보내기 직전에 번역해 모델에 전달합니다.'],['button','버튼으로만','입력창 왼쪽 번역 버튼을 눌렀을 때만 번역합니다.'],['off','끔','']],'inputMode');
 const langRow=el('label','ttk-field');langRow.append(el('strong','','입력을 번역할 언어'));const langSel=el('select');for(const [value,l] of Object.entries(INPUT_LANGUAGES)){const o=el('option','',l.label);o.value=value;langSel.append(o);}langSel.value=T().inputLang;langSel.addEventListener('change',()=>{T().inputLang=langSel.value;trChanged();});langRow.append(langSel);trBody.append(langRow);
 // v0.23: 번역 지시문 한 칸(응답·입력 공통) — 기본값 / 직접 입력
 const insBox=el('fieldset','ttk-choice');insBox.append(el('legend','','번역 지시문'));const insRadios={};
 const insField=el('div','ttk-field ttk-tr-instruction');const insText=el('textarea');insText.rows=8;insText.maxLength=CUSTOM_PROMPT_MAX;insText.placeholder='예: 대사는 반말을 유지하고, 지문은 현재형으로. 사투리는 표준어로 바꾸지 말 것.';insText.value=T().customPrompt;
 const insCount=el('small','ttk-font-status');const updateInsCount=()=>{insCount.textContent=`${insText.value.length} / ${CUSTOM_PROMPT_MAX}자`;};updateInsCount();
 const setInsMode=mode=>{T().promptMode=mode;for(const [v,r] of Object.entries(insRadios))r.checked=v===mode;insField.hidden=mode!=='custom';trChanged();};
 for(const [value,label,desc] of [['default','기본값','내장 지침을 씁니다. 응답 번역은 한국어 문체 지침(번역투 없이, 인물 말투 유지), 입력 번역은 그 언어로 처음 쓴 듯한 문장으로 옮깁니다.'],['custom','직접 입력','아래 칸의 지시문을 씁니다. 응답 번역에서는 내장 문체 지침 자리에, 입력 번역에서는 내장 지침 뒤에 들어갑니다. 칸이 비어 있으면 기본값과 같습니다.']]){const row=el('label','ttk-choice-row');const r=el('input');r.type='radio';r.name='ttk-tr-prompt';r.value=value;r.checked=T().promptMode===value;r.addEventListener('change',()=>{if(r.checked)setInsMode(value);});insRadios[value]=r;const text=el('span','ttk-option-label');text.append(el('strong','',label),el('small','',desc));row.append(r,text);insBox.append(row);}
 insText.addEventListener('input',updateInsCount);
 insText.addEventListener('change',()=>{settings.translation=normalizeTranslation({...T(),customPrompt:insText.value});insText.value=T().customPrompt;updateInsCount();trChanged();});
 const insActions=el('div','ttk-actions');insActions.append(btn('기본 지침 불러오기',async()=>{if(insText.value.trim()&&!(await confirmAsk('칸에 쓴 지시문을 기본 지침으로 바꿀까요?',{ok:'바꾸기'})))return;insText.value=KOREAN_STYLE;insText.dispatchEvent(new Event('change'));}),btn('기본값 복원',()=>setInsMode('default')));
 insField.append(insText,insCount,el('small','ttk-font-status','줄바꿈·마크다운·따옴표·HTML을 그대로 두라는 형식 규칙과 용어집은 어느 쪽이든 항상 함께 전달됩니다. "기본 지침 불러오기"는 한국어로 옮길 때의 문체 지침이라, 입력 번역에도 쓰려면 필요한 줄만 남기세요. "기본값 복원"은 기본값으로 돌아가며 칸의 내용은 지우지 않습니다.'),insActions);insField.hidden=T().promptMode!=='custom';
 trBody.append(insBox,insField);
 const tokRow=el('label','ttk-field');tokRow.append(el('strong','','최소 출력 토큰'),el('small','ttk-font-status','0이면 자동입니다. 추론 모델에서 빈 응답이 나오면 4000~8000으로 올려 보세요.'));const tok=el('input');tok.type='number';tok.min='0';tok.max='16000';tok.step='500';tok.value=String(T().minTokens);tok.addEventListener('change',()=>{settings.translation=normalizeTranslation({...T(),minTokens:tok.value});tok.value=String(T().minTokens);trChanged();});tokRow.append(tok);trBody.append(tokRow);
 const trStatus=el('p','ttk-note ttk-tr-status','');trStatus.setAttribute('aria-live','polite');trBody.append(trStatus);
 const trActions=el('div','ttk-actions');trActions.append(btn('프로필 목록 새로고침',fillTrProfiles),btn('보이는 응답 모두 번역',()=>{const n=messageTranslator.translateVisible();if(n)trStatus.textContent=`${n}개 응답 번역을 시작합니다.`;}),btn('이 채팅 번역 기록 삭제',async()=>{if(await confirmAsk('이 채팅에 저장된 번역을 모두 지울까요? 보낸 메시지의 번역 전 문장도 지워집니다.',{ok:'삭제',danger:true}))messageTranslator.clearChat();}));trBody.append(trActions);
 messageTranslator.onStatus=m=>{trStatus.textContent=m;};
 messageTranslator.onConflict=list=>{conflictBox.hidden=!list.length;if(!list.length)return;const ul=el('ul','');conflictBox.replaceChildren(el('strong','','다른 번역 확장이 켜져 있습니다'),el('p','',`감지됨: ${list.join(', ')}`),el('p','','두 확장이 같은 메시지를 번역하지 않도록 자동 번역을 멈췄습니다. 메시지의 번역 버튼은 계속 쓸 수 있습니다.'),ul);ul.append(el('li','','번역 모듈을 쓰려면 위 확장을 끄고 페이지를 새로고침하세요. 기본 번역은 자동 모드를 "없음"으로 바꾸면 됩니다.'),el('li','','다른 번역 확장을 계속 쓰려면 위의 모듈 목록에서 번역을 끄세요.'));const recheck=btn('다시 확인',()=>messageTranslator.checkConflicts());conflictBox.append(recheck);if(!conflictToastShown){conflictToastShown=true;globalThis.toastr?.warning?.(`${list.join(', ')}이(가) 켜져 있어 다락방의 자동 번역을 멈췄습니다. 하나만 켜 두세요. 자세한 안내는 다락방 › 번역에 있습니다.`,'번역 확장 중복',{timeOut:9000});}};
 fillTrProfiles();
 body.append(trPanel);

 // ---- 대필 ----
 const gwPanel=el('details','ttk-section');gwPanel.id='ttk-ghostwrite-section';gwPanel.hidden=!settings.modules.ghostwrite;gwPanel.append(el('summary','ttk-section-summary','대필 · 내 다음 메시지 쓰기'));
 const gwBody=el('div','ttk-controls');gwPanel.append(gwBody);
 gwBody.append(el('p','ttk-note','입력창 왼쪽의 깃펜 버튼을 누르면 지금 쓰는 RP 연결과 프리셋으로 내 캐릭터의 다음 메시지를 써서 입력창에 넣습니다. 자동으로 보내지 않으니 고친 뒤 직접 보내세요. 입력창에 메모나 대사를 적어 두면 그 방향대로 풀어 씁니다. 한 번 더 누르면 같은 방향으로 다시 쓰고, 되돌리기 버튼으로 대필 전 입력으로 돌아갑니다. 분량은 RP 연결의 프리셋(분량·출력 지침)을 그대로 따릅니다. 요청마다 RP 모델 사용량이 발생합니다.'));
 const G=()=>settings.ghostwrite;
 const gwLangRow=el('label','ttk-field');gwLangRow.append(el('strong','','쓰는 언어'));const gwLang=el('select');for(const [value,label] of [['ko','한국어 (번역 모듈의 입력 번역과 함께 쓰기 좋음)'],['chat','내 이전 메시지와 같은 언어']]){const o=el('option','',label);o.value=value;gwLang.append(o);}gwLang.value=G().language;gwLang.addEventListener('change',()=>{G().language=gwLang.value;save();});gwLangRow.append(gwLang);gwBody.append(gwLangRow);
 const gwInsRow=el('label','ttk-field');gwInsRow.append(el('strong','','항상 적용할 요청 (선택)'),el('small','ttk-font-status','예: 1인칭 현재형으로, 대사는 짧게, 속마음을 한 줄 넣기'));const gwIns=el('textarea');gwIns.rows=3;gwIns.maxLength=1000;gwIns.value=G().instruction;gwIns.addEventListener('change',()=>{settings.ghostwrite=normalizeGhostwrite({...G(),instruction:gwIns.value});save();});gwInsRow.append(gwIns);gwBody.append(gwInsRow);
 body.append(gwPanel);

 // ---- 용어집 (번역·대필 공용) ----
 const glPanel=el('details','ttk-section');glPanel.id='ttk-glossary-section';glPanel.hidden=!(settings.modules.translation||settings.modules.ghostwrite);glPanel.append(el('summary','ttk-section-summary','용어집 · 이름과 고유명사 (번역·대필 공용)'));
 const glBody=el('div','ttk-controls');glPanel.append(glBody);
 glBody.append(el('p','ttk-note','번역과 대필이 같은 이름·고유명사를 쓰도록 맞춰 두는 칸입니다. 한 줄에 하나씩 "원어 = 한국어"로 적으세요. 예: Lancer = 랜서, The Church = 교회, Holy Grail War = 성배전쟁. 순서는 뒤바뀌어도 되고 메모도 적을 수 있습니다(예: 아처는 반말 쓰는 사이). 번역과 대필 요청마다 함께 전달되어 토큰이 조금 더 듭니다.'));
 const glRow=el('label','ttk-field');glRow.append(el('strong','','용어집'),el('small','ttk-font-status',`최대 ${GLOSSARY_MAX}자`));const glText=el('textarea');glText.rows=7;glText.maxLength=GLOSSARY_MAX;glText.placeholder='Lancer = 랜서\nThe Church = 교회';glText.value=settings.glossary;glText.addEventListener('change',()=>{settings.glossary=normalizeGlossary(glText.value);glText.value=settings.glossary;save();});glRow.append(glText);glBody.append(glRow);
 body.append(glPanel);

 // ---- QR 보관함 ----
 const qrPanel=el('details','ttk-section');qrPanel.id='ttk-qr-section';qrPanel.hidden=!settings.modules.qr;qrPanel.append(el('summary','ttk-section-summary','QR 보관함'));
 const qrBody=el('div','ttk-controls');qrPanel.append(qrBody);
 qrBody.append(el('p','ttk-note','입력창의 QR 버튼(상자 모양)으로 보관함을 엽니다. "QR 실행"에서 세트별로 찾아 눌러 실행하고, "세트 관리"에서 세트를 전역·채팅별로 켜고 끄거나 가져오기·내보내기·전체 백업을 합니다. QR 자체는 SillyTavern의 Quick Reply 확장에 그대로 저장되며, 만들기와 편집은 확장 › Quick Reply에서 합니다.'));
 const qrOpt=(label,desc,key)=>{const row=el('label','ttk-module-row');row.append(info(label,desc));const c=el('input');c.type='checkbox';c.checked=settings.qr[key];c.addEventListener('change',()=>{settings.qr[key]=c.checked;save();qrVault.applyBar();});row.append(c);qrBody.append(row);};
 qrOpt('입력창 위 QR 바 숨기기','보관함으로 대신 쓰고 화면을 넓힙니다. 끄면 원래 QR 바도 함께 보입니다.','hideBar');
 qrOpt('실행하면 보관함 닫기','끄면 여러 QR을 이어서 누를 수 있습니다.','closeOnRun');
 body.append(qrPanel);

 // ---- 통합 조회 ----
 const invPanel=el('details','ttk-section');invPanel.id='ttk-inventory-section';invPanel.hidden=!settings.modules.inventory;invPanel.append(el('summary','ttk-section-summary','통합 조회 · 테마 / 프롬프트 / 확장 점검'));
 const invBody=el('div','ttk-controls');invPanel.append(invBody);
 invBody.append(el('p','ttk-note','설치된 UI 테마, 채팅 완성 프리셋(프롬프트), 확장을 한 창에서 확인하고 오류와 충돌을 점검합니다. 읽기만 하며 아무것도 바꾸지 않습니다. 마법봉 메뉴의 "통합 조회"로도 열 수 있습니다. 확장의 스크립트 오류는 이 모듈을 켠 뒤에 발생한 것만 기록됩니다.'));
 const invActions=el('div','ttk-actions');invActions.append(btn('통합 조회 열기',()=>inventory.open()));invBody.append(invActions);
 body.append(invPanel);

 // ---- 프로필 사진 ----
 const avPanel=el('details','ttk-section');avPanel.id='ttk-avatars-section';avPanel.hidden=!settings.modules.avatars;avPanel.append(el('summary','ttk-section-summary','프로필 사진'));
 const avBody=el('div','ttk-controls');avPanel.append(avBody);
 avBody.append(el('p','ttk-note',`봇 캐릭터와 내 페르소나마다 사진을 최대 ${MAX_PER_OWNER}장까지 등록합니다. SillyTavern의 원래 아바타 파일은 바꾸지 않고, 채팅에 보이는 사진만 바꿉니다. 사진은 서버의 사용자 파일로 올라가며 긴 변 512px로 줄입니다.`));
 avBody.append(el('p','ttk-note','입력창 옆 "프로필 사진" 버튼에서 등록하고 기본 사진을 고릅니다. 새 메시지는 그 시점의 기본 사진을 기억하므로 이전 메시지는 바뀌지 않습니다. 메시지마다 바꾸려면 메시지의 ⋯ 메뉴에 생기는 ID 아이콘을 쓰세요.'));
 const avActions=el('div','ttk-actions');avActions.append(btn('프로필 사진 열기',()=>avatars.open()));avBody.append(avActions);
 body.append(avPanel);

 // ---- 화자 얼굴 ----
 const faPanel=el('details','ttk-section');faPanel.id='ttk-faces-section';faPanel.hidden=!settings.modules.faces;faPanel.append(el('summary','ttk-section-summary','화자 얼굴'));
 if(faces)faPanel.append(faces.buildPanel(btn));
 body.append(faPanel);

 // ---- 테마 이미지 교체 ----
 const tiPanel=el('details','ttk-section');tiPanel.id='ttk-themeimg-section';tiPanel.hidden=!settings.modules.themeImages;tiPanel.append(el('summary','ttk-section-summary','테마 이미지 교체'));
 const tiBody=el('div','ttk-controls');tiPanel.append(tiBody);
 tiBody.append(el('p','ttk-note','현재 테마의 사용자 CSS에서 이미지 주소를 찾아, 항목마다 내 파일로 바꿉니다. 테마 파일은 건드리지 않고 이 브라우저에만 저장되며 테마별로 따로 기억합니다. 다른 기기에서는 다시 지정해야 합니다.'));
 tiBody.append(el('p','ttk-note','"테마 이미지 교체"가 만든 스타일은 사용자 CSS 뒤에 덧붙여 적용됩니다. 끄면 바로 원래대로 돌아갑니다.'));
 const tiActions=el('div','ttk-actions');tiActions.append(btn('테마 이미지 교체 열기',()=>themeImages.open()));tiBody.append(tiActions);
 body.append(tiPanel);

 // ---- 이미지 모아보기 ----
 const galPanel=el('details','ttk-section');galPanel.id='ttk-gallery-section';galPanel.hidden=!settings.modules.gallery;galPanel.append(el('summary','ttk-section-summary','이미지 모아보기'));
 const galBody=el('div','ttk-controls');galPanel.append(galBody);
 galBody.append(el('p','ttk-note','이 채팅의 메시지에 붙은 이미지와, 서버에 저장된 이미지 폴더를 한 창에서 봅니다. 읽기 전용이라 아무것도 바꾸거나 지우지 않습니다. 마법봉 메뉴의 "이미지 모아보기"로도 열 수 있습니다.'));
 const galActions=el('div','ttk-actions');galActions.append(btn('이미지 모아보기 열기',()=>gallery.open()));galBody.append(galActions);
 body.append(galPanel);

 // ---- 날씨·분위기 ----
 const wxPanel=el('details','ttk-section');wxPanel.id='ttk-weather-section';wxPanel.hidden=!settings.modules.weather;wxPanel.append(el('summary','ttk-section-summary','날씨 · 분위기'));
 if(weather)wxPanel.append(weather.buildPanel(btn));
 body.append(wxPanel);

 // ---- 모바일 최적화 ----
 const optPanel=el('details','ttk-section');optPanel.id='ttk-optimization-section';optPanel.hidden=!settings.modules.optimization;optPanel.append(el('summary','ttk-section-summary','모바일 최적화'));
 const optBody=el('div','ttk-controls');optPanel.append(optBody);
 optBody.append(el('p','ttk-note','다른 모듈과 따로 동작하는 성능 모듈입니다. 디자인·번역 등을 꺼도 켤 수 있고, 이 모듈을 꺼도 다른 모듈은 그대로입니다. SillyTavern 설정은 바꾸지 않으며 끄면 즉시 원래대로 돌아갑니다.'));
 const optState=el('p','ttk-note ttk-opt-state','');optState.setAttribute('aria-live','polite');optBody.append(optState);
 const O=()=>settings.optimization;const optChanged=()=>{save();optimizer.apply();};
 const optScope=el('fieldset','ttk-choice');optScope.append(el('legend','','적용 대상'));for(const [value,label,desc] of [['mobile','모바일에서만','화면 폭 1000px 이하이거나 터치 기기일 때만 적용합니다.'],['always','항상','PC에서도 적용합니다. 사양이 낮은 PC에 유용합니다.']]){const row=el('label','ttk-choice-row');const r=el('input');r.type='radio';r.name='ttk-opt-scope';r.value=value;r.checked=O().scope===value;r.addEventListener('change',()=>{if(r.checked){O().scope=value;optChanged();}});const text=el('span','ttk-option-label');text.append(el('strong','',label),el('small','',desc));row.append(r,text);optScope.append(row);}optBody.append(optScope);
 const optRow=(label,desc,key)=>{const row=el('label','ttk-module-row');row.append(info(label,desc));const c=el('input');c.type='checkbox';c.checked=O()[key];c.addEventListener('change',()=>{O()[key]=c.checked;optChanged();});row.append(c);optBody.append(row);};
 optRow('화면 밖 메시지 그리기 건너뛰기','보이지 않는 메시지의 배치와 그리기를 미뤄 긴 채팅의 스크롤과 입력 반응을 가볍게 합니다. 마지막 메시지와 편집 중인 메시지는 제외합니다. 메시지 이미지는 비동기로 디코딩합니다.','offscreen');
 optRow('블러·그림자 효과 끄기','배경 흐림(blur)과 글자·상자 그림자를 끕니다. 휴대폰에서 부담이 큰 효과입니다.','effects');
 optRow('입력할 때 화면 확대 방지','입력칸 글자를 16px 이상으로 맞춰 iOS가 입력할 때 화면을 확대하지 않게 합니다.','zoom');
 optRow('애니메이션 줄이기','전환·움직임 효과를 없앱니다. 로딩 표시 회전은 유지합니다. 화면이 딱딱하게 느껴질 수 있어 기본은 꺼짐입니다.','motion');
 optBody.append(el('p','ttk-note','함께 보면 좋은 SillyTavern 설정: 사용자 설정의 "불러올 메시지 수"를 50~100으로 두면 긴 채팅을 여는 속도가 가장 크게 좋아집니다. 이 값은 도구함이 바꾸지 않습니다.'));
 body.append(optPanel);
 optimizer.onState=st=>{optState.textContent=!st.enabled?'':st.active?`적용 중 · ${st.mobile?'모바일 화면':'PC 화면'} · 현재 표시된 메시지 ${st.messages}개`:'대기 중 · 지금은 PC 화면이라 적용하지 않습니다. PC에서도 쓰려면 적용 대상을 "항상"으로 바꾸세요.';};

 const section=el('details','ttk-section');section.id='ttk-theme-section';section.hidden=!settings.modules.design;section.append(el('summary','ttk-section-summary','테마 및 가독성 설정'));
 const controls=el('div','ttk-controls');section.append(controls);body.append(section);
 // v0.23.6: 미리보기는 기본이 고정 해제 — 필요할 때만 머리말의 '고정'으로 화면 위에 붙입니다(기기별 저장).
 const preview=el('div','ttk-mini-preview');preview.setAttribute('aria-label','테마 미리보기');
 const previewHead=el('div','ttk-preview-header');previewHead.append(el('span','','미리보기 · 실시간'));
 const PIN_KEY='darak-preview-pin';const pinned=()=>{try{return localStorage.getItem(PIN_KEY)==='on';}catch{return false;}};
 const pinBtn=el('button','ttk-preview-pin','고정');pinBtn.type='button';
 const syncPin=()=>{const on=pinned();preview.dataset.pinned=on?'true':'false';pinBtn.setAttribute('aria-pressed',String(on));pinBtn.title=on?'미리보기 고정 해제':'미리보기를 화면 위에 고정';};
 pinBtn.addEventListener('click',()=>{try{localStorage.setItem(PIN_KEY,pinned()?'off':'on');}catch{}syncPin();});
 previewHead.append(pinBtn);syncPin();
 const previewBox=el('div','ttk-preview-message');
 const previewName=el('strong','ttk-preview-name','CHARACTER');
 const narration=el('p','ttk-preview-narration','그는 창밖을 바라보다 천천히 고개를 돌렸다. 비에 젖은 유리창 너머로 가로등 불빛이 번지고, 방 안에는 식어 가는 ');narration.append(el('em','','찻잔의 김'),document.createTextNode('만 희미하게 남아 있었다.'));
 const dialogue=el('p','ttk-preview-dialogue','“오늘은 여기까지 이야기해도 괜찮아. 나머지는 내일 다시 듣고 싶어.”');
 const narration2=el('p','ttk-preview-narration','소리 없이 책장이 넘어갔다. 짧은 침묵이 이어지는 동안 누구도 먼저 입을 열지 않았고, 시계 초침 소리만 또렷하게 들렸다.');
 previewBox.append(previewName,narration,dialogue,narration2);preview.append(previewHead,previewBox);controls.append(preview);
 // v0.23: 테마는 한 줄 4칸 칩(색 견본 + 이름), 설명은 고른 테마 하나만 아래에.
 const themes=el('div','ttk-theme-chips');themes.setAttribute('role','group');themes.setAttribute('aria-label','테마');const themeButtons=[];
 for(const [id,t] of Object.entries(THEMES)){
   const b=btn('',()=>{settings.design=selectTheme(settings.design,id);syncControls();changed();},'ttk-theme-chip');b.title=t.name;b.style.setProperty('--ttk-sample-bg',t.bg);b.style.setProperty('--ttk-sample-surface',t.surface);b.style.setProperty('--ttk-sample-text',t.text);b.style.setProperty('--ttk-sample-accent',t.accent);
   const sw=el('span','ttk-theme-swatch');sw.append(el('span','ttk-theme-swatch-line'),el('span','ttk-theme-swatch-chip'));
   b.append(sw,el('strong','',t.name.split(' · ')[0]));themes.append(b);themeButtons.push([id,b]);
 }
 const themeDesc=el('p','ttk-theme-desc');
 controls.append(themes,themeDesc);
 controls.append(el('p','ttk-note','테마를 바꾸면 팔레트와 레이아웃만 바뀌고, 폰트와 가독성 설정은 그대로입니다.'));
 // v0.23: 글꼴 목록의 각 이름을 그 글꼴로 표시합니다. 목록을 열었을 때 화면에 보이는 글꼴만 불러옵니다.
 let openPicker=null;
 // 패널을 다시 만들어도(설정 가져오기 등) 리스너가 쌓이지 않게, 이전 것을 떼고 새로 붙입니다.
 if(globalThis.__ttkFontPickerDown)document.removeEventListener('pointerdown',globalThis.__ttkFontPickerDown,true);
 globalThis.__ttkFontPickerDown=e=>{if(openPicker&&!openPicker.contains(e.target))openPicker.close();};
 document.addEventListener('pointerdown',globalThis.__ttkFontPickerDown,true);
 function makeFontRow(title,key){
  const row=el('div','ttk-field ttk-font-field');const label=el('strong','',title);const labelId=`ttk-font-label-${key}`;label.id=labelId;row.append(label);
  const wrap=el('div','ttk-font-picker');
  const trigger=el('button','ttk-font-trigger');trigger.type='button';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-labelledby',labelId);
  const list=el('div','ttk-font-list');list.setAttribute('role','listbox');list.hidden=true;
  const options=new Map();let io=null,current=settings.design[key];
  const build=()=>{list.replaceChildren();options.clear();io?.disconnect?.();io=null;
  for(const [category,groupLabel] of Object.entries(FONT_GROUPS)){
    const ids=Object.keys(FONTS).filter(id=>FONTS[id].category===category);if(!ids.length)continue;
    list.append(el('div','ttk-font-group',groupLabel));list.lastChild.setAttribute('role','presentation');
    for(const id of ids){const f=FONTS[id];const o=el('div','ttk-font-option',f.name);o.tabIndex=-1;o.setAttribute('role','option');o.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();o.click();}});o.dataset.font=id;o.style.setProperty('font-family',f.family,'important');o.addEventListener('click',()=>{api.close();if(current===id)return;api.value=id;settings.design[key]=id;syncPreview();changed();updateStatus();trigger.focus();});options.set(id,o);list.append(o);}
  }};build();
  const note=el('small','ttk-font-status');
  const paint=()=>{const f=FONTS[current];trigger.textContent=f?.name||'';if(f?.family)trigger.style.setProperty('font-family',f.family,'important');else trigger.style.removeProperty('font-family');for(const [id,o] of options)o.setAttribute('aria-selected',String(id===current));};
  const api={
   get value(){return current;},set value(v){current=FONTS[v]?v:current;paint();},
   contains:n=>wrap.contains(n),
   open(){if(openPicker&&openPicker!==api)openPicker.close();openPicker=api;list.hidden=false;trigger.setAttribute('aria-expanded','true');fontPreviewNode(current);
    if(!io&&typeof IntersectionObserver!=='undefined')io=new IntersectionObserver(entries=>{for(const en of entries)if(en.isIntersecting){fontPreviewNode(en.target.dataset.font);io.unobserve(en.target);}},{root:list,rootMargin:'80px 0px'});
    if(io)for(const o of options.values())io.observe(o);else for(const id of options.keys())fontPreviewNode(id);
    const sel=options.get(current);if(sel){list.scrollTop=Math.max(0,sel.offsetTop-list.clientHeight/2);sel.focus({preventScroll:true});}},
   close(){if(list.hidden)return;list.hidden=true;trigger.setAttribute('aria-expanded','false');if(openPicker===api)openPicker=null;},
  };
  trigger.addEventListener('click',()=>list.hidden?api.open():api.close());
  list.addEventListener('keydown',e=>{const items=[...options.values()],i=items.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();api.close();trigger.focus();}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const n=items[Math.min(items.length-1,Math.max(0,i+(e.key==='ArrowDown'?1:-1)))];n?.focus();}});
  const updateStatus=async()=>{
    const id=current,f=FONTS[id];if(!f)return;
    if(f.source==='web'){
      note.textContent='웹폰트 불러오는 중…';
      const first=[].concat(f.face||[])[0]?.family?`'${[].concat(f.face)[0].family}'`:f.family.split(',')[0];
      try{
        await new Promise(r=>setTimeout(r,60));
        await document.fonts?.load?.(`16px ${first}`,'가나다 Abc');
        if(current!==id)return;
        note.textContent=document.fonts?.check?.(`16px ${first}`,'가나다 Abc')?'웹폰트 적용됨 · 선택한 글꼴만 인터넷에서 불러옵니다':'웹폰트를 불러오지 못했습니다 · 인터넷 연결을 확인하세요. 기기 기본 글꼴로 표시됩니다';
      }catch{if(current===id)note.textContent='웹폰트를 불러오지 못했습니다 · 기기 기본 글꼴로 표시됩니다';}
    }else{note.textContent='시스템 기본 글꼴';}
  };
  api.updateStatus=updateStatus;api.rebuild=()=>{build();paint();};paint();
  wrap.append(trigger,list);row.append(wrap,note);controls.append(row);return api;
 }
 // ---- 지문·대사 서식 (v1.1.0) ---- 굵기 · 기울임 · 밑줄. 안내 문구는 화면에 항상 보이는 글로 두고, 마우스를 올려야 뜨는 설명은 쓰지 않는다.
 let narrStyle=null,dlgStyle=null,emphPaint=null;
 function makeStyleRow(title,styleKey,fontKey,isDialogue){
  const box=el('div','ttk-field ttk-style-field');box.append(el('strong','',`${title} 서식`));
  const seg=(label,items,onPick)=>{const wrap=el('div','ttk-style-line');wrap.append(el('small','ttk-style-sub',label));const g=el('div','ttk-seg');g.setAttribute('role','group');g.setAttribute('aria-label',`${title} ${label}`);const map={};for(const [value,text] of items){const b=el('button','ttk-seg-btn',text);b.type='button';b.addEventListener('click',()=>onPick(value));map[value]=b;g.append(b);}wrap.append(g);box.append(wrap);return map;};
  const wBtns=seg('굵기',WEIGHT_STEPS,v=>{settings.design[styleKey].weight=v;syncPreview();changed();});
  const iLine=el('div','ttk-style-line');iLine.append(el('small','ttk-style-sub','기울임'));
  const iRow=el('label','ttk-style-check');const iBox=el('input');iBox.type='checkbox';iBox.addEventListener('change',()=>{settings.design[styleKey].italic=iBox.checked;syncPreview();changed();});iRow.append(iBox,el('span','','기울임체'));iLine.append(iRow);box.append(iLine);
  const uBtns=seg('밑줄',UNDERLINES,v=>{settings.design[styleKey].underline=v;syncPreview();changed();});
  const note=el('small','ttk-note ttk-style-note');box.append(note);
  controls.append(box);
  return {paint(){
   const st=settings.design[styleKey],fid=settings.design[fontKey];
   for(const [v,b] of Object.entries(wBtns)){b.setAttribute('aria-pressed',String(st.weight===v));b.dataset.dim=String(v!=='auto'&&!resolveWeight(fid,v).exact);}
   iBox.checked=!!st.italic;
   const overlap=isDialogue&&settings.design.theme==='nocturne';
   for(const [v,b] of Object.entries(uBtns)){b.setAttribute('aria-pressed',String(st.underline===v));b.dataset.dim=String(overlap&&v==='marker');}
   const ws=fontWeights(fid);
   const lines=[ws?`이 글꼴이 가진 굵기는 ${ws.join('·')}입니다. 흐리게 보이는 단계는 이 글꼴에 없는 굵기라 가까운 굵기로 표시됩니다.`:'이 글꼴이 가진 굵기를 알 수 없어서 모든 단계를 고를 수 있습니다.'];
   lines.push(isDialogue?'굵기 \'기본\'은 테마 기본 그대로입니다(Paper·Nocturne의 대사는 굵게).':'굵기 \'기본\'은 테마 기본 그대로입니다.');
   if(overlap)lines.push('Nocturne 대사는 자막식 배경이 이미 깔려 있어서 형광펜이 흐리게 보이지만, 고르면 그 위에 연하게 겹쳐 적용됩니다.');
   note.textContent=lines.join(' ');
  }};
 }
 const font=makeFontRow('지문 폰트','font');
 narrStyle=makeStyleRow('지문','narrationStyle','font',false);
 const dialogueFont=makeFontRow('대사 폰트','dialogueFont');
 dlgStyle=makeStyleRow('대사','dialogueStyle','dialogueFont',true);
 {const row=el('label','ttk-field ttk-emph-row');const box=el('input');box.type='checkbox';box.addEventListener('change',()=>{settings.design.emphasis=box.checked;syncPreview();changed();});row.append(box,el('span','','강조 서식 (*강조*를 기울임 + 한 단계 굵게로 구분)'));
  const note=el('small','ttk-note ttk-emph-note');controls.append(row,note);
  emphPaint=()=>{box.checked=settings.design.emphasis===true;const m=emphasisOf(settings.design.font,settings.design.narrationStyle.weight);note.textContent=`지문 전체를 *별표*로 감싸 쓰는 봇이라면 켜지 않는 편이 좋습니다. 켜도 한 문단의 지문 80% 이상이 별표로 감싸져 있으면 강조가 아니라 지문 서식으로 보고 뺍니다. 지금 지문 글꼴·굵기에서는 ${m.mode==='weight'?'한 단계 굵게':'포인트 색(더 굵게 할 수 없어서)'}로 구분합니다.`;};}
 // ---- 내 글꼴 추가 (v0.24.0) ----
 const ufSection=el('details','ttk-subsection');ufSection.append(el('summary','','내 글꼴 추가'));
 ufSection.append(el('p','ttk-note',`웹폰트를 세 칸으로 추가합니다. 세 번째 칸에는 CSS 주소(Google Fonts 등), 글꼴 파일 주소(woff2·woff·ttf·otf), @font-face 코드 중 아무거나 붙여 넣으면 알아서 구분합니다. 최대 ${USER_FONT_MAX}개, https 주소만 쓸 수 있고 고른 글꼴만 불러옵니다.`));
 const ufField=(title,node)=>{const r=el('label','ttk-field ttk-uf-field');r.append(el('strong','',title),node);return r;};
 const ufName=el('input');ufName.type='text';ufName.placeholder='예: 부크크 명조';ufName.maxLength=60;
 const ufFamily=el('input');ufFamily.type='text';ufFamily.placeholder='예: BookkMyungjo (@font-face 코드면 비워도 됩니다)';ufFamily.maxLength=60;
 const ufSrc=el('textarea');ufSrc.rows=5;ufSrc.placeholder="https://…  또는  @font-face{font-family:'이름';src:url('https://…/font.woff2') format('woff2');}";ufSrc.maxLength=20000;
 const ufMsg=el('small','ttk-note');ufMsg.setAttribute('role','status');
 const ufList=el('div','ttk-uf-list');
 const ufAdd=btn('추가',()=>addUserFont());
 function refreshFontRows(){for(const r of [font,dialogueFont]){r.rebuild();}}
 function renderUf(){ufList.replaceChildren();const n=settings.userFonts.length;ufAdd.disabled=n>=USER_FONT_MAX;
  if(!n){ufList.append(el('small','ttk-note','추가한 글꼴이 없습니다.'));return;}
  ufList.append(el('small','ttk-note',`추가한 글꼴 ${n}/${USER_FONT_MAX}`));
  for(const u of settings.userFonts){const r=el('div','ttk-uf-item');const nm=el('span','',u.name);nm.style.setProperty('font-family',FONTS[userFontId(u)]?.family||'inherit','important');
   const del=btn('삭제',async()=>{if(!await confirmAsk(`"${u.name}" 글꼴을 목록에서 지울까요?`))return;settings.userFonts=settings.userFonts.filter(x=>x.id!==u.id);setUserFonts(settings.userFonts);settings.design=normalizeDesign(settings.design);refreshFontRows();syncControls();renderUf();changed();});
   r.append(nm,del);ufList.append(r);}}
 async function addUserFont(){
  ufMsg.textContent='';
  if(settings.userFonts.length>=USER_FONT_MAX){ufMsg.textContent=`글꼴은 최대 ${USER_FONT_MAX}개까지 추가할 수 있습니다.`;return;}
  const src=ufSrc.value.trim();
  if(!src){ufMsg.textContent='세 번째 칸에 주소나 @font-face 코드를 넣어 주세요.';return;}
  const kind=/@font-face/i.test(src)?'face':/^https:\/\/[^\s]+$/i.test(src)?(/\.(woff2|woff|ttf|otf)$/i.test(src.split(/[?#]/)[0])?'file':'css'):'';
  if(!kind){ufMsg.textContent='https:// 로 시작하는 주소 한 줄이거나 @font-face 코드여야 합니다. (http 주소, @import는 쓸 수 없습니다)';return;}
  if(kind==='face'&&!sanitizeFontFaceCode(src)){ufMsg.textContent='@font-face 코드를 읽지 못했습니다. font-family와 https 주소의 src가 있는지 확인해 주세요.';return;}
  if(kind!=='face'&&!ufFamily.value.trim()){ufMsg.textContent='글꼴 이름(font-family)을 적어 주세요. 주소 안의 CSS에 적힌 font-family 이름과 같아야 합니다.';return;}
  const next=normalizeUserFonts([...settings.userFonts,{kind,name:ufName.value,family:ufFamily.value,url:src,code:src}]);
  if(next.length!==settings.userFonts.length+1){ufMsg.textContent='추가하지 못했습니다. 입력한 값을 확인해 주세요.';return;}
  settings.userFonts=next;setUserFonts(next);const added=next[next.length-1];
  ufName.value='';ufFamily.value='';ufSrc.value='';
  refreshFontRows();renderUf();save();
  const id=userFontId(added);ufMsg.textContent=`"${added.name}" 추가됨 · 불러오는지 확인 중…`;
  try{fontPreviewNode(id);await new Promise(r=>setTimeout(r,80));const fam=FONTS[id].family.split(',')[0];await document.fonts?.load?.(`16px ${fam}`,'가나다 Abc');
   ufMsg.textContent=document.fonts?.check?.(`16px ${fam}`,'가나다 Abc')?`"${added.name}" 추가됨 · 불러오기 확인됨. 위 글꼴 목록의 "내 글꼴"에서 고르세요.`:`"${added.name}" 추가됨 · 하지만 지금은 불러오지 못했습니다. 주소와 글꼴 이름을 확인해 주세요. (목록에서 지울 수 있습니다)`;
  }catch{ufMsg.textContent=`"${added.name}" 추가됨 · 불러오기를 확인하지 못했습니다. 주소와 글꼴 이름을 확인해 주세요.`;}
 }
 const ufActions=el('div','ttk-actions');ufActions.append(ufAdd);
 ufSection.append(ufField('표시명',ufName),ufField('글꼴 이름 (font-family)',ufFamily),ufField('주소 또는 CSS 코드',ufSrc),ufActions,ufMsg,ufList);
 renderUf();controls.append(ufSection);
 const dialogueColorRow=el('label','ttk-color-field ttk-dialogue-color-row');dialogueColorRow.append(el('strong','','대사 글자색'));
 const dialogueColorInput=el('input');dialogueColorInput.type='color';dialogueColorInput.title='현재 테마의 대사 색상';
 dialogueColorInput.addEventListener('input',()=>{settings.design.dialogueColors[settings.design.theme]=dialogueColorInput.value;syncPreview();changed();});
 dialogueColorRow.append(dialogueColorInput);controls.append(dialogueColorRow);

 controls.append(el('p','ttk-note','“큰따옴표” 또는 「낫표」로 묶인 대사를 화면에서만 구분합니다. HTML 서식으로 끊긴 대사, 따옴표 없는 대사는 지문 폰트가 유지될 수 있습니다.'));
 const sliders=el('div','ttk-slider-grid');slider(sliders,'글자 크기','size',10,23,1,v=>`${v}px`,syncPreview);slider(sliders,'줄간격','lineHeight',1.4,2.4,.05,v=>Number(v).toFixed(2),syncPreview);slider(sliders,'자간','letterSpacing',-.6,1.8,.1,v=>`${Number(v).toFixed(1)}px`,syncPreview);slider(sliders,'문단 간격','paragraphSpacing',0,32,1,v=>`${v}px`,syncPreview);controls.append(sliders);
 const photoRow=el('div','ttk-field ttk-photo-row');photoRow.append(el('strong','','메시지 프로필 사진'));const photoSeg=el('div','ttk-seg');photoSeg.setAttribute('role','group');photoSeg.setAttribute('aria-label','메시지 프로필 사진');const photoBtns={};for(const [value,label] of PHOTO_SIZES){const b=el('button','ttk-seg-btn',label);b.type='button';b.addEventListener('click',()=>{settings.design.photoSize=value;syncPhoto();changed();});photoBtns[value]=b;photoSeg.append(b);}photoRow.append(photoSeg,el('small','ttk-note','끄면 사진 없이 이름과 시간만 표시합니다. 작게·크게는 테마 기본 크기를 기준으로 사진만 줄이거나 키웁니다.'));controls.append(photoRow);
 const syncPhoto=()=>{for(const [v,b] of Object.entries(photoBtns))b.setAttribute('aria-pressed',String(settings.design.photoSize===v));};syncPhoto();
 const colors=el('details','ttk-subsection');colors.open=true;colors.append(el('summary','','테마 컬러 변경 · 컬러칩')); const grid=el('div','ttk-color-grid');const colorInputs={};const paletteLabels={bg:'전체 배경',surface:'패널',raised:'보조 패널',text:'본문 글자',muted:'보조 글자',accent:'강조색',border:'테두리',user:'사용자 메시지',ai:'AI 메시지'};
 for(const [key,label] of Object.entries(paletteLabels)){const cell=el('label','ttk-color-field');cell.append(el('span','',label));const input=el('input');input.type='color';input.addEventListener('input',()=>{settings.design.palettes[settings.design.theme][key]=input.value;settings.design.custom=settings.design.palettes[settings.design.theme];syncPreview();changed();});cell.append(input);grid.append(cell);colorInputs[key]=input;}
 colors.append(grid);
 // Per-theme palette chips: clicking changes the entire palette rather than only accent.
 const chips=el('div','ttk-accent-chip-wrap');chips.append(el('strong','','테마 컬러 조합'));
 const chipRow=el('div','ttk-palette-chips');
 // v0.12.0: four chips per theme; the first/default-named chip of each theme is the base palette (override {}).
 const variantDefs={paper:[['상아',{}],['세피아',{bg:'#EBDFC6',surface:'#F3EAD6',raised:'#E6D9BC',text:'#3A2E20',muted:'#6A5A44',accent:'#7A4F2A',border:'#D2C3A2',user:'#EFE4CC',ai:'#F3EAD6'}],['한지',{bg:'#F2EFE3',surface:'#FAF8F0',raised:'#EAE6D6',text:'#262622',muted:'#66655A',accent:'#8A3A3A',border:'#DCD8C6',user:'#F0EDDF',ai:'#FAF8F0'}],['로즈',{bg:'#F6ECEA',surface:'#FCF6F5',raised:'#F0E3E1',text:'#302628',muted:'#6E5A5E',accent:'#96506A',border:'#E8D6D6',user:'#F7EAE8',ai:'#FCF6F5'}]],nocturne:[['은빛',{}],['골드 시네마',{bg:'#12100C',surface:'#1E1A13',raised:'#26211A',text:'#F0E9DA',muted:'#B3A890',accent:'#D3B46D',border:'#5F513B',user:'#26211A',ai:'#1E1A13'}],['필름 느와르',{bg:'#0F0F10',surface:'#1A1A1B',raised:'#232324',text:'#F0F0F0',muted:'#ABABAB',accent:'#DADADA',border:'#444444',user:'#232324',ai:'#1A1A1B'}],['보랏빛 밤',{bg:'#161226',surface:'#221C36',raised:'#2A2342',text:'#F3EDFB',muted:'#BBAFD0',accent:'#C6AEEC',border:'#52477A',user:'#2A2342',ai:'#221C36'}]],porcelain:[['클래식',{}],['로얄',{bg:'#FBFBF8',surface:'#FFFFFF',raised:'#E8EEF9',text:'#142346',muted:'#4F5C7C',accent:'#1B3A7A',border:'#8EA3CC',user:'#F0F4FB',ai:'#FFFFFF'}],['청자',{bg:'#F8FBF9',surface:'#FFFFFF',raised:'#E6F1EE',text:'#1C3531',muted:'#4F6A65',accent:'#3E7F78',border:'#AFCFC8',user:'#F0F7F5',ai:'#FFFFFF'}],['트림',{bg:'#FDFCF6',surface:'#FFFFFF',raised:'#F3F0E3',text:'#1E2A4A',muted:'#5A6683',accent:'#2F4F8F',border:'#B8964F',user:'#F8F6EC',ai:'#FFFFFF'}]],studio:[['세이지',{bg:'#F2F5F1',surface:'#FFFFFF',raised:'#E7EDE6',text:'#1F2A22',muted:'#5C6B5F',accent:'#4F6F5A',border:'#D4DED3',user:'#F4F7F3',ai:'#FFFFFF'}],['블루 그레이',{}],['피치',{bg:'#FAF4F1',surface:'#FFFFFF',raised:'#F3E7E1',text:'#2E2420',muted:'#6E5C54',accent:'#A5614B',border:'#EBD6CC',user:'#FCF7F4',ai:'#FFFFFF'}],['라벤더',{bg:'#F6F4FA',surface:'#FFFFFF',raised:'#ECE8F4',text:'#25203A',muted:'#625B7A',accent:'#66588F',border:'#DDD7EC',user:'#F9F7FC',ai:'#FFFFFF'}]]};
 function renderPaletteChips(){chipRow.replaceChildren();const id=settings.design.theme;chipRow.dataset.theme=id;for(const [name,override] of variantDefs[id]){const base=THEMES[id];const palette=Object.fromEntries(['bg','surface','raised','text','muted','accent','border','user','ai'].map(k=>[k,override[k]||base[k]]));const chip=btn('',()=>{settings.design.palettes[id]={...palette};settings.design.custom=settings.design.palettes[id];syncControls();changed();},'ttk-palette-chip');chip.title=name;chip.setAttribute('aria-label',`${name} 색상 조합`);const sw=el('span','ttk-palette-chip-swatch');sw.style.cssText=`--c-bg:${palette.bg};--c-surf:${palette.surface};--c-acc:${(id==='porcelain'&&name==='트림')?'#B8964F':palette.accent};--c-bd:${palette.border};--c-tx:${palette.text}`;chip.append(sw);chip.append(el('small','',name));chipRow.append(chip);}}
 chips.append(chipRow);colors.append(chips);controls.append(colors);
 const iconSection=el('details','ttk-subsection');iconSection.append(el('summary','','상단·하단 아이콘 디자인'));
 iconSection.append(el('p','ttk-note','상단·하단의 지원 아이콘을 정돈된 선형 심볼로 교체합니다. 윤곽형은 선만, 부드러운 버튼형은 옅은 바탕, 미니멀형은 작고 옅게 표시합니다. 버튼 기능과 클릭 동작은 유지합니다.'));
 const iconStyleRow=el('label','ttk-field');iconStyleRow.append(el('strong','','아이콘 스타일'));const iconStyle=el('select');for(const [value,label] of [['outline','윤곽형'],['soft','부드러운 버튼형'],['minimal','미니멀형']]){const o=el('option','',label);o.value=value;iconStyle.append(o)}iconStyle.addEventListener('change',()=>{settings.design.iconStyle=iconStyle.value;changed()});iconStyleRow.append(iconStyle);iconSection.append(iconStyleRow);
 const iconToneRow=el('label','ttk-field');iconToneRow.append(el('strong','','아이콘 색상'));const iconTone=el('select');for(const [value,label] of [['neutral','중립색 (기본)'],['accent','테마 강조색']]){const o=el('option','',label);o.value=value;iconTone.append(o)}iconTone.addEventListener('change',()=>{settings.design.iconTone=iconTone.value;changed()});iconToneRow.append(iconTone);iconSection.append(iconToneRow);controls.append(iconSection);
 // ---- 메시지 버튼 고르기 (v0.24.0) ----
 const mbSection=el('details','ttk-subsection');mbSection.append(el('summary','','메시지 버튼 고르기'));
 mbSection.append(el('p','ttk-note','메시지 아래 버튼 중 앞줄에 둘 것을 고릅니다. 켜지 않은 버튼은 ⋯ 안에 접힙니다. 숨기거나 순서를 바꾸지는 않습니다.'));
 const mbList=el('div','ttk-chips');mbSection.append(mbList);
 function renderMb(){const cfg=settings.msgButtons;mbList.replaceChildren();const keys=Object.keys(cfg.seen);if(!keys.length){mbList.append(el('small','ttk-note','아직 읽은 버튼이 없습니다. 채팅을 연 뒤 "버튼 다시 읽기"를 눌러 주세요.'));return;}
  for(const k of keys){const b=el('button','ttk-chip',cfg.seen[k].label);b.type='button';b.title=k;const on=isFront(cfg,k);b.setAttribute('aria-pressed',String(on));b.addEventListener('click',()=>{setFront(cfg,k,!isFront(cfg,k));b.setAttribute('aria-pressed',String(isFront(cfg,k)));changed();});mbList.append(b);}}
 const mbActions=el('div','ttk-actions');mbActions.append(btn('버튼 다시 읽기',()=>{scanButtons(settings.msgButtons);renderMb();changed();}),btn('기본값으로',()=>{resetFront(settings.msgButtons);renderMb();changed();}));mbSection.append(mbActions);
 mbSection.addEventListener('toggle',()=>{if(mbSection.open){if(scanButtons(settings.msgButtons))save();renderMb();}});
 controls.append(mbSection);
 const dropRow=el('label','ttk-field ttk-dropcap-row');const dropCap=el('input');dropCap.type='checkbox';dropCap.addEventListener('change',()=>{settings.design.dropCap=dropCap.checked;changed()});dropRow.append(dropCap,el('span','','Studio 첫 글자 장식(드롭캡)'));controls.append(dropRow);
 const typeRow=el('label','ttk-field ttk-typing-row');const typeBox=el('input');typeBox.type='checkbox';typeBox.addEventListener('change',()=>{settings.design.typing=typeBox.checked;changed()});typeRow.append(typeBox,el('span','','입력 중 표시(AI가 응답을 쓰는 동안 표시)'));controls.append(typeRow);
 function syncPreview(){const d=settings.design,c=d.custom;preview.dataset.theme=d.theme;preview.dataset.porcelainVariant=d.theme==='porcelain'?(c.border.toLowerCase()==='#c5b18a'?'trim':c.accent.toLowerCase()==='#153e82'?'royal':'classic'):'';for(const [key,value] of Object.entries(c))preview.style.setProperty(`--pv-${key}`,value);preview.style.setProperty('--pv-font',FONTS[d.font].family);preview.style.setProperty('--pv-dialogue-font',FONTS[d.dialogueFont].family);preview.style.setProperty('--pv-dialogue-color',d.dialogueColors[d.theme]);preview.style.setProperty('--pv-size',`${d.size}px`);preview.style.setProperty('--pv-line',d.lineHeight);preview.style.setProperty('--pv-tracking',`${d.letterSpacing}px`);preview.style.setProperty('--pv-para',`${d.paragraphSpacing}px`);
  const ns=d.narrationStyle,ds=d.dialogueStyle,nw=resolveWeight(d.font,ns.weight),dw=resolveWeight(d.dialogueFont,ds.weight),em=emphasisOf(d.font,ns.weight);
  const setv=(k,v)=>v===null||v===undefined?preview.style.removeProperty(k):preview.style.setProperty(k,String(v));
  setv('--pv-narr-w',nw.value);setv('--pv-dlg-w',dw.value);setv('--pv-emph-w',em.value);
  const flag=(k,on)=>{if(on)preview.setAttribute(k,typeof on==='string'?on:'on');else preview.removeAttribute(k);};
  flag('data-narr-w',nw.value!==null);flag('data-dlg-w',dw.value!==null);flag('data-narr-i',ns.italic);flag('data-dlg-i',ds.italic);flag('data-narr-u',ns.underline!=='none'&&ns.underline);flag('data-dlg-u',ds.underline!=='none'&&ds.underline);flag('data-emph',d.emphasis&&em.mode);
  narrStyle?.paint();dlgStyle?.paint();emphPaint?.();}
 
 const actions=el('div','ttk-actions');actions.append(btn('현재 테마 초기화',()=>{settings.design=resetPalette(settings.design,settings.design.theme);syncControls();changed();}));
 actions.append(btn('설정 내보내기',()=>{const payload={format:'darak-design',version:7,design:settings.design,userFonts:settings.userFonts,msgButtons:settings.msgButtons,faces:settings.faces};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='darak-design-v7.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}));
 const upload=el('input');upload.type='file';upload.accept='.json,application/json';upload.hidden=true;actions.append(btn('설정 가져오기',()=>upload.click()),upload);upload.addEventListener('change',async()=>{const file=upload.files?.[0];if(!file)return;try{if(file.size>300000)throw Error('300KB 이하 JSON만 지원합니다.');const value=JSON.parse(await file.text());if(!['darak-design','tavern-toolkit-design'].includes(value.format)||![1,2,3,4,5,6,7].includes(value.version)||typeof value.design!=='object')throw Error('호환되지 않는 형식입니다.');if(Array.isArray(value.userFonts)){settings.userFonts=normalizeUserFonts(value.userFonts);setUserFonts(settings.userFonts);}if(value.msgButtons&&typeof value.msgButtons==='object')settings.msgButtons=normalizeMsgButtons(value.msgButtons);if(value.faces&&typeof value.faces==='object')settings.faces=normalizeFaces(value.faces);settings.design=normalizeDesign(value.design);changed();const replacement=build();openDrawer(replacement);replacement.querySelector('#ttk-theme-section').open=true;root.replaceWith(replacement);}catch(error){globalThis.toastr?.error?.(`설정 가져오기 실패: ${error.message}`,'다락방');}finally{upload.value='';}});controls.append(actions);
 function syncControls(){for(const [id,b] of themeButtons)b.setAttribute('aria-pressed',String(id===settings.design.theme));themeDesc.textContent=`${THEMES[settings.design.theme].name} — ${THEMES[settings.design.theme].description}`;font.value=settings.design.font;dialogueFont.value=settings.design.dialogueFont;dialogueColorInput.value=settings.design.dialogueColors[settings.design.theme];font.updateStatus();dialogueFont.updateStatus();for(const [key,input] of Object.entries(colorInputs))input.value=settings.design.custom[key];iconStyle.value=settings.design.iconStyle;iconTone.value=settings.design.iconTone;dropCap.checked=settings.design.dropCap!==false;typeBox.checked=settings.design.typing!==false;renderPaletteChips();sliders.replaceChildren();slider(sliders,'글자 크기','size',10,23,1,v=>`${v}px`,syncPreview);slider(sliders,'줄간격','lineHeight',1.4,2.4,.05,v=>Number(v).toFixed(2),syncPreview);slider(sliders,'자간','letterSpacing',-.6,1.8,.1,v=>`${Number(v).toFixed(1)}px`,syncPreview);slider(sliders,'문단 간격','paragraphSpacing',0,32,1,v=>`${v}px`,syncPreview);syncPreview();}
 // ---- 묶음: 채팅 보조 / 화면 / 도구 ----
 {const groups=[['채팅 보조','번역 · 대필 · 프로필 사진 · 화자 얼굴',[['translation','ttk-translation-section'],['ghostwrite','ttk-ghostwrite-section'],['avatars','ttk-avatars-section'],['faces','ttk-faces-section']],['ttk-glossary-section']],['화면','디자인 · 한글화 · 날씨 · 테마 이미지 · 모바일 최적화',[['design','ttk-theme-section'],['localization','ttk-localization-section'],['weather','ttk-weather-section'],['themeImages','ttk-themeimg-section'],['optimization','ttk-optimization-section']],[]],['도구','QR 보관함 · 통합 조회 · 이미지 모아보기',[['qr','ttk-qr-section'],['inventory','ttk-inventory-section'],['gallery','ttk-gallery-section']],[]]];
  const holder=el('div','ttk-groups');
  for(const [name,sub,items,extra] of groups){const g=el('section','ttk-group');const h=el('div','ttk-group-head');h.append(el('strong','',name),el('small','',sub));g.append(h);
   for(const [key,secId] of items){const row=rowOf[key],sec=root.querySelector('#'+secId);if(row)g.append(row);if(sec)g.append(sec);}
   for(const id of extra){const sec=root.querySelector('#'+id);if(sec)g.append(sec);}
   holder.append(g);}
  body.append(holder);}
 syncControls();return root;
}
async function main(){
 const ctx=window.SillyTavern?.getContext?.();
 if(!ctx?.extensionSettings||!ctx?.saveSettingsDebounced){console.error('[DARAK] Initialization failed: SillyTavern context unavailable');return;}
 try{settings=merge(ctx.extensionSettings[KEY]??ctx.extensionSettings[LEGACY_KEY]);}catch(e){console.error('[DARAK] 저장된 설정을 읽지 못했습니다. 기본값으로 시작합니다.',e);settings=merge({});}
 ctx.extensionSettings[KEY]=settings;save=()=>ctx.saveSettingsDebounced();
 guard('프롬프트 이름 번역',()=>{promptTranslator=new PromptNameTranslator({getSettings:()=>settings.promptTranslation,save});});
 guard('번역',()=>{messageTranslator=new MessageTranslator({getSettings:()=>settings.translation,getGlossary:()=>settings.glossary,save,getProfiles:()=>promptTranslator.getProfiles(),selfFolder:SELF_FOLDER});});
 guard('대필',()=>{ghostwriter=new Ghostwriter({getSettings:()=>settings.ghostwrite,getGlossary:()=>settings.glossary});});
 guard('QR 보관함',()=>{qrVault=new QrVault({getSettings:()=>settings.qr,save:()=>save()});});
 guard('모바일 최적화',()=>{optimizer=new MobileOptimizer({getSettings:()=>settings.optimization});});
 guard('프로필 사진',()=>{avatars=new Avatars({getSettings:()=>settings.avatars,save:()=>save()});});
 guard('화자 얼굴',()=>{faces=new Faces({getSettings:()=>settings.faces,save:()=>save()});});
 guard('테마 이미지 교체',()=>{themeImages=new ThemeImages({getSettings:()=>settings.themeImages,save:()=>save()});});
 guard('이미지 모아보기',()=>{gallery=new Gallery({getSettings:()=>settings.gallery,save:()=>save()});});
 guard('날씨·분위기',()=>{weather=new Weather({getSettings:()=>settings.weather,save:()=>save()});});
 guard('통합 조회',()=>{inventory=new Inventory({getToolkit:()=>({design:settings.modules.design,translation:settings.modules.translation}),selfFolder:SELF_FOLDER});});
 const target=document.querySelector('#extensions_settings2')||document.querySelector('#extensions_settings');
 if(target)guard('설정 패널',()=>{document.getElementById('ttk-panel')?.remove();target.append(build());},()=>document.getElementById('ttk-panel')?.remove());
 else console.error('[DARAK] 확장 설정 패널을 찾을 수 없습니다. 모듈은 저장된 설정대로 동작합니다.');
 applyModules();showFailures();
 console.info(`[DARAK] v${VERSION} ready`);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',main,{once:true});else main();
