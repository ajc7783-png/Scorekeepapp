
(() => {
  const startBtn = document.getElementById('start-round');
  const holesSelect = document.getElementById('holes-select');
  const playersSelect = document.getElementById('players-select');
  const playerNamesDiv = document.getElementById('player-names');
  const scoreboard = document.getElementById('scoreboard');
  const setup = document.getElementById('setup');
  const scoresContainer = document.getElementById('scores-container');
  const holesCountEl = document.getElementById('holes-count');
  const playerCountEl = document.getElementById('player-count');
  const currentHoleEl = document.getElementById('current-hole');
  const undoBtn = document.getElementById('undo-button');
  const clearHoleBtn = document.getElementById('clear-last-hole');
  const prevHoleBtn = document.getElementById('prev-hole');
  const nextHoleBtn = document.getElementById('next-hole');
  const resetButton = document.getElementById('reset-button');
  const wakeState = document.getElementById('wake-state');

  let state = {
    holes: 9,
    players: 1,
    names: ['Player 1'],
    scores: [], 
    currentHole: 1,
    history: [] 
  };

  const STORAGE_KEY = 'golf-scorekeeper-state-v1';

  
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      
      if (!parsed || !parsed.holes) return false;
      state = parsed;
      return true;
    } catch (e) { return false; }
  }

  
  function createPlayerNameInputs(count){
    playerNamesDiv.innerHTML = '';
    for(let i=0;i<count;i++){
      const label = document.createElement('label');
      label.innerHTML = `Name:
        <input type="text" class="player-name" maxlength="20" data-player="${i}" value="${state.names[i]||`Player ${i+1}`}">`;
      playerNamesDiv.appendChild(label);
    }
  }

  playersSelect.addEventListener('change', ()=> {
    const val = Number(playersSelect.value);
    
    state.players = val;
    
    while(state.names.length < val) state.names.push(`Player ${state.names.length+1}`);
    if (state.names.length > val) state.names = state.names.slice(0,val);
    createPlayerNameInputs(val);
  });

  playerNamesDiv.addEventListener('input', (e)=>{
    if(e.target.classList.contains('player-name')){
      const idx = Number(e.target.dataset.player);
      state.names[idx] = e.target.value || `Player ${idx+1}`;
      saveState();
    }
  });

  function initScoresMatrix(holes, players){
    const matrix = [];
    for(let h=0;h<holes;h++){
      const row = new Array(players).fill(null);
      matrix.push(row);
    }
    return matrix;
  }

  function startRoundFromUI(){
    const holes = Number(holesSelect.value);
    const players = Number(playersSelect.value);
    state.holes = holes;
    state.players = players;
    
    const nameInputs = [...document.querySelectorAll('.player-name')];
    state.names = nameInputs.map((el,i)=> el.value.trim() || `Player ${i+1}`);
    state.scores = initScoresMatrix(holes, players);
    state.currentHole = 1;
    state.history = [];
    saveState();
    renderScoreboard();
    setup.classList.add('hidden');
    scoreboard.classList.remove('hidden');
    requestWakeLock();
  }

  startBtn.addEventListener('click', startRoundFromUI);

  
  resetButton.addEventListener('click', ()=>{
    if(!confirm('Reset all scores and settings?')) return;
    localStorage.removeItem(STORAGE_KEY);
    
    state = {
      holes: 9,
      players: 1,
      names: ['Player 1'],
      scores: [],
      currentHole: 1,
      history: []
    };
    setup.classList.remove('hidden');
    scoreboard.classList.add('hidden');
    createPlayerNameInputs(1);
    releaseWakeLock();
  });


  function renderScoreboard(){
    holesCountEl.textContent = state.holes;
    playerCountEl.textContent = state.players;
    currentHoleEl.textContent = state.currentHole;
    
    scoresContainer.style.setProperty('--players', state.players);

    
    scoresContainer.innerHTML = '';
    for(let h=0;h<state.holes;h++){
      const row = document.createElement('div');
      row.className = 'score-row';
      row.dataset.hole = (h+1);

      const holeLabel = document.createElement('div');
      holeLabel.className = 'hole-label';
      holeLabel.textContent = `#${h+1}`;
      row.appendChild(holeLabel);

      for(let p=0;p<state.players;p++){
        const cell = document.createElement('div');
        cell.className = 'score-cell';
        const input = document.createElement('input');
        input.type = 'tel'; 
        input.inputMode = 'numeric';
        input.pattern = '[0-9]*';
        input.placeholder = '-';
        input.value = state.scores[h] && state.scores[h][p] != null ? state.scores[h][p] : '';
        input.dataset.hole = h;
        input.dataset.player = p;
        input.autocomplete = 'off';

        
        input.setAttribute('aria-label', `${state.names[p]} hole ${h+1} strokes`);

        
        input.addEventListener('input', (e)=>{
          const raw = e.target.value.replace(/[^\d]/g,'');
          e.target.value = raw;
        });

        input.addEventListener('change', onScoreInputChange);
        
        input.addEventListener('blur', onScoreInputChange);

        cell.appendChild(input);
        row.appendChild(cell);
      }

      const holeTotal = document.createElement('div');
      holeTotal.className = 'total-col muted small';
      const totals = state.scores[h] ? state.scores[h].map(v=>v||0).reduce((a,b)=>a+b,0) : 0;
      holeTotal.textContent = `Total: ${totals || '-'}`;
      row.appendChild(holeTotal);

      scoresContainer.appendChild(row);
    }

    
    const totalBar = document.createElement('div');
    totalBar.className = 'total-bar';
    const totalsWrap = document.createElement('div');
    totalsWrap.className = 'player-totals';
    for(let p=0;p<state.players;p++){
      const pt = document.createElement('div');
      pt.className = 'player-total';
      pt.dataset.player = p;
      pt.innerHTML = `<div style="font-weight:700">${state.names[p]}</div><div class="muted">Total: <span class="sum">${computePlayerTotal(p)}</span></div>`;
      totalsWrap.appendChild(pt);
    }
    totalBar.appendChild(totalsWrap);
    scoresContainer.appendChild(totalBar);

    
    highlightCurrentHole();
    saveState();
  }

  function computePlayerTotal(playerIndex){
    let sum = 0;
    for(let h=0;h<state.holes;h++){
      const v = state.scores[h] && state.scores[h][playerIndex];
      if (v != null && v !== '') sum += Number(v);
    }
    return sum;
  }

  function onScoreInputChange(e){
    const input = e.target;
    const hole = Number(input.dataset.hole);
    const player = Number(input.dataset.player);
    const raw = input.value.trim();
    if (raw === '') {
      
      const prev = state.scores[hole] ? state.scores[hole][player] : null;
      state.scores[hole][player] = null;
      state.history.push({hole,player,prev});
      renderTotals();
      saveState();
      return;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      alert('Enter a whole number >= 1 for strokes.');
      input.value = '';
      return;
    }
    const prev = state.scores[hole] ? state.scores[hole][player] : null;
    state.scores[hole][player] = value;
    state.history.push({hole,player,prev});
   
    renderTotals();
    saveState();
  }

  function renderTotals(){
    
    document.querySelectorAll('.player-total').forEach(pt=>{
      const p = Number(pt.dataset.player);
      pt.querySelector('.sum').textContent = computePlayerTotal(p);
    });
    document.querySelectorAll('.score-row').forEach(row=>{
      const h = Number(row.dataset.hole) - 1;
      const totalCell = row.querySelector('.total-col');
      if (totalCell){
        const totals = state.scores[h] ? state.scores[h].map(v=>v||0).reduce((a,b)=>a+b,0) : 0;
        totalCell.textContent = `Total: ${totals || '-'}`;
      }
    });
  }

  undoBtn.addEventListener('click', ()=>{
    if(state.history.length===0){ alert('Nothing to undo'); return;}
    const last = state.history.pop();
    const {hole, player, prev} = last;
    state.scores[hole][player] = prev === undefined ? null : prev;
    
    const input = document.querySelector(`input[data-hole="${hole}"][data-player="${player}"]`);
    if (input) input.value = prev == null ? '' : prev;
    renderTotals();
    saveState();
  });

  clearHoleBtn.addEventListener('click', ()=>{
    const h = state.currentHole - 1;
    if(!confirm(`Clear scores for hole ${h+1}?`)) return;
    for(let p=0;p<state.players;p++){
      const prev = state.scores[h][p];
      state.history.push({hole:h,player:p,prev});
      state.scores[h][p] = null;
      const input = document.querySelector(`input[data-hole="${h}"][data-player="${p}"]`);
      if (input) input.value = '';
    }
    renderTotals();
    saveState();
  });

  // navigate holes
  prevHoleBtn.addEventListener('click', ()=>{
    if (state.currentHole > 1) state.currentHole--;
    highlightCurrentHole();
    saveState();
  });
  nextHoleBtn.addEventListener('click', ()=>{
    if (state.currentHole < state.holes) state.currentHole++;
    highlightCurrentHole();
    saveState();
  });

  function highlightCurrentHole(){
    currentHoleEl.textContent = state.currentHole;
    const rows = document.querySelectorAll('.score-row');
    rows.forEach(r=>{
      const hole = Number(r.dataset.hole);
      if (hole === state.currentHole) r.style.boxShadow = '0 0 0 3px rgba(11,108,241,0.08)';
      else r.style.boxShadow = 'none';
    });
    // scroll into view
    const node = document.querySelector(`.score-row[data-hole="${state.currentHole}"]`);
    if (node) node.scrollIntoView({behavior:'smooth', block:'center'});
  }

  
  if (loadState()) {
    // If saved contains a scores matrix, render accordingly
    if (state.scores && state.scores.length) {
      // Put setup hidden, show scoreboard
      setup.classList.add('hidden');
      scoreboard.classList.remove('hidden');
      createPlayerNameInputs(state.players);
      // populate name inputs with saved names
      document.querySelectorAll('.player-name').forEach((el,i)=>{
        el.value = state.names[i] || `Player ${i+1}`;
      });
      renderScoreboard();
      requestWakeLock();
    } else {
      createPlayerNameInputs(state.players);
    }
  } else {
    createPlayerNameInputs(1);
  }

  window.GolfState = state;
})();
