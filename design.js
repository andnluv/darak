/** DARAK: original full theme layer. Does not mutate SillyTavern native theme settings. */
export const THEMES = Object.freeze({
  paper: {name:'Paper · 페이퍼', description:'이북 리더기처럼 읽는 종이 한 페이지', bg:'#F5F1E6', surface:'#FBF8EF', raised:'#EFEADB', text:'#2A2824', muted:'#6B675D', accent:'#7A5C44', border:'#E0DACB', user:'#F3EEDF', ai:'#FBF8EF', shadow:'rgba(59,40,26,.10)', font:'nanummyeongjo'},
  nocturne: {name:'Nocturne · 녹턴', description:'영화 티켓과 포스터를 닮은 은빛 야간 테마', bg:'#0F1217', surface:'#181C24', raised:'#1D222C', text:'#EEF1F5', muted:'#A8B0BE', accent:'#C3CAD6', border:'#3A414E', user:'#1D222C', ai:'#181C24', shadow:'rgba(0,0,0,.5)', font:'nanumbarun'},
  porcelain: {name:'Porcelain · 포슬린', description:'청화백자의 코발트 문양과 유약 흰빛', bg:'#FBFBF7', surface:'#FFFFFF', raised:'#EDF1F9', text:'#1E2A4A', muted:'#5A6683', accent:'#2A4E9C', border:'#BFCBE4', user:'#F3F6FC', ai:'#FFFFFF', shadow:'rgba(30,42,74,.10)', font:'ridibatang'},
  studio: {name:'Studio · 스튜디오', description:'위는 화보, 아래는 메시지로 나뉜 매거진 카드', bg:'#F3F5F8', surface:'#FFFFFF', raised:'#E9EDF3', text:'#1E2430', muted:'#5F6776', accent:'#46627F', border:'#DDE2EA', user:'#F6F8FB', ai:'#FFFFFF', shadow:'rgba(30,36,48,.10)', font:'nanumgothic'},
});
// v0.12.0: previous default palettes (exact values only) are upgraded to the new concept palettes; personalised ones are kept.
const LEGACY_DEFAULTS=Object.freeze([
  {paper:{bg:'#FAF9F6',surface:'#FFFFFF',raised:'#F8F6F2',text:'#332D28',muted:'#746B62',accent:'#86664E',border:'#DCD3C5',user:'#F5F1EA',ai:'#FFFFFF'},
   nocturne:{bg:'#161C25',surface:'#222A36',raised:'#2A3442',text:'#E5E8ED',muted:'#AFBACB',accent:'#A9BEDB',border:'#465366',user:'#29384B',ai:'#202936'},
   porcelain:{bg:'#FFFFFF',surface:'#FFFFFF',raised:'#F5F8FC',text:'#263548',muted:'#617285',accent:'#2F5F9C',border:'#BCD0E4',user:'#F4F8FD',ai:'#FFFFFF'},
   studio:{bg:'#E6EAE4',surface:'#F9FBF7',raised:'#EFF3EC',text:'#303C35',muted:'#59685F',accent:'#4C6B59',border:'#C4D0C4',user:'#DEE8DE',ai:'#F9FBF7'}},
  {paper:{bg:'#F3EFE6',surface:'#FFFCF6',raised:'#F8F3E9',text:'#332D28',muted:'#746B62',accent:'#86664E',border:'#D9CDBE',user:'#EAE0D3',ai:'#FFFCF6'}},
]);
// v0.3.14: every typeface is a remotely hosted web font. Nothing is bundled, and a
// stylesheet is requested only while its font is selected and the design module is ON.
const GF=q=>`https://fonts.googleapis.com/css2?family=${q}&display=swap`;
const JSD='https://cdn.jsdelivr.net/gh/';
const GOTHIC='"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
const SERIF='"AppleMyungjo", "Noto Serif KR", "Batang", serif';
export const FONTS = Object.freeze({
 nanummyeongjo:{name:'나눔명조',category:'serif',source:'web',css:GF('Nanum+Myeongjo:wght@400;700;800'),family:`"Nanum Myeongjo", ${SERIF}`},
 nanumbarun:{name:'나눔바른고딕',category:'gothic',source:'web',css:JSD+'moonspam/NanumBarunGothic@1.2/nanumbarungothicsubset.css',family:`"NanumBarunGothic", ${GOTHIC}`},
 nanumgothic:{name:'나눔고딕',category:'gothic',source:'web',css:GF('Nanum+Gothic:wght@400;700;800'),family:`"Nanum Gothic", ${GOTHIC}`},
 pretendard:{name:'프리텐다드',category:'gothic',source:'web',css:JSD+'orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.css',family:`"Pretendard", ${GOTHIC}`},
 kopubdotum:{name:'KoPub 돋움',category:'gothic',source:'web',css:JSD+'adrinerDP/font-kopubworld@28997aceeb0fa6322357b03b63aaf292e74868f4/css/dotum.css',family:`"KoPubWorld Dotum", ${GOTHIC}`},
 nanumsquareround:{name:'나눔스퀘어라운드',category:'gothic',source:'web',css:JSD+'innks/NanumSquareRound@1c6bf0ee5e0e17e2552311aac31ba157dcb805e8/nanumsquareround.min.css',family:`"NanumSquareRound", ${GOTHIC}`},
 ibmplex:{name:'IBM Plex Sans KR',category:'gothic',source:'web',css:GF('IBM+Plex+Sans+KR:wght@400;500;600;700'),family:`"IBM Plex Sans KR", ${GOTHIC}`},
 ridibatang:{name:'리디바탕',category:'serif',source:'web',face:{family:'RIDIBatang',url:JSD+'projectnoonnu/noonfonts_twelve@1.0/RIDIBatang.woff',format:'woff'},family:`"RIDIBatang", ${SERIF}`},
 kopubbatang:{name:'KoPub 바탕',category:'serif',source:'web',css:JSD+'adrinerDP/font-kopubworld@28997aceeb0fa6322357b03b63aaf292e74868f4/css/batang.css',family:`"KoPubWorld Batang", ${SERIF}`},
 hahmlet:{name:'함렡',category:'serif',source:'web',css:GF('Hahmlet:wght@400;500;600;700'),family:`"Hahmlet", ${SERIF}`},
 busandandi:{name:'부산단디명조',category:'serif',source:'web',face:[300,500,700].map((weight,i)=>({family:'BusanDandiMyeongjo',url:JSD+`Project-Noonnu/2610132210@l-2/l/부산단디명조${'LMB'[i]}.woff2`,format:'woff2',weight})),family:`"BusanDandiMyeongjo", ${SERIF}`},
 zenserif:{name:'Zen Old Mincho',category:'serif',source:'web',css:GF('Zen+Old+Mincho:wght@400;500;700'),family:`"Zen Old Mincho", ${SERIF}`},
 paperlogy:{name:'페이퍼로지',category:'gothic',source:'web',face:[[400,'4Regular'],[700,'7Bold']].map(([weight,f])=>({family:'Paperozi',url:JSD+`projectnoonnu/2408-3@1.0/Paperlogy-${f}.woff2`,format:'woff2',weight})),family:`"Paperozi", ${GOTHIC}`},
 suit:{name:'수트 (SUIT)',category:'gothic',source:'web',css:JSD+'sun-typeface/SUIT@2/fonts/static/woff2/SUIT.css',family:`"SUIT", ${GOTHIC}`},
 freesentation:{name:'프리젠테이션',category:'gothic',source:'web',face:[[400,'4Regular'],[700,'7Bold']].map(([weight,f])=>({family:'Presentation',url:JSD+`projectnoonnu/2404@1.0/Freesentation-${f}.woff2`,format:'woff2',weight})),family:`"Presentation", ${GOTHIC}`},
 maruburi:{name:'마루 부리',category:'serif',source:'web',face:[[400,'Regular'],[700,'Bold']].map(([weight,f])=>({family:'MaruBuri',url:`https://hangeul.pstatic.net/hangeul_static/webfont/MaruBuri/MaruBuri-${f}.woff2`,format:'woff2',weight})),family:`"MaruBuri", ${SERIF}`},
 gowunbatang:{name:'고운바탕',category:'serif',source:'web',css:GF('Gowun+Batang:wght@400;700'),family:`"Gowun Batang", ${SERIF}`},
 bookendbatang:{name:'북엔드 바탕',category:'serif',source:'web',face:[[400,'R'],[700,'SB']].map(([weight,f])=>({family:'BookendBatang',url:JSD+`projectnoonnu/2410-2@1.0/TTBookendBatang${f}.woff2`,format:'woff2',weight})),family:`"BookendBatang", ${SERIF}`},
 hwalkong:{name:'HS활공명조',category:'serif',source:'web',face:{family:'HsGlidingSerif',url:JSD+'projectnoonnu/2604-1@1.0/HSHwalkongSerif-Regular.woff2',format:'woff2'},family:`"HsGlidingSerif", ${SERIF}`},
 gmarket:{name:'G마켓 산스',category:'decor',source:'web',face:[[300,'Light'],[500,'Medium'],[700,'Bold']].map(([weight,f])=>({family:'GmarketSans',url:JSD+`projectnoonnu/noonfonts_2001@1.1/GmarketSans${f}.woff`,format:'woff',weight})),family:`"GmarketSans", ${GOTHIC}`},
 surroundair:{name:'카페24 써라운드에어',category:'decor',source:'web',face:{family:'Cafe24SurroundAir',url:JSD+'projectnoonnu/noonfonts_2105_2@1.0/Cafe24SsurroundAir.woff',format:'woff'},family:`"Cafe24SurroundAir", ${GOTHIC}`},
 levelup:{name:'레벨업',category:'decor',source:'web',face:[[400,'regular','Regular'],[700,'regular','Bold'],[400,'italic','Italic']].map(([weight,tag,f])=>({family:'LevelUp',url:JSD+`Project-Noonnu/2610132210@levelup-${tag}/levelup-${tag}/LevelUp-${f}.woff2`,format:'woff2',weight,style:tag==='italic'?'italic':'normal'})),family:`"LevelUp", ${GOTHIC}`},
 badasseugi:{name:'학교안심 받아쓰기',category:'hand',source:'web',face:{family:'SchoolSafeDictation',url:JSD+'projectnoonnu/2408-5@1.0/HakgyoansimBadasseugiTTF-L.woff2',format:'woff2'},family:`"SchoolSafeDictation", ${GOTHIC}`},
 mona12:{name:'모나12',category:'decor',source:'web',css:JSD+'MonadABXY/mona-font@2026.10.09/web/mona.css',family:`"Mona12", ${GOTHIC}`},
 sanhayeop:{name:'산하엽',category:'decor',source:'web',face:{family:'Sanhayeop',url:JSD+'projectnoonnu/noonfonts_JAMO@1.0/Diphylleia-Regular.woff2',format:'woff2'},family:`"Sanhayeop", ${SERIF}`},
 gangwon:{name:'강원교육새음체',category:'decor',source:'web',face:{family:'GangwonEduSaeeum',url:JSD+'projectnoonnu/noonfonts_2201-2@1.0/GangwonEduSaeeum_OTFMediumA.woff',format:'woff'},family:`"GangwonEduSaeeum", ${GOTHIC}`},
 geulbang:{name:'그리운X국한박 글방구리체',category:'decor',source:'web',face:{family:'GeuriunXGukhanbakGeulbangGuri',url:JSD+'Project-Noonnu/2607161334@x-4/x/GriunXHangeul_Banguri-Rg.woff2',format:'woff2'},family:`"GeuriunXGukhanbakGeulbangGuri", ${GOTHIC}`},
 oswald:{name:'Oswald (영문·숫자)',category:'decor',source:'web',css:GF('Oswald:wght@400;500;600'),family:'"Oswald", sans-serif'},
 playfair:{name:'Playfair Display (영문·숫자)',category:'decor',source:'web',css:GF('Playfair+Display:wght@700;900'),family:'"Playfair Display", Georgia, serif'},
 system:{name:'기본 시스템 글꼴',category:'gothic',source:'system',family:'system-ui, sans-serif'},
});
export const FONT_GROUPS = Object.freeze({gothic:'고딕',serif:'명조·바탕',decor:'꾸밈',hand:'손글씨'});

const clamp = (v,min,max,fallback) => v!==undefined && v!==null && v!=='' && Number.isFinite(Number(v))? Math.min(max,Math.max(min,Number(v))): fallback;
const safeHex=(v, fallback)=>typeof v==='string' && /^#[0-9a-fA-F]{6}$/.test(v)?v:fallback;
const PALETTE_KEYS=['bg','surface','raised','text','muted','accent','border','user','ai'];
const DEFAULT={theme:'paper',dialogueColors:{},font:'nanummyeongjo',dialogueFont:'nanummyeongjo',size:17,lineHeight:1.85,letterSpacing:0,paragraphSpacing:14,palettes:{},iconStyle:'outline',iconTone:'neutral'};
function normalizePalette(raw,theme){const palette={};for(const key of PALETTE_KEYS)palette[key]=safeHex(raw?.[key],THEMES[theme][key]);return palette;}
export function normalizeDesign(raw={}){
 const theme=Object.hasOwn(THEMES,raw.theme)?raw.theme:(raw.theme==='midnight'?'nocturne':raw.theme==='sage'?'studio':'paper');
 const legacyFont={noto:'nanumgothic',nanum:'nanummyeongjo',gowun:'gowunbatang',basicgothic:'nanumgothic',seoulhangang:'nanummyeongjo',yeonseong:'nanumgothic'};
 const candidate=legacyFont[raw.font]||raw.font;
 const font=Object.hasOwn(FONTS,candidate)?candidate:THEMES[theme].font;
 const dialogueCandidate=legacyFont[raw.dialogueFont]||raw.dialogueFont;
 const dialogueFont=Object.hasOwn(FONTS,dialogueCandidate)?dialogueCandidate:font;
 const palettes={};for(const id of Object.keys(THEMES))palettes[id]=normalizePalette(raw.palettes?.[id]||(id===theme?raw.custom:undefined),id);
 // v0.12.0: upgrade only exact legacy defaults (older low-contrast fixes are covered because those values are legacy defaults too).
 const sameHex=(p,q)=>Object.keys(q).every(k=>p[k]?.toLowerCase()===q[k].toLowerCase());
 for(const set of LEGACY_DEFAULTS)for(const [id,old] of Object.entries(set))if(sameHex(palettes[id],old))palettes[id]=normalizePalette(null,id);
 const lowContrast={paper:{border:['#E5DED3','#E0DACB']},porcelain:{muted:['#697C91','#5A6683']},studio:{muted:['#66786D','#5F6776'],accent:['#547662','#46627F']}};
 for(const [id,keys] of Object.entries(lowContrast))for(const [k,[from,to]] of Object.entries(keys))if(palettes[id][k].toLowerCase()===from.toLowerCase())palettes[id][k]=to;
 const dialogueDefaults={paper:'#7A5C44',nocturne:'#F6F8FB',porcelain:'#2A4E9C',studio:'#46627F'};
 const legacyDialogue={paper:'#79543B',nocturne:'#9EC5FF',porcelain:'#315F95',studio:'#396750'};
 const dialogueColors={};for(const id of Object.keys(THEMES))dialogueColors[id]=safeHex(raw.dialogueColors?.[id],dialogueDefaults[id]);
 // v0.3.14: the old Nocturne dialogue default was indistinguishable from body text (1.19:1). Move only that exact default.
 if(dialogueColors.nocturne.toUpperCase()==='#CAD6F1')dialogueColors.nocturne=dialogueDefaults.nocturne;
 for(const id of Object.keys(THEMES))if(dialogueColors[id].toUpperCase()===legacyDialogue[id].toUpperCase())dialogueColors[id]=dialogueDefaults[id];
 return {theme,font,dialogueFont,dialogueColors,size:clamp(raw.size,10,23,DEFAULT.size),lineHeight:clamp(raw.lineHeight,1.4,2.4,DEFAULT.lineHeight),letterSpacing:clamp(raw.letterSpacing,-.6,1.8,DEFAULT.letterSpacing),paragraphSpacing:clamp(raw.paragraphSpacing,0,32,DEFAULT.paragraphSpacing),palettes,custom:palettes[theme],iconStyle:['outline','soft','minimal'].includes(raw.iconStyle)?raw.iconStyle:DEFAULT.iconStyle,iconTone:['neutral','accent'].includes(raw.iconTone)?raw.iconTone:DEFAULT.iconTone,dropCap:raw.dropCap!==false,typing:raw.typing!==false};
}
// A theme switch changes only the palette + layout. Typography and all theme palettes survive.
export function selectTheme(raw,id){if(!THEMES[id])return normalizeDesign(raw);return normalizeDesign({...normalizeDesign(raw),theme:id});}
export function resetPalette(raw,id){const current=normalizeDesign(raw);if(!THEMES[id])return current;return normalizeDesign({...current,palettes:{...current.palettes,[id]:normalizePalette(null,id)}});}
const STYLE_ID='ttk-full-theme-runtime';
const FONT_ATTR='data-ttk-font';
// Keeps exactly the stylesheets of the fonts in use. Idempotent, so live slider/colour edits never re-request a font.
export function syncFontSources(ids=[]){
 const wanted=new Set(ids.filter(id=>FONTS[id]&&(FONTS[id].css||FONTS[id].face)));
 for(const node of document.head.querySelectorAll(`[${FONT_ATTR}]`)){if(wanted.has(node.getAttribute(FONT_ATTR)))wanted.delete(node.getAttribute(FONT_ATTR));else node.remove();}
 for(const id of wanted){
  const f=FONTS[id];let node;
  if(f.css){node=document.createElement('link');node.rel='stylesheet';node.href=f.css;node.crossOrigin='anonymous';}
  else{node=document.createElement('style');node.textContent=[].concat(f.face).map(face=>`@font-face{font-family:'${face.family}';src:url('${encodeURI(face.url)}') format('${face.format}');font-weight:${face.weight||400};font-style:${face.style||'normal'};font-display:swap}`).join('\n');}
  node.setAttribute(FONT_ATTR,id);document.head.append(node);
 }
}
// v0.23: font picker previews. Separate attribute so syncFontSources never removes a preview the list still shows.
const PREVIEW_ATTR='data-ttk-font-pv';
export function fontPreviewNode(id){
 const f=FONTS[id];if(!f||!(f.css||f.face))return;
 if(document.head.querySelector(`[${PREVIEW_ATTR}="${id}"]`))return;
 let node;
 if(f.css){node=document.createElement('link');node.rel='stylesheet';node.href=f.css;node.crossOrigin='anonymous';}
 else{node=document.createElement('style');node.textContent=fontFaceCss(f);}
 node.setAttribute(PREVIEW_ATTR,id);document.head.append(node);
}
export function clearFontPreviews(){document.head.querySelectorAll(`[${PREVIEW_ATTR}]`).forEach(n=>n.remove());}
function fontFaceCss(f){return [].concat(f.face).map(face=>`@font-face{font-family:'${face.family}';src:url('${encodeURI(face.url)}') format('${face.format}');font-weight:${face.weight||400};font-style:${face.style||'normal'};font-display:swap}`).join('\n');}
function luminance(hex){const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.03928?c/12.92:((c+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];}
export function schemeOf(palette){return luminance(palette.bg)<.3?'dark':'light';}
const ROOT_ATTRS=['data-ttk-theme','data-ttk-icon-style','data-ttk-icon-tone','data-ttk-scheme','data-ttk-dropcap'];
// v0.11.0: while the design is ON, the original ST theme's user CSS (#custom-style) is switched off so it
// cannot decide avatar size/position or message structure. media="not all" survives ST rewriting the
// style's contents on a theme switch; it is removed again when the design is turned off.
const ORIGINAL_CSS_ID='custom-style', MUTE_ATTR='data-ttk-muted';
let originalObserver=null;
function muteOriginal(node){if(!node||node.hasAttribute(MUTE_ATTR))return;node.setAttribute(MUTE_ATTR,node.getAttribute('media')??'');node.setAttribute('media','not all');}
export function setOriginalThemeCss(muted){
 const node=document.getElementById(ORIGINAL_CSS_ID);
 if(muted){
  muteOriginal(node);
  if(!originalObserver&&typeof MutationObserver!=='undefined'){originalObserver=new MutationObserver(()=>muteOriginal(document.getElementById(ORIGINAL_CSS_ID)));originalObserver.observe(document.head,{childList:true});}
 }else{
  originalObserver?.disconnect();originalObserver=null;
  if(node?.hasAttribute(MUTE_ATTR)){const prev=node.getAttribute(MUTE_ATTR);if(prev)node.setAttribute('media',prev);else node.removeAttribute('media');node.removeAttribute(MUTE_ATTR);}
 }
}
export function teardownDesign(){setOriginalThemeCss(false);clearFontPreviews();document.getElementById(STYLE_ID)?.remove();syncFontSources([]);for(const a of ROOT_ATTRS)document.documentElement.removeAttribute(a);}
export function applyDesign(enabled,raw){
 if(!enabled){teardownDesign();return;}
 const d=normalizeDesign(raw),p=d.custom;
 const root=document.documentElement;
 root.dataset.ttkTheme=d.theme;root.dataset.ttkIconStyle=d.iconStyle;root.dataset.ttkIconTone=d.iconTone;root.dataset.ttkScheme=schemeOf(p);root.dataset.ttkDropcap=d.dropCap?'on':'off';
 setOriginalThemeCss(true);
 // Studio's cover numerals are set in Playfair Display; it is requested only while Studio is active.
 syncFontSources([d.font,d.dialogueFont,...(d.theme==='studio'?['playfair']:[]),...(d.theme==='nocturne'?['oswald']:[])]);
 const hexRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(',');
 const vars={...p,rgbAccent:hexRgb(p.accent),dialogueBg:d.theme==='nocturne'?`rgba(${hexRgb(p.accent)},.26)`:d.theme==='paper'?`rgba(${hexRgb(p.accent)},.12)`:'transparent',shadow:THEMES[d.theme].shadow,dialogue:d.dialogueColors[d.theme],font:FONTS[d.font].family,dialogueFont:FONTS[d.dialogueFont].family,size:`${d.size}px`,line:d.lineHeight,tracking:`${d.letterSpacing}px`,para:`${d.paragraphSpacing}px`};
 let node=document.getElementById(STYLE_ID);
 if(!node){node=document.createElement('style');node.id=STYLE_ID;document.head.append(node);}
 const css=`html[data-ttk-theme] {${Object.entries(vars).map(([k,v])=>`--ttk-${k}:${v};`).join('\n')}}`;
 if(node.textContent!==css)node.textContent=css;
}
