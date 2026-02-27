// index.js
import { SEQUENCES } from './sequences.js';
import { SCORE } from './score.js';

const AUDIO_BASE = 'audio';
const BATTERY_KEY = 'psychometric_battery_v1';

globalThis.STATE = {
  submitted: false,
  prompt: null,
  SCORE,
  maskTimeout: null,
  submissionValue: '',
};

const $ = document.querySelector.bind(document);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.addEventListener('DOMContentLoaded', main);

function defaultBatteryState() {
  return {
    completed: {
      'genelkultur': false,
      'kelimebilgisi': false,
      'analoji-beta': false,
      'hagentest': false,
      'digitspan': false,
    },
    rawScores: {
      'genelkultur': '',
      'kelimebilgisi': '',
      'analoji-beta': '',
      'hagentest': '',
      'digitspan': '',
    },
    updatedAt: null,
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
      updatedAt: parsed.updatedAt || null,
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

function main() {
  injectHintNode();          // add hint UI
  updateTable();
  setupMaskedInput();
  $('#continue-to-hub').addEventListener('click', goBackToHub);

  $('#submit-and-continue').addEventListener('click', () => {
    STATE.submitted = true;
    $('#submit-and-continue').disabled = true;
  });

  // Replay last instruction
  $('#play').addEventListener('click', async () => {
    if ($('#play').dataset.clicked === 'false') return;
    $('#play').disabled = true;
    $('#submit-and-continue').disabled = true;
    if (STATE.prompt) await playInstruction(STATE.prompt);
    $('#play').disabled = false;
    $('#submit-and-continue').disabled = false;
    $('#submission').disabled = false;
    $('#pseudo-submission').focus();
  });

  // Begin test
  $('#play').addEventListener('click', async () => {
    if ($('#play').dataset.clicked === 'true') return;
    $('#play').dataset.clicked = 'true';

    // -------- FORWARD --------
    STATE.prompt = 'forward.mp3';
    await playInstruction(STATE.prompt);

    let forwardWrongStreak = 0;
    FORWARD: for (const [i, sequence] of Object.entries(SEQUENCES.FORWARD)) {
      for (const digit of sequence) {
        await playDigit(digit);
        await waitFor(120);
      }
      const submission = await waitForSubmission();
      const isCorrect = submission === sequence.join('');
      STATE.SCORE.FORWARD += isCorrect ? 1 : 0;
      updateTable();
      if (isCorrect) {
        forwardWrongStreak = 0;
      } else if (++forwardWrongStreak === 2) {
        break FORWARD;
      }
    }

    // -------- BACKWARD (practice) --------
    STATE.prompt = 'backward1.mp3';
    await playInstruction(STATE.prompt);

    // Example: "7 1"  -> type "17"
    await waitFor(250);
    await playDigit(7);
    await waitFor(120);
    await playDigit(1);

    $('#play').disabled = false;
    $('#play').textContent = 'TEKRAR';
    showHint('Örnek: kutucuğa <b>1 7</b> yazın');
    const BACKWARD_PRACTICE_1 = await waitForSubmission();
    hideHint();

    STATE.prompt = 'backward2.mp3';
    await playInstruction(STATE.prompt);

    // Example: "3 4"  -> type "43"
    await waitFor(250);
    await playDigit(3);
    await waitFor(120);
    await playDigit(4);

    $('#play').disabled = false;
    showHint('Örnek: kutucuğa <b>4 3</b> yazın');
    const BACKWARD_PRACTICE_2 = await waitForSubmission();
    hideHint();

    // -------- BACKWARD (main) --------
    STATE.prompt = 'backwardmain.mp3';
    await playInstruction(STATE.prompt);

    let backwardWrongStreak = 0;
    BACKWARD: for (const [i, sequence] of Object.entries(SEQUENCES.BACKWARD)) {
      for (const digit of sequence) {
        await playDigit(digit);
        await waitFor(120);
      }
      const submission = await waitForSubmission();
      const isCorrect = submission === [...sequence].reverse().join('');
      STATE.SCORE.BACKWARD += isCorrect ? 1 : 0;
      updateTable();
      if (isCorrect) {
        backwardWrongStreak = 0;
      } else if (++backwardWrongStreak === 2) {
        break BACKWARD;
      }
    }

    // -------- SEQUENCING (practice) --------
    STATE.prompt = 'sequences1.mp3';
    await playInstruction(STATE.prompt);

    // Example: "2 3 1" -> type "123"
    await waitFor(250);
    for (const d of [2, 3, 1]) {
      await playDigit(d);
      await waitFor(120);
    }

    $('#play').disabled = false;
    showHint('Örnek: kutucuğa <b>1 2 3</b> yazın');
    const SEQUENCING_PRACTICE_1 = await waitForSubmission();
    hideHint();

    STATE.prompt = 'sequences2.mp3';
    await playInstruction(STATE.prompt);

    // Example: "5 2 2" -> type "225"
    await waitFor(250);
    for (const d of [5, 2, 2]) {
      await playDigit(d);
      await waitFor(120);
    }

    $('#play').disabled = false;
    showHint('Örnek: kutucuğa <b>2 2 5</b> yazın');
    const SEQUENCING_PRACTICE_2 = await waitForSubmission();
    hideHint();

    // -------- SEQUENCING (main) --------
    STATE.prompt = 'sequencesmain.mp3';
    await playInstruction(STATE.prompt);

    let sequencingWrongStreak = 0;
    SEQUENCING: for (const [i, sequence] of Object.entries(SEQUENCES.SEQUENCING)) {
      for (const digit of sequence) {
        await playDigit(digit);
        await waitFor(120);
      }
      const submission = await waitForSubmission();
      const isCorrect = submission === [...sequence].sort((a, b) => a - b).join('');
      STATE.SCORE.SEQUENCING += isCorrect ? 1 : 0;
      updateTable();
      if (isCorrect) {
        sequencingWrongStreak = 0;
      } else if (++sequencingWrongStreak === 2) {
        break SEQUENCING;
      }
    }

    // End
    $('#play').disabled = true;
    $('#submission').disabled = true;
    $('#submit-and-continue').disabled = true;
    $('#pseudo-submission').classList.add('test-complete');
    const overallRaw = STATE.SCORE.OVERALL;
    const details = `F:${STATE.SCORE.FORWARD} B:${STATE.SCORE.BACKWARD} S:${STATE.SCORE.SEQUENCING} O:${overallRaw}`;
    saveBatteryResult('digitspan', details);
    $('#continue-to-hub').style.display = 'inline-block';
  });
}

/* ---------- Audio helpers ---------- */

async function playAudio(filename) {
  $('#play').disabled = true;
  $('#submission').disabled = true;

  return new Promise((resolve) => {
    const audio = new Audio(`${AUDIO_BASE}/${filename}`);
    audio.addEventListener('ended', () => {
      $('#play').disabled = false;
      $('#submission').disabled = false;
      resolve();
    });
    audio.addEventListener('error', () => {
      alert(`Ses dosyası yüklenemedi: ${filename}`);
      $('#play').disabled = false;
      $('#submission').disabled = false;
      resolve(); // fail-soft
    });
    audio.play();
  });
}

function playDigit(digit) {
  return playAudio(`${digit}.mp3`);
}

function playInstruction(nameOrFile) {
  const file = nameOrFile.endsWith('.mp3') ? nameOrFile : `${nameOrFile}.mp3`;
  return playAudio(file);
}

/* ---------- Timing / input helpers ---------- */

async function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSubmission() {
  $('#submission').disabled = false;
  $('#pseudo-submission').focus();
  $('#submit-and-continue').disabled = false;
  while (true) {
    await waitFor(0);
    if (STATE.submitted) {
      STATE.submitted = false;
      const submission = $('#submission').value.trim();
      $('#submission').value = '';
      return submission;
    }
  }
}

/* ---------- Scores ---------- */

function updateTable() {
  for (const category of ['FORWARD', 'BACKWARD', 'SEQUENCING', 'OVERALL']) {
    const { children: tds } = $(`tr[name="${category.toLowerCase()}"]`);
    tds[1].textContent = STATE.SCORE[category];
  }
}

/* ---------- Masked input + hint UI ---------- */

function setupMaskedInput() {
  setInterval(() => {
    if ($('#submission').disabled) {
      $('#pseudo-submission').innerHTML = '&nbsp;';
      $('#pseudo-submission').contentEditable = false;
    } else if ($('#pseudo-submission').contentEditable === 'false') {
      $('#pseudo-submission').contentEditable = true;
      focusContentEditable($('#pseudo-submission'));
    }
  });

  $('#pseudo-submission').addEventListener('keydown', function (evt) {
    if (evt.key === 'Enter') {
      $('#submit-and-continue').click();
      evt.preventDefault();
      return;
    }
  });

  $('#pseudo-submission').addEventListener('input', function () {
    // Only digits
    this.textContent = this.textContent.replace(/\D/g, '');
    $('#submission').value = this.textContent;

    // flatten the tree
    this.textContent = this.textContent;

    const lastChar = document.createElement('span');

    clearTimeout(STATE.maskTimeout);
    STATE.maskTimeout = setTimeout(() => {
      lastChar.style.fontFamily = 'Password';
    }, 500);

    if (STATE.submissionValue.length < this.textContent.length) {
      lastChar.classList.add('visible-digit');
    }
    const child = this.firstChild?.splitText(this.textContent.length - 1);
    child && lastChar.appendChild(child);

    this.appendChild(lastChar);

    const range = document.createRange();
    range.selectNodeContents(this);
    range.collapse(false);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    STATE.submissionValue = this.textContent;
  });
}

function focusContentEditable(el) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.setStart(el.childNodes[0], 1);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  el.focus();
}

/* ---------- Hint helpers ---------- */

function injectHintNode() {
  if ($('#digitspan-hint')) return;
  const hint = document.createElement('div');
  hint.id = 'digitspan-hint';
  hint.style.position = 'fixed';
  hint.style.bottom = '18px';
  hint.style.left = '50%';
  hint.style.transform = 'translateX(-50%)';
  hint.style.padding = '10px 14px';
  hint.style.background = 'rgba(0,0,0,0.75)';
  hint.style.color = '#fff';
  hint.style.borderRadius = '10px';
  hint.style.fontSize = '14px';
  hint.style.boxShadow = '0 6px 18px rgba(0,0,0,0.25)';
  hint.style.zIndex = '9999';
  hint.style.display = 'none';
  hint.style.maxWidth = '80vw';
  hint.style.textAlign = 'center';
  document.body.appendChild(hint);
}

function showHint(html) {
  const hint = $('#digitspan-hint');
  if (!hint) return;
  hint.innerHTML = html;
  hint.style.display = 'block';
}

function hideHint() {
  const hint = $('#digitspan-hint');
  if (!hint) return;
  hint.style.display = 'none';
}
