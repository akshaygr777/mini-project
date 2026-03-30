const App = (() => {
  let currentPage = 'greeting';
  let totalScore  = 0;

  function navigate(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

    if (currentPage === 'practice') Practice.cleanup();
    if (currentPage === 'test')     Test.cleanup();

    currentPage = page;

    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');

    const nav = document.getElementById('main-nav');
    if (page === 'greeting') {
      nav.classList.add('hidden');
    } else {
      nav.classList.remove('hidden');
      const tab = document.getElementById(`nav-${page}`);
      if (tab) tab.classList.add('active');
    }

    if (page === 'practice') setTimeout(() => Practice.start(), 100);
    if (page === 'test')     setTimeout(() => Test.start(), 100);
  }

  function addScore(pts) {
    totalScore += pts;
    document.getElementById('nav-score-val').textContent = totalScore;
  }

  return { navigate, addScore, get currentPage() { return currentPage; } };
})();

const Practice = (() => {
  let currentIdx         = 0;
  let streak             = 0;
  let correctCount       = 0;
  let locked             = false;
  let consecutiveCorrect = 0;
  
  const CORRECT_NEEDED   = 6;
  let warmupFrames       = 0;
  const WARMUP_NEEDED    = 12;

  const MODE             = 'practice';

  function start() {
    currentIdx         = 0;
    streak             = 0;
    correctCount       = 0;
    locked             = false;
    consecutiveCorrect = 0;
    warmupFrames       = 0;
    updateDisplay();
    initCamera();
  }

  async function initCamera() {
    const ok = await Camera.init(MODE);
    if (!ok) { showCameraError(MODE); return; }
    Camera.startDetection(MODE, handleDetection);
    setStatus('detecting');
  }

  function cleanup() {
    Camera.stop(MODE);
    locked = false;
  }

  function handleDetection(result) {
    if (locked) return;

    const target   = ASL_CURRICULUM[currentIdx];
    const detVal   = document.getElementById('practice-det-val');
    const ring     = document.getElementById('practice-detect-ring');
    const camLabel = document.getElementById('practice-cam-label');

    if (!result.hand_detected || result.error) {
      detVal.textContent   = '—';
      detVal.className     = 'det-val';
      ring.className       = 'detect-ring';
      camLabel.textContent = 'Position your hand in frame';
      consecutiveCorrect   = 0;
      warmupFrames         = 0;
      setStatus('detecting');
      return;
    }

    if (warmupFrames < WARMUP_NEEDED) {
      warmupFrames++;
      ring.className       = 'detect-ring';
      camLabel.textContent = 'Get ready...';
      return;
    }

    const detected = result.label;
    const conf     = result.confidence || 0;

    ring.className       = 'detect-ring hand-found';
    camLabel.textContent = detected ? `Seeing: ${detected} (${Math.round(conf * 100)}%)` : 'Hand detected';
    detVal.textContent   = detected || '?';

    if (detected === target) {
      detVal.className = 'det-val match';
      ring.className   = 'detect-ring correct';
      consecutiveCorrect++;
      setStatus('correct');

      if (consecutiveCorrect >= CORRECT_NEEDED) {
        consecutiveCorrect = 0;
        onCorrect();
      }
    } else {
      detVal.className   = 'det-val no-match';
      ring.className     = 'detect-ring hand-found';
      consecutiveCorrect = 0;
      setStatus('detecting');
    }
  }

  function onCorrect() {
    locked = true;
    streak++;
    correctCount++;
    document.getElementById('practice-streak').textContent = streak;
    App.addScore(10);
    showResult('correct', ASL_CURRICULUM[currentIdx]);
    setTimeout(() => { hideResult(); advance(); }, 2500);
  }

  function advance() {
    currentIdx++;
    locked             = false;
    consecutiveCorrect = 0;
    warmupFrames       = 0;
    if (currentIdx >= ASL_CURRICULUM.length) { showComplete(); return; }
    updateDisplay();
  }

  function prev() {
    if (currentIdx > 0) {
      currentIdx--;
      locked             = false;
      consecutiveCorrect = 0;
      warmupFrames       = 0;
      updateDisplay();
    }
  }

  function skip() {
    streak = 0;
    document.getElementById('practice-streak').textContent = streak;
    locked             = false;
    consecutiveCorrect = 0;
    warmupFrames       = 0;
    advance();
  }

  function updateDisplay() {
    const letter = ASL_CURRICULUM[currentIdx];
    document.getElementById('practice-letter').textContent = letter;
    document.getElementById('practice-svg').innerHTML      = makeImg(letter);

    const pct = ((currentIdx + 1) / ASL_CURRICULUM.length * 100).toFixed(1);
    document.getElementById('practice-progress').style.width = `${pct}%`;
    document.getElementById('practice-counter').textContent  = `${currentIdx + 1} / ${ASL_CURRICULUM.length}`;
    document.getElementById('practice-hint').textContent     = `Show the sign for "${letter}" to the camera`;
    document.getElementById('practice-det-val').textContent  = '—';
    document.getElementById('practice-det-val').className    = 'det-val';
    document.getElementById('practice-detect-ring').className = 'detect-ring';
  }

  function setStatus(state) {
    const badge = document.getElementById('practice-status');
    badge.className  = `status-chip status-${state}`;
    const labels = { waiting: 'Waiting', detecting: 'Detecting', correct: 'Correct!', wrong: 'Try Again' };
    badge.textContent = labels[state] || state;
  }

  function showComplete() {
    Camera.stop(MODE);
    const overlay = document.getElementById('complete-overlay');
    document.getElementById('complete-title').textContent = 'Practice Complete!';
    document.getElementById('complete-sub').textContent   = 'You signed all 26 ASL letters!';
    document.getElementById('complete-stats').innerHTML   = `
      <div class="complete-stat"><div class="c-stat-num">${correctCount}</div><div class="c-stat-lbl">Signed</div></div>
      <div class="complete-stat"><div class="c-stat-num">${streak}</div><div class="c-stat-lbl">Best Streak</div></div>
    `;
    document.getElementById('complete-retry').onclick = () => { overlay.classList.add('hidden'); start(); };
    overlay.classList.remove('hidden');
  }

  return { start, cleanup, prev, skip };
})();

const Test = (() => {
  let currentIdx         = 0;
  let correct            = 0;
  let wrong              = 0;
  let locked             = false;
  let consecutiveMatch   = 0;  
  let lastSeen           = null;
  
  const HOLD_NEEDED      = 6;  
  let warmupFrames       = 0;
  const WARMUP_NEEDED    = 12;

  const MODE             = 'test';
  let curriculum         = [];

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function start() {
    curriculum         = shuffle(ASL_CURRICULUM);
    currentIdx         = 0;
    correct            = 0;
    wrong              = 0;
    locked             = false;
    consecutiveMatch   = 0;
    lastSeen           = null;
    warmupFrames       = 0;
    updateDisplay();
    initCamera();
  }

  async function initCamera() {
    const ok = await Camera.init(MODE);
    if (!ok) { showCameraError(MODE); return; }
    Camera.startDetection(MODE, handleDetection);
    setStatus('detecting');
  }

  function cleanup() {
    Camera.stop(MODE);
    locked = false;
  }

  function handleDetection(result) {
    if (locked) return;

    const target   = curriculum[currentIdx];
    const detVal   = document.getElementById('test-det-val');
    const ring     = document.getElementById('test-detect-ring');
    const camLabel = document.getElementById('test-cam-label');

    if (!result.hand_detected || result.error) {
      detVal.textContent   = '—';
      detVal.className     = 'det-val';
      ring.className       = 'detect-ring';
      camLabel.textContent = `Show the sign for: ${target}`;
      consecutiveMatch     = 0;
      lastSeen             = null;
      warmupFrames         = 0;
      setStatus('detecting');
      return;
    }

    if (warmupFrames < WARMUP_NEEDED) {
      warmupFrames++;
      ring.className       = 'detect-ring';
      camLabel.textContent = 'Get ready...';
      return;
    }

    const detected = result.label;
    const conf     = result.confidence || 0;

    ring.className       = 'detect-ring hand-found';
    camLabel.textContent = detected ? `Seeing: ${detected} (${Math.round(conf * 100)}%)` : 'Hand detected';
    detVal.textContent   = detected || '?';

    if (!detected) {
      consecutiveMatch = 0;
      lastSeen         = null;
      return;
    }

    if (detected === lastSeen) {
      consecutiveMatch++;
    } else {
      consecutiveMatch = 1;
      lastSeen         = detected;
    }

    if (detected === target) {
      detVal.className = 'det-val match';
      ring.className   = 'detect-ring correct';
      setStatus('correct');
    } else {
      detVal.className = 'det-val no-match';
      ring.className   = 'detect-ring hand-found';
      setStatus('detecting');
    }

    if (consecutiveMatch >= HOLD_NEEDED) {
      consecutiveMatch = 0;
      lastSeen         = null;
      if (detected === target) {
        onCorrect();
      } else {
        onWrong();
      }
    }
  }

  function onCorrect() {
    locked = true;
    correct++;
    App.addScore(10);
    updateScores();
    showResult('correct', curriculum[currentIdx]);
    setTimeout(() => { hideResult(); advance(); }, 2500);
  }

  function onWrong() {
    locked = true;
    wrong++;
    updateScores();
    showResult('wrong', curriculum[currentIdx]);
    setTimeout(() => { hideResult(); advance(); }, 2500);
  }

  function advance() {
    currentIdx++;
    locked           = false;
    consecutiveMatch = 0;
    lastSeen         = null;
    warmupFrames     = 0;
    if (currentIdx >= curriculum.length) { showComplete(); return; }
    updateDisplay();
  }

  function updateDisplay() {
    const letter = curriculum[currentIdx];
    document.getElementById('test-letter').textContent = letter;

    const pct = ((currentIdx + 1) / curriculum.length * 100).toFixed(1);
    document.getElementById('test-progress').style.width  = `${pct}%`;
    document.getElementById('test-counter').textContent   = `${currentIdx + 1} / ${curriculum.length}`;
    document.getElementById('test-det-val').textContent   = '—';
    document.getElementById('test-det-val').className     = 'det-val';
    document.getElementById('test-detect-ring').className = 'detect-ring';
    setStatus('detecting');
  }

  function updateScores() {
    document.getElementById('test-correct-count').textContent = correct;
    document.getElementById('test-wrong-count').textContent   = wrong;
    document.getElementById('test-total-count').textContent   = correct + wrong;
  }

  function setStatus(state) {
    const badge = document.getElementById('test-status');
    badge.className   = `status-chip status-${state}`;
    const labels = { waiting: 'Waiting', detecting: 'Detecting', correct: 'Correct!', wrong: 'Wrong' };
    badge.textContent = labels[state] || state;
  }

  function showComplete() {
    Camera.stop(MODE);
    const accuracy = curriculum.length > 0 ? Math.round((correct / curriculum.length) * 100) : 0;
    const overlay  = document.getElementById('complete-overlay');
    document.getElementById('complete-title').textContent = 'Test Complete!';
    document.getElementById('complete-sub').textContent   = `You completed all ${curriculum.length} letters!`;
    document.getElementById('complete-stats').innerHTML   = `
      <div class="complete-stat"><div class="c-stat-num">${correct}</div><div class="c-stat-lbl">Correct</div></div>
      <div class="complete-stat"><div class="c-stat-num">${accuracy}%</div><div class="c-stat-lbl">Accuracy</div></div>
      <div class="complete-stat"><div class="c-stat-num">${wrong}</div><div class="c-stat-lbl">Wrong</div></div>
    `;
    document.getElementById('complete-retry').onclick = () => { overlay.classList.add('hidden'); start(); };
    overlay.classList.remove('hidden');
  }

  return { start, cleanup };
})();

function showResult(type, letter) {
  const overlay  = document.getElementById('result-overlay');
  const icon     = document.getElementById('result-icon');
  const title    = document.getElementById('result-title');
  const sub      = document.getElementById('result-sub');
  const letterEl = document.getElementById('result-letter');

  if (type === 'correct') {
    icon.textContent  = '✓';
    icon.style.color  = '#15803d';
    title.textContent = 'Correct!';
    title.style.color = '#15803d';
    sub.textContent   = 'Moving to next letter…';
  } else {
    icon.textContent  = '✗';
    icon.style.color  = '#b91c1c';
    title.textContent = 'Wrong';
    title.style.color = '#b91c1c';
    sub.textContent   = 'Moving to next letter…';
  }

  letterEl.textContent = letter;
  overlay.classList.remove('hidden');
}

function hideResult() {
  document.getElementById('result-overlay').classList.add('hidden');
}

function showCameraError(mode) {
  const label = document.getElementById(`${mode}-cam-label`);
  if (label) {
    label.textContent = '⚠ Camera access denied or unavailable';
    label.style.color = '#b91c1c';
  }
}

window.addEventListener('load', async () => {
  const ok = await Camera.checkBackend().catch(() => false);
  if (!ok) console.warn('Backend not reachable. Run: python backend/app.py');
});

window.App      = App;
window.Practice = Practice;
window.Test     = Test;