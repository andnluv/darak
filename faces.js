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

export const MAX_FACES = 24;
const URL_OK = /^\/?user\/files\/[\w.\-%]+$/;
const PROMPT_KEY = 'darak_faces';
const TAG_RE = /[\[［【〔]\s*([^\]］】〕\n]{1,20}?)\s*[\]］】〕]\s*[:：]?\s*$/;

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
    keys.sort((a, b) => b.k.length - a.k.length);
    return keys;
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
            if (Object.prototype.hasOwnProperty.call(pick, ord)) id = pick[ord] || null;
            if (tag) { // hide the tag on screen; the text stays in the data
                const node = tag.node, mid = node.splitText(tag.from), rest = mid.splitText(tag.to - tag.from);
                const w = el('span', 'ttk-ftag'); mid.replaceWith(w); w.append(mid); void rest;
            }
            const e = id && entries.find(x => x.id === id); if (!e) return;
            const b = el('span', 'ttk-face'); b.setAttribute('role', 'button'); b.tabIndex = 0; b.dataset.id = e.id; b.dataset.ord = String(ord);
            b.setAttribute('aria-label', `${e.name} (눌러서 이름 보기)`);
            const img = el('img'); img.src = e.url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false; b.append(img);
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
    openPop(faceEl, { change = false } = {}) {
        this.closePop();
        const entries = this.entries(), e = entries.find(x => x.id === faceEl.dataset.id); if (!e) return;
        const pop = this.pop = el('div', 'ttk-face-pop'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', '화자 얼굴');
        if (!change) {
            const row = el('div', 'ttk-face-pop-row'); row.append(el('strong', '', e.name));
            const b = el('button', 'ttk-face-pop-btn', '바꾸기'); b.type = 'button'; b.addEventListener('click', () => this.openPop(faceEl, { change: true })); row.append(b); pop.append(row);
        } else {
            pop.append(el('div', 'ttk-face-pop-title', '이 대사의 화자'));
            const grid = el('div', 'ttk-face-pop-grid');
            for (const x of entries) {
                const b = el('button', 'ttk-face-pop-pick'); b.type = 'button'; b.setAttribute('aria-pressed', String(x.id === e.id));
                const img = el('img'); img.src = x.url; img.alt = ''; b.append(img, el('span', '', x.name)); b.addEventListener('click', () => this.setPick(faceEl, x.id)); grid.append(b);
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
        return `[대사 화자 표기] 대사(따옴표 안의 말)를 쓸 때마다 바로 앞에 말하는 인물의 이름을 [이름] 꼴로 붙인다. 쓸 수 있는 이름: ${names.join(', ')}. 예: [${names[0]}] “…” 지문, 독백, 설명에는 붙이지 않는다.`;
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
    addEntry(name, url) {
        const key = this.key(); if (!key) return false;
        const card = this.S().cards[key] ||= { entries: [] };
        if (card.entries.length >= MAX_FACES) { window.toastr?.warning?.(`얼굴은 카드마다 최대 ${MAX_FACES}명까지 등록할 수 있습니다.`); return false; }
        card.entries.push({ id: uid(), name: String(name || '이름 없음').trim().slice(0, 20), url, aliases: [] }); return true;
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
        const used = Object.values(this.S().cards).some(cd => cd.entries.some(x => x.url === e.url));
        if (!used) { try { await fetch('/api/files/delete', { method: 'POST', headers: this.ctx().getRequestHeaders(), body: JSON.stringify({ path: e.url.replace(/^\//, '') }) }); } catch { /* best effort */ } }
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
        root.append(el('p', 'ttk-note', '화자는 대사 바로 앞의 [이름] 표기로 찾고, 없으면 대사 앞뒤 글에 나온 등록된 이름으로 추정합니다(한 글자 이름은 표기로만 인식, 번역문에 얼굴을 보이려면 번역된 이름을 '다른 이름'에 넣으세요). 화면에서는 표기를 숨기며, 채팅 내용에는 그대로 남습니다. 얼굴을 누르면 이름과 [바꾸기]가 나옵니다.'));
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
            btn('다른 카드 사진 가져오기', () => run(async () => {
                if (!self.key()) throw Error('카드를 먼저 선택해 주세요.');
                const chars = self.ctx()?.characters || []; if (!chars.length) throw Error('카드 목록을 불러오지 못했습니다.');
                const name = window.prompt('가져올 카드의 이름 (정확히 같은 이름)'); if (!name) return;
                const hit = chars.find(x => norm(x.name) === norm(name)); if (!hit) throw Error('같은 이름의 카드가 없습니다.');
                await self.addFromCard(hit.avatar);
            })));
        function row(e) {
            const r = el('div', 'ttk-face-row'), img = el('img'); img.src = e.url; img.alt = ''; r.append(img);
            const name = el('input'); name.type = 'text'; name.value = e.name; name.maxLength = 20; name.placeholder = '이름'; name.setAttribute('aria-label', '이름');
            const al = el('input'); al.type = 'text'; al.value = (e.aliases || []).join(', '); al.placeholder = '다른 이름 (쉼표로 구분)'; al.setAttribute('aria-label', '다른 이름');
            const apply = () => { e.name = name.value.trim().slice(0, 20) || e.name; e.aliases = al.value.split(/[,，、]/).map(s => s.trim().slice(0, 20)).filter(Boolean).slice(0, 6); self.save(); self.refresh(); };
            name.addEventListener('change', apply); al.addEventListener('change', apply);
            const del = btn('삭제', async () => { if (!(await confirmAsk(`“${e.name}” 얼굴을 목록에서 지웁니다.`))) return; await self.removeEntry(e.id); render(); }, 'ttk-button-danger');
            const fields = el('div', 'ttk-face-fields'); fields.append(name, al); r.append(fields, del); return r;
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
