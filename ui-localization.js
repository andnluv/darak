/** DARAK v1.4.0 — 화면 전체 한국어.
 *
 * SillyTavern 화면과 확장 화면에 남은 영어·중국어 글자(채팅 밖)를 모아 저장된 연결 프로필로 나눠 번역하고,
 * 결과를 '영어 원문 → 한국어' 표로 설정에 저장한 뒤 화면의 글자 노드만 바꿉니다.
 *
 * - 첫 번역과 대기 중인 글자 번역은 사용자가 버튼을 눌렀을 때만 모델을 부릅니다(자동 호출 없음).
 * - 사용자가 쓰거나 고른 내용(채팅·입력칸·이름·선택값)은 건드리지 않습니다. 속성·값도 바꾸지 않습니다.
 *   예외는 SillyTavern이 번역 표시(data-i18n="[title]…")로 직접 채우는 title·placeholder·aria-label·alt 속성뿐입니다.
 * - 끄면 바꾼 글자를 모두 원문으로 되돌립니다.
 */
import {glossaryBlock} from './translation.js';

export const DEFAULT_KEEP_TERMS = 'Top P, Top K, Top A, Min P, Temperature, Context, Token, API, JSON, Regex, Prompt, URL, ID, CSS, HTML, Markdown';
export const UI_BATCH = 200;
const MAX_CACHE = 6000, MAX_LIST = 3000, KEY_MAX = 300, VAL_MAX = 400, EXT_MAX = 80, TERMS_MAX = 1000;
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];

export const normKey = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const strList = (v, max, len) => Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string').map(normKey).filter(x => x && x.length <= len))].slice(0, max) : [];

export const DEFAULT_UI_TRANSLATION = Object.freeze({enabled: false, profileId: '', terms: DEFAULT_KEEP_TERMS});

export function normalizeUiTranslation(raw = {}) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const cache = Object.create(null);
    let n = 0;
    if (r.cache && typeof r.cache === 'object' && !Array.isArray(r.cache)) {
        for (const [key, value] of Object.entries(r.cache)) {
            if (n >= MAX_CACHE) break;
            if (key.length > KEY_MAX || key !== normKey(key) || typeof value !== 'string') continue;
            const v = value.trim().slice(0, VAL_MAX);
            if (v) { cache[key] = v; n++; }
        }
    }
    const kept = strList(r.kept, MAX_LIST, KEY_MAX).filter(x => !cache[x]);
    const edited = strList(r.edited, MAX_LIST, KEY_MAX).filter(x => cache[x]);
    const excluded = strList(r.excluded, MAX_LIST, KEY_MAX);
    const excludedExt = strList(r.excludedExt, 100, EXT_MAX);
    return {
        enabled: r.enabled === true,
        profileId: typeof r.profileId === 'string' ? r.profileId.slice(0, 180) : '',
        terms: typeof r.terms === 'string' ? r.terms.replace(/\r\n?/g, '\n').slice(0, TERMS_MAX) : DEFAULT_KEEP_TERMS,
        cache, kept, edited, excluded, excludedExt,
    };
}

/** 번역 대상 글자인지(영어 또는 중국어(한자)가 있고, 한글이 없고, 이름·경로·값처럼 보이지 않는지). 일본어(가나)만 있는 글자는 제외. */
export function isCandidate(text) {
    const t = normKey(text);
    if (t.length < 2 || t.length > KEY_MAX) return false;
    if (!/[A-Za-z]/.test(t) && (!/\p{Script=Han}/u.test(t) || /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t))) return false;
    if (/\p{Script=Hangul}/u.test(t)) return false;
    if (/^[\[({<].*[\])}>]$/.test(t) && t.length < 40 && !/\p{Script=Han}/u.test(t)) return false;                       // [ None ] 같은 값
    if (/^(https?:|www\.|\/|[A-Za-z]:\\|\.{1,2}\/)/.test(t)) return false;                // 주소·경로
    if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(t)) return false;                                // 이메일
    if (/^[\w./\\ -]+\.(json|jsonl|png|jpe?g|webp|gif|svg|css|js|mjs|html|txt|md|zip|ya?ml|png|mp3|wav|ogg)$/i.test(t)) return false; // 파일 이름
    if (/^(ctrl|alt|shift|cmd|meta|enter|esc|tab)(\s*\+\s*\S+)*$/i.test(t)) return false; // 단축키
    if (!/\s/.test(t)) {
        if (/^[A-Z0-9_.:-]+$/.test(t)) return false;                                       // API, MAX_TOKENS 같은 한 낱말 약어·상수
        if (/^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(t) || /^\w+(?:_\w+)+$/.test(t) || /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(t)) return false; // 식별자
    }
    return true;
}

/** 알림(toastr) 중 숫자·이름·값이 없는 고정 문구만 번역한다. */
export function isFixedToast(text) {
    const t = normKey(text);
    if (!isCandidate(t)) return false;
    if (/[0-9"'“”‘’`\[\]{}<>:/\\@#%=|]/.test(t)) return false;
    if (t.split(' ').length > 16) return false;
    if (/\b[A-Z][a-z]+[A-Z]\w*\b/.test(t)) return false;                                  // CamelCase 이름
    return true;
}

const TOKEN_RE = /\{\{[^}]*\}\}|\$\{[^}]*\}|\{\d+\}|%\d*\$?[sd]|<\/?[a-z][^>]*>/gi;
const tokens = s => (String(s).match(TOKEN_RE) || []).sort().join('\u0001');

/** 모델이 돌려준 한 줄을 다듬는다. 쓸 수 없으면 ''. 원문과 같은 값은 그대로 돌려준다(호출한 쪽이 '원문 유지'로 처리). */
export function cleanUi(raw, original) {
    let v = String(raw ?? '').trim();
    v = v.replace(/^```(?:text|json)?\s*/i, '').replace(/\s*```$/, '').trim();
    if (!/^['"“‘]/.test(original)) v = v.replace(/^['"“‘](.*)['"”’]$/s, '$1').trim();
    if (!v || v.length > VAL_MAX || v.includes('```')) return '';
    if (!original.includes('\n')) v = v.replace(/\s*\n\s*/g, ' ');
    if (tokens(v) !== tokens(original)) return '';                                          // {{변수}}·%s·HTML 태그가 바뀌면 버린다
    return v;
}

/** 번호 붙은 JSON({"1":"…"} · [{n,ko}] · 줄 수가 같은 배열)을 원문 → 응답 표로 바꾼다. */
export function parseNumbered(raw, batch) {
    const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let data;
    try { data = JSON.parse(text); } catch {
        const m = text.match(/[\[{][\s\S]*[\]}]/);
        if (!m) return new Map();
        try { data = JSON.parse(m[0]); } catch { return new Map(); }
    }
    const byN = new Map(batch.map(b => [String(b.n), b.t]));
    const out = new Map();
    const put = (n, v) => { const t = byN.get(String(n)); if (t !== undefined && typeof v === 'string') out.set(t, v); };
    if (Array.isArray(data)) {
        data.forEach((v, i) => {
            if (v && typeof v === 'object') put(v.n ?? v.id, v.ko ?? v.t ?? v.text ?? v.translation);
            else if (data.length === batch.length) put(batch[i].n, v);
        });
    } else if (data && typeof data === 'object') {
        for (const [k, v] of Object.entries(data)) put(k, v);
    }
    return out;
}

export function keepTerms(terms) { return String(terms || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean).slice(0, 80); }

export function buildSystemPrompt({terms, glossary} = {}) {
    const list = keepTerms(terms);
    return [
        'You localize the user interface of SillyTavern (a role-play chat web app) and its extensions into Korean.',
        'The user message is a JSON array of {"n","t","where","kind"}. "t" is the English or Chinese UI text to translate. "where" (location in the UI) and "kind" (button | label | title | description | message) are context only; never translate or output them.',
        'Output ONLY one JSON object that maps every n (as a string) to the Korean text for its "t", e.g. {"1":"…","2":"…"}. Include every n. No explanations.',
        'Style: short, natural Korean UI wording. Buttons: concise noun or verb form, consistent across the list. Labels and titles: noun phrases without sentence endings. Descriptions and messages: polite plain style (…합니다 / …하세요). Follow SillyTavern\'s own Korean terminology where you know it.',
        'Keep the Korean no longer than needed; it has to fit a button or a field.',
        'Return the original "t" unchanged when it is a proper noun, a product, model, API, preset, extension or file name, code, a regex, a key name or shortcut, a URL, a [ None ]-style placeholder, or anything a user chose or typed.',
        'Inside a translated text keep numbers, symbols, emoji, {{macros}}, %s / {0} placeholders and HTML tags exactly as they are.',
        list.length ? `Keep these terms in English exactly as written: ${list.join(', ')}.` : '',
        glossaryBlock(glossary, true).trim(),
    ].filter(Boolean).join('\n');
}

function extractText(response) {
    if (typeof response === 'string') return response;
    if (typeof response?.content === 'string') return response.content;
    if (Array.isArray(response?.content)) return response.content.map(p => p?.text || '').join('');
    return response?.choices?.[0]?.message?.content ?? response?.choices?.[0]?.text ?? response?.text ?? '';
}

// ---- 화면 구역 ----------------------------------------------------------------------------------
// 채팅·입력칸·코드·사용자가 만든 목록(캐릭터·페르소나·로어북·프롬프트·배경·QR 이름)과 다락방 자체 화면은 건드리지 않는다.
const SKIP_LIST = [
    'script', 'style', 'noscript', 'template', 'textarea', 'input', 'code', 'pre', 'kbd', 'samp', 'svg', 'canvas', 'iframe',
    '[contenteditable=""]', '[contenteditable="true"]', '.CodeMirror', '.ace_editor',
    '.select2-container', '.select2-results', '.select2-dropdown',
    '#chat', '#send_textarea', '.mes', '.mes_text',
    '#rm_print_characters_block', '#rm_group_members', '#rm_group_add_members', '#user_avatar_block', '#world_popup_entries_list',
    '#completion_prompt_manager_list', '.select_chat_block_wrapper', '.BGSampleTitle', '.WIEntryTitleAndStatus', '.tag', '.tags',
    '#qr--bar', '.qr--button',
    '#ttk-panel', 'dialog.ttk-ask', '[data-ttk-ignore]', '[id^="ttk-"]',
    // 다락방이 직접 만든 화면(class가 ttk-로 시작). 단, SillyTavern 요소에 붙여 두는 표시 class와 body·html은 제외한다.
    ':is([class^="ttk-"],[class*=" ttk-"]):not(body,html,.ttk-av-host,.ttk-av-on,.ttk-av-busy,.ttk-qr-host,.ttk-qr-running,.ttk-qr-hide-bar,.ttk-cv,.ttk-flash,.ttk-enter,.ttk-prompt-localized,.ttk-tr-on,.ttk-tr-spin,.ttk-drop-on,.ttk-gal-flash,.ttk-gal-bad)',
];
export const SKIP_SELECTOR = SKIP_LIST.join(',');
// 입력칸의 안내 글(placeholder)은 SillyTavern이 번역 표시로 채우는 이름표라서 입력칸 자체는 막지 않는다. 입력칸의 값은 어느 쪽이든 건드리지 않는다.
const SKIP_ATTR_SELECTOR = SKIP_LIST.filter(x => x !== 'textarea' && x !== 'input').join(',');
const EXT_ROOTS = '#extensions_settings, #extensions_settings2';
const TOAST = '#toast-container';

export class UiTranslator {
    constructor({getSettings, getGlossary, getProfiles, getFallbackProfile, save, loadService} = {}) {
        this.getSettings = getSettings; this.getGlossary = getGlossary || (() => '');
        this.getProfiles = getProfiles || (() => []);
        this.getFallbackProfile = getFallbackProfile || (() => '');
        this.save = save || (() => {}); this.loadService = loadService || null;
        this.onStatus = () => {}; this.onChange = () => {};
        this.active = false; this.observer = null; this.timer = null; this.dirty = new Set();
        this.applied = new Map();      // 글자 노드 → {orig, shown, key}
        this.appliedAttrs = new Set(); // {el, attr, orig, shown, key}
        this.pending = new Map();      // 영어 원문 → {where, kind}
        this.controller = null; this.running = false; this.service = null;
    }
    get s() { return this.getSettings(); }

    // ---- 켜기 / 끄기 ----
    start() {
        if (this.active) return;
        this.active = true;
        this.processRoot(document.body);
        this.observer = new MutationObserver(records => {
            for (const r of records) {
                if (r.target?.closest?.('#chat')) continue;                                  // 채팅 칸은 지켜보지 않는다
                for (const n of r.addedNodes) {
                    const el = n.nodeType === 1 ? n : n.nodeType === 3 ? n.parentElement : null;
                    if (el && !el.closest('#chat')) this.dirty.add(el);
                }
            }
            if (this.dirty.size) this.schedule(150);
        });
        this.observer.observe(document.body, {childList: true, subtree: true});
        this.emit();
    }
    stop() {
        this.active = false;
        this.observer?.disconnect(); this.observer = null;
        clearTimeout(this.timer); this.timer = null; this.dirty.clear();
        this.abort();
        this.restoreAll();
        this.pending.clear();
        this.emit();
    }
    abort() { this.controller?.abort(); }
    schedule(ms) { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), ms); }
    generating() {
        const stop = document.getElementById('mes_stop');
        return !!stop && getComputedStyle(stop).display !== 'none';
    }
    flush() {
        if (!this.active) return;
        if (this.generating()) { this.schedule(1500); return; }                               // 스트리밍 중에는 멈춤
        const roots = [...this.dirty].filter(n => n.isConnected); this.dirty.clear();
        for (const el of roots) if (!roots.some(o => o !== el && o.contains(el))) this.processRoot(el);
        this.emit();
    }
    emit() { try { this.onChange(); } catch (e) { console.warn('[DARAK]', e); } }

    // ---- 구역 판정 ----
    isOptionBlocked(el) { const o = el.closest?.('option'); return !!o && !o.hasAttribute('data-i18n'); }
    origText(node) { return this.applied.get(node)?.key ?? normKey(node.nodeValue); }
    extKey(drawer) {
        const head = drawer.querySelector(':scope > .inline-drawer-toggle, :scope > .inline-drawer-header');
        const b = head?.querySelector('b') || head;
        if (!b) return '';
        const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) { const k = this.origText(w.currentNode); if (k) return k; }
        return '';
    }
    isExtDrawer(el) {
        return el.classList?.contains('inline-drawer') && !!el.closest(EXT_ROOTS) && !el.parentElement?.closest('.inline-drawer');
    }
    listExtensions() {
        const out = [];
        for (const d of document.querySelectorAll('#extensions_settings .inline-drawer, #extensions_settings2 .inline-drawer')) {
            if (!this.isExtDrawer(d)) continue;
            const k = this.extKey(d);
            if (k && !out.includes(k)) out.push(k);
        }
        return out;
    }
    blockedSelf(el, ext) {
        if (el.matches(SKIP_SELECTOR)) return true;
        if (el.tagName === 'OPTION' && !el.hasAttribute('data-i18n')) return true;
        if (ext.size && this.isExtDrawer(el) && ext.has(this.extKey(el))) return true;
        return false;
    }
    blockedUp(el, ext, forAttr = false) {
        if (!el) return true;
        if (el.closest(forAttr ? SKIP_ATTR_SELECTOR : SKIP_SELECTOR) || this.isOptionBlocked(el)) return true;
        if (ext.size) for (let d = el.closest('.inline-drawer'); d; d = d.parentElement?.closest('.inline-drawer')) if (this.isExtDrawer(d) && ext.has(this.extKey(d))) return true;
        return false;
    }
    texts(root, ext) {
        const out = [];
        if (!root) return out;
        if (root.nodeType === 3) { if (!this.blockedUp(root.parentElement, ext)) out.push(root); return out; }
        if (root.nodeType !== 1 || this.blockedUp(root, ext)) return out;
        const self = this;
        const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode(n) {
                if (n.nodeType === 3) return NodeFilter.FILTER_ACCEPT;
                return self.blockedSelf(n, ext) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
            },
        });
        while (w.nextNode()) if (w.currentNode.nodeType === 3) out.push(w.currentNode);
        return out;
    }

    // ---- 위치·종류 정보(모델에 맥락으로만 보냄) ----
    contextOf(el) {
        const clip = t => normKey(t).slice(0, 40);
        const parts = [];
        const drawer = el.closest('.drawer');
        const panel = drawer?.querySelector(':scope > .drawer-toggle .drawer-icon');
        const pt = panel?.getAttribute('title') || panel?.getAttribute('data-i18n')?.replace(/^\[[^\]]*\]/, '');
        if (pt) parts.push(clip(pt));
        const inline = el.closest('.inline-drawer');
        const head = inline?.querySelector(':scope > .inline-drawer-toggle b, :scope > .inline-drawer-header b');
        if (head) { const k = this.extKey(inline); if (k) parts.push(clip(k)); }
        if (el.closest('#toast-container')) parts.push('notification');
        else if (el.closest('dialog, .popup')) parts.push('dialog');
        const kind = el.closest('#toast-container') ? 'message'
            : el.closest('button, .menu_button, [role="button"], a.menu_button') ? 'button'
            : el.closest('h1, h2, h3, h4, h5, b, strong, summary, .inline-drawer-header, .drawer-header') ? 'title'
            : (el.closest('small, .note-link-span, p, .notes, .flex-container > i') || normKey(el.textContent).length > 60) ? 'description'
            : 'label';
        return {where: parts.join(' › '), kind};
    }

    // ---- 화면에 적용 ----
    state() { const s = this.s; return {ext: new Set(s.excludedExt), excluded: new Set(s.excluded), kept: new Set(s.kept)}; }
    processRoot(root) {
        const st = this.state(), cache = this.s.cache;
        for (const node of this.texts(root, st.ext)) this.handleText(node, st, cache);
        const base = root.nodeType === 1 ? root : root.parentElement;
        if (!base) return;
        const els = [...(base.matches?.('[data-i18n*="["]') ? [base] : []), ...base.querySelectorAll('[data-i18n*="["]')];
        for (const el of els) if (!this.blockedUp(el, st.ext, true)) this.handleAttrs(el, st, cache);
    }
    handleText(node, st, cache) {
        const raw = node.nodeValue;
        const known = this.applied.get(node);
        if (known) { if (raw === known.shown) return; this.applied.delete(node); }          // 다른 코드가 글자를 바꿨으면 기록을 버린다
        const key = normKey(raw);
        if (!key || st.excluded.has(key)) return;
        const ko = cache[key];
        if (ko) {
            const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
            const shown = lead + ko + trail;
            this.applied.set(node, {orig: raw, shown, key});
            node.nodeValue = shown;
            return;
        }
        if (st.kept.has(key) || !isCandidate(key) || this.pending.has(key)) return;
        const parent = node.parentElement;
        if (parent?.closest(TOAST) && !isFixedToast(key)) return;
        this.pending.set(key, this.contextOf(parent));
    }
    handleAttrs(el, st, cache) {
        const spec = el.getAttribute('data-i18n') || '';
        for (const attr of ATTRS) {
            if (!spec.includes(`[${attr}]`)) continue;
            const val = el.getAttribute(attr);
            if (!val) continue;
            const prev = [...this.appliedAttrs].find(r => r.el === el && r.attr === attr);
            if (prev) { if (val === prev.shown) continue; this.appliedAttrs.delete(prev); }
            const key = normKey(val);
            if (!key || st.excluded.has(key)) continue;
            const ko = cache[key];
            if (ko) { el.setAttribute(attr, ko); this.appliedAttrs.add({el, attr, orig: val, shown: ko, key}); }
            else if (!st.kept.has(key) && isCandidate(key) && !this.pending.has(key)) this.pending.set(key, {where: this.contextOf(el).where, kind: 'label'});
        }
    }
    restoreAll() {
        for (const [node, r] of this.applied) if (node.nodeValue === r.shown) node.nodeValue = r.orig;
        this.applied.clear();
        for (const r of this.appliedAttrs) if (r.el.getAttribute(r.attr) === r.shown) r.el.setAttribute(r.attr, r.orig);
        this.appliedAttrs.clear();
    }
    /** 바꾼 글자를 모두 되돌린 뒤 저장된 표로 다시 적용하고 대기 목록을 새로 만든다. */
    refreshView() {
        this.restoreAll(); this.pending.clear();
        if (this.active) this.processRoot(document.body);
        this.emit();
    }
    pruneApplied() {
        if (this.applied.size > 4000) for (const n of this.applied.keys()) if (!n.isConnected) this.applied.delete(n);
        if (this.appliedAttrs.size > 800) for (const r of this.appliedAttrs) if (!r.el.isConnected) this.appliedAttrs.delete(r);
    }

    // ---- 번역 ----
    profileId() { return this.s.profileId || this.getFallbackProfile() || ''; }
    counts() {
        const s = this.s;
        return {translated: Object.keys(s.cache).length, pending: this.pending.size, excluded: s.excluded.length + s.kept.length};
    }
    /** @param {'all'|'pending'} mode all: 화면을 다시 훑어 모은 것 전부 / pending: 새로 생겨 대기 중인 것만 */
    async translate(mode = 'all') {
        if (!this.active) { this.onStatus('먼저 \'화면 전체 한국어\'를 켜 주세요.'); return; }
        if (this.running) return;
        const profile = this.profileId();
        if (!profile) { this.onStatus('번역에 쓸 연결 프로필을 골라 주세요.'); return; }
        if (!this.getProfiles().some(p => p.id === profile)) { this.onStatus('저장된 번역 프로필을 선택해 주세요.'); return; }
        if (mode === 'all') { this.pending.clear(); this.processRoot(document.body); }
        this.running = true;
        const controller = new AbortController(); this.controller = controller;
        const s = this.s, fails = new Map();
        const todo = () => [...this.pending].filter(([k]) => !s.cache[k] && !s.kept.includes(k) && !s.excluded.includes(k) && (fails.get(k) || 0) < 2);
        let calls = 0, done = 0, errors = 0, stopped = false;
        const total0 = Math.ceil(todo().length / UI_BATCH);
        try {
            if (!total0) { this.onStatus('번역할 새 글자가 없습니다.'); return; }
            const service = await this.getService();
            while (this.active && !controller.signal.aborted) {
                const queue = todo();
                if (!queue.length) break;
                if (Object.keys(s.cache).length >= MAX_CACHE) { this.onStatus(`저장 한도(${MAX_CACHE}개)에 도달했습니다. 번역 수정 목록에서 정리해 주세요.`); break; }
                const slice = queue.slice(0, UI_BATCH);
                const batch = slice.map(([text, ctx], i) => ({n: i + 1, t: text, where: ctx.where, kind: ctx.kind}));
                calls++;
                const total = Math.max(total0, calls - 1 + Math.ceil(queue.length / UI_BATCH));
                this.onStatus(`번역 중 ${calls}/${total} · 이번 ${batch.length}줄 · 남은 ${queue.length}줄`);
                try {
                    const messages = [
                        {role: 'system', content: buildSystemPrompt({terms: s.terms, glossary: this.getGlossary()})},
                        {role: 'user', content: JSON.stringify(batch)},
                    ];
                    // 추론 모델은 생각에 출력 토큰을 먼저 쓰므로 넉넉하게 잡는다.
                    const response = await service.sendRequest(profile, messages, Math.min(16000, Math.max(1500, batch.length * 90)), {stream: false, signal: controller.signal, includePreset: false, includeInstruct: false});
                    if (controller.signal.aborted) break;
                    const map = parseNumbered(extractText(response), batch);
                    let ok = 0;
                    for (const {t} of batch) {
                        const raw = map.get(t);
                        const v = raw === undefined ? '' : cleanUi(raw, t);
                        if (!v) { fails.set(t, (fails.get(t) || 0) + 1); continue; }
                        if (normKey(v) === t) { if (!s.kept.includes(t)) s.kept.push(t); }
                        else if (!s.edited.includes(t) || !s.cache[t]) s.cache[t] = v;
                        this.pending.delete(t); ok++;
                    }
                    done += ok; errors = 0;
                    this.save(); this.applyAll(); this.emit();
                } catch (e) {
                    if (controller.signal.aborted) break;
                    console.warn('[DARAK] 화면 번역 묶음', e);
                    for (const {t} of batch) fails.set(t, (fails.get(t) || 0) + 1);
                    if (++errors >= 2) { this.onStatus(`번역 연결 오류로 멈췄습니다 · ${e?.cause?.message || e?.message || e}`); stopped = true; break; }
                }
                await new Promise(r => setTimeout(r, 250));                                  // 화면과 호출 제한을 위해 숨 돌리기
            }
            if (!stopped) {
                const left = todo().length;
                this.onStatus(controller.signal.aborted ? `중지했습니다 · 저장 ${done}줄 · 남은 ${left}줄` : left ? `${done}줄 저장 · 번역되지 않은 ${left}줄(다시 눌러 재시도)` : `완료 · ${done}줄 저장`);
            }
        } catch (e) {
            console.warn('[DARAK]', e);
            this.onStatus(`번역 연결 오류 · ${e?.cause?.message || e?.message || e}`);
        } finally {
            this.running = false; if (this.controller === controller) this.controller = null;
            this.pruneApplied(); this.emit();
        }
    }
    applyAll() { if (this.active) this.processRoot(document.body); }
    async getService() {
        if (this.service) return this.service;
        if (this.loadService) { this.service = await this.loadService(); return this.service; }
        const module = await import('/scripts/extensions/shared.js');
        if (!module?.ConnectionManagerRequestService?.sendRequest) throw Error('현재 실리태번에서 프로필 요청 서비스를 사용할 수 없습니다.');
        return (this.service = module.ConnectionManagerRequestService);
    }

    // ---- 고치기·제외·되돌리기 ----
    list(query = '', limit = 100) {
        const q = String(query || '').trim().toLowerCase(), s = this.s;
        const items = Object.entries(s.cache).filter(([k, v]) => !q || k.toLowerCase().includes(q) || v.toLowerCase().includes(q)).sort((a, b) => a[0].localeCompare(b[0]));
        return {total: items.length, items: items.slice(0, limit).map(([key, value]) => ({key, value, edited: s.edited.includes(key)}))};
    }
    setOverride(key, value) {
        const s = this.s, v = String(value ?? '').trim().slice(0, VAL_MAX);
        if (v) { s.cache[key] = v; if (!s.edited.includes(key)) s.edited.push(key); s.kept = s.kept.filter(x => x !== key); }
        else { delete s.cache[key]; s.edited = s.edited.filter(x => x !== key); }
        this.save(); this.refreshView();
    }
    /** 줄 단위 '원문으로': 번역을 지우고 원문 유지로 기억해서 다시 번역하지 않는다. */
    toKept(key) {
        const s = this.s;
        delete s.cache[key]; s.edited = s.edited.filter(x => x !== key);
        if (!s.kept.includes(key)) s.kept.push(key);
        this.save(); this.refreshView();
    }
    addExcluded(key) {
        const s = this.s;
        delete s.cache[key]; s.edited = s.edited.filter(x => x !== key); s.kept = s.kept.filter(x => x !== key);
        if (!s.excluded.includes(key)) s.excluded.push(key);
        this.save(); this.refreshView();
    }
    removeExcluded(key) { const s = this.s; s.excluded = s.excluded.filter(x => x !== key); this.save(); this.refreshView(); }
    setExtExcluded(name, on) {
        const s = this.s, k = normKey(name).slice(0, EXT_MAX);
        s.excludedExt = on ? [...new Set([...s.excludedExt, k])] : s.excludedExt.filter(x => x !== k);
        this.save(); this.refreshView();
    }
    clearAll() {
        const s = this.s;
        s.cache = Object.create(null); s.kept = []; s.edited = [];
        this.abort(); this.save(); this.refreshView();
        this.onStatus('저장된 번역을 모두 지웠습니다. 화면은 원문으로 돌아왔습니다.');
    }
    exportData() { const s = this.s; return {format: 'darak-ui-translation', version: 1, cache: s.cache, kept: s.kept, edited: s.edited, excluded: s.excluded}; }
    /** 번역 목록 전용 파일 가져오기. 같은 원문은 파일의 번역으로 덮어쓴다. */
    importData(value) {
        if (!value || value.format !== 'darak-ui-translation' || value.version !== 1) throw Error('호환되지 않는 형식입니다.');
        const incoming = normalizeUiTranslation(value), s = this.s;
        for (const [k, v] of Object.entries(incoming.cache)) { if (Object.keys(s.cache).length >= MAX_CACHE && !s.cache[k]) break; s.cache[k] = v; }
        s.kept = [...new Set([...s.kept, ...incoming.kept])].filter(x => !s.cache[x]).slice(0, MAX_LIST);
        s.edited = [...new Set([...s.edited, ...incoming.edited])].filter(x => s.cache[x]).slice(0, MAX_LIST);
        s.excluded = [...new Set([...s.excluded, ...incoming.excluded])].slice(0, MAX_LIST);
        this.save(); this.refreshView();
        return Object.keys(incoming.cache).length;
    }
}
