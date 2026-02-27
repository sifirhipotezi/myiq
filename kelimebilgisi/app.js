const $ = (sel)=>document.querySelector(sel);
const state = { i:0, data:null, answers:[] };
const BATTERY_KEY = 'psychometric_battery_v1';

function defaultBatteryState(){
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

function loadBatteryState(){
  try{
    const raw = localStorage.getItem(BATTERY_KEY);
    if(!raw) return defaultBatteryState();
    const parsed = JSON.parse(raw);
    const base = defaultBatteryState();
    return {
      completed: { ...base.completed, ...(parsed.completed || {}) },
      rawScores: { ...base.rawScores, ...(parsed.rawScores || {}) },
      updatedAt: parsed.updatedAt || null
    };
  }catch(_){
    return defaultBatteryState();
  }
}

function saveBatteryResult(testId, rawScoreText){
  const s = loadBatteryState();
  s.completed[testId] = true;
  s.rawScores[testId] = rawScoreText;
  s.updatedAt = new Date().toISOString();
  localStorage.setItem(BATTERY_KEY, JSON.stringify(s));
}

function goBackToHub(){
  window.location.href = '../index.html';
}

async function load(){
  const res = await fetch('items.json');
  state.data = await res.json();
  $('#progress').textContent = ``; // initially blank
}
function render(){
  const {items} = state.data;
  const i = state.i;
  $('#progress').textContent = `${i+1} / ${items.length}`;
  const item = items[i];
  $('#prompt').textContent = item.prompt || `soru ${i+1}`;
  const form = $('#choices');
  form.innerHTML = '';
  item.choices.forEach((txt,idx)=>{
    const id = `opt_${i}_${idx}`;
    const label = document.createElement('label');
    label.className = 'choice';
    label.innerHTML = `<input type="radio" name="q_${i}" value="${idx}" ${state.answers[i]==idx?'checked':''}><span>${txt}</span>`;
    label.querySelector('input').id = id;
    label.htmlFor = id;
    form.appendChild(label);
  });
  $('#prev').disabled = i===0;
  $('#next').textContent = (i===items.length-1) ? 'bitir' : 'sonraki';
}
function pick(){
  const radios = document.querySelectorAll(`#choices input[type="radio"]`);
  let v = null;
  radios.forEach(r=>{ if(r.checked) v = parseInt(r.value,10); });
  state.answers[state.i] = v;
}
$('#prev').addEventListener('click', ()=>{ pick(); state.i--; render(); });
$('#next').addEventListener('click', ()=>{
  pick();
  const last = state.i === state.data.items.length-1;
  if(!last){ state.i++; render(); }
  else{ finish(); }
});
$('#restart').addEventListener('click', ()=>{
  state.i=0; state.answers=[];
  $('#result').classList.add('hidden');
  $('#card').classList.add('hidden');
  $('#intro').classList.remove('hidden');
  $('#progress').textContent = ``;
});
$('#continueToHub')?.addEventListener('click', goBackToHub);
$('#start').addEventListener('click', ()=>{
  $('#intro').classList.add('hidden');
  $('#card').classList.remove('hidden');
  state.i=0;
  render();
});

function finish(){
  const {items} = state.data;
  let correct = 0;
  items.forEach((it,idx)=>{
    if(state.answers[idx] === it.answer_index) correct++;
  });
  const scoreline = `puan: ${correct} / ${items.length}`;
  $('#scoreline').textContent = scoreline;
  saveBatteryResult('kelimebilgisi', `${correct}/${items.length}`);
  // answer key
  const ol = $('#answerkey');
  ol.innerHTML = '';
  items.forEach((it,idx)=>{
    const li = document.createElement('li');
    const user = state.answers[idx];
    const ok = user === it.answer_index;
    li.innerHTML = `<strong>${it.prompt || 'soru '+(idx+1)}</strong>: doğru 👉 <em>${it.answer_text}</em>` +
                   (user==null ? ` — <span class="summary-wrong">(boş)</span>` :
                   ok ? ` — <span class="summary-correct">(doğru)</span>` :
                        ` — <span class="summary-wrong">(yanlış; sen: ${it.choices[user]})</span>`);
    ol.appendChild(li);
  });
  $('#card').classList.add('hidden');
  $('#result').classList.remove('hidden');
}


load();
document.querySelector('#start')?.addEventListener('click', ()=>{
  document.querySelector('#intro')?.classList.add('hidden');
  document.querySelector('#card')?.classList.remove('hidden');
  state.i = 0;
  render();
});


document.addEventListener('DOMContentLoaded', ()=>{
  const startBtn = document.querySelector('#start');
  if(startBtn){
    startBtn.addEventListener('click', ()=>{
      document.querySelector('#intro')?.classList.add('hidden');
      document.querySelector('#card')?.classList.remove('hidden');
      state.i = 0;
      render();
    });
  }
});
