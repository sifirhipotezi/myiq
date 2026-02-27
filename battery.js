import { scoreVCI } from './verbalcomprehensionnorms.js';
import { SCALED_SCORES } from './digitspan/scaled-scores.js';
import { scaledScoreToIQ } from './digitspan/score.js';

// ─── Constants ───
const SESSION_KEY = 'zekatesti_session';
const BATTERY_KEY = 'psychometric_battery_v1';
const MATRICES_RESULT_KEYS = ['matrices_results', 'kbit2_results'];
const RESULTS_KEY = 'zekatesti_results';
const CURRENT_TEST_KEY = 'zekatesti_current_test';

const SUBTESTS = [
  {
    id: 'kelimebilgisi',
    batteryId: 'kelimebilgisi',
    title: 'Kelime Bilgisi',
    description: 'Sözcük dağarcığı ve anlama',
    href: './kelimebilgisi/index.html?from=battery',
  },
  {
    id: 'genelkultur',
    batteryId: 'genelkultur',
    title: 'Genel Kültür',
    description: 'Genel bilgi ve kültürel farkındalık',
    href: './genelkultur/index.html?from=battery',
  },
  {
    id: 'analoji-beta',
    batteryId: 'analoji-beta',
    title: 'Analogiler',
    description: 'Sözel akıl yürütme (ön-normatif)',
    href: './analoji-beta/index.html?from=battery',
  },
  {
    id: 'matrices',
    batteryId: 'matrices',
    title: 'Matrisler',
    description: 'Görsel akıl yürütme (KBIT-2)',
    href: './Matrices/index.html?from=battery',
  },
  {
    id: 'digitspan',
    batteryId: 'digitspan',
    title: 'Sayı Dizisi',
    description: 'Çalışma belleği',
    href: './digitspan/index.html?from=battery',
  },
];

// ─── Helpers ───
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
let html2canvasLoadPromise = null;

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function calculateAge(birthdate) {
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// ─── Session ───
function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

// ─── Battery state (shared key used by existing subtests) ───
function getBatteryState() {
  try {
    const raw = localStorage.getItem(BATTERY_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Subtest completion detection adapters ───
function isSubtestCompleted(subtestId) {
  if (subtestId === 'matrices') {
    return getMatricesResult() !== null;
  }
  const state = getBatteryState();
  if (!state || !state.completed) return false;
  return !!state.completed[subtestId];
}

function getCompletedCount() {
  return SUBTESTS.filter((t) => isSubtestCompleted(t.id)).length;
}

function allCompleted() {
  return SUBTESTS.every((t) => isSubtestCompleted(t.id));
}

// ─── Raw score parsers ───
function parseKbRaw(str) {
  if (!str) return 0;
  return parseInt(str.split('/')[0], 10) || 0;
}

function parseGkRaw(str) {
  if (!str) return 0;
  return parseInt(str.split('/')[0], 10) || 0;
}

function parseAnalogiRaw(str) {
  if (!str) return { correct: 0, total: 32 };
  const match = str.match(/raw=(\d+)\/(\d+)/);
  if (match) return { correct: parseInt(match[1], 10), total: parseInt(match[2], 10) };
  const parts = str.split('/');
  return { correct: parseInt(parts[0], 10) || 0, total: parseInt(parts[1], 10) || 32 };
}

function parseDigitSpanScores(str) {
  if (!str) return { forward: 0, backward: 0, sequencing: 0, overall: 0 };
  const f = str.match(/F:(\d+)/);
  const b = str.match(/B:(\d+)/);
  const s = str.match(/S:(\d+)/);
  const o = str.match(/O:(\d+)/);
  return {
    forward: f ? parseInt(f[1], 10) : 0,
    backward: b ? parseInt(b[1], 10) : 0,
    sequencing: s ? parseInt(s[1], 10) : 0,
    overall: o ? parseInt(o[1], 10) : 0,
  };
}

function getMatricesResult() {
  try {
    const candidates = [];

    for (const key of MATRICES_RESULT_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length === 0) continue;

      const latest = arr[arr.length - 1];
      const ts = Date.parse(
        latest?.timestamp ||
        latest?.created_at ||
        latest?.started_at ||
        ''
      );

      candidates.push({
        key,
        latest,
        hasValidTs: Number.isFinite(ts),
        ts: Number.isFinite(ts) ? ts : null,
      });
    }

    if (candidates.length === 0) return null;

    const dated = candidates.filter((c) => c.hasValidTs);
    if (dated.length > 0) {
      dated.sort((a, b) => a.ts - b.ts);
      return dated[dated.length - 1].latest;
    }

    for (const key of MATRICES_RESULT_KEYS) {
      const found = candidates.find((c) => c.key === key);
      if (found) {
        return found.latest;
      }
    }

    return candidates[candidates.length - 1].latest;
  } catch {
    return null;
  }
}

// ─── Digit Span scaled score ───
function getDigitSpanAgeKey(ageYears) {
  if (ageYears <= 17) return '16-17';
  if (ageYears <= 19) return '18-19';
  if (ageYears <= 24) return '20-24';
  if (ageYears <= 34) return '25-34';
  if (ageYears <= 44) return '35-44';
  if (ageYears <= 54) return '45-54';
  if (ageYears <= 69) return '55-69';
  return '70-79';
}

function getDigitSpanScaledScore(overallRaw, ageYears) {
  const key = getDigitSpanAgeKey(ageYears);
  const table = SCALED_SCORES[key];
  if (!table) return null;
  for (let i = 0; i < table.length; i++) {
    const entry = table[i];
    if (Array.isArray(entry)) {
      if (overallRaw >= entry[0] && overallRaw <= entry[1]) return i + 1;
    } else {
      if (overallRaw === entry) return i + 1;
    }
  }
  return null;
}

// ─── VCI descriptor ───
function getVCIDescriptor(vci) {
  if (vci >= 130) return 'Çok Üstün';
  if (vci >= 120) return 'Üstün';
  if (vci >= 110) return 'Ortalamanın Üstü';
  if (vci >= 90) return 'Ortalama';
  if (vci >= 80) return 'Ortalamanın Altı';
  if (vci >= 70) return 'Sınır';
  return 'Çok Düşük';
}

function getMatricesDescriptor(ss) {
  if (ss >= 130) return 'Çok Üstün';
  if (ss >= 120) return 'Üstün';
  if (ss >= 110) return 'Ortalamanın Üstü';
  if (ss >= 90) return 'Ortalama';
  if (ss >= 80) return 'Ortalamanın Altı';
  if (ss >= 70) return 'Sınır';
  return 'Çok Düşük';
}

// ─── Compute all scores ───
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getCompositeScore(vci, matricesIQ, wmIQ) {
  if (vci === null || matricesIQ === null || wmIQ === null) return null;
  const v = Number(vci);
  const m = Number(matricesIQ);
  const w = Number(wmIQ);
  if (!Number.isFinite(v) || !Number.isFinite(m) || !Number.isFinite(w)) return null;
  const rawSum = v + m + w;
  const SD_SUM = 36.74;
  const composite = Math.round(((rawSum - 300) / SD_SUM) * 15 + 100);
  return clamp(composite, 40, 160);
}
function computeAllScores() {
  const session = getSession();
  if (!session) return null;

  const batteryState = getBatteryState();
  const rawScores = batteryState?.rawScores || {};

  const ageYears = session.age_years;

  // VCI
  const kbRaw = parseKbRaw(rawScores.kelimebilgisi);
  const gkRaw = parseGkRaw(rawScores.genelkultur);
  const vci = scoreVCI(kbRaw, gkRaw, ageYears);

  // Matrices
  const matricesResult = getMatricesResult();
  const matricesSS = matricesResult?.ss ?? null;
  const matricesPct = matricesResult?.percentile ?? null;
  const matricesCI90 = matricesResult?.ci90 ?? null;
  const matricesRaw = matricesResult?.raw ?? null;

  // Analogies
  const analogiParsed = parseAnalogiRaw(rawScores['analoji-beta']);
  const analogiPct = analogiParsed.total > 0
    ? Math.round((analogiParsed.correct / analogiParsed.total) * 100)
    : 0;

  // Digit Span
  const dsScores = parseDigitSpanScores(rawScores.digitspan);
  const dsScaledScore = getDigitSpanScaledScore(dsScores.overall, ageYears);
  const dsIQ = scaledScoreToIQ(dsScaledScore);
  const compositeIQ = getCompositeScore(vci.vci, matricesSS, dsIQ);

  return {
    vci,
    kbRaw,
    gkRaw,
    matricesSS,
    matricesPct,
    matricesCI90,
    matricesRaw,
    analogiPct,
    analogiCorrect: analogiParsed.correct,
    analogiTotal: analogiParsed.total,
    dsScores,
    dsScaledScore,
    dsIQ,
    compositeIQ,
    ageYears,
    session,
  };
}

// ─── Data persistence ───
function persistSessionResults(scores) {
  const session = scores.session;

  const record = {
    session_id: generateUUID(),
    timestamp: new Date().toISOString(),
    demographics: {
      birthdate: session.birthdate,
      age_years: session.age_years,
      cinsiyet: session.cinsiyet,
    },
    scores: {
      kb_raw: scores.kbRaw,
      kb_ss: scores.vci.kb_ss,
      gk_raw: scores.gkRaw,
      gk_ss: scores.vci.gk_ss,
      vci: scores.vci.vci,
      vci_ci90: [scores.vci.vci_ci90_lo, scores.vci.vci_ci90_hi],
      matrices_ss: scores.matricesSS,
      matrices_pct: scores.matricesPct ? String(scores.matricesPct) : null,
      analogies_pct: scores.analogiPct,
      digitspan_ss: scores.dsScaledScore,
      digitspan_iq: scores.dsIQ,
      composite_iq: scores.compositeIQ,
    },
    durations_seconds: {
      kb: null,
      gk: null,
      analogies: null,
      matrices: null,
      digitspan: null,
    },
  };

  // Try to get Matrices duration from the stored Matrices payload
  const matricesResult = getMatricesResult();
  if (matricesResult?.duration_seconds) {
    record.durations_seconds.matrices = matricesResult.duration_seconds;
  }

  let existing = [];
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed;
    }
  } catch { /* ignore */ }

  existing.push(record);
  localStorage.setItem(RESULTS_KEY, JSON.stringify(existing));

  return record;
}

// ─── Screen management ───
const SCREENS = ['demographics', 'hub', 'transition', 'results'];

function showScreen(id) {
  SCREENS.forEach((s) => {
    const el = $(`#screen-${s}`);
    if (el) el.classList.toggle('hidden', s !== id);
  });
}

// ─── Demographics ───
function initDemographics() {
  const form = $('#demographics-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#input-name').value.trim();
    const birthdate = $('#input-birthdate').value;
    const cinsiyet = $('#input-cinsiyet').value;

    if (!birthdate) {
      $('#demographics-error').textContent = 'Doğum tarihi zorunludur.';
      return;
    }

    const ageYears = calculateAge(birthdate);
    if (ageYears < 14 || ageYears > 99) {
      $('#demographics-error').textContent = 'Yaş 14-99 arasında olmalıdır.';
      return;
    }

    $('#demographics-error').textContent = '';

    const session = {
      name: name || null,
      birthdate,
      age_years: ageYears,
      cinsiyet,
      started_at: new Date().toISOString(),
    };

    saveSession(session);
    showHub();
  });
}

// ─── Hub ───
function showHub() {
  showScreen('hub');
  renderHub();
}

function renderHub() {
  const list = $('#subtest-list');
  if (!list) return;

  const completedCount = getCompletedCount();
  const total = SUBTESTS.length;

  // Progress bar
  const pctComplete = Math.round((completedCount / total) * 100);
  $('#hub-progress-text').textContent = `${completedCount} / ${total} tamamlandı`;
  $('#hub-progress-fill').style.width = `${pctComplete}%`;

  list.innerHTML = '';

  SUBTESTS.forEach((test, idx) => {
    const completed = isSubtestCompleted(test.id);
    const prevCompleted = idx === 0 || isSubtestCompleted(SUBTESTS[idx - 1].id);
    const status = completed ? 'completed' : prevCompleted ? 'available' : 'locked';

    const card = document.createElement('div');
    card.className = `subtest-card ${status}`;

    const info = document.createElement('div');
    info.className = 'subtest-info';

    const name = document.createElement('div');
    name.className = 'subtest-name';
    name.textContent = test.title;

    const meta = document.createElement('div');
    meta.className = 'subtest-meta';
    meta.textContent = test.description;

    info.appendChild(name);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.alignItems = 'center';
    actions.style.gap = '8px';

    if (completed) {
      const badge = document.createElement('span');
      badge.className = 'subtest-badge badge-completed';
      badge.textContent = 'Tamamlandı';
      actions.appendChild(badge);

      const redoBtn = document.createElement('button');
      redoBtn.className = 'btn btn-secondary btn-sm';
      redoBtn.textContent = 'Tekrarla';
      redoBtn.addEventListener('click', () => navigateToSubtest(test));
      actions.appendChild(redoBtn);
    } else if (status === 'available') {
      const badge = document.createElement('span');
      badge.className = 'subtest-badge badge-available';
      badge.textContent = 'Hazır';
      actions.appendChild(badge);

      const startBtn = document.createElement('button');
      startBtn.className = 'btn btn-primary btn-sm';
      startBtn.textContent = 'Başla';
      startBtn.addEventListener('click', () => navigateToSubtest(test));
      actions.appendChild(startBtn);
    } else {
      const badge = document.createElement('span');
      badge.className = 'subtest-badge badge-locked';
      badge.textContent = 'Kilitli';
      actions.appendChild(badge);
    }

    card.appendChild(info);
    card.appendChild(actions);
    list.appendChild(card);
  });

  // Show results button if all complete
  const resultsBtn = $('#show-results-btn');
  if (resultsBtn) {
    resultsBtn.classList.toggle('hidden', !allCompleted());
  }
}

function navigateToSubtest(test) {
  localStorage.setItem(CURRENT_TEST_KEY, test.id);
  window.location.href = test.href;
}

// ─── Transition screen ───
function showTransition(justCompletedId) {
  const completedCount = getCompletedCount();
  const total = SUBTESTS.length;

  if (allCompleted()) {
    showResults();
    return;
  }

  showScreen('transition');

  const pctComplete = Math.round((completedCount / total) * 100);
  $('#transition-progress-text').textContent = `${completedCount} / ${total} tamamlandı`;
  $('#transition-progress-fill').style.width = `${pctComplete}%`;

  $('#transition-continue').onclick = () => showHub();
}

// ─── Results ───
function showResults() {
  showScreen('results');
  renderResults();
}

function renderResults() {
  const scores = computeAllScores();
  if (!scores) return;

  const session = scores.session;

  // Header
  const dateStr = new Date().toLocaleDateString('tr-TR', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  $('#results-date').textContent = dateStr;
  if (session.name) {
    $('#results-name').textContent = session.name;
    $('#results-name').classList.remove('hidden');
  }

  // Composite Hero
  if (scores.compositeIQ !== null) {
    $('#composite-value').textContent = scores.compositeIQ;
    $('#composite-descriptor').textContent = getVCIDescriptor(scores.compositeIQ);
  } else {
    $('#composite-value').textContent = '-';
    $('#composite-descriptor').textContent = 'Hesaplanamadı';
  }

  // VCI Hero
  const vci = scores.vci;
  $('#vci-value').textContent = vci.vci;
  $('#vci-descriptor').textContent = getVCIDescriptor(vci.vci);
  $('#vci-ci').textContent = `%90 GA: ${vci.vci_ci90_lo} \u2013 ${vci.vci_ci90_hi}`;
  $('#vci-kb-detail').textContent = `KB ÖP: ${vci.kb_ss} (Ham: ${vci.kb_raw})`;
  $('#vci-gk-detail').textContent = `GK ÖP: ${vci.gk_ss} (Ham: ${vci.gk_raw})`;

  // Matrices
  if (scores.matricesSS !== null) {
    $('#matrices-value').textContent = scores.matricesSS;
    $('#matrices-sub').textContent = getMatricesDescriptor(scores.matricesSS);
    const ci = scores.matricesCI90;
    if (ci && Array.isArray(ci)) {
      $('#matrices-ci').textContent = `%90 GA: ${ci[0]} \u2013 ${ci[1]}`;
    }
    const pct = scores.matricesPct;
    $('#matrices-pct').textContent = `Yüzdelik: ${pct || '-'}`;
  } else {
    $('#matrices-value').textContent = '-';
    $('#matrices-sub').textContent = 'Hesaplanamadı';
    $('#matrices-ci').textContent = '';
    $('#matrices-pct').textContent = '';
  }

  // Analogies
  $('#analogies-value').textContent = `${scores.analogiPct}. yüzdelik`;
  $('#analogies-sub').textContent = `Ham: ${scores.analogiCorrect} / ${scores.analogiTotal}`;

  // Digit Span
  const dsSS = scores.dsScaledScore;
  const dsIQ = scores.dsIQ;
  $('#digitspan-value').textContent = dsIQ !== null ? dsIQ : '-';
  $('#digitspan-sub').textContent = dsIQ !== null ? 'IQ eşdeğeri' : 'Hesaplanamadı';
  $('#digitspan-detail').textContent =
    `İleri: ${scores.dsScores.forward}  Geri: ${scores.dsScores.backward}  Sıralama: ${scores.dsScores.sequencing}  Toplam: ${scores.dsScores.overall}  ÖP: ${dsSS ?? '-'}`;

  // Profile chart
  renderProfileChart(scores);

  // Persist results (only once per render)
  if (!renderResults._persisted) {
    persistSessionResults(scores);
    renderResults._persisted = true;
  }

  // Share buttons
  $('#share-btn').onclick = () => shareResults(scores);
  const shareImageBtn = $('#share-image-btn');
  if (shareImageBtn) {
    shareImageBtn.onclick = () => shareResultsImage(scores);
  }
}

function renderProfileChart(scores) {
  const container = $('#profile-chart-bars');
  if (!container) return;
  container.innerHTML = '';

  // All scores normalized to IQ scale (40-160) for the bar chart
  // VCI: already IQ scale
  // Matrices: already IQ scale
  // Digit Span: scaled score -> IQ via score.js conversion
  // Analogies: percentile → z-score → IQ approximation

  const chartMin = 40;
  const chartMax = 160;
  const chartRange = chartMax - chartMin;

  const rows = [];

  // VCI
  rows.push({
    label: 'Sözel Kavrayış (VCI)',
    value: scores.vci.vci,
    displayValue: String(scores.vci.vci),
    normed: true,
  });

  // Matrices
  if (scores.matricesSS !== null) {
    rows.push({
      label: 'Akıcı Akıl Yürütme (Gf)',
      value: scores.matricesSS,
      displayValue: String(scores.matricesSS),
      normed: true,
    });
  }

  // Digit Span
  if (scores.dsIQ !== null) {
    rows.push({
      label: 'Çalışma Belleği (Gsm)',
      value: scores.dsIQ,
      displayValue: String(scores.dsIQ),
      normed: true,
    });
  }

  // Analogies (percentile → approximate IQ via z-score)
  // Simple approximation: percentile → z via probit, then IQ = 100 + 15z
  const pct = scores.analogiPct;
  const zApprox = percentileToZ(pct);
  const analogIQApprox = Math.round(100 + 15 * zApprox);
  rows.push({
    label: 'Sözel Akıl Yürütme',
    value: analogIQApprox,
    displayValue: `${pct}. yüzdelik`,
    normed: false,
  });

  rows.forEach((row) => {
    const div = document.createElement('div');
    div.className = 'chart-row';

    const label = document.createElement('div');
    label.className = 'chart-label';
    label.textContent = row.label;

    const barWrap = document.createElement('div');
    barWrap.className = 'chart-bar-wrap';

    // Mean line at IQ 100
    const meanPct = ((100 - chartMin) / chartRange) * 100;
    const meanLine = document.createElement('div');
    meanLine.className = 'chart-mean-line';
    meanLine.style.left = `${meanPct}%`;
    barWrap.appendChild(meanLine);

    const bar = document.createElement('div');
    bar.className = `chart-bar ${row.normed ? 'normed' : 'prenorm'}`;
    const clampedVal = Math.max(chartMin, Math.min(chartMax, row.value));
    const barPct = ((clampedVal - chartMin) / chartRange) * 100;
    bar.style.width = `${barPct}%`;
    barWrap.appendChild(bar);

    const valueEl = document.createElement('div');
    valueEl.className = 'chart-value';
    valueEl.textContent = row.displayValue;

    div.appendChild(label);
    div.appendChild(barWrap);
    div.appendChild(valueEl);
    container.appendChild(div);
  });
}

// Simple percentile to z-score approximation
function percentileToZ(pct) {
  const p = Math.max(0.5, Math.min(99.5, pct)) / 100;
  // Rational approximation of the inverse normal CDF
  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00,
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

function setShareStatus(message, timeoutMs = 3000) {
  const status = $('#share-status');
  if (!status) return;
  status.textContent = message;
  if (timeoutMs > 0) {
    setTimeout(() => {
      if (status.textContent === message) status.textContent = '';
    }, timeoutMs);
  }
}

function getShareCaption(scores) {
  const iq = scores.compositeIQ ?? scores.vci?.vci ?? null;
  if (iq !== null && iq !== undefined) {
    return `Benim IQ'm ${iq}`;
  }
  return 'Benim IQ sonuçlarım';
}

function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (html2canvasLoadPromise) return html2canvasLoadPromise;

  html2canvasLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.async = true;
    script.onload = () => {
      if (window.html2canvas) resolve(window.html2canvas);
      else reject(new Error('html2canvas yüklendi ama erişilemedi.'));
    };
    script.onerror = () => reject(new Error('html2canvas yüklenemedi.'));
    document.head.appendChild(script);
  });

  return html2canvasLoadPromise;
}

async function captureResultsImageBlob() {
  const html2canvas = await loadHtml2Canvas();
  const resultsEl = $('#screen-results');
  if (!resultsEl) throw new Error('Sonuç alanı bulunamadı.');

  const bgColor = getComputedStyle(document.body).backgroundColor || '#f8f9fb';
  const scale = 3;

  const canvas = await html2canvas(resultsEl, {
    backgroundColor: bgColor,
    scale,
    useCORS: true,
    logging: false,
    width: resultsEl.scrollWidth,
    height: resultsEl.scrollHeight,
    scrollX: 0,
    scrollY: -window.scrollY,
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Görüntü oluşturulamadı.'));
    }, 'image/jpeg', 0.95);
  });
}

async function shareResultsImage(scores) {
  try {
    setShareStatus('Görsel hazırlanıyor...', 0);
    const blob = await captureResultsImageBlob();
    const caption = getShareCaption(scores);
    const file = new File([blob], 'zekatesti-sonuc.jpg', { type: 'image/jpeg' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Zekatesti Sonuçlarım',
        text: caption,
        files: [file],
      });
      setShareStatus('Paylaşım ekranı açıldı.');
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zekatesti-sonuc.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    try {
      await navigator.clipboard.writeText(caption);
      setShareStatus('Görsel indirildi. Açıklama panoya kopyalandı.');
    } catch {
      setShareStatus(`Görsel indirildi. Açıklama: ${caption}`);
    }
  } catch (err) {
    console.error(err);
    setShareStatus('Görsel paylaşımı başarısız oldu.');
  }
}

// ─── Share ───
function shareResults(scores) {
  const vci = scores.vci;
  const dsSS = scores.dsScaledScore;
  const dsIQ = scores.dsIQ;

  let text = `Zekatesti Sonuçları\n`;
  if (scores.compositeIQ !== null) {
    text += `Genel Bileşik Puan: ${scores.compositeIQ}\n`;
  }
  text += `Sözel Kavrayış (VCI): ${vci.vci} [${vci.vci_ci90_lo}\u2013${vci.vci_ci90_hi}]\n`;

  if (scores.matricesSS !== null) {
    const ci = scores.matricesCI90;
    const ciStr = ci ? `[${ci[0]}\u2013${ci[1]}]` : '';
    text += `Akıcı Akıl Yürütme (Gf): ${scores.matricesSS} ${ciStr}\n`;
  }

  text += `Sözel Akıl Yürütme: ${scores.analogiPct}. yüzdelik (ön-normatif)\n`;

  if (dsIQ !== null) {
    text += `Çalışma Belleği (Gsm): ${dsIQ} IQ (ÖP: ${dsSS})\n`;
  }

  navigator.clipboard.writeText(text).then(() => {
    setShareStatus('Sonuçlar panoya kopyalandı.');
  }).catch(() => {
    setShareStatus('Kopyalama başarısız oldu.');
  });
}

// ─── Init ───
function init() {
  const session = getSession();
  const lastTest = localStorage.getItem(CURRENT_TEST_KEY);

  // No session yet → demographics
  if (!session) {
    showScreen('demographics');
    initDemographics();
    return;
  }

  // Check if we just returned from a subtest
  if (lastTest) {
    localStorage.removeItem(CURRENT_TEST_KEY);
    const justCompleted = isSubtestCompleted(lastTest);

    if (justCompleted) {
      if (allCompleted()) {
        showResults();
        return;
      }
      showTransition(lastTest);
      return;
    }
  }

  // Already have session, check if all done
  if (allCompleted()) {
    showHub(); // Show hub with option to view results
    return;
  }

  showHub();
}

// ─── Reset ───
function resetBattery() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(CURRENT_TEST_KEY);
  // Don't remove subtest results — they manage their own state
  showScreen('demographics');
  initDemographics();
}

// ─── Exports for HTML event handlers ───
window.__battery = {
  showHub,
  showResults,
  resetBattery,
};

document.addEventListener('DOMContentLoaded', init);
