const JSON_PATH = './data/analogies_items_private.json';
const BATTERY_KEY = 'psychometric_battery_v1';
const LANG = 'TR';

let bankItems = [];
let form = [];
let idx = 0;
let attemptId = null;
let startedAt = null;
let itemEnterT = 0;

const responses = new Map(); // ITEM_ID -> { chosen, rt_ms, ts }
const el = (id) => document.getElementById(id);

function defaultBatteryState() {
  return {
    completed: {
      'genelkultur': false,
      'kelimebilgisi': false,
      'analoji-beta': false,
      'hagentest': false,
      'digitspan': false
    },
    rawScores: {
      'genelkultur': '',
      'kelimebilgisi': '',
      'analoji-beta': '',
      'hagentest': '',
      'digitspan': ''
    },
    updatedAt: null
  };
}

function loadBatteryState() {
  try {
    const raw = localStorage.getItem(BATTERY_KEY);
    if (!raw) return defaultBatteryState();
    const parsed = JSON.parse(raw);
    const base = defaultBatteryState();
    return {
      completed: { ...base.completed, ...(parsed.completed || {}) },
      rawScores: { ...base.rawScores, ...(parsed.rawScores || {}) },
      updatedAt: parsed.updatedAt || null
    };
  } catch (_) {
    return defaultBatteryState();
  }
}

function saveBatteryResult(testId, rawScoreText) {
  const s = loadBatteryState();
  s.completed[testId] = true;
  s.rawScores[testId] = rawScoreText;
  s.updatedAt = new Date().toISOString();
  localStorage.setItem(BATTERY_KEY, JSON.stringify(s));
}

function goBackToHub() {
  window.location.href = '../index.html';
}

function uid() {
  return `att_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function hashToSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function rng() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildForm(items, seedStr) {
  const rng = mulberry32(hashToSeed(seedStr));
  const fixed = items.filter((x) => x.ITEM_TYPE === 'FIXED');
  const rotation = items.filter((x) => x.ITEM_TYPE === 'ROTATION');
  const fixedShuf = shuffleWithRng(fixed, rng);
  const rot8 = shuffleWithRng(rotation, rng).slice(0, 8);
  return shuffleWithRng(fixedShuf.concat(rot8), rng);
}

function choiceText(item, key) {
  return item[`${key}_${LANG}`] ?? '';
}

function stemText(item) {
  return item[`STEM_${LANG}`] ?? '';
}

function formatStemForDisplay(item) {
  const raw = stemText(item) || '';
  const normalized = raw.replace(/\s*:\s*/g, ' : ').trim();
  return `${normalized} :: ? : ?`;
}

function setProgress() {
  el('progressChip').textContent = `${idx + 1} / ${form.length}`;
}

function selectedKeyFor(item) {
  const rec = responses.get(item.ITEM_ID);
  return rec ? rec.chosen : null;
}

function renderChoices(item) {
  const container = el('choices');
  container.innerHTML = '';
  const keys = ['A', 'B', 'C', 'D', 'E'];
  const selected = selectedKeyFor(item);

  keys.forEach((k) => {
    const div = document.createElement('div');
    div.className = `choice${selected === k ? ' selected' : ''}`;
    div.tabIndex = 0;
    div.setAttribute('role', 'button');
    div.dataset.key = k;

    const keySpan = document.createElement('div');
    keySpan.className = 'key';
    keySpan.textContent = k;

    const txt = document.createElement('div');
    txt.className = 'txt';
    txt.textContent = choiceText(item, k);

    div.appendChild(keySpan);
    div.appendChild(txt);
    div.addEventListener('click', () => onSelect(item, k));
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') onSelect(item, k);
    });

    container.appendChild(div);
  });

  el('nextBtn').disabled = !selectedKeyFor(item);
}

function renderItem() {
  const item = form[idx];
  setProgress();
  el('stem').textContent = formatStemForDisplay(item);
  renderChoices(item);
  itemEnterT = performance.now();
  el('backBtn').disabled = idx === 0;
}

function onSelect(item, key) {
  const rt = Math.max(0, Math.round(performance.now() - itemEnterT));
  responses.set(item.ITEM_ID, {
    chosen: key,
    rt_ms: rt,
    ts: new Date().toISOString()
  });

  renderChoices(item);
  setTimeout(() => next(), 80);
}

function next() {
  const item = form[idx];
  if (!responses.get(item.ITEM_ID)) return;

  if (idx < form.length - 1) {
    idx += 1;
    renderItem();
  } else {
    finish();
  }
}

function back() {
  if (idx > 0) {
    idx -= 1;
    renderItem();
  }
}

function computeScore() {
  let fixedTotal = 0;
  let fixedCorrect = 0;
  let rotAnswered = 0;

  for (const item of form) {
    const rec = responses.get(item.ITEM_ID);
    const answered = !!rec?.chosen;

    if (item.ITEM_TYPE === 'FIXED') {
      fixedTotal += 1;
      if (answered && rec.chosen === item.ANSWER_KEY) fixedCorrect += 1;
    } else if (item.ITEM_TYPE === 'ROTATION') {
      if (answered) rotAnswered += 1;
    }
  }

  return { fixedTotal, fixedCorrect, raw: fixedCorrect, rotAnswered };
}

function finish() {
  const s = computeScore();
  el('scoreline').textContent = `puan: ${s.fixedCorrect} / 32`;
  saveBatteryResult('analoji-beta', `raw=${s.fixedCorrect}/${s.fixedTotal}`);

  el('testScreen').classList.add('hidden');
  el('endScreen').classList.remove('hidden');
  el('progressChip').classList.add('hidden');
}

function start() {
  attemptId = uid();
  startedAt = new Date().toISOString();
  idx = 0;
  responses.clear();
  form = buildForm(bankItems, attemptId);

  el('startScreen').classList.add('hidden');
  el('endScreen').classList.add('hidden');
  el('testScreen').classList.remove('hidden');
  el('progressChip').classList.remove('hidden');
  renderItem();
}

function setupKeys() {
  document.addEventListener('keydown', (e) => {
    if (el('testScreen').classList.contains('hidden')) return;
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') back();
    const k = e.key.toUpperCase();
    if (['A', 'B', 'C', 'D', 'E'].includes(k)) onSelect(form[idx], k);
  });
}

async function loadBank() {
  const res = await fetch(JSON_PATH, { cache: 'no-store' });
  if (!res.ok) throw new Error(`failed to load json: ${res.status}`);
  const data = await res.json();
  bankItems = data.items ?? [];
}

function wireUi() {
  el('startBtn').addEventListener('click', start);
  el('nextBtn').addEventListener('click', next);
  el('backBtn').addEventListener('click', back);
  el('continueToHub')?.addEventListener('click', goBackToHub);
}

(async function main() {
  wireUi();
  setupKeys();
  try {
    await loadBank();
  } catch (err) {
    console.error(err);
  }
})();
