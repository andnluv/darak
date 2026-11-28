/** 「한글화」 모듈 안의 '화면 전체 한국어' 묶음(v1.4.0). 별도 창 없이 패널 안에서 모두 처리한다. 마우스를 올려야 뜨는 안내는 쓰지 않는다. */
import {DEFAULT_KEEP_TERMS} from './ui-localization.js';

const PAGE = 60;
const FILE_MAX = 3 * 1024 * 1024;
const fmt = n => Number(n).toLocaleString('ko-KR');

export function buildUiTranslationPanel({el, btn, info, confirmAsk, translator, getSettings, save, changed, toast}) {
    const section = el('details', 'ttk-subsection');
    section.id = 'ttk-ui-localization';
    section.append(el('summary', '', '화면 전체 한국어'));
    const body = el('div', 'ttk-controls'); section.append(body);
    body.append(el('p', 'ttk-note', 'SillyTavern 기본 한국어에 없는 영어·중국어(한자)를 선택한 연결 프로필로 번역해 화면 글자만 바꿉니다. 확장 설정·창·고정 알림도 포함합니다. 채팅 본문, 입력칸의 값, 캐릭터·페르소나·프리셋·모델·파일 이름처럼 사용자가 쓰거나 고른 내용은 바꾸지 않습니다. 번역은 버튼을 눌렀을 때만 모델을 부르고(처음 한 번 200줄씩 7회 안팎), 결과는 설정에 저장해 다시 부르지 않습니다. 끄면 화면 전체가 원래대로 돌아옵니다. 요청에 모델 비용이 발생할 수 있습니다.'));

    // 켜기
    const onRow = el('label', 'ttk-module-row'); onRow.append(info('화면 전체 한국어', '기본 꺼짐. 켜면 저장된 번역을 화면에 적용하고, 새로 생긴 영어·중국어는 대기 목록에 모읍니다.'));
    const onBox = el('input'); onBox.type = 'checkbox'; onBox.checked = getSettings().enabled === true;
    onBox.addEventListener('change', () => { getSettings().enabled = onBox.checked; changed(); paint(); });
    onRow.append(onBox); body.append(onRow);

    // 연결 프로필
    const profRow = el('label', 'ttk-field'); profRow.append(el('strong', '', '연결 프로필'));
    const profile = el('select'); profRow.append(profile); body.append(profRow);
    const profNote = el('small', 'ttk-font-status'); body.append(profNote);
    function refreshProfiles() {
        const profiles = translator.getProfiles(), cur = getSettings().profileId;
        profile.replaceChildren();
        const follow = el('option', '', '번역 모듈에서 고른 프로필 따라가기'); follow.value = ''; profile.append(follow);
        for (const p of profiles) { const o = el('option', '', p.name); o.value = p.id; profile.append(o); }
        profile.value = profiles.some(p => p.id === cur) ? cur : '';
        profNote.textContent = profiles.length ? `연결 프로필 ${profiles.length}개` : '지원되는 저장 연결 프로필이 없습니다. 연결 관리자를 확인하세요.';
    }
    profile.addEventListener('change', () => { getSettings().profileId = profile.value; save(); });
    body.append(btn('프로필 목록 새로고침', refreshProfiles));

    // 상태·진행
    const count = el('p', 'ttk-note'); count.setAttribute('aria-live', 'polite');
    const progress = el('p', 'ttk-note'); progress.setAttribute('aria-live', 'polite');
    body.append(count, progress);
    function renderCounts() {
        const c = translator.counts();
        count.textContent = onBox.checked ? `번역됨 ${fmt(c.translated)} · 대기 ${fmt(c.pending)} · 제외 ${fmt(c.excluded)}` : `꺼짐 · 저장된 번역 ${fmt(c.translated)}줄`;
    }
    const actions = el('div', 'ttk-actions');
    const bAll = btn('화면 번역하기', () => translator.translate('all'));
    const bPending = btn('대기 중인 글자 번역', () => translator.translate('pending'));
    const bStop = btn('중지', () => translator.abort());
    const bClear = btn('모두 지우기', async () => { if (await confirmAsk('저장된 화면 번역을 모두 지울까요? 화면은 원문으로 돌아갑니다. 직접 고친 줄도 함께 지워집니다.', {ok: '지우기', danger: true})) translator.clearAll(); });
    actions.append(bAll, bPending, bStop, bClear); body.append(actions);
    function paint() {
        const on = onBox.checked;
        for (const b of [bAll, bPending, bClear]) b.disabled = !on || translator.running;
        bStop.disabled = !translator.running;
        renderCounts();
    }

    // 번역 수정 목록
    const edits = el('details', 'ttk-subsection'); edits.append(el('summary', '', '번역 수정 목록'));
    const editsBody = el('div', 'ttk-controls'); edits.append(editsBody); body.append(edits);
    const search = el('input'); search.type = 'search'; search.placeholder = '원문 또는 번역 검색'; search.setAttribute('aria-label', '번역 검색');
    const listBox = el('div', 'ttk-ui-list'); const more = btn('더 보기', () => { shown += PAGE; renderList(); });
    let shown = PAGE, timer = null;
    const editNote = el('p', 'ttk-note');
    editsBody.append(editNote, search, listBox, more);
    function renderList() {
        const {total, items} = translator.list(search.value, shown);
        editNote.textContent = `저장된 번역 ${fmt(translator.counts().translated)}줄${search.value.trim() ? ` · 검색 결과 ${fmt(total)}줄` : ''} · 직접 고친 줄은 다시 번역해도 덮어쓰지 않습니다. 수정은 화면 글자에만 적용됩니다.`;
        listBox.replaceChildren();
        for (const it of items) {
            const row = el('div', 'ttk-field ttk-translation-edit');
            row.append(el('small', '', it.edited ? `${it.key}  (직접 고침)` : it.key));
            const input = el('input'); input.type = 'text'; input.maxLength = 400; input.value = it.value; input.setAttribute('aria-label', `${it.key} 번역`);
            const ctl = el('div', 'ttk-actions');
            ctl.append(btn('저장', () => translator.setOverride(it.key, input.value)), btn('원문으로', () => translator.toKept(it.key)), btn('제외에 추가', () => translator.addExcluded(it.key)));
            row.append(input, ctl); listBox.append(row);
        }
        more.hidden = total <= items.length;
    }
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { shown = PAGE; renderList(); }, 200); });
    const io = el('div', 'ttk-actions');
    io.append(btn('번역 목록 내보내기', () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(translator.exportData())], {type: 'application/json'}));
        const a = el('a'); a.href = url; a.download = 'darak-ui-translation.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    }));
    const file = el('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
    io.append(btn('번역 목록 가져오기', () => file.click()), file);
    file.addEventListener('change', async () => {
        const f = file.files?.[0]; if (!f) return;
        try {
            if (f.size > FILE_MAX) throw Error('3MB 이하 JSON만 지원합니다.');
            const n = translator.importData(JSON.parse(await f.text()));
            toast?.success?.(`번역 ${fmt(n)}줄을 가져왔습니다.`, '다락방');
        } catch (e) { toast?.error?.(`번역 목록 가져오기 실패: ${e.message}`, '다락방'); } finally { file.value = ''; }
    });
    editsBody.append(io);
    // 제외한 글자
    const exBox = el('div', 'ttk-controls'); editsBody.append(exBox);
    function renderExcluded() {
        exBox.replaceChildren();
        const list = getSettings().excluded;
        exBox.append(el('p', 'ttk-note', `제외한 글자 ${fmt(list.length)}개 · 번역하지 않고 원문 그대로 둡니다.`));
        for (const key of list.slice(0, 100)) {
            const row = el('div', 'ttk-field ttk-translation-edit'); row.append(el('small', '', key));
            const ctl = el('div', 'ttk-actions'); ctl.append(btn('제외 해제', () => translator.removeExcluded(key))); row.append(ctl); exBox.append(row);
        }
    }
    edits.addEventListener('toggle', () => { if (edits.open) { shown = PAGE; renderList(); renderExcluded(); } });

    // 그대로 두는 용어
    const terms = el('details', 'ttk-subsection'); terms.append(el('summary', '', '그대로 두는 용어'));
    const termsBody = el('div', 'ttk-controls'); terms.append(termsBody); body.append(terms);
    termsBody.append(el('p', 'ttk-note', '번역하지 않고 영어로 둘 용어입니다(쉼표나 줄바꿈으로 구분). 다락방 용어집(번역·대필 공용)에 있는 단어는 그 표기를 따릅니다. 바꾼 용어는 앞으로의 번역부터 적용됩니다.'));
    const termsInput = el('textarea'); termsInput.rows = 4; termsInput.maxLength = 1000; termsInput.value = getSettings().terms; termsInput.setAttribute('aria-label', '그대로 두는 용어');
    termsInput.addEventListener('change', () => { getSettings().terms = termsInput.value.slice(0, 1000); save(); });
    termsBody.append(termsInput, btn('기본값으로', () => { termsInput.value = DEFAULT_KEEP_TERMS; getSettings().terms = DEFAULT_KEEP_TERMS; save(); }));

    // 확장별 제외
    const ext = el('details', 'ttk-subsection'); ext.append(el('summary', '', '이 확장 제외'));
    const extBody = el('div', 'ttk-controls'); ext.append(extBody); body.append(ext);
    function renderExt() {
        extBody.replaceChildren();
        extBody.append(el('p', 'ttk-note', '글자를 비교해 동작하는 확장이 번역 때문에 고장 나면 여기서 그 확장을 통째로 뺍니다. 누른 확장의 설정 화면은 번역하지 않고 원래대로 둡니다.'));
        const names = [...new Set([...translator.listExtensions(), ...getSettings().excludedExt])];
        if (!names.length) { extBody.append(el('small', 'ttk-note', '읽은 확장이 없습니다. 확장 화면을 한 번 연 뒤 다시 열어 주세요.')); return; }
        const chips = el('div', 'ttk-chips');
        for (const name of names) {
            const b = el('button', 'ttk-chip', name); b.type = 'button';
            b.setAttribute('aria-pressed', String(getSettings().excludedExt.includes(name)));
            b.addEventListener('click', () => { const on = !getSettings().excludedExt.includes(name); translator.setExtExcluded(name, on); b.setAttribute('aria-pressed', String(on)); });
            chips.append(b);
        }
        extBody.append(chips);
    }
    ext.addEventListener('toggle', () => { if (ext.open) renderExt(); });

    translator.onStatus = msg => { progress.textContent = msg; paint(); };
    translator.onChange = () => {
        paint();
        if (edits.open && !editsBody.contains(document.activeElement)) { renderList(); renderExcluded(); }
    };
    refreshProfiles(); paint();
    return {section, refreshProfiles, paint};
}
