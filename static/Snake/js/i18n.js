var SNAKE_LOCALES = SNAKE_LOCALES || {};
var ActiveLocale = {id:'en-US', pack:null};

var LANG_DEFAULT = {
  en:'en-US',
  zh:'zh-CN',
  cmn:'zh-CN',
  yue:'zh-HK',
  ja:'ja-JP',
  ko:'ko-KR',
  de:'de-DE',
  fr:'fr-FR',
  es:'es-ES',
  pt:'pt-BR',
  it:'it-IT',
  nl:'nl-NL',
  pl:'pl-PL',
  ru:'ru-RU',
  uk:'uk-UA',
  tr:'tr-TR',
  ar:'ar-SA',
  he:'he-IL',
  hi:'hi-IN',
  th:'th-TH',
  vi:'vi-VN',
  id:'id-ID',
  ms:'ms-MY',
  sv:'sv-SE',
  da:'da-DK',
  no:'nb-NO',
  nb:'nb-NO',
  nn:'nn-NO',
  fi:'fi-FI',
  cs:'cs-CZ',
  sk:'sk-SK',
  hu:'hu-HU',
  ro:'ro-RO',
  el:'el-GR',
  bg:'bg-BG',
  hr:'hr-HR',
  sr:'sr-Cyrl',
  sl:'sl-SI',
  ca:'ca-ES',
  gl:'gl-ES',
  fa:'fa-IR',
  ur:'ur-PK',
  bn:'bn-BD',
  ta:'ta-IN',
  te:'te-IN',
  mr:'mr-IN',
  fil:'fil-PH',
  tl:'fil-PH',
  sw:'sw-KE',
  lt:'lt-LT',
  lv:'lv-LV',
  et:'et-EE',
  af:'af-ZA'
};

var REGION_MAP = {
  'en-NZ':'en-AU',
  'en-IE':'en-GB',
  'en-ZA':'en-GB',
  'en-IN':'en-GB',
  'en-SG':'en-GB',
  'en-HK':'en-GB',
  'en-PH':'en-US',
  'en-NG':'en-GB',
  'en-KE':'en-GB',
  'es-419':'es-MX',
  'es-US':'es-MX',
  'es-CO':'es-MX',
  'es-CL':'es-MX',
  'es-PE':'es-MX',
  'es-VE':'es-MX',
  'es-EC':'es-MX',
  'es-GT':'es-MX',
  'es-CR':'es-MX',
  'es-PA':'es-MX',
  'es-DO':'es-MX',
  'es-PR':'es-MX',
  'es-BO':'es-MX',
  'es-PY':'es-MX',
  'es-HN':'es-MX',
  'es-NI':'es-MX',
  'es-SV':'es-MX',
  'es-CU':'es-MX',
  'es-UY':'es-AR',
  'de-LI':'de-DE',
  'de-LU':'de-DE',
  'fr-LU':'fr-FR',
  'pt-AO':'pt-PT',
  'pt-MZ':'pt-PT',
  'pt-CV':'pt-PT',
  'pt-GW':'pt-PT',
  'pt-ST':'pt-PT',
  'pt-TL':'pt-PT',
  'pt-MO':'pt-PT',
  'nl-SR':'nl-NL',
  'nl-AW':'nl-NL',
  'ar-AE':'ar-SA',
  'ar-QA':'ar-SA',
  'ar-KW':'ar-SA',
  'ar-BH':'ar-SA',
  'ar-OM':'ar-SA',
  'ar-JO':'ar-SA',
  'ar-LB':'ar-SA',
  'ar-SY':'ar-SA',
  'ar-IQ':'ar-SA',
  'ar-YE':'ar-SA',
  'ar-MA':'ar-SA',
  'ar-DZ':'ar-SA',
  'ar-TN':'ar-SA',
  'ar-LY':'ar-SA',
  'ar-SD':'ar-SA',
  'bn-IN':'bn-BD',
  'ta-LK':'ta-IN',
  'ta-SG':'ta-IN',
  'ms-BN':'ms-MY',
  'ms-SG':'ms-MY',
  'sr-ME':'sr-Latn',
  'sr-BA':'sr-Cyrl',
  'sr-RS':'sr-Cyrl'
};

var LEGACY_LANG = {iw:'he', in:'id'};

function pickLocale(id){
  if(!id || !SNAKE_LOCALES[id]) return null;
  return id;
}

function splitTag(tag){
  var raw = String(tag || '').trim().replace(/_/g, '-').split('-');
  var lang = raw.length && raw[0] ? raw[0].toLowerCase() : '';
  var script = '';
  var region = '';
  for(var i = 1; i < raw.length; i++){
    var part = raw[i];
    if(!part) continue;
    if(part.length === 4 && /^[A-Za-z]{4}$/.test(part)){
      script = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }else if(/^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part)){
      region = part.toUpperCase();
    }
  }
  if(LEGACY_LANG[lang]) lang = LEGACY_LANG[lang];
  return {lang:lang, script:script, region:region};
}

function matchChinese(parts){
  if(parts.region === 'HK') return pickLocale('zh-HK');
  if(parts.region === 'MO') return pickLocale('zh-MO');
  if(parts.region === 'TW') return pickLocale('zh-TW');
  if(parts.region === 'CN' || parts.region === 'SG' || parts.region === 'MY') return pickLocale('zh-CN');
  if(parts.script === 'Hans') return pickLocale('zh-CN');
  if(parts.script === 'Hant') return pickLocale('zh-TW');
  return pickLocale('zh-CN');
}

function matchSerbian(parts){
  if(parts.script === 'Latn') return pickLocale('sr-Latn');
  if(parts.script === 'Cyrl') return pickLocale('sr-Cyrl');
  if(parts.region === 'ME') return pickLocale('sr-Latn');
  return pickLocale('sr-Cyrl');
}

function matchTag(tag){
  var parts = splitTag(tag);
  if(!parts.lang) return null;
  var exact = parts.lang;
  if(parts.script) exact += '-' + parts.script;
  if(parts.region) exact += '-' + parts.region;
  var direct = pickLocale(exact);
  if(direct) return direct;
  if(parts.region){
    direct = pickLocale(parts.lang + '-' + parts.region);
    if(direct) return direct;
  }
  if(parts.lang === 'zh' || parts.lang === 'cmn') return matchChinese(parts);
  if(parts.lang === 'yue'){
    if(parts.region === 'MO') return pickLocale('zh-MO');
    return pickLocale('zh-HK');
  }
  if(parts.lang === 'sr') return matchSerbian(parts);
  if(parts.lang === 'nn') return pickLocale('nn-NO') || pickLocale('nb-NO');
  if(parts.lang === 'no' || parts.lang === 'nb') return pickLocale('nb-NO');
  if(parts.lang === 'fil' || parts.lang === 'tl') return pickLocale('fil-PH');
  if(parts.region){
    var mapped = REGION_MAP[parts.lang + '-' + parts.region];
    if(mapped && pickLocale(mapped)) return mapped;
  }
  if(parts.script){
    direct = pickLocale(parts.lang + '-' + parts.script);
    if(direct) return direct;
  }
  var fallback = LANG_DEFAULT[parts.lang];
  if(fallback && pickLocale(fallback)) return fallback;
  return null;
}

function browserLanguages(){
  var list = [];
  if(navigator.languages && navigator.languages.length){
    for(var i = 0; i < navigator.languages.length; i++) list.push(navigator.languages[i]);
  }else if(navigator.language){
    list.push(navigator.language);
  }
  if(!list.length) list.push('en-US');
  return list;
}

function resolveLocale(languages){
  var list = languages && languages.length ? languages : ['en-US'];
  for(var i = 0; i < list.length; i++){
    var found = matchTag(list[i]);
    if(found) return found;
  }
  return 'en-US';
}

function t(key){
  var pack = ActiveLocale.pack;
  if(pack && Object.prototype.hasOwnProperty.call(pack, key) && pack[key] != null && pack[key] !== '') return pack[key];
  var fallback = SNAKE_LOCALES['en-US'];
  if(fallback && Object.prototype.hasOwnProperty.call(fallback, key) && fallback[key] != null) return fallback[key];
  return '';
}

function setText(id, key){
  if(!document.getElementById) return;
  var el = document.getElementById(id);
  if(!el) return;
  el.textContent = t(key);
}

function applyHints(){
  var touch = typeof isTouchDevice !== 'undefined' && !!isTouchDevice;
  if(touch){
    setText('hint', 'hintTouch');
    setText('idleHint', 'idleHintTouch');
    setText('pausedHint', 'pausedHintTouch');
    return;
  }
  var canFull = typeof fullscreenBtn !== 'undefined' && fullscreenBtn && !fullscreenBtn.hidden;
  setText('hint', canFull ? 'hintDesktopFull' : 'hintDesktop');
  setText('idleHint', 'idleHintDesktop');
  setText('pausedHint', 'pausedHintDesktop');
}

function applyFont(pack){
  var family = pack.font || 'Noto Sans';
  var stack = '"' + family + '", "Noto Sans", "PingFang SC", "PingFang TC", "PingFang HK", "Hiragino Sans", "Hiragino Sans GB", "Microsoft YaHei", "Microsoft JhengHei", "Noto Sans Arabic", "Noto Sans Hebrew", "Noto Sans Devanagari", "Noto Sans Thai", sans-serif';
  if(document.documentElement && document.documentElement.style){
    document.documentElement.style.setProperty('--font-ui', stack);
  }
  if(!document.head || !document.getElementById || !document.createElement) return;
  var extra = document.getElementById('localeFont');
  if(family === 'Noto Sans'){
    if(extra && extra.parentNode) extra.parentNode.removeChild(extra);
    return;
  }
  var href = 'https://fonts.googleapis.com/css2?family=' + family.replace(/ /g, '+') + ':wght@400;500;700;900&display=swap';
  if(!extra){
    extra = document.createElement('link');
    extra.id = 'localeFont';
    extra.rel = 'stylesheet';
    document.head.appendChild(extra);
  }
  if(extra.getAttribute('href') !== href) extra.setAttribute('href', href);
}

function applyMessages(){
  if(!document.querySelectorAll) return;
  var nodes = document.querySelectorAll('[data-i18n]');
  for(var i = 0; i < nodes.length; i++){
    nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
  }
  var arias = document.querySelectorAll('[data-i18n-aria]');
  for(var j = 0; j < arias.length; j++){
    arias[j].setAttribute('aria-label', t(arias[j].getAttribute('data-i18n-aria')));
  }
  applyHints();
}

function applyDocument(){
  var root = document.documentElement;
  var pack = ActiveLocale.pack;
  if(!root || !pack) return;
  root.lang = ActiveLocale.id;
  root.dir = pack.dir === 'rtl' ? 'rtl' : 'ltr';
  if(root.classList) root.classList.toggle('locale-compact', !!pack.compact);
  root.setAttribute('data-locale', ActiveLocale.id);
  applyFont(pack);
  applyMessages();
  document.title = t('docTitle');
}

function bootLocale(){
  var id = resolveLocale(browserLanguages());
  if(!pickLocale(id)) id = 'en-US';
  ActiveLocale.id = id;
  ActiveLocale.pack = SNAKE_LOCALES[id] || null;
  applyDocument();
}

bootLocale();
