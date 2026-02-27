const $ = (sel) => document.querySelector(sel);
const state = { i: 0, data: null, answers: [], ok: [] };
const BATTERY_KEY = 'psychometric_battery_v1';

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

async function load() {
  const res = await fetch('items.json');
  state.data = await res.json();
  $('#progress').textContent = `0 / ${state.data.items.length}`;
}

function turkishNormalize(s) {
  if (!s) return '';
  s = String(s).toLowerCase();
  const map = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.split('').map((ch) => map[ch] || ch).join('');
  s = s.replace(/[^a-z0-9]+/g, '').trim();
  return s;
}

function answerVariants(item) {
  const sources = [];
  if (item.answer_text) sources.push(item.answer_text);
  if (Array.isArray(item.choices)) sources.push(...item.choices);

  const parts = [];
  sources.forEach((a) => {
    String(a || '')
      .split(/\s*[,/;|]\s*/)
      .forEach((x) => parts.push(x));
  });

  return Array.from(new Set(parts.map(turkishNormalize).filter(Boolean)));
}

function displayAnswerKey(item) {
  if (item.answer_text && String(item.answer_text).trim()) return item.answer_text;
  if (Array.isArray(item.choices)) return item.choices.filter(Boolean).join(' / ');
  return '-';
}

function render() {
  const { items } = state.data;
  const i = state.i;
  $('#progress').textContent = `${i + 1} / ${items.length}`;
  const item = items[i];
  $('#prompt').textContent = item.prompt || `soru ${i + 1}`;
  $('#answerInput').value = state.answers[i] || '';
  $('#feedback').classList.add('hidden');
  $('#prev').disabled = i === 0;
  $('#submit').textContent = i === items.length - 1 ? 'bitir' : 'gönder';
  $('#answerInput').focus();
}

function submit() {
  const input = $('#answerInput').value || '';
  state.answers[state.i] = input;
  const item = state.data.items[state.i];
  const golds = answerVariants(item);
  const ok = golds.includes(turkishNormalize(input));
  state.ok[state.i] = ok;

  const fb = $('#feedback');
  fb.classList.remove('hidden');
  fb.textContent = ok ? 'doğru' : `yanlış • doğru: ${displayAnswerKey(item)}`;
  fb.className = 'feedback ' + (ok ? 'summary-correct' : 'summary-wrong');

  const last = state.i === state.data.items.length - 1;
  setTimeout(() => {
    if (!last) {
      state.i++;
      render();
    } else {
      finish();
    }
  }, 750);
}

$('#prev').addEventListener('click', () => {
  state.i--;
  render();
});
$('#submit').addEventListener('click', submit);
$('#answerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  submit();
});
$('#restart').addEventListener('click', () => {
  state.i = 0;
  state.answers = [];
  state.ok = [];
  $('#result').classList.add('hidden');
  $('#card').classList.remove('hidden');
  render();
});
$('#continueToHub')?.addEventListener('click', goBackToHub);

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('#start')?.addEventListener('click', () => {
    document.querySelector('#intro')?.classList.add('hidden');
    document.querySelector('#card')?.classList.remove('hidden');
    state.i = 0;
    render();
  });
});

function finish() {
  const { items } = state.data;
  const correct = state.ok.filter(Boolean).length;
  $('#scoreline').textContent = `puan: ${correct} / ${items.length}`;
  saveBatteryResult('genelkultur', `${correct}/${items.length}`);

  const ol = $('#answerkey');
  ol.innerHTML = '';
  items.forEach((it, idx) => {
    const li = document.createElement('li');
    const user = state.answers[idx] || '(boş)';
    const ok = state.ok[idx];
    const keyText = displayAnswerKey(it);
    li.innerHTML = `<strong>${it.prompt || 'soru ' + (idx + 1)}</strong>: doğru -> <em>${keyText}</em> - ` +
      (ok ? `<span class="summary-correct">doğru</span>` : `<span class="summary-wrong">yanlış</span>`) +
      `; sen: ${user}`;
    ol.appendChild(li);
  });

  $('#card').classList.add('hidden');
  $('#result').classList.remove('hidden');
}

load();
