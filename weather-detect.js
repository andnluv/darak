/** DARAK v1.5.0 — 채팅을 읽어 날씨·분위기를 정한다. 화면·설정을 건드리지 않는 순수 함수만 둔다.
 *
 * 우선순위: 최근 메시지일수록 우선. 한 메시지 안에서는 [날씨:…] 표기가 본문 낱말보다 우선이고, 같은 종류끼리는 뒤에 나온 것을 쓴다.
 * 낱말은 '비밀·준비·눈(目)'처럼 겹치는 말을 잡지 않도록 낱말 하나가 아니라 구절로만 찾는다.
 */
export const WEATHER_WINDOW = 30;   // 날씨는 최근 30개 메시지까지
export const MOOD_WINDOW = 12;      // 분위기(흩날리는 것)는 장면이 빨리 바뀌므로 최근 12개까지
export const TAG_RE = /\[\s*(날씨|weather|분위기|mood)\s*[:：]\s*([^\]\n]{1,24}?)\s*\]/gi;

const W_TAG = [
    ['none', /^(맑음|맑은|갬|개임|갠|없음|clear|sunny|none|fine)$/i],
    ['storm', /^(뇌우|천둥|번개|천둥번개|폭풍우|폭풍|storm|thunder(storm)?)$/i],
    ['rain', /^(비|폭우|가랑비|이슬비|보슬비|부슬비|소나기|장대비|빗속|rain|rainy|drizzle|heavy rain|light rain|downpour)$/i],
    ['snow', /^(눈|폭설|싸락눈|함박눈|눈보라|첫눈|snow|snowy|blizzard|heavy snow|light snow)$/i],
    ['fog', /^(흐림|흐린|안개|짙은 안개|먹구름|구름|fog|foggy|mist|misty|cloudy|overcast)$/i],
];
const M_TAG = [
    ['none', /^(없음|none|clear)$/i],
    ['petal', /^(꽃잎|벚꽃|꽃비|petals?|blossoms?|cherry blossoms?)$/i],
    ['leaf', /^(낙엽|단풍|단풍잎|leaf|leaves|falling leaves)$/i],
    ['firefly', /^(반딧불|반딧불이|개똥벌레|fireflies|firefly)$/i],
    ['ember', /^(불똥|불씨|불티|불꽃|embers?|sparks?)$/i],
    ['star', /^(별|별빛|은하수|stars?|starlight|starry)$/i],
];
const HI = /폭우|장대비|퍼붓|퍼부|쏟아|폭설|눈보라|펑펑|heavy|downpour|blizzard|pour/i;
const LO = /가랑비|이슬비|보슬비|부슬비|싸락눈|drizzle|light/i;

// 본문 구절. 같은 메시지 안에서는 가장 뒤에 나온 구절이 그 메시지의 날씨가 된다.
const W_WORDS = [
    ['none', /(?:비|눈|빗줄기|빗발|소나기|눈발)(?:가|이|는)?\s*(?:그치|그쳤|멎|멈추|멈췄|잦아들|잦아든)|하늘이\s*(?:개|갰|맑아|맑게)|맑게\s*갠|맑은\s*하늘|구름\s*한\s*점\s*없|햇살이\s*(?:쏟|내리쬐|비치)|햇볕이\s*(?:쏟|내리쬐)|\b(?:the\s+)?(?:rain|snow)\s+(?:stopped|had\s+stopped|let\s+up|ceased)|\bclear\s+(?:blue\s+)?sky/gi],
    ['storm', /천둥|뇌우|폭풍우|번개가\s*(?:치|쳤|번쩍|내리|갈라)|벼락이\s*(?:치|쳤|떨어)|\bthunder(?:storm|clap)?s?\b|\blightning\s+(?:flash|struck|split|crack|lit)/gi],
    ['rain', /비가\s*(?:(?:오래|계속|조금씩|세차게|억수같이|많이|펑펑|하염없이|부슬부슬|주룩주룩|추적추적|그칠\s*줄\s*모르고)\s*)?(?:내리(?!깔)|내린|내렸|오(?!래)|온다|와서|왔|쏟|퍼붓|퍼부|흩뿌|뿌리|뿌렸|떨어)|빗방울|빗줄기|빗소리|빗물|빗발|소나기|장대비|폭우|가랑비|이슬비|보슬비|부슬비|빗속|비\s*내리는|비에\s*(?:젖|흠뻑)|우산을\s*(?:펴|폈|펼|쓰|썼|받)|\b(?:raining|rainfall|raindrops?|downpour|drizzl\w*)\b|\brain\s+(?:fell|falls|falling|poured|pours|pounded|lashed|drummed|pattered)/gi],
    ['snow', /눈이\s*(?:(?:오래|계속|조금씩|세차게|억수같이|많이|펑펑|하염없이|부슬부슬|주룩주룩|추적추적|그칠\s*줄\s*모르고)\s*)?(?:내리(?!깔)|내린|내렸|오(?!래)|온다|와서|왔|쌓|흩날|날리|날렸|펑펑|소복)|눈송이|눈발|함박눈|폭설|눈보라|첫눈|싸락눈|설원|눈\s*덮인|눈밭|눈길을\s*(?:걷|밟)|\b(?:snowing|snowfall|snowflakes?|snowstorm|blizzard)\b|\bsnow\s+(?:fell|falls|falling|drifted|covered)/gi],
    ['fog', /안개가\s*(?:끼|낀|꼈|짙|자욱|피어|깔|내려)|짙은\s*안개|자욱한\s*안개|안개\s*속|먹구름|잿빛\s*하늘|하늘이\s*(?:흐리|흐려|흐렸|잔뜩)|흐린\s*하늘|잔뜩\s*흐린|구름이\s*(?:잔뜩|낮게|몰려|끼|꼈)|\b(?:fog|foggy|mist|misty|overcast)\b/gi],
];
const M_WORDS = [
    ['petal', /꽃잎이?\s*(?:흩날|날리|날렸|떨어|휘날|흩어|춤)|꽃비|벚꽃이\s*(?:흩날|날리|떨어|지|피|만개)|벚꽃\s*잎|\bcherry\s+blossoms?\b|\bpetals?\s+(?:fell|fall|falling|drift|scatter)/gi],
    ['leaf', /낙엽|단풍잎|단풍이\s*(?:지|떨어|물든|물들)|잎(?:사귀)?(?:이|들이)\s*(?:떨어|흩날|날리|우수수)|\bfalling\s+leaves\b|\bleaves\s+(?:fell|fall|falling|drift|scatter)/gi],
    ['firefly', /반딧불|개똥벌레|\bfirefl(?:y|ies)\b/gi],
    ['ember', /불똥|불씨가?\s*(?:튀|날|흩)|불티|불꽃이\s*(?:튀|흩날)|모닥불|화톳불|\bembers?\b/gi],
    ['star', /별빛|별들?이\s*(?:쏟|빛나|반짝|총총|가득|박혀)|은하수|밤하늘의\s*별|\bstarlight\b|\bstarry\b|\bstars\s+(?:glitter|shone|shine|twinkl)/gi],
];

const pick = (table, value) => { const v = String(value || '').trim(); for (const [id, re] of table) if (re.test(v)) return id; return null; };
const levelOf = text => HI.test(text) ? 'hi' : LO.test(text) ? 'lo' : 'mid';

/** 코드 블록·HTML 주석·태그 속성 안의 글은 읽지 않는다. */
export function cleanText(s) {
    return String(s || '').replace(/```[\s\S]*?```/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
}

/** 한 메시지에서 날씨·분위기 단서를 찾는다. 없으면 null. */
export function scanMessage(text) {
    const t = cleanText(text);
    const out = {weather: null, mood: null};
    // 1) 표기
    let tw = null, tm = null;
    for (const m of t.matchAll(TAG_RE)) {
        const kind = m[1].toLowerCase(), value = m[2];
        if (kind === '날씨' || kind === 'weather') { const id = pick(W_TAG, value); if (id) tw = {id, level: id === 'none' ? 'mid' : levelOf(value), by: 'tag', text: m[0]}; }
        else { const id = pick(M_TAG, value); if (id) tm = {id, by: 'tag', text: m[0]}; }
    }
    // 2) 낱말 (표기가 없는 쪽만)
    const last = (table, text) => {
        let best = null;
        for (const [id, re] of table) for (const m of text.matchAll(re)) if (!best || m.index >= best.at) best = {id, at: m.index, text: m[0]};
        return best;
    };
    const plain = t.replace(TAG_RE, ' ');
    if (!tw) { const b = last(W_WORDS, plain); if (b) tw = {id: b.id, level: b.id === 'none' ? 'mid' : levelOf(b.text), by: 'word', text: b.text}; }
    if (!tm) { const b = last(M_WORDS, plain); if (b) tm = {id: b.id, by: 'word', text: b.text}; }
    out.weather = tw; out.mood = tm;
    return out;
}

/**
 * 메시지 목록(오래된 것 → 최근)에서 지금 날씨·분위기를 정한다.
 * @param {{text:string}[]} messages
 * @returns {{weather:string, level:string, mood:string, why:{weather:object|null, mood:object|null}}}
 */
export function detectWeather(messages) {
    const list = Array.isArray(messages) ? messages : [];
    let weather = null, mood = null;
    for (let i = list.length - 1, back = 0; i >= 0 && back < WEATHER_WINDOW && (!weather || !mood); i--, back++) {
        const r = scanMessage(list[i]?.text);
        if (!weather && r.weather) weather = {...r.weather, back};
        if (!mood && back < MOOD_WINDOW && r.mood) mood = {...r.mood, back};
    }
    return {weather: weather?.id || 'none', level: weather?.level || 'mid', mood: mood?.id || 'none', why: {weather, mood}};
}
