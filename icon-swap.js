/** DARAK v1.7.15 — 다락방 아이콘 교체 (테마 이미지 교체 창의 「아이콘」 탭).
 *
 * 다락방이 정해 둔 아이콘(상단 메뉴·입력창·메시지 버튼·설정 창·대화상자·다른 확장 대체 아이콘·이모지 대체)을
 * 내 파일, SVG 코드, 내장 Lucide 아이콘으로 바꿉니다.
 * - 그리는 방식은 지금과 같은 마스크입니다. 모양만 쓰고 색은 테마 아이콘 색을 따릅니다.
 * - 범위: 공통(모든 다락방 테마) + 테마별 덮어쓰기. 테마별 값이 있으면 그 테마에서는 공통 값보다 앞섭니다.
 * - 저장: 이 브라우저의 IndexedDB(테마 이미지 교체와 같은 DB의 icons 저장소). 다락방 CSS 파일은 건드리지 않습니다.
 * - 적용: 바꾼 항목만 !important로 다시 정의한 <style>을 head 끝에 붙입니다. 모듈을 끄면 지웁니다.
 * 기본 아이콘은 불러온 다락방 CSS에서 직접 읽어 오므로, 새 아이콘이 생기면 목록에 저절로 나타납니다.
 */
import { confirmAsk } from './dialogs.js';
import { THEMES } from './design.js';
import { lucideNames, lucideSvg, lucideUrl } from './composer-icons.js';

export const ICON_STORE = 'icons';
const STYLE_ID = 'ttk-iconswap-style';
const MAX_FILE = 5 * 1048576, RASTER_PX = 128;

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
function button(cls, text, fn) { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }

export const GROUPS = Object.freeze([
    ['top', '상단 메뉴'], ['composer', '입력창'], ['message', '메시지 버튼'],
    ['darak', '다락방 설정 창 · 대화상자'], ['foreign', '다른 확장 버튼'], ['emoji', '입력창 이모지 대체'],
]);
const ST = {
    menu: ['composer', '옵션 메뉴'], spark: ['composer', '확장 메뉴(요술봉) · 메시지 버튼 공통'], up: ['composer', '펼치기 · 접기 화살표'],
    send: ['composer', '보내기'], lang: ['composer', '번역 · 메시지 버튼 공통'], badge: ['composer', '프로필 사진 · 메시지 버튼 공통'],
    box: ['composer', 'QR 보관함'], feather: ['composer', '대필'], undo: ['composer', '대필 되돌리기'], next: ['composer', '계속 · 메시지 버튼 공통'],
    mask: ['composer', '사칭(대신 쓰기)'], cstop: ['composer', '생성 중단'], play: ['composer', '스크립트 계속'], pause: ['composer', '스크립트 일시정지'],
    sq: ['composer', '스크립트 중지'], x: ['composer', '첨부 지우기'], camera: ['composer', '카메라 · 메시지 버튼 공통'],
    dots: ['message', '더보기(⋯)'], tune: ['message', '조정'], edit: ['message', '편집'], copy: ['message', '복사'], trash: ['message', '삭제'],
    branch: ['message', '분기'], doc: ['message', '프롬프트 보기'], eyeoff: ['message', '숨기기'], voice: ['message', '읽어 주기'],
    pin: ['message', '고정'], star: ['message', '즐겨찾기'], image: ['message', '이미지'], pie: ['message', '통계'], brush: ['message', '붓(그리기)'],
    clip: ['message', '첨부'], flag: ['message', '책갈피'], broom: ['message', '정리(빗자루)'],
};
const TOP = [
    ['sliders', 'AI 응답 설정', ['fa-sliders']], ['plug', 'API 연결', ['fa-plug']], ['font', '고급 서식', ['fa-font']],
    ['book', '월드 정보', ['fa-book', 'fa-book-atlas']], ['usergear', '사용자 설정', ['fa-user-gear', 'fa-user-cog']],
    ['bg', '배경', ['fa-image', 'fa-panorama']], ['cubes', '확장 프로그램', ['fa-cubes']], ['persona', '페르소나 관리', ['fa-face-smile']],
    ['chars', '캐릭터 관리', ['fa-address-card']],
];
const LC = {
    x: '닫기', images: '이미지 모아보기', 'clip-list': '통합 조회', export: '내보내기', img: '테마 이미지 교체 · 이미지', trash: '삭제', crop: '자르기',
    plus: '추가', upload: '올리기', link: '링크', code: '코드', zip: '압축 파일', users: '인물 목록', repeat: '화자 바꾸기', smile: '화자 얼굴 · 표정',
    'w-attic': '다락방(요술봉 메뉴 항목)', 'w-palette': '디자인', 'w-globe': '한글화', 'w-languages': '번역', 'w-pen-line': '대필', 'w-cloud': '날씨',
    'w-smartphone': '최적화', 'w-layout-grid': '전체', 'w-sun': '창 밝게', 'w-moon': '창 어둡게', 'w-search': '검색', 'w-qr-code': 'QR 보관함',
    'w-user-round': '프로필 사진', 'w-book-a': '용어집',
};
const FOREIGN = {
    bell: '종', book: '책', bookmark: '책갈피', bot: '로봇', brain: '뇌', calendar: '달력', camera: '카메라', chart: '차트', clip: '클립', clipboard: '클립보드',
    clock: '시계', cloud: '구름', coffee: '커피', cpu: '칩', dice: '주사위', download: '내려받기', drama: '가면', earth: '지구', eye: '눈', feather: '깃털',
    film: '필름', flag: '깃발', flame: '불꽃', folder: '폴더', ghost: '유령', gift: '선물', globe: '지구본', heart: '하트', home: '집', image: '이미지',
    key: '열쇠', languages: '언어', lightbulb: '전구', link: '링크', list: '목록', lock: '자물쇠', mail: '편지', map: '지도', message: '말풍선', mic: '마이크',
    moon: '달', music: '음표', notebook: '공책', palette: '팔레트', pencil: '연필', phone: '전화', pin: '핀', plug: '플러그', puzzle: '퍼즐', refresh: '새로고침',
    save: '저장', scroll: '두루마리', search: '검색', settings: '설정', shirt: '옷', shuffle: '섞기', sliders: '슬라이더', smile: '웃는 얼굴', sparkles: '반짝임',
    star: '별', sun: '해', trash: '휴지통', upload: '올리기', user: '사람', users: '사람들', volume: '소리', wand: '요술봉', wrench: '렌치', zap: '번개',
};

// ---- 기본 아이콘 읽기 ----
function walk(rules, cb) {
    for (const r of rules || []) {
        if (r.styleSheet) { try { walk(r.styleSheet.cssRules, cb); } catch { /* 다른 출처 */ } }
        else if (r.cssRules && !r.selectorText) walk(r.cssRules, cb);
        if (r.selectorText && r.style) cb(r);
    }
}
function eachRule(cb) {
    for (const s of document.styleSheets) {
        if (s.ownerNode?.id === STYLE_ID) continue;
        let rules; try { rules = s.cssRules; } catch { continue; }
        walk(rules, cb);
    }
}
const isUrl = v => /^\s*url\(/i.test(v || '');

/** 지금 화면에 불러온 다락방 CSS와 입력창을 보고 바꿀 수 있는 아이콘 목록을 만듭니다. */
export function buildCatalog() {
    const map = new Map(), add = (id, o) => { if (!map.has(id) && isUrl(o.def)) map.set(id, { id, ...o }); };
    const foreignFa = {};
    eachRule(r => {
        const sel = r.selectorText, st = r.style;
        for (let i = 0; i < st.length; i++) {
            const p = st[i];
            if (p.startsWith('--ttk-ic-x-')) {
                const n = p.slice(11);
                add(`var:${p}`, { group: 'foreign', label: `${FOREIGN[n] || n} 모양`, name: n, def: st.getPropertyValue(p).trim(), kind: 'root', prop: p });
            } else if (p.startsWith('--ttk-ic-')) {
                const n = p.slice(9), meta = ST[n] || ['composer', n];
                add(`var:${p}`, { group: meta[0], label: meta[1], name: n, def: st.getPropertyValue(p).trim(), kind: 'root', prop: p });
            } else if (p === '--ttk-lc-chev') {
                add('var:--ttk-lc-chev', { group: 'darak', label: '펼치기 화살표', name: 'chev', def: st.getPropertyValue(p).trim(), kind: 'root', prop: p });
            } else if (p === '--ttk-w-key' && /\.ttk-win\b/.test(sel)) {
                add('key', { group: 'darak', label: '설정 창 맨 아래 열쇠 그림', name: 'key', def: st.getPropertyValue(p).trim(), kind: 'key', prop: p });
            } else if (p === '--ttk-lc') {
                const m = /^\.ttk-lc-([\w-]+)$/.exec(sel.trim());
                if (m) add(`lc:${m[1]}`, { group: 'darak', label: LC[m[1]] || m[1], name: m[1], def: st.getPropertyValue(p).trim(), kind: 'lc', cls: m[1] });
            }
        }
        const xs = /var\(--ttk-ic-x-([\w-]+)\)/.exec(st.getPropertyValue('mask-image') || st.getPropertyValue('-webkit-mask-image') || '');
        if (xs) { const set = (foreignFa[xs[1]] ||= new Set()); for (const c of sel.match(/\.fa-[\w-]+/g) || []) set.add(c.slice(1)); }
        if (sel.includes('#top-settings-holder') && sel.includes('::before')) {
            const t = TOP.find(([, , fa]) => new RegExp(`\\.${fa[0]}(?![\\w-])`).test(sel));
            const v = st.getPropertyValue('mask-image') || st.getPropertyValue('-webkit-mask-image');
            if (t) add(`top:${t[0]}`, { group: 'top', label: t[1], name: t[2].join(', '), def: v.trim(), kind: 'top', fa: t[2] });
        }
    });
    for (const e of map.values()) if (e.group === 'foreign' && foreignFa[e.name]?.size) e.sub = [...foreignFa[e.name]].filter(Boolean).slice(0, 4).join(', ');
    // 입력창에서 지금 이모지 대신 그리고 있는 아이콘(같은 Lucide 아이콘을 쓰는 이모지는 함께 바뀝니다)
    const emo = {};
    for (const n of document.querySelectorAll('#send_form [data-ttk-emoji-ic]')) (emo[n.getAttribute('data-ttk-emoji-ic')] ||= new Set()).add((n.textContent || '').trim());
    for (const [n, set] of Object.entries(emo)) add(`emoji:${n}`, { group: 'emoji', label: `${[...set].join(' ')} → ${n}`, name: n, def: lucideUrl(n), kind: 'emoji' });
    return map;
}
/** 이미 교체해 두었지만 지금 화면에 없는 이모지 항목도 되돌릴 수 있게 목록에 넣습니다. */
function addStoredEmoji(map, layers) {
    for (const ov of Object.values(layers)) for (const id of Object.keys(ov || {})) {
        if (!id.startsWith('emoji:') || map.has(id)) continue;
        const n = id.slice(6); map.set(id, { id, group: 'emoji', label: `${n} (지금 입력창에 없음)`, name: n, def: lucideUrl(n), kind: 'emoji' });
    }
}

// ---- CSS 만들기 ----
const cssUrl = v => String(v).replace(/[\n\r]/g, '');
/** 한 항목·한 범위의 덮어쓰기 규칙. scope: null이면 공통, 아니면 테마 키. */
export function ruleFor(id, value, scope) {
    const v = cssUrl(value), root = scope ? `html[data-ttk-theme="${scope}"]` : ':root', html = scope ? `html[data-ttk-theme="${scope}"]` : 'html[data-ttk-theme]';
    const [kind, name] = id.includes(':') ? [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)] : [id, ''];
    if (kind === 'var') return `${root}{${name}:${v}!important}`;
    if (kind === 'key') return `${root} .ttk-win{--ttk-w-key:${v}!important}`;
    if (kind === 'lc') return `${root} .ttk-lc-${name}{--ttk-lc:${v}!important}`;
    if (kind === 'emoji') return `${html} #send_form [data-ttk-emoji-ic="${name.replace(/["\\]/g, '')}"]{--ttk-emoji-mask:${v}!important}`;
    if (kind === 'top') {
        const t = TOP.find(x => x[0] === name); if (!t) return '';
        const cls = t[2].length > 1 ? `:is(${t[2].map(c => `.${c}`).join(',')})` : `.${t[2][0]}`;
        return `${html} #top-settings-holder .drawer-toggle > .drawer-icon${cls}::before{-webkit-mask-image:${v}!important;mask-image:${v}!important}`;
    }
    return '';
}
export function buildCss(layers) {
    const out = [];
    for (const [id, v] of Object.entries(layers.common || {})) out.push(ruleFor(id, v, null));
    for (const t of Object.keys(THEMES)) for (const [id, v] of Object.entries(layers[t] || {})) out.push(ruleFor(id, v, t));
    return out.filter(Boolean).join('\n');
}

// ---- 입력 다듬기 ----
const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
/** SVG 코드(전체 <svg> 또는 안쪽 도형만)를 마스크용 url()로. 스크립트·이벤트 속성은 지웁니다. */
export function svgToUrl(code) {
    let s = String(code || '').trim();
    if (!s) return '';
    s = s.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '')
        .replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/<script[^>]*\/>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/(href\s*=\s*["'])\s*javascript:[^"']*/gi, '$1').trim();
    if (!/<[a-z]/i.test(s)) return '';
    if (!/^<svg[\s>]/i.test(s)) {
        if (/<svg[\s>]/i.test(s)) s = s.slice(s.search(/<svg[\s>]/i));
        else s = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>${s}</svg>`;
    }
    if (!/<svg[^>]*\sxmlns\s*=/i.test(s)) s = s.replace(/<svg/i, "<svg xmlns='http://www.w3.org/2000/svg'");
    // width/height가 없고 viewBox도 없으면 마스크 크기를 잡지 못하므로 24 기준을 넣습니다.
    if (!/<svg[^>]*\sviewBox\s*=/i.test(s) && !/<svg[^>]*\swidth\s*=/i.test(s)) s = s.replace(/<svg/i, "<svg viewBox='0 0 24 24'");
    return `url("data:image/svg+xml;base64,${b64(s)}")`;
}
/** 그림 파일을 128px 안쪽 PNG로 줄입니다. opaque: 투명한 부분이 하나도 없는지. */
async function rasterToUrl(file) {
    const src = URL.createObjectURL(file);
    try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
        const w = img.naturalWidth || RASTER_PX, h = img.naturalHeight || RASTER_PX, k = Math.min(1, RASTER_PX / Math.max(w, h));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
        let opaque = true; try { const d = g.getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { opaque = false; break; } } catch { opaque = false; }
        return { url: `url("${c.toDataURL('image/png')}")`, opaque };
    } finally { URL.revokeObjectURL(src); }
}

// ---- 본체 ----
export class IconSwap {
    constructor(store) { this.store = store; this.enabled = false; this.layer = 'common'; this.edit = ''; this.pick = false; }
    async layers() {
        const out = {};
        for (const k of ['common', ...Object.keys(THEMES)]) out[k] = await this.store.get(ICON_STORE, k, {});
        return out;
    }
    async apply() {
        if (!this.enabled) return;
        let layers; try { layers = await this.layers(); } catch { return; }
        if (!this.enabled) return;
        const css = buildCss(layers);
        let s = document.getElementById(STYLE_ID);
        if (!css) { s?.remove(); return; }
        if (!s) { s = el('style'); s.id = STYLE_ID; }
        s.textContent = `/* DARAK — 아이콘 교체 */\n${css}`;
        document.head.append(s); // 늘 맨 뒤
    }
    start() { this.enabled = true; return this.apply(); }
    stop() { this.enabled = false; document.getElementById(STYLE_ID)?.remove(); }
    async set(id, value) { const cur = await this.store.get(ICON_STORE, this.layer, {}); if (value) cur[id] = value; else delete cur[id]; await this.store.put(ICON_STORE, this.layer, cur); await this.apply(); }

    /** 「아이콘」 탭. rerender: 창 전체 다시 그리기. */
    async render(body, rerender, stale) {
        let layers; try { layers = await this.layers(); } catch { layers = null; }
        if (stale()) return;
        if (!layers) { body.append(el('p', 'ttk-inv-note', '이 브라우저에서는 바꾼 아이콘을 저장할 수 없습니다. 사생활 보호(시크릿) 창이거나 사이트 데이터를 막아 둔 경우입니다.')); return; }
        const cat = buildCatalog(); addStoredEmoji(cat, layers);
        const cur = layers[this.layer] || {}, common = layers.common || {}, isTheme = this.layer !== 'common';
        const live = document.documentElement.dataset.ttkTheme;

        // 범위 고르기
        const chips = el('div', 'ttk-ic-layers'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', '적용 범위');
        for (const [k, label] of [['common', '공통'], ...Object.entries(THEMES).map(([k, t]) => [k, t.name.split(' · ')[0]])]) {
            const n = Object.keys(layers[k] || {}).length;
            const b = button('ttk-inv-btn ttk-ic-chip', n ? `${label} ${n}` : label, () => { this.layer = k; this.edit = ''; this.pick = false; rerender(); });
            b.setAttribute('aria-pressed', String(this.layer === k)); chips.append(b);
        }
        body.append(chips);
        body.append(el('p', 'ttk-ic-p', isTheme
            ? `${THEMES[this.layer].name.split(' · ')[0]} 테마에서만 쓰는 아이콘입니다. 여기서 바꾸지 않은 항목은 공통 설정을 따릅니다.`
            : '모든 다락방 테마에 쓰는 아이콘입니다. 특정 테마에서만 다르게 하려면 위에서 그 테마를 고르세요.'));
        body.append(el('p', 'ttk-ic-p', live ? `지금 쓰는 다락방 테마: ${THEMES[live]?.name || live}` : '다락방 디자인이 꺼져 있습니다. 상단 메뉴·입력창·메시지 버튼·다른 확장 버튼 아이콘은 디자인을 켜야 보입니다. 설정 창·대화상자 아이콘은 늘 적용됩니다.'));
        body.append(el('p', 'ttk-ic-p', '아이콘은 모양만 쓰고 색은 테마의 아이콘 색을 따릅니다. 배경이 투명한 PNG나 SVG를 쓰세요. 배경이 채워진 사진은 네모 모양으로 보입니다.'));

        const tools = el('div', 'ttk-inv-tools'), q = el('input', 'ttk-inv-search'); q.type = 'search'; q.placeholder = '아이콘 이름으로 찾기'; q.setAttribute('aria-label', '아이콘 찾기');
        const reset = button('ttk-inv-btn', '이 범위 전부 되돌리기', async () => {
            const scope = isTheme ? `${THEMES[this.layer].name.split(' · ')[0]} 테마` : '공통';
            if (!(await confirmAsk(`${scope}에서 바꾼 아이콘 ${Object.keys(cur).length}개를 모두 원래대로 되돌립니다.`, { ok: '되돌리기' }))) return;
            await this.store.put(ICON_STORE, this.layer, {}); await this.apply(); this.edit = ''; rerender();
        });
        reset.disabled = !Object.keys(cur).length; tools.append(q, reset); body.append(tools);

        const file = el('input'); file.type = 'file'; file.accept = 'image/png,image/svg+xml,image/webp,image/gif,image/jpeg'; file.hidden = true; body.append(file);
        file.addEventListener('change', async () => {
            const f = file.files[0]; file.value = ''; if (!f || !this.edit) return;
            if (f.size > MAX_FILE) { window.toastr?.warning?.('5MB보다 큰 파일은 쓸 수 없습니다.'); return; }
            try {
                let url;
                if (/svg/i.test(f.type) || /\.svg$/i.test(f.name)) url = svgToUrl(await f.text());
                else { const r = await rasterToUrl(f); url = r.url; if (r.opaque) window.toastr?.warning?.('투명한 부분이 없는 그림이라 네모로 보일 수 있습니다.'); }
                if (!url) { window.toastr?.warning?.('이 파일에서 아이콘 모양을 읽지 못했습니다.'); return; }
                await this.set(this.edit, url); rerender();
            } catch { window.toastr?.warning?.('이 파일을 읽지 못했습니다.'); }
        });

        const rows = [];
        for (const [g, gLabel] of GROUPS) {
            const items = [...cat.values()].filter(e => e.group === g);
            if (!items.length) continue;
            const sec = el('section', 'ttk-ic-group'), h = el('div', 'ttk-ic-group-head');
            const changed = items.filter(e => cur[e.id] !== undefined).length;
            h.append(el('strong', '', gLabel), el('small', '', changed ? `${items.length}개 · 바꾼 것 ${changed}개` : `${items.length}개`)); sec.append(h);
            if (g === 'emoji') sec.append(el('p', 'ttk-ic-p', '지금 입력창에 보이는 것만 나옵니다. 같은 아이콘을 쓰는 이모지는 함께 바뀝니다.'));
            const list = el('div', 'ttk-ic-list');
            for (const e of items) {
                const own = cur[e.id], inherited = isTheme && own === undefined ? common[e.id] : undefined, shown = own ?? inherited ?? e.def;
                const row = el('div', `ttk-ic-row${own !== undefined ? ' ttk-ic-on' : ''}`); row.dataset.q = `${e.label} ${e.name} ${e.sub || ''}`.toLowerCase();
                const prev = el('div', 'ttk-ic-prev'), glyph = el('span', 'ttk-ic-glyph'); glyph.style.setProperty('--g', shown); prev.append(glyph);
                const main = el('div', 'ttk-inv-row-main'); main.append(el('strong', '', e.label));
                const state = own !== undefined ? '바꿈' : inherited !== undefined ? '공통 설정에서 바꾼 아이콘' : '기본';
                main.append(el('small', '', e.sub ? `${state} · ${e.sub}` : state));
                const btns = el('div', 'ttk-ic-btns');
                const open = this.edit === e.id;
                const edit = button('ttk-inv-btn', open ? '닫기' : '바꾸기', () => { this.edit = open ? '' : e.id; this.pick = false; rerender(); });
                edit.setAttribute('aria-expanded', String(open)); btns.append(edit);
                if (own !== undefined) btns.append(button('ttk-inv-btn', '되돌리기', async () => { await this.set(e.id, null); rerender(); }));
                row.append(prev, main, btns);
                if (open) row.append(this.editor(e, file, rerender));
                list.append(row); rows.push(row);
            }
            sec.append(list); body.append(sec);
        }
        if (!rows.length) body.append(el('p', 'ttk-inv-ok', '바꿀 수 있는 아이콘을 찾지 못했습니다. 다락방을 다시 불러온 뒤 열어 보세요.'));
        const none = el('p', 'ttk-inv-ok', '찾는 아이콘이 없습니다.'); none.hidden = true; body.append(none);
        q.addEventListener('input', () => {
            const t = q.value.trim().toLowerCase(); let any = false;
            for (const r of rows) { const hit = !t || r.dataset.q.includes(t); r.hidden = !hit; any ||= hit; }
            for (const s of body.querySelectorAll('.ttk-ic-group')) s.hidden = ![...s.querySelectorAll('.ttk-ic-row')].some(r => !r.hidden);
            none.hidden = any;
        });
    }
    editor(e, file, rerender) {
        const box = el('div', 'ttk-ic-editor');
        const a = el('div', 'ttk-ic-ed-row');
        a.append(button('ttk-inv-btn', '파일에서 고르기', () => file.click()), button('ttk-inv-btn', this.pick ? 'Lucide 목록 닫기' : 'Lucide에서 고르기', () => { this.pick = !this.pick; rerender(); }));
        box.append(a, el('p', 'ttk-ic-p', 'PNG · SVG · WebP · GIF · JPG, 5MB까지. 그림 파일은 128px로 줄여 저장합니다.'));
        if (this.pick) box.append(this.picker(e, rerender));
        const ta = el('textarea', 'ttk-ic-code'); ta.rows = 3; ta.placeholder = '<svg …>…</svg> 또는 <path d="…"/> 같은 도형 코드'; ta.setAttribute('aria-label', 'SVG 코드');
        const go = button('ttk-inv-btn', '코드 적용', async () => {
            const url = svgToUrl(ta.value);
            if (!url) { window.toastr?.warning?.('SVG 코드를 읽지 못했습니다.'); return; }
            await this.set(e.id, url); rerender();
        });
        box.append(el('strong', 'ttk-ic-ed-label', 'SVG 코드 붙여넣기'), ta, el('p', 'ttk-ic-p', '도형만 붙여넣으면 Lucide와 같은 24칸 틀(굵기 1.5 · 둥근 끝)에 넣습니다.'), go);
        return box;
    }
    picker(e, rerender) {
        const wrap = el('div', 'ttk-ic-picker'), q = el('input', 'ttk-inv-search'); q.type = 'search'; q.placeholder = '영어 이름으로 찾기 (예: heart, moon)'; q.setAttribute('aria-label', 'Lucide 아이콘 찾기');
        const grid = el('div', 'ttk-ic-grid'), cells = [];
        for (const n of lucideNames()) {
            const b = button('ttk-ic-cell', null, async () => { await this.set(e.id, `url("data:image/svg+xml;base64,${b64(lucideSvg(n))}")`); this.pick = false; rerender(); });
            const g = el('span', 'ttk-ic-glyph'); g.style.setProperty('--g', lucideUrl(n)); b.append(g, el('span', 'ttk-ic-cell-name', n)); b.dataset.q = n;
            grid.append(b); cells.push(b);
        }
        q.addEventListener('input', () => { const t = q.value.trim().toLowerCase(); for (const c of cells) c.hidden = !!t && !c.dataset.q.includes(t); });
        wrap.append(q, el('p', 'ttk-ic-p', `다락방에 들어 있는 Lucide 아이콘 ${cells.length}개`), grid);
        return wrap;
    }
}
