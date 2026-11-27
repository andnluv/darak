/** DARAK — 화자 얼굴 (multi-character bots: show the speaker's face beside each dialogue line).
 *
 * Nothing in the message text is ever rewritten. On screen only:
 *  - a small face is put in front of each dialogue span (`span.ttk-dialogue`, made by the design module);
 *  - a registered `[이름]` tag right before a dialogue is hidden (`span.ttk-ftag`) — it stays in the chat data,
 *    so the model keeps seeing and following the format.
 * Who is speaking: (1) the `[이름]` tag, (2) otherwise the nearest registered name/alias around the dialogue.
 * A face can be changed by hand (tap the face → 바꾸기); that choice is kept in message.extra.ttk_face_pick.
 * Pictures are ordinary user files (/api/files/upload), settings only hold their paths.
 */
import { shrink, toBase64 } from './avatars.js';
import { confirmAsk } from './dialogs.js';

export const MAX_FACES = 150;
export const MAX_MOODS = 12;
export const MOOD_LABELS = { angry: '화남', annoyed: '짜증', blush: '홍조', crying: '울음', embarrassed: '당황', expressionless: '무표정', gloomy: '우울', laughing: '웃음', panic: '놀람', smile: '미소', mask: '가면', happy: '기쁨', sad: '슬픔', surprised: '놀람', neutral: '기본', shy: '수줍음' };
const NEUTRAL_ORDER = ['expressionless', 'neutral', 'smile', 'default'];
const moodLabel = k => MOOD_LABELS[k] || k;
const pickUrl = (e, mood) => (mood && e.moods?.find(m => m.k === mood)?.url) || e.url;
const NAMES_IN_PROMPT = 30; // 이름이 이보다 많으면 지시문에 이름 목록을 싣지 않는다(토큰 절약)
const URL_OK = /^\/?user\/files\/[\w.\-%]+$/;
const PROMPT_KEY = 'darak_faces';
const TAG_RE = /[\[［【〔]\s*([^\]］】〕\n]{1,20}?)\s*[\]］】〕]\s*[:：]?\s*$/;

/** fit = {cx, cy, z, r}: the square shown in the face circle is centred at (cx, cy) (fractions of the picture) and is 1/z of the
 *  picture's shorter side; r is width/height of the stored picture. Nothing is cut from the stored file — it can be moved later. */
export function normalizeFit(f) {
    if (!f || typeof f !== 'object') return null;
    const n = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
    return { cx: n(f.cx, 0, 1, 0.5), cy: n(f.cy, 0, 1, 0.5), z: n(f.z, 1, 6, 1), r: n(f.r, 0.2, 5, 1) };
}
/** Draw a picture into a round/square node with its fit. Without a fit it is centred and covers the node. */
export function facePaint(node, e, url) {
    node.style.backgroundImage = `url("${url}")`; node.style.backgroundRepeat = 'no-repeat';
    const f = e?.fit;
    if (!f) { node.style.backgroundSize = 'cover'; node.style.backgroundPosition = 'center'; return; }
    const kx = f.z * Math.max(f.r, 1), ky = kx / f.r, pos = (c, k) => (Math.abs(k - 1) < 1e-6 ? 50 : ((0.5 - c * k) / (1 - k)) * 100);
    node.style.backgroundSize = `${kx * 100}% ${ky * 100}%`; node.style.backgroundPosition = `${pos(f.cx, kx)}% ${pos(f.cy, ky)}%`;
}
/** Starting fit for a bust-up picture: its upper middle, where the face usually is. */
export function presetFit(w, h) {
    const r = w / h;
    if (r > 1.15) { const side = 0.62; return { cx: 0.5, cy: 0.03 + side / 2, z: 1 / side, r }; }
    if (r < 1 / 1.15) return { cx: 0.5, cy: 0.03 + 0.5 * r, z: 1, r };
    return null;
}

export const DEFAULT_FACES = Object.freeze({ prompt: true, cards: {} });
export function normalizeFaces(raw = {}) {
    const cards = {};
    for (const [key, v] of Object.entries(raw?.cards && typeof raw.cards === 'object' ? raw.cards : {})) {
        if (!/^(char|group):/.test(key) || key.length > 300) continue;
        const seen = new Set();
        const entries = (Array.isArray(v?.entries) ? v.entries : []).filter(e => e && typeof e.id === 'string' && typeof e.url === 'string' && URL_OK.test(e.url))
            .map(e => ({
                id: e.id.slice(0, 40), url: e.url.startsWith('/') ? e.url : `/${e.url}`, name: String(e.name || '').trim().slice(0, 20),
                aliases: (Array.isArray(e.aliases) ? e.aliases : []).map(a => String(a || '').trim().slice(0, 20)).filter(Boolean).slice(0, 6),
                fit: normalizeFit(e.fit),
                moods: (Array.isArray(e.moods) ? e.moods : []).filter(m => m && typeof m.k === 'string' && typeof m.url === 'string' && URL_OK.test(m.url)).slice(0, MAX_MOODS)
                    .map(m => ({ k: m.k.slice(0, 20), url: m.url.startsWith('/') ? m.url : `/${m.url}` })),
            }))
            .filter(e => e.name && !seen.has(e.id) && seen.add(e.id)).slice(0, MAX_FACES);
        if (entries.length) cards[key] = { entries };
    }
    return { prompt: raw?.prompt !== false, cards };
}

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const norm = s => String(s || '').trim().toLowerCase();

/** names → lookup. For guessing from running text keys are at least 2 characters (a 1-syllable name hits too many words);
 *  an explicit [이름] tag is matched with minLen 1. */
export function buildIndex(entries, minLen = 2) {
    const keys = [];
    for (const e of entries) for (const n of [e.name, ...(e.aliases || [])]) { const k = norm(n); if (k.length >= minLen) keys.push({ k, id: e.id }); }
    const owners = new Map(); for (const { k, id } of keys) { if (!owners.has(k)) owners.set(k, new Set()); owners.get(k).add(id); }
    const uniq = keys.filter(({ k }) => owners.get(k).size === 1); // 두 인물이 같이 쓰는 이름(성 등)은 추정에서 제외
    uniq.sort((a, b) => b.k.length - a.k.length);
    return uniq;
}
export const byName = (index, name) => index.find(x => x.k === norm(name))?.id || null;
/** The registered name that appears last in `text` (the nearest one before a dialogue). */
export function lastMention(index, text) {
    const t = text.toLowerCase(); let best = null;
    for (const { k, id } of index) { const i = t.lastIndexOf(k); if (i >= 0 && (!best || i + k.length > best.end)) best = { id, end: i + k.length }; }
    return best?.id || null;
}
/** The registered name that appears first in `text`, only within the first `limit` characters. */
export function firstMention(index, text, limit = 24) {
    const t = text.toLowerCase().slice(0, limit); let best = null;
    for (const { k, id } of index) { const i = t.indexOf(k); if (i >= 0 && (!best || i < best.at)) best = { id, at: i }; }
    return best?.id || null;
}

/** "리온 바레 (S-0417)" → 이름 "리온 바레", 다른 이름 ["S-0417", "리온", "바레"]. 「」 같은 꾸밈 괄호는 뗀다. */
export function cleanName(raw) {
    let n = String(raw || '').replace(/\s+/g, ' ').trim(); const aliases = [];
    const m = n.match(/^(.*?)\s*[（(]([^)）]{1,20})[)）]\s*$/); if (m && m[1]) { n = m[1].trim(); aliases.push(m[2].trim()); }
    n = n.replace(/^[「『“"'\[]+|[」』”"'\]]+$/g, '').trim();
    for (const part of n.split(' ')) if (part.length >= 2 && part !== n) aliases.push(part);
    return { name: n.slice(0, 20), aliases: [...new Set(aliases)].filter(a => a && a !== n).map(a => a.slice(0, 20)).slice(0, 6) };
}
/** Pull (name, picture) pairs out of a page's HTML: each <img> with the nearest bold/heading text in its own card. */
export function parseGallery(html, base) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html'), out = [], seen = new Set();
    for (const img of doc.querySelectorAll('img')) {
        const raw = img.getAttribute('src') || img.getAttribute('data-src') || ''; if (!raw || raw.startsWith('data:')) continue;
        let url; try { url = new URL(raw, base || undefined).href; } catch { continue; }
        if (!/^https?:/.test(url) || seen.has(url)) continue;
        let name = '', sub = '', box = img.parentElement;
        for (let i = 0; i < 4 && box; i++, box = box.parentElement) {
            if (box.querySelectorAll('img').length > 1) break;
            const n = box.querySelector('b,strong,h1,h2,h3,h4,h5,h6,figcaption,[class*=name i]');
            if (n && n.textContent.trim()) { name = n.textContent; sub = box.querySelector('small')?.textContent || ''; break; }
        }
        if (!name) { name = img.getAttribute('alt') || ''; if (!name.trim()) { try { name = decodeURIComponent(url.split('/').pop().replace(/\.[^.]+$/, '')); } catch { name = ''; } } }
        const c = cleanName(name); if (!c.name) continue;
        seen.add(url); out.push({ ...c, sub: sub.replace(/\s+/g, ' ').trim().slice(0, 40), url });
    }
    return out;
}

/** Minimal zip reader (stored + deflate, no password, no ZIP64): lists entries and inflates one at a time. */
export async function readZip(file) {
    const size = file.size, tailLen = Math.min(size, 65557 + 22);
    const tail = new DataView(await file.slice(size - tailLen).arrayBuffer());
    let eocd = -1; for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw Error('zip 파일이 아닙니다.');
    const count = tail.getUint16(eocd + 10, true), cdSize = tail.getUint32(eocd + 12, true), cdOff = tail.getUint32(eocd + 16, true);
    if (cdOff === 0xffffffff || cdSize === 0xffffffff) throw Error('ZIP64 형식(아주 큰 zip)은 지원하지 않습니다.');
    const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer()), dec = new TextDecoder('utf-8'), out = []; let p = 0;
    for (let n = 0; n < count && p + 46 <= cd.byteLength; n++) {
        if (cd.getUint32(p, true) !== 0x02014b50) break;
        const flags = cd.getUint16(p + 8, true), method = cd.getUint16(p + 10, true), csize = cd.getUint32(p + 20, true), usize = cd.getUint32(p + 24, true);
        const nl = cd.getUint16(p + 28, true), xl = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true), off = cd.getUint32(p + 42, true);
        const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nl)); p += 46 + nl + xl + cl;
        if (name.endsWith('/') || (flags & 1) || name.startsWith('__MACOSX/') || name.split('/').pop().startsWith('.')) continue;
        out.push({ name, size: usize, async blob() {
            const lh = new DataView(await file.slice(off, off + 30).arrayBuffer()), start = off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true), raw = file.slice(start, start + csize);
            if (method === 0) return raw; if (method !== 8) throw Error('지원하지 않는 압축 방식입니다.');
            return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
        } });
    }
    return out;
}
/** Face thumbnail. With `crop`, a wide (bust-up) picture is cut to a square on its upper middle, where the face usually is. */
export async function faceBlob(file, crop = true, out = 256) {
    const bmp = await createImageBitmap(file), w = bmp.width, h = bmp.height; let sx = 0, sy = 0, sw = w, sh = h;
    if (crop && w / h > 1.15) { sh = Math.round(h * 0.62); sw = sh; sx = Math.round((w - sw) / 2); sy = Math.round(h * 0.03); }
    else if (crop && h / w > 1.15) { sh = w; sy = Math.round(h * 0.03); }
    const k = Math.min(1, out / Math.max(sw, sh)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
    c.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height); bmp.close?.();
    const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.9)); if (!blob) throw Error('이미지를 변환하지 못했습니다.'); return blob;
}
/** "구야_angry.png" → {name:'구야', mood:'angry'}; without "_" the whole name is the character. */
export function splitMoodName(file) {
    const base = String(file).split('/').pop().replace(/\.[^.]+$/, ''), i = base.lastIndexOf('_');
    return i > 0 && i < base.length - 1 ? { name: base.slice(0, i), mood: base.slice(i + 1).toLowerCase() } : { name: base, mood: '' };
}
export const defaultMood = moods => NEUTRAL_ORDER.find(k => moods.includes(k)) || moods[0] || '';

export class Faces {
    constructor({ getSettings, save } = {}) { this.getSettings = getSettings; this.save = save; this.enabled = false; this.pop = null; }
    ctx() { return window.SillyTavern?.getContext?.(); }
    S() { return this.getSettings(); }

    // ---- whose list ----
    key() {
        const c = this.ctx(); if (!c) return '';
        if (c.groupId) return `group:${c.groupId}`;
        const f = c.characters?.[c.characterId]?.avatar; return f ? `char:${f}` : '';
    }
    entries(key = this.key()) { return this.S().cards[key]?.entries || []; }
    face(id) { return this.entries().find(e => e.id === id) || null; }

    // ---- speaker detection and drawing ----
    /** Remove everything this module put into a host and restore the original text nodes. */
    clean(host) {
        host.querySelectorAll('.ttk-face').forEach(n => n.remove());
        const tags = host.querySelectorAll('span.ttk-ftag');
        tags.forEach(n => n.replaceWith(document.createTextNode(n.textContent)));
        if (tags.length) host.normalize();
    }
    /** Range text between the end of the previous dialogue (or the block start) and this dialogue. */
    around(host, span, spans) {
        const block = span.closest('p,li,blockquote,h1,h2,h3,h4,h5,h6') || host, i = spans.indexOf(span);
        const prev = spans[i - 1], next = spans[i + 1];
        const before = document.createRange(), after = document.createRange();
        if (prev && block.contains(prev)) before.setStartAfter(prev); else before.setStart(block, 0);
        before.setEndBefore(span);
        after.setStartAfter(span);
        if (next && block.contains(next)) after.setEndBefore(next); else after.setEnd(block, block.childNodes.length);
        return { before, after, block };
    }
    /** If the text right before the dialogue ends with a registered `[이름]`, return {id, node, from, to}. */
    tagBefore(range, index) {
        const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
        let last = null, n;
        while ((n = walker.nextNode())) {
            if (!range.intersectsNode(n)) continue;
            if (n.parentElement?.closest('.ttk-dialogue')) continue;
            if (n.nodeValue.trim()) last = n;
        }
        if (!last) return null;
        let text = last.nodeValue;
        if (last === range.endContainer) text = text.slice(0, range.endOffset);
        const m = TAG_RE.exec(text); if (!m) return null;
        const id = byName(index, m[1]); if (!id) return null;
        return { id, node: last, from: m.index, to: m.index + m[0].replace(/\s+$/, '').length };
    }
    process(host) {
        if (!this.enabled || !host?.isConnected) return;
        this.clean(host);
        const entries = this.entries(); if (!entries.length) return;
        const spans = [...host.querySelectorAll('span.ttk-dialogue')]; if (!spans.length) return;
        const index = buildIndex(entries), tagIndex = buildIndex(entries, 1), mes = host.closest('.mes'), c = this.ctx();
        const mesId = mes ? Number(mes.getAttribute('mesid')) : NaN, msg = Number.isNaN(mesId) ? null : c?.chat?.[mesId];
        const pick = msg?.extra?.ttk_face_pick || {};
        spans.forEach((span, ord) => {
            let id = null, tag = null;
            const { before, after } = this.around(host, span, spans);
            tag = this.tagBefore(before, tagIndex);
            if (tag) id = tag.id;
            else id = firstMention(index, after.toString()) || lastMention(index, before.toString());
            let mood = '';
            if (Object.prototype.hasOwnProperty.call(pick, ord)) { const [pid, pm] = String(pick[ord] || '').split('#'); id = pid || null; mood = pm || ''; }
            if (tag) { // hide the tag on screen; the text stays in the data
                const node = tag.node, mid = node.splitText(tag.from), rest = mid.splitText(tag.to - tag.from);
                const w = el('span', 'ttk-ftag'); mid.replaceWith(w); w.append(mid); void rest;
            }
            const e = id && entries.find(x => x.id === id); if (!e) return;
            const b = el('span', 'ttk-face'); b.setAttribute('role', 'button'); b.tabIndex = 0; b.dataset.id = e.id; b.dataset.ord = String(ord); b.dataset.mood = mood;
            b.setAttribute('aria-label', `${e.name} (눌러서 이름 보기)`);
            facePaint(b, e, pickUrl(e, mood));
            const anchor = span.previousSibling instanceof Element && span.previousSibling.classList?.contains('ttk-ftag') ? span.previousSibling : span;
            anchor.before(b);
        });
    }
    /** Re-draw every message (settings or entries changed). */
    refresh() {
        document.querySelectorAll('#chat .mes_text,#chat .ttk-tr-text').forEach(h => this.process(h));
        this.syncPrompt();
    }
    cleanup() { document.querySelectorAll('#chat .mes_text,#chat .ttk-tr-text').forEach(h => this.clean(h)); this.closePop(); }

    // ---- tap a face: name + 바꾸기 (no hover) ----
    closePop() { this.pop?.remove(); this.pop = null; document.removeEventListener('pointerdown', this.onDown, true); document.removeEventListener('keydown', this.onKey, true); }
    openPop(faceEl, { change = false, mood = false } = {}) {
        this.closePop();
        const entries = this.entries(), e = entries.find(x => x.id === faceEl.dataset.id); if (!e) return;
        const pop = this.pop = el('div', 'ttk-face-pop'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', '화자 얼굴');
        if (!change && !mood) {
            const row = el('div', 'ttk-face-pop-row'); row.append(el('strong', '', e.name));
            const b = el('button', 'ttk-face-pop-btn', '바꾸기'); b.type = 'button'; b.addEventListener('click', () => this.openPop(faceEl, { change: true })); row.append(b);
            if (e.moods?.length) { const m = el('button', 'ttk-face-pop-btn', '표정'); m.type = 'button'; m.addEventListener('click', () => this.openPop(faceEl, { mood: true })); row.append(m); }
            pop.append(row);
        } else if (mood) {
            pop.append(el('div', 'ttk-face-pop-title', `${e.name}의 표정`));
            const grid = el('div', 'ttk-face-pop-grid');
            for (const x of [{ k: '', url: e.url }, ...e.moods]) {
                const b = el('button', 'ttk-face-pop-pick'); b.type = 'button'; b.setAttribute('aria-pressed', String((faceEl.dataset.mood || '') === x.k));
                const th = el('span', 'ttk-face-thumb'); facePaint(th, e, x.url); b.append(th, el('span', '', x.k ? moodLabel(x.k) : '기본')); b.addEventListener('click', () => this.setPick(faceEl, x.k ? `${e.id}#${x.k}` : e.id)); grid.append(b);
            }
            pop.append(grid);
        } else {
            pop.append(el('div', 'ttk-face-pop-title', '이 대사의 화자'));
            const grid = el('div', 'ttk-face-pop-grid');
            for (const x of entries) {
                const b = el('button', 'ttk-face-pop-pick'); b.type = 'button'; b.setAttribute('aria-pressed', String(x.id === e.id));
                const th = el('span', 'ttk-face-thumb'); facePaint(th, x, x.url); b.append(th, el('span', '', x.name)); b.addEventListener('click', () => this.setPick(faceEl, x.id)); grid.append(b);
            }
            const none = el('button', 'ttk-face-pop-pick ttk-face-pop-none'); none.type = 'button'; none.append(el('span', '', '얼굴 없음')); none.addEventListener('click', () => this.setPick(faceEl, '')); grid.append(none);
            pop.append(grid);
        }
        document.body.append(pop);
        const r = faceEl.getBoundingClientRect(), pr = pop.getBoundingClientRect();
        const left = Math.max(8, Math.min(window.innerWidth - pr.width - 8, r.left)), top = r.bottom + pr.height + 8 > window.innerHeight ? Math.max(8, r.top - pr.height - 6) : r.bottom + 6;
        pop.style.left = `${left}px`; pop.style.top = `${top}px`;
        this.onDown = ev => { if (this.pop && !this.pop.contains(ev.target) && !ev.target.closest?.('.ttk-face')) this.closePop(); };
        this.onKey = ev => { if (ev.key === 'Escape') this.closePop(); };
        setTimeout(() => { document.addEventListener('pointerdown', this.onDown, true); document.addEventListener('keydown', this.onKey, true); });
    }
    setPick(faceEl, id) {
        const c = this.ctx(), mes = faceEl.closest('.mes'), mesId = Number(mes?.getAttribute('mesid')), msg = c?.chat?.[mesId];
        this.closePop(); if (!msg) return;
        const pick = { ...(msg.extra?.ttk_face_pick || {}), [faceEl.dataset.ord]: id };
        msg.extra = { ...(msg.extra || {}), ttk_face_pick: pick };
        mes.querySelectorAll('.mes_text,.ttk-tr-text').forEach(h => this.process(h)); c.saveChat?.();
    }

    // ---- prompt: ask the model to put [이름] before each dialogue ----
    promptText() {
        const names = this.entries().map(e => e.name); if (!names.length) return '';
        const list = names.length <= NAMES_IN_PROMPT ? ` 쓸 수 있는 이름: ${names.join(', ')}.` : ' 이름은 등장인물의 이름 그대로 쓴다.';
        return `[대사 화자 표기] 대사(따옴표 안의 말)를 쓸 때마다 바로 앞에 말하는 인물의 이름을 [이름] 꼴로 붙인다.${list} 예: [${names[0]}] “…” 지문, 독백, 설명에는 붙이지 않는다.`;
    }
    syncPrompt() {
        const c = this.ctx(); if (!c?.setExtensionPrompt) return;
        const on = this.enabled && this.S().prompt !== false, text = on ? this.promptText() : '';
        try { c.setExtensionPrompt(PROMPT_KEY, text, c.extension_prompt_types?.IN_CHAT ?? 1, 1, false, c.extension_prompt_roles?.SYSTEM ?? 0); } catch (e) { console.warn('[DARAK] 화자 표기 지시문 설정 실패', e); }
    }

    // ---- registering pictures ----
    async putFile(file) {
        const c = this.ctx();
        const { blob, ext } = await shrink(file), name = `ttk_face_${uid()}.${ext}`;
        const r = await fetch('/api/files/upload', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ name, data: await toBase64(blob) }) });
        if (!r.ok) throw Error(String(r.status));
        const { path } = await r.json(); if (!path) throw Error('경로 없음');
        return `/${String(path).replace(/^\/+/, '')}`;
    }
    addEntry(name, url, aliases = []) {
        const key = this.key(); if (!key) return false;
        const card = this.S().cards[key] ||= { entries: [] };
        if (card.entries.length >= MAX_FACES) { window.toastr?.warning?.(`얼굴은 카드마다 최대 ${MAX_FACES}명까지 등록할 수 있습니다.`); return false; }
        card.entries.push({ id: uid(), name: String(name || '이름 없음').trim().slice(0, 20), url, aliases: aliases.slice(0, 6) }); return true;
    }
    /** Files: the file name (without extension) becomes the character name. */
    async addFiles(files) {
        let added = 0, failed = 0;
        for (const f of files) {
            try { if (!f.type.startsWith('image/')) throw Error('이미지 파일이 아닙니다.'); const url = await this.putFile(f); if (this.addEntry(f.name.replace(/\.[^.]+$/, ''), url)) added++; else break; }
            catch (e) { failed++; console.warn('[DARAK] face upload failed', f.name, e); }
        }
        this.save(); this.refresh(); if (failed) window.toastr?.error?.(`${failed}장을 올리지 못했습니다.`); return added;
    }
    async addUrl(name, address) {
        let blob; try { const r = await fetch(address); if (!r.ok) throw Error(String(r.status)); blob = await r.blob(); } catch (e) { throw Error('그 주소의 사진을 가져오지 못했습니다. 사이트가 막아 두었을 수 있으니 사진을 내려받아 올려 주세요.'); }
        const url = await this.putFile(new File([blob], 'face', { type: blob.type || 'image/png' }));
        const ok = this.addEntry(name, url); this.save(); this.refresh(); return ok;
    }
    /** Use a character card's own picture, named after the card. */
    async addFromCard(avatar) {
        const c = this.ctx(), ch = c?.characters?.find(x => x.avatar === avatar); if (!ch) throw Error('카드를 찾지 못했습니다.');
        const r = await fetch(`/characters/${encodeURIComponent(avatar)}`); if (!r.ok) throw Error(String(r.status));
        const url = await this.putFile(new File([await r.blob()], 'face', { type: 'image/png' }));
        const ok = this.addEntry(ch.name, url); this.save(); this.refresh(); return ok;
    }
    async removeEntry(id) {
        const key = this.key(), card = this.S().cards[key]; const e = card?.entries.find(x => x.id === id); if (!e) return;
        card.entries = card.entries.filter(x => x.id !== id); if (!card.entries.length) delete this.S().cards[key];
        this.save(); this.refresh();
        for (const u of [e.url, ...(e.moods || []).map(m => m.url)]) {
            const used = Object.values(this.S().cards).some(cd => cd.entries.some(x => x.url === u || x.moods?.some(m => m.url === u)));
            if (!used) { try { await fetch('/api/files/delete', { method: 'POST', headers: this.ctx().getRequestHeaders(), body: JSON.stringify({ path: u.replace(/^\//, '') }) }); } catch { /* best effort */ } }
        }
    }

    // ---- move/zoom the face inside its circle (non-destructive) ----
    async openCrop(entry, done) {
        document.getElementById('ttk-face-crop')?.remove();
        const probe = new Image(); probe.src = entry.url; try { await probe.decode(); } catch { return window.toastr?.error?.('사진을 불러오지 못했습니다.'); }
        const r = probe.naturalWidth / probe.naturalHeight, fit = { ...(normalizeFit(entry.fit) || { cx: 0.5, cy: 0.5, z: 1 }), r };
        const wrap = el('div'); wrap.id = 'ttk-face-crop'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', '얼굴 위치 조정');
        const box = el('div', 'ttk-fi-box'); wrap.append(box);
        const close = () => { document.removeEventListener('keydown', onKey, true); wrap.remove(); done?.(); };
        const head = el('div', 'ttk-fi-head'); head.append(el('strong', '', `${entry.name} · 얼굴 위치 조정`)); const x = el('button', 'ttk-fi-x', '닫기'); x.type = 'button'; x.addEventListener('click', close); head.append(x); box.append(head);
        box.append(el('p', 'ttk-note', '그림을 끌어서 옮기고(키보드는 방향키), 아래 칸으로 크기를 맞추세요. 어두운 바깥쪽은 채팅에서 보이지 않습니다. 원본은 자르지 않으므로 언제든 다시 바꿀 수 있고, 표정 그림도 같은 위치를 씁니다.'));
        const stage = el('div', 'ttk-crop-stage'); stage.tabIndex = 0; stage.setAttribute('aria-label', '얼굴 위치 (끌거나 방향키)'); box.append(stage);
        let url = entry.url;
        const dims = () => { const kx = fit.z * Math.max(fit.r, 1), ky = kx / fit.r; return { kx, ky }; };
        const clamp = () => { const { kx, ky } = dims(); fit.cx = Math.min(1 - 0.5 / kx, Math.max(0.5 / kx, fit.cx)); fit.cy = Math.min(1 - 0.5 / ky, Math.max(0.5 / ky, fit.cy)); };
        const draw = () => { clamp(); facePaint(stage, { fit }, url); };
        const zoom = el('input'); zoom.type = 'range'; zoom.min = '1'; zoom.max = '4'; zoom.step = '0.05'; zoom.value = String(Math.min(4, fit.z)); zoom.setAttribute('aria-label', '크기');
        zoom.addEventListener('input', () => { fit.z = Number(zoom.value); draw(); });
        const zl = el('label', 'ttk-field'); zl.append(el('span', '', '크기'), zoom); box.append(zl);
        if (entry.moods?.length) {
            const sel = el('select'); sel.setAttribute('aria-label', '미리 볼 표정'); sel.append(new Option('기본', ''));
            for (const m of entry.moods) sel.append(new Option(moodLabel(m.k), m.url));
            sel.addEventListener('change', () => { url = sel.value || entry.url; draw(); });
            const sl = el('label', 'ttk-field'); sl.append(el('span', '', '미리 볼 표정'), sel); box.append(sl);
        }
        let drag = null;
        stage.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY, cx: fit.cx, cy: fit.cy }; stage.setPointerCapture?.(ev.pointerId); ev.preventDefault(); });
        stage.addEventListener('pointermove', ev => {
            if (!drag) return; const { kx, ky } = dims(), w = stage.clientWidth || 240;
            fit.cx = drag.cx - (ev.clientX - drag.x) / (kx * w); fit.cy = drag.cy - (ev.clientY - drag.y) / (ky * w); draw();
        });
        const end = () => { drag = null; }; stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
        stage.addEventListener('keydown', ev => {
            const st = 0.02 / fit.z, d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[ev.key]; if (!d) return;
            ev.preventDefault(); ev.stopPropagation(); fit.cx += d[0]; fit.cy += d[1]; draw();
        });
        const actions = el('div', 'ttk-actions');
        const reset = el('button', 'ttk-button', '처음 위치로'); reset.type = 'button'; reset.addEventListener('click', () => { const p = presetFit(probe.naturalWidth, probe.naturalHeight) || { cx: 0.5, cy: 0.5, z: 1, r }; Object.assign(fit, p, { r }); zoom.value = String(Math.min(4, fit.z)); draw(); });
        const save = el('button', 'ttk-button', '저장'); save.type = 'button'; save.addEventListener('click', () => { clamp(); entry.fit = normalizeFit(fit); this.save(); this.refresh(); close(); });
        const cancel = el('button', 'ttk-button', '취소'); cancel.type = 'button'; cancel.addEventListener('click', close);
        actions.append(reset, cancel, save); box.append(actions);
        const onKey = ev => { if (ev.key === 'Escape') close(); }; document.addEventListener('keydown', onKey, true);
        document.body.append(wrap); draw(); stage.focus();
    }

    // ---- import from a page's code (or its address) ----
    async putBlob(blob, ext = 'webp') {
        const c = this.ctx(), name = `ttk_face_${uid()}.${ext}`;
        const r = await fetch('/api/files/upload', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ name, data: await toBase64(blob) }) });
        if (!r.ok) throw Error(String(r.status));
        const { path } = await r.json(); if (!path) throw Error('경로 없음');
        return `/${String(path).replace(/^\/+/, '')}`;
    }
    openZip(done) {
        document.getElementById('ttk-face-import')?.remove();
        const key = this.key(); if (!key) return window.toastr?.warning?.('카드를 먼저 선택해 주세요.');
        const wrap = el('div'); wrap.id = 'ttk-face-import'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', '표정 묶음(zip)에서 가져오기');
        const box = el('div', 'ttk-fi-box'); wrap.append(box);
        const close = () => { document.removeEventListener('keydown', onKey, true); wrap.remove(); done?.(); };
        const head = el('div', 'ttk-fi-head'); head.append(el('strong', '', '표정 묶음(zip)에서 가져오기')); const x = el('button', 'ttk-fi-x', '닫기'); x.type = 'button'; x.addEventListener('click', close); head.append(x); box.append(head);
        box.append(el('p', 'ttk-note', '“인물_표정.png” 꼴의 파일(예: 구야_smile.png)이 들어 있는 zip을 고르면 인물마다 한 명으로 묶고, 표정은 얼굴을 눌러 바꿀 수 있게 저장합니다. 기본 얼굴은 무표정, 없으면 미소, 없으면 첫 파일입니다. 큰 그림은 긴 변 512px로 줄여 올리므로 zip이 커도 서버에는 조금만 쌓이고, 그림 자체는 자르지 않아 얼굴 위치를 나중에 다시 맞출 수 있습니다. 이 작업은 브라우저 안에서만 이루어지고 zip은 어디로도 보내지 않습니다.'));
        const file = el('input'); file.type = 'file'; file.accept = '.zip,application/zip'; file.hidden = true; file.setAttribute('aria-label', 'zip 파일'); // 테마가 파일 입력칸을 가릴 수 있어 자체 버튼을 쓴다
        const pickRow = el('div', 'ttk-actions'), pickBtn = el('button', 'ttk-button', 'zip 파일 고르기'); pickBtn.type = 'button'; pickBtn.addEventListener('click', () => file.click());
        const pickName = el('span', 'ttk-note', '고른 파일 없음'); pickRow.append(pickBtn, pickName, file);
        const cropRow = el('label', 'ttk-style-check'), crop = el('input'); crop.type = 'checkbox'; crop.checked = true; cropRow.append(crop, el('span', '', '가로·세로가 긴 그림은 처음 위치를 위쪽 가운데(얼굴)에 맞추기 (나중에 목록의 [위치 조정]으로 바꿀 수 있음)'));
        const status = el('p', 'ttk-note'), list = el('div', 'ttk-fi-list'), go = el('button', 'ttk-button', '선택한 인물 가져오기'); go.type = 'button'; go.hidden = true;
        box.append(pickRow, cropRow, status, list, go);
        let groups = [];
        const have = () => new Set(this.entries().map(e => norm(e.name)));
        const chosen = () => groups.filter(g => g.cb.checked && !g.cb.disabled);
        const count = () => { go.textContent = `선택한 인물 가져오기 (${chosen().length}명)`; };
        file.addEventListener('change', async () => {
            const f = file.files?.[0]; list.replaceChildren(); go.hidden = true; groups = []; pickName.textContent = f ? f.name : '고른 파일 없음'; if (!f) return;
            status.textContent = '읽는 중…';
            try {
                const entries = (await readZip(f)).filter(e => /\.(png|jpe?g|webp|gif|avif)$/i.test(e.name)), map = new Map();
                for (const e of entries) { const { name, mood } = splitMoodName(e.name); if (!name) continue; if (!map.has(name)) map.set(name, []); map.get(name).push({ mood, entry: e }); }
                if (!map.size) throw Error('이미지 파일을 찾지 못했습니다.');
                const h = have();
                for (const [name, files] of map) {
                    const c = cleanName(name), row = el('label', 'ttk-fi-row'), cb = el('input'); cb.type = 'checkbox'; cb.checked = true; cb.addEventListener('change', count);
                    const t = el('span', 'ttk-fi-name'); t.append(el('b', '', c.name), el('small', '', `표정 ${files.length}개 · ${files.map(x => moodLabel(x.mood) || '기본').slice(0, 6).join(', ')}${files.length > 6 ? ' …' : ''}`));
                    if (h.has(norm(c.name))) { cb.checked = false; cb.disabled = true; t.append(el('small', '', '이미 등록됨')); }
                    row.append(cb, t); list.append(row); groups.push({ name: c.name, aliases: c.aliases, files, cb });
                }
                status.textContent = `인물 ${groups.length}명, 그림 ${entries.length}장을 찾았습니다.`; go.hidden = false; count();
            } catch (e) { status.textContent = e?.message || String(e); }
        });
        go.addEventListener('click', async () => {
            const picks = chosen(); if (!picks.length) return;
            if (picks.length + this.entries().length > MAX_FACES) return window.toastr?.warning?.(`카드마다 최대 ${MAX_FACES}명입니다.`);
            go.disabled = pickBtn.disabled = true; let ok = 0, fail = 0, n = 0, i = 0;
            const one = async g => {
                let dims = null;
                const up = async f => { const src = await f.entry.blob(); if (!dims) { const bmp = await createImageBitmap(src); dims = [bmp.width, bmp.height]; bmp.close?.(); } return this.putBlob(await faceBlob(src, false, 512)); };
                const moods = g.files.filter(f => f.mood).slice(0, MAX_MOODS), pool = moods.length ? moods : g.files.slice(0, 1);
                const def = moods.length ? pool.find(f => f.mood === defaultMood(pool.map(x => x.mood))) || pool[0] : pool[0];
                const urls = new Map(); for (const f of pool) urls.set(f, await up(f));
                const card = this.S().cards[this.key()] ||= { entries: [] };
                card.entries.push({ id: uid(), name: g.name, aliases: g.aliases, url: urls.get(def), fit: crop.checked && dims ? presetFit(dims[0], dims[1]) : null, moods: moods.map(f => ({ k: f.mood, url: urls.get(f) })) });
            };
            const work = async () => { while (i < picks.length) { const g = picks[i++]; try { await one(g); ok++; } catch (e) { fail++; console.warn('[DARAK] zip import failed', g.name, e); } status.textContent = `가져오는 중… ${++n}/${picks.length}`; } };
            await Promise.all([work(), work(), work()]);
            this.save(); this.refresh(); status.textContent = `${ok}명을 가져왔습니다.${fail ? ` ${fail}명은 실패했습니다.` : ''}`;
            for (const g of groups) if (have().has(norm(g.name))) { g.cb.checked = false; g.cb.disabled = true; }
            go.disabled = pickBtn.disabled = false; count(); this.onChange?.();
        });
        const onKey = e => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', onKey, true);
        document.body.append(wrap);
    }
    async fetchPicture(url) {
        const r = await fetch(url, { credentials: 'omit' }); if (!r.ok) throw Error(String(r.status));
        const blob = await r.blob(); return this.putFile(new File([blob], 'face', { type: blob.type && blob.type.startsWith('image/') ? blob.type : 'image/webp' }));
    }
    openImport(done) {
        document.getElementById('ttk-face-import')?.remove();
        const key = this.key(); if (!key) return window.toastr?.warning?.('카드를 먼저 선택해 주세요.');
        const wrap = el('div'); wrap.id = 'ttk-face-import'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', '페이지에서 얼굴 가져오기');
        const box = el('div', 'ttk-fi-box'); wrap.append(box);
        const close = () => { wrap.remove(); done?.(); };
        const head = el('div', 'ttk-fi-head'); head.append(el('strong', '', '페이지에서 얼굴 가져오기')); const x = el('button', 'ttk-fi-x', '닫기'); x.type = 'button'; x.addEventListener('click', close); head.append(x); box.append(head);
        box.append(el('p', 'ttk-note', '인물 도감 같은 페이지의 코드(개발자 도구 Elements에서 복사)를 붙여 넣고, 사진 주소의 기준이 되는 사이트 주소를 적으세요. 사진 옆의 굵은 글씨나 제목을 이름으로 읽습니다. 코드를 비우고 주소만 적으면 그 페이지를 직접 읽어 봅니다(막힌 사이트에서는 실패합니다).'));
        const code = el('textarea', 'ttk-fi-code'); code.rows = 5; code.placeholder = '붙여넣을 HTML 코드'; code.setAttribute('aria-label', 'HTML 코드');
        const base = el('input', 'ttk-fi-base'); base.type = 'url'; base.placeholder = '기준 주소 (예: https://example.github.io/site/)'; base.setAttribute('aria-label', '기준 주소');
        const read = el('button', 'ttk-button', '읽기'); read.type = 'button';
        const status = el('p', 'ttk-note'), tools = el('div', 'ttk-fi-tools'), list = el('div', 'ttk-fi-list'), go = el('button', 'ttk-button', '선택한 얼굴 가져오기'); go.type = 'button'; go.hidden = true;
        box.append(code, base, read, status, tools, list, go);
        let items = [];
        const have = () => new Set(this.entries().map(e => norm(e.name)));
        const chosen = () => items.filter(i => i.cb && i.cb.checked && !i.cb.disabled);
        const refreshCount = () => { const n = chosen().length; go.textContent = `선택한 얼굴 가져오기 (${n}명)`; };
        const draw = filter => {
            list.replaceChildren(); const q = norm(filter), h = have();
            for (const it of items) {
                const show = !q || norm(`${it.name} ${it.sub} ${it.aliases.join(' ')}`).includes(q);
                if (!it.row) {
                    const row = el('label', 'ttk-fi-row'), cb = el('input'); cb.type = 'checkbox'; it.cb = cb; cb.addEventListener('change', () => { if (cb.checked && chosen().length + this.entries().length > MAX_FACES) { cb.checked = false; window.toastr?.warning?.(`카드마다 최대 ${MAX_FACES}명입니다.`); } refreshCount(); });
                    const im = el('img'); im.src = it.url; im.alt = ''; im.loading = 'lazy'; const t = el('span', 'ttk-fi-name'); t.append(el('b', '', it.name), el('small', '', it.sub));
                    if (h.has(norm(it.name))) { cb.disabled = true; t.append(el('small', '', '이미 등록됨')); }
                    row.append(cb, im, t); it.row = row;
                }
                it.row.hidden = !show; list.append(it.row);
            }
            refreshCount();
        };
        read.addEventListener('click', async () => {
            read.disabled = true; status.textContent = '읽는 중…';
            try {
                let html = code.value.trim(), b = base.value.trim();
                if (!html) { if (!b) throw Error('코드를 붙여 넣거나 주소를 적어 주세요.'); const r = await fetch(b, { credentials: 'omit' }); if (!r.ok) throw Error(`페이지를 읽지 못했습니다 (${r.status}).`); html = await r.text(); }
                if (!b && !/^https?:/i.test((html.match(/<img[^>]+src=["']([^"']+)/i) || [])[1] || '')) throw Error('사진 주소가 상대 경로입니다. 기준 주소를 적어 주세요.');
                items = parseGallery(html, b || undefined);
                if (!items.length) throw Error('이미지를 찾지 못했습니다. 이미지가 스크립트로 그려지는 페이지라면 화면에 보이는 상태의 코드를 복사해 붙여 넣어 주세요.');
                status.textContent = `사진 ${items.length}장을 찾았습니다. 가져올 인물을 고르세요.`;
                tools.replaceChildren(); const q = el('input'); q.type = 'search'; q.placeholder = '이름·소속으로 찾기'; q.setAttribute('aria-label', '찾기'); q.addEventListener('input', () => draw(q.value));
                const all = el('button', 'ttk-button', '보이는 항목 모두 선택'); all.type = 'button'; all.addEventListener('click', () => { for (const it of items) if (it.cb && !it.cb.disabled && !it.row.hidden && chosen().length + this.entries().length < MAX_FACES) it.cb.checked = true; refreshCount(); });
                const none = el('button', 'ttk-button', '선택 해제'); none.type = 'button'; none.addEventListener('click', () => { for (const it of items) if (it.cb) it.cb.checked = false; refreshCount(); });
                tools.append(q, all, none); draw(''); go.hidden = false;
            } catch (e) { status.textContent = e?.message || String(e); items = []; list.replaceChildren(); tools.replaceChildren(); go.hidden = true; }
            read.disabled = false;
        });
        go.addEventListener('click', async () => {
            const picks = chosen(); if (!picks.length) return; go.disabled = read.disabled = true; let ok = 0, fail = 0, n = 0, i = 0;
            const work = async () => { while (i < picks.length) { const it = picks[i++]; try { const url = await this.fetchPicture(it.url); if (this.addEntry(it.name, url, it.aliases)) ok++; } catch (e) { fail++; console.warn('[DARAK] face import failed', it.url, e); } status.textContent = `가져오는 중… ${++n}/${picks.length}`; } };
            await Promise.all([work(), work(), work(), work()]);
            this.save(); this.refresh(); status.textContent = `${ok}명을 가져왔습니다.${fail ? ` ${fail}명은 실패했습니다(사이트가 사진 가져오기를 막았을 수 있습니다).` : ''}`;
            for (const it of items) if (it.cb) { it.cb.checked = false; if (have().has(norm(it.name))) it.cb.disabled = true; }
            go.disabled = read.disabled = false; refreshCount(); this.onChange?.();
        });
        const onKey = e => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey, true); close(); } }; document.addEventListener('keydown', onKey, true);
        document.body.append(wrap); code.focus();
    }

    // ---- life cycle ----
    start() {
        if (this.enabled) return; this.enabled = true;
        this.onClick = ev => { const f = ev.target.closest?.('.ttk-face'); if (f && f.closest('#chat')) { ev.preventDefault(); ev.stopPropagation(); this.openPop(f); } };
        this.onKeyFace = ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList?.contains('ttk-face')) { ev.preventDefault(); this.openPop(ev.target); } };
        const chat = document.getElementById('chat'); chat?.addEventListener('click', this.onClick, true); chat?.addEventListener('keydown', this.onKeyFace, true); this.chatEl = chat;
        const c = this.ctx(), ev = c?.eventSource, T = c?.eventTypes || {};
        this.handlers = [[T.CHAT_CHANGED, () => { this.closePop(); this.refresh(); this.onChange?.(); }]];
        for (const [t, f] of this.handlers) if (t) ev?.on?.(t, f);
        this.refresh();
    }
    stop() {
        if (!this.enabled) return; this.enabled = false;
        this.chatEl?.removeEventListener('click', this.onClick, true); this.chatEl?.removeEventListener('keydown', this.onKeyFace, true);
        const ev = this.ctx()?.eventSource; for (const [t, f] of this.handlers || []) if (t) ev?.removeListener?.(t, f);
        this.cleanup(); this.syncPrompt();
    }

    // ---- settings panel body ----
    buildPanel(btn) {
        const root = el('div', 'ttk-controls'), self = this;
        root.append(el('p', 'ttk-note', '여러 인물이 나오는 봇에서 대사 앞에 말한 인물의 얼굴을 보여 줍니다. 얼굴 목록은 카드마다 따로 저장되고, 채팅에 보이는 모양만 바꿉니다. 디자인 모듈이 켜져 있어야 대사가 인식됩니다.'));
        root.append(el('p', 'ttk-note', '화자는 대사 바로 앞의 [이름] 표기로 찾고, 없으면 대사 앞뒤 글에 나온 등록된 이름으로 추정합니다(한 글자 이름은 표기로만 인식, 번역문에 얼굴을 보이려면 번역된 이름을 “다른 이름”에 넣으세요). 화면에서는 표기를 숨기며, 채팅 내용에는 그대로 남습니다. 얼굴을 누르면 이름과 [바꾸기]가 나옵니다.'));
        const promptRow = el('label', 'ttk-style-check'); const pc = el('input'); pc.type = 'checkbox'; pc.checked = this.S().prompt !== false;
        pc.addEventListener('change', () => { this.S().prompt = pc.checked; this.save(); this.syncPrompt(); });
        promptRow.append(pc, el('span', '', '대사 앞에 [이름]을 붙이도록 AI에게 지시문 보내기')); root.append(promptRow);
        root.append(el('p', 'ttk-note', '지시문은 등록된 이름만 담은 한 줄이며 끄면 보내지 않습니다. 프리셋이 대괄호 표기를 막는다면 끄고 이름 추정만 쓰세요.'));
        const where = el('p', 'ttk-note ttk-face-where'), list = el('div', 'ttk-face-list'), actions = el('div', 'ttk-actions');
        root.append(where, list, actions);
        const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.multiple = true; file.hidden = true;
        file.addEventListener('change', async () => { const fs = [...file.files]; file.value = ''; if (!fs.length) return; await this.addFiles(fs); render(); });
        const run = async fn => { try { await fn(); } catch (e) { window.toastr?.error?.(e?.message || String(e)); } render(); };
        actions.append(btn('사진 올리기 (파일 이름이 인물 이름)', () => { if (!self.key()) return window.toastr?.warning?.('카드를 먼저 선택해 주세요.'); file.click(); }), file,
            btn('주소로 추가', () => run(async () => {
                if (!self.key()) throw Error('카드를 먼저 선택해 주세요.');
                const name = window.prompt('인물 이름'); if (!name) return;
                const address = window.prompt('사진 주소 (https://…)'); if (!address) return;
                await self.addUrl(name, address.trim());
            })),
            btn('페이지에서 가져오기 (도감 등)', () => self.openImport(render)),
            btn('표정 묶음(zip) 가져오기', () => self.openZip(render)),
            btn('다른 카드 사진 가져오기', () => run(async () => {
                if (!self.key()) throw Error('카드를 먼저 선택해 주세요.');
                const chars = self.ctx()?.characters || []; if (!chars.length) throw Error('카드 목록을 불러오지 못했습니다.');
                const name = window.prompt('가져올 카드의 이름 (정확히 같은 이름)'); if (!name) return;
                const hit = chars.find(x => norm(x.name) === norm(name)); if (!hit) throw Error('같은 이름의 카드가 없습니다.');
                await self.addFromCard(hit.avatar);
            })));
        function row(e) {
            const r = el('div', 'ttk-face-row'), img = el('span', 'ttk-face-thumb'); facePaint(img, e, e.url); r.append(img);
            const name = el('input'); name.type = 'text'; name.value = e.name; name.maxLength = 20; name.placeholder = '이름'; name.setAttribute('aria-label', '이름');
            const al = el('input'); al.type = 'text'; al.value = (e.aliases || []).join(', '); al.placeholder = '다른 이름 (쉼표로 구분)'; al.setAttribute('aria-label', '다른 이름');
            const apply = () => { e.name = name.value.trim().slice(0, 20) || e.name; e.aliases = al.value.split(/[,，、]/).map(s => s.trim().slice(0, 20)).filter(Boolean).slice(0, 6); self.save(); self.refresh(); };
            name.addEventListener('change', apply); al.addEventListener('change', apply);
            const del = btn('삭제', async () => { if (!(await confirmAsk(`“${e.name}” 얼굴을 목록에서 지웁니다.`))) return; await self.removeEntry(e.id); render(); }, 'ttk-button-danger');
            const fields = el('div', 'ttk-face-fields'); fields.append(name, al); r.append(fields, btn('위치 조정', () => self.openCrop(e, render)), del); return r;
        }
        function render() {
            const key = self.key(), c = self.ctx(); list.replaceChildren();
            if (!key) { where.textContent = '카드가 선택되어 있지 않습니다. 채팅을 열면 그 카드의 얼굴 목록이 나옵니다.'; return; }
            const label = key.startsWith('group:') ? '이 그룹' : (c?.characters?.[c?.characterId]?.name || '이 카드');
            where.textContent = `${label}의 얼굴 목록 · ${self.entries().length}/${MAX_FACES}명`;
            const es = self.entries(); if (!es.length) { list.append(el('p', 'ttk-note', '아직 등록한 얼굴이 없습니다. 아래에서 사진을 올리면 파일 이름이 인물 이름이 됩니다.')); return; }
            for (const e of es) list.append(row(e));
        }
        this.onChange = render; render(); return root;
    }
}
