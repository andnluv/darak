/** DARAK — 이미지 모아보기.
 *
 * One window that gathers generated images in two places:
 *  - 이 채팅: every image attached to a message of the open chat (a click jumps to that message);
 *  - 서버 폴더: the image folders SillyTavern keeps on the server (one folder per character by default).
 * Read-only: nothing is changed, moved or deleted.
 */
const PAGE = 60;
const IMG_EXT = /\.(png|jpe?g|webp|gif|avif|bmp|svg)(\?|#|$)/i;

export const DEFAULT_GALLERY = Object.freeze({ lastTab: 'chat' });
export function normalizeGallery(raw = {}) { return { lastTab: raw?.lastTab === 'server' ? 'server' : 'chat' }; }

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

const TAG_IMG = /<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi, MD_IMG = /!\[[^\]]*\]\(\s*<?([^)\s>]+)/g;
const SHOWABLE = /^(https?:\/\/|\/\/|\/|[\w.%\-]+\/)/i;
/** Addresses of images written straight into the message text (<img src> or ![](url)). Embedded data: images are skipped. */
export function inlineImages(text) {
    const out = [], t = typeof text === 'string' ? text : '';
    for (const re of [TAG_IMG, MD_IMG]) { re.lastIndex = 0; let m; while ((m = re.exec(t))) { const u = (re === TAG_IMG ? m[2] : m[1]).trim().replace(/&amp;/g, '&'); if (u && SHOWABLE.test(u) && !/^data:/i.test(u)) out.push(u); } }
    return out;
}
/** All images of a chat: attached to a message (image, swipes, media) or written into its text. [{url, mesId, name, swipe, inline}] */
export function collectChatImages(chat) {
    const out = [];
    (Array.isArray(chat) ? chat : []).forEach((m, mesId) => {
        if (!m || m.is_system && !m.extra) return;
        const x = m.extra || {}, seen = new Set(), add = (url, swipe = false, inline = false) => { if (typeof url !== 'string' || !url || seen.has(url)) return; seen.add(url); out.push({ url, mesId, name: m.name || '', swipe, inline }); };
        add(x.image);
        for (const u of Array.isArray(x.image_swipes) ? x.image_swipes : []) add(u, true);
        for (const it of Array.isArray(x.media) ? x.media : []) { if (typeof it === 'string') add(it); else if (it && (it.type === 'image' || it.type == null || IMG_EXT.test(it.url || ''))) add(it.url); }
        for (const u of inlineImages(m.mes)) add(u, false, true);
    });
    return out;
}

export class Gallery {
    constructor({ getSettings, save } = {}) { this.getSettings = getSettings; this.save = save; this.enabled = false; this.dialog = null; this.tab = null; this.folder = ''; this.folders = null; this.files = []; this.shown = PAGE; this.view = null; this.items = []; }
    ctx() { return window.SillyTavern?.getContext?.(); }
    start() {
        if (this.enabled) return; this.enabled = true;
        // v1.7.2: 요술봉 메뉴에는 「다락방」만 둡니다. 이 기능은 설정 창의 도구에서 엽니다.
        document.getElementById('ttk_gallery_menu')?.remove();
    }
    stop() { if (!this.enabled) return; this.enabled = false; document.getElementById('ttk_gallery_menu')?.remove(); this.close(); }
    close() { document.removeEventListener('keydown', this.onKey, true); this.dialog?.remove(); this.dialog = null; this.view = null; }

    async api(path, body) {
        const h = this.ctx()?.getRequestHeaders?.() || { 'Content-Type': 'application/json' };
        let r = await fetch(path, { method: 'POST', headers: h, body: JSON.stringify(body || {}) });
        if (r.status === 404 || r.status === 405) r = await fetch(path, { headers: h });
        if (!r.ok) throw Error(String(r.status));
        return r.json();
    }
    async loadFolders() {
        if (this.folders) return this.folders;
        const j = await this.api('/api/images/folders'); this.folders = (Array.isArray(j) ? j : []).map(f => typeof f === 'string' ? f : f?.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'));
        return this.folders;
    }
    async loadFiles(folder) {
        const j = await this.api('/api/images/list', { folder });
        return (Array.isArray(j) ? j : []).map(f => typeof f === 'string' ? f : f?.name || f?.path).filter(f => f && IMG_EXT.test(f)).reverse();
    }
    serverUrl(folder, file) { return `/user/images/${encodeURIComponent(folder)}/${file.split('/').map(encodeURIComponent).join('/')}`; }

    async open() {
        this.close();
        const d = this.dialog = el('dialog'); d.id = 'ttk-gallery'; d.setAttribute('aria-label', '이미지 모아보기');
        d.addEventListener('click', e => { if (e.target === d) d.close(); }); d.addEventListener('close', () => this.close());
        document.body.append(d); d.showModal();
        this.onKey = e => { if (!this.view) return; if (e.key === 'ArrowLeft') this.step(-1); else if (e.key === 'ArrowRight') this.step(1); else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.view = null; this.render(); } };
        document.addEventListener('keydown', this.onKey, true);
        this.tab = this.getSettings().lastTab; this.shown = PAGE; this.view = null;
        await this.render();
    }
    step(n) { if (!this.view) return; const i = this.view.index + n; if (i < 0 || i >= this.items.length) return; this.view.index = i; this.render(); }
    async render() {
        const d = this.dialog; if (!d) return; d.replaceChildren();
        const my = this.rid = (this.rid || 0) + 1, stale = () => this.rid !== my || this.dialog !== d; // a newer render replaces this one
        const head = el('div', 'ttk-inv-head'), t = el('div', 'ttk-inv-title'); t.append(el('strong', '', '이미지 모아보기'), el('small', '', '읽기 전용 · 아무것도 바꾸지 않습니다'));
        const x = el('button', 'ttk-inv-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', '닫기'); x.addEventListener('click', () => d.close());
        const acts = el('div', 'ttk-inv-head-actions'); acts.append(x); head.append(t, acts);
        const tabs = el('div', 'ttk-inv-tabs'); tabs.setAttribute('role', 'tablist');
        for (const [id, label] of [['chat', '이 채팅'], ['server', '서버 폴더']]) {
            const b = el('button', 'ttk-inv-tab', label); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(this.tab === id));
            b.addEventListener('click', () => { this.tab = id; this.shown = PAGE; this.view = null; this.getSettings().lastTab = id; this.save(); this.render(); }); tabs.append(b);
        }
        const body = el('div', 'ttk-inv-body'); d.append(head, tabs, body);
        if (this.tab === 'chat') this.renderChat(body); else await this.renderServer(body, stale);
        if (stale()) return;
        if (this.view) this.renderViewer(d);
    }
    grid(body, items) {
        this.items = items;
        if (!items.length) return;
        const g = el('div', 'ttk-gal-grid');
        items.slice(0, this.shown).forEach((it, i) => {
            const b = el('button', 'ttk-gal-cell'), img = el('img'); b.type = 'button'; img.src = it.url; img.loading = 'lazy'; img.alt = it.label || ''; img.addEventListener('error', () => { b.classList.add('ttk-gal-bad'); });
            b.append(img); b.addEventListener('click', () => { this.view = { index: i }; this.render(); }); g.append(b);
        });
        body.append(g);
        if (items.length > this.shown) { const more = el('button', 'ttk-inv-btn ttk-gal-more', `더 보기 (${this.shown}/${items.length})`); more.type = 'button'; more.addEventListener('click', () => { this.shown += PAGE; this.render(); }); body.append(more); }
    }
    renderChat(body) {
        const imgs = collectChatImages(this.ctx()?.chat);
        this.chatImages = imgs;
        if (!imgs.length) { body.append(el('p', 'ttk-inv-ok', '이 채팅에는 메시지에 붙었거나 본문에 들어 있는 이미지가 없습니다.')); this.items = []; return; }
        const inl = imgs.filter(i => i.inline).length;
        body.append(el('small', 'ttk-inv-foot', `이미지 ${imgs.length}장${inl ? ` (메시지 본문에 직접 들어 있는 이미지 ${inl}장 포함)` : ''} · 누르면 크게 보고, 메시지로 이동할 수 있습니다.`));
        this.grid(body, imgs.map(i => ({ ...i, label: `${i.mesId}번 메시지` })));
    }
    async renderServer(body, stale) {
        let folders;
        try { folders = await this.loadFolders(); if (stale()) return; } catch { body.append(el('p', 'ttk-inv-ok', '서버의 이미지 폴더 목록을 불러오지 못했습니다. 이 SillyTavern 버전에서는 목록 요청을 지원하지 않을 수 있습니다.')); this.items = []; return; }
        if (!folders.length) { body.append(el('p', 'ttk-inv-ok', '서버에 저장된 이미지 폴더가 없습니다.')); this.items = []; return; }
        if (!this.folder || !folders.includes(this.folder)) { const c = this.ctx(), mine = c?.characters?.[c?.characterId]?.name; this.folder = folders.includes(mine) ? mine : folders[0]; this.files = []; this.loaded = ''; }
        const bar = el('div', 'ttk-inv-tools'), sel = el('select', 'ttk-gal-select'); sel.setAttribute('aria-label', '폴더');
        for (const f of folders) { const o = el('option', '', f); o.value = f; if (f === this.folder) o.selected = true; sel.append(o); }
        sel.addEventListener('change', () => { this.folder = sel.value; this.loaded = ''; this.shown = PAGE; this.render(); });
        bar.append(sel); body.append(bar);
        if (this.loaded !== this.folder) { try { const f = await this.loadFiles(this.folder); if (stale()) return; this.files = f; this.loaded = this.folder; } catch { body.append(el('p', 'ttk-inv-ok', '이 폴더의 파일 목록을 불러오지 못했습니다.')); this.items = []; return; } }
        if (!this.files.length) { body.append(el('p', 'ttk-inv-ok', '이 폴더에 이미지가 없습니다.')); this.items = []; return; }
        body.append(el('small', 'ttk-inv-foot', `이미지 ${this.files.length}장 · 최신 파일이 앞에 옵니다.`));
        this.grid(body, this.files.map(f => ({ url: this.serverUrl(this.folder, f), label: f, file: f })));
    }
    renderViewer(d) {
        const it = this.items[this.view.index]; if (!it) { this.view = null; return; }
        const v = el('div', 'ttk-gal-view'), img = el('img'); img.src = it.url; img.alt = it.label || '';
        const bar = el('div', 'ttk-gal-viewbar'), prev = el('button', 'ttk-inv-btn', '‹ 이전'), next = el('button', 'ttk-inv-btn', '다음 ›'), close = el('button', 'ttk-inv-btn', '닫기');
        for (const b of [prev, next, close]) b.type = 'button';
        prev.disabled = this.view.index === 0; next.disabled = this.view.index >= this.items.length - 1;
        prev.addEventListener('click', () => this.step(-1)); next.addEventListener('click', () => this.step(1)); close.addEventListener('click', () => { this.view = null; this.render(); });
        bar.append(prev, el('span', 'ttk-gal-count', `${this.view.index + 1} / ${this.items.length}`), next);
        if (it.mesId != null) { const go = el('button', 'ttk-inv-btn', '메시지로 이동'); go.type = 'button'; go.addEventListener('click', () => this.jump(it.mesId)); bar.append(go); }
        else { const open = el('a', 'ttk-inv-btn', '원본 열기'); open.href = it.url; open.target = '_blank'; open.rel = 'noopener'; bar.append(open); }
        bar.append(close);
        v.append(img, bar); d.append(v);
    }
    jump(mesId) {
        const m = document.querySelector(`#chat .mes[mesid="${mesId}"]`);
        if (!m) { window.toastr?.info?.(`${mesId}번 메시지가 화면에 불러와져 있지 않습니다. 채팅을 위로 올려 이전 메시지를 더 불러온 뒤 다시 눌러 주세요.`); return; }
        this.dialog?.close(); m.scrollIntoView({ block: 'center' }); m.classList.add('ttk-gal-flash'); setTimeout(() => m.classList.remove('ttk-gal-flash'), 2200);
    }
}
