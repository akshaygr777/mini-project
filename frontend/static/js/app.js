// frontend/static/js/app.js

const CURRICULUM = {
  characters: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
  words: ["I","LOVE","YOU","HELP","ME","PLEASE","HAVE","A","GOOD","DAY","SHE","HAS","CAT","HE","DOG","WE","READ","BOOK","THEY","DRINK","WATER","EAT","FOOD","HELLO","HOW","ARE","YES","CAN","NO","THANK"],
  sentences: ["I LOVE YOU", "HELP ME PLEASE", "HAVE A GOOD DAY", "SHE HAS A CAT", "HE HAS A DOG", "WE READ A BOOK", "THEY DRINK WATER", "I EAT GOOD FOOD", "HELLO HOW ARE YOU", "YES I CAN", "NO THANK YOU", "CAN YOU HELP ME", "I HAVE A BOOK", "THEY EAT FOOD", "I LOVE A GOOD DOG", "SHE DRINK WATER", "WE HAVE A CAT", "PLEASE READ BOOK", "HELLO GOOD DAY", "CAN WE EAT FOOD"]
};

const App = (() => {
  let currentPage = 'greeting';

  function init() {
    navigate('greeting');
  }

  function navigate(pageId) {
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');

    const nav = document.getElementById('main-nav');
    if (pageId === 'greeting') {
      nav.classList.add('hidden');
      Teaching.stop();
      Practicing.stop();
    } else {
      nav.classList.remove('hidden');
      document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
      document.getElementById('nav-' + pageId).classList.add('active');
      
      if (pageId === 'teaching') {
        Practicing.stop();
        Teaching.start();
      } else if (pageId === 'practicing') {
        Teaching.stop();
        Practicing.start();
      }
    }
    
    currentPage = pageId;
  }

  return { init, navigate, get currentPage() { return currentPage; } };
})();

// ---------------------------------------------------------
// TEACHING MODE
// ---------------------------------------------------------
const Teaching = (() => {
  const MODE = 'teaching';
  let active = false;
  let currentModule = 'characters';
  let currentIndex = 0;
  
  let currentTarget = "";
  let targetChars = [];
  let charIndex = 0;
  let consecutiveCorrect = 0;
  const REQUIRED_FRAMES = 6;
  let locked = false;

  function start() {
    active = true;
    showMenu();
    selectModule(currentModule);
    document.getElementById('nav-pts').style.display = 'none';
  }

  function stop() {
    active = false;
    Camera.stop(MODE);
  }

  function showMenu() {
    Camera.stop(MODE);
    document.getElementById('teaching-menu-view').classList.remove('hidden');
    document.getElementById('teaching-active-view').classList.add('hidden');
  }

  function selectModule(modId) {
    currentModule = modId;
    
    document.querySelectorAll('#teaching-modules .module-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.innerText.toLowerCase().includes(modId.slice(0, 4))) {
        btn.classList.add('active');
      }
    });
    
    let title = "Characters";
    if (modId === 'words') title = "Words";
    if (modId === 'sentences') title = "Sentences";
    document.getElementById('teaching-menu-title').innerText = title;
    
    const grid = document.getElementById('teaching-items-grid');
    grid.innerHTML = "";
    const items = CURRICULUM[modId];
    
    items.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.className = 'item-btn';
      btn.innerText = item;
      btn.onclick = () => startItem(idx);
      grid.appendChild(btn);
    });
  }

  function startItem(index) {
    currentIndex = index;
    const items = CURRICULUM[currentModule];
    if (index < 0 || index >= items.length) {
      showMenu();
      return;
    }
    
    currentTarget = items[index];
    targetChars = currentTarget.replace(/ /g, '').split(''); 
    charIndex = 0;
    consecutiveCorrect = 0;
    locked = false;
    
    document.getElementById('teaching-menu-view').classList.add('hidden');
    document.getElementById('teaching-active-view').classList.remove('hidden');
    
    updateUI();
    initCamera();
  }
  
  async function initCamera() {
    const ok = await Camera.init(MODE);
    if (!ok) { console.error("Camera init failed"); return; }
    Camera.startDetection(MODE, handleDetection);
  }

  function updateUI() {
    const items = CURRICULUM[currentModule];
    
    document.getElementById('teaching-counter').innerText = `${currentIndex + 1} / ${items.length}`;
    document.getElementById('teaching-progress').style.width = `${((currentIndex) / items.length) * 100}%`;
    document.getElementById('teaching-letter').innerText = currentTarget;
    
    const char = targetChars[charIndex];
    if(window.ASL_IMAGES && window.ASL_IMAGES[char]) {
      document.getElementById('teaching-svg').innerHTML = `<img src="${window.ASL_IMAGES[char]}" alt="${char}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;"/>`;
    } else {
      document.getElementById('teaching-svg').innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:4rem;color:#94a3b8;">${char || ''}</div>`;
    }
    
    const tfContainer = document.getElementById('teaching-textframes');
    tfContainer.innerHTML = "";
    targetChars.forEach((c, idx) => {
      const sp = document.createElement('div');
      sp.className = 'textframe';
      sp.id = `teach-tf-${idx}`;
      sp.innerText = c;
      if (idx < charIndex) {
        sp.classList.add('correct');
      } else if (idx === charIndex) {
         sp.style.borderColor = "#3b82f6";
         sp.style.borderWidth = "2px";
      }
      tfContainer.appendChild(sp);
    });
    
    const overlay = document.getElementById('teaching-accuracy-overlay');
    overlay.classList.remove('hidden');
    overlay.innerText = "0%";
    overlay.classList.remove('correct');
    
    const statusChip = document.getElementById('teaching-status');
    statusChip.innerText = `Waiting for ${char || ''}`;
    statusChip.className = "status-chip";
    document.getElementById('teaching-status-side').innerText = "";
    document.getElementById('teaching-det-val').innerText = "—";
    document.getElementById('teaching-detect-ring').className = "detect-ring";
  }

  function handleDetection(result) {
    if (!active || locked) return;
    
    const char = targetChars[charIndex];
    if (!char) return;

    const detVal = document.getElementById('teaching-det-val');
    const statusChip = document.getElementById('teaching-status');
    const statusSide = document.getElementById('teaching-status-side');
    const ring = document.getElementById('teaching-detect-ring');
    const overlay = document.getElementById('teaching-accuracy-overlay');

    if (!result.hand_detected || result.error) {
      detVal.innerText = "—";
      statusChip.innerText = "No hand detected";
      statusChip.className = "status-chip warning";
      ring.className = "detect-ring warning";
      statusSide.innerText = "";
      consecutiveCorrect = Math.max(0, consecutiveCorrect - 1);
    } else {
      detVal.innerText = result.label;
      
      if (result.label && result.label.toUpperCase() === char.toUpperCase()) {
        consecutiveCorrect++;
        statusChip.innerText = `Detected ${char}! Hold...`;
        statusChip.className = "status-chip success";
        ring.className = "detect-ring success";
        statusSide.innerText = "✓";
        statusSide.style.color = "#10b981";
      } else {
        consecutiveCorrect = Math.max(0, consecutiveCorrect - 1);
        statusChip.innerText = "Incorrect sign";
        statusChip.className = "status-chip error";
        ring.className = "detect-ring error";
        statusSide.innerText = "✗";
        statusSide.style.color = "#ef4444";
      }
    }
    
    let accuracy = Math.min(100, Math.round((consecutiveCorrect / REQUIRED_FRAMES) * 100));
    overlay.innerText = `${accuracy}%`;
    
    if (consecutiveCorrect >= REQUIRED_FRAMES) {
       overlay.innerText = "100%";
       overlay.classList.add('correct');
       onCharCorrect();
    } else {
       overlay.classList.remove('correct');
    }
  }

  function onCharCorrect() {
    locked = true;
    charIndex++;
    if (charIndex >= targetChars.length) {
      // Completed full item
      let prog = JSON.parse(localStorage.getItem('asl_progress') || "{}");
      if(!prog[currentModule]) prog[currentModule] = 0;
      prog[currentModule] = Math.max(prog[currentModule], currentIndex + 1);
      localStorage.setItem('asl_progress', JSON.stringify(prog));
      
      showPopup("Correct!", "Moving to next...", () => {
         skip();
      });
    } else {
      // Next char
      setTimeout(() => {
        consecutiveCorrect = 0;
        locked = false;
        updateUI();
      }, 800);
    }
  }

  function prev() {
    if (currentIndex > 0) startItem(currentIndex - 1);
  }

  function skip() {
    if (currentIndex < CURRICULUM[currentModule].length - 1) {
      startItem(currentIndex + 1);
    } else {
       showPopup("Module Complete!", "You have finished this module.", () => showMenu());
    }
  }

  function showPopup(title, sub, callback) {
    const overlay = document.getElementById('result-overlay');
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-sub').textContent = sub;
    document.getElementById('result-letter').textContent = "";
    
    overlay.classList.remove('hidden');
    
    setTimeout(() => {
      overlay.classList.add('hidden');
      if (callback) callback();
    }, 1500);
  }

  window.Teaching = { start, stop, showMenu, selectModule, prev, skip };
  return window.Teaching;
})();

// ---------------------------------------------------------
// PRACTICING MODE
// ---------------------------------------------------------
const Practicing = (() => {
  const MODE = 'practicing';
  let active = false;
  let sequence = [];
  let currentIndex = 0;
  
  let currentTarget = "";
  let targetChars = [];
  let charIndex = 0;
  
  let consecutiveCorrect = 0;
  const REQUIRED_FRAMES = 5;
  let maxTimeMs = 4000;
  let timeRemaining = 4000;
  let lastFrameTime = 0;
  
  let totalPoints = 0;
  let possiblePoints = 0;
  
  let timerInterval = null;
  let locked = false;

  function start() {
    active = true;
    document.getElementById('nav-pts').style.display = 'flex';
    document.getElementById('nav-score-val').innerText = '0';
    
    sequence = [];
    totalPoints = 0;
    possiblePoints = 0;
    
    const chars = [...CURRICULUM.characters];
    shuffle(chars);
    sequence.push(...chars.slice(0, 13));
    
    const words = [...CURRICULUM.words];
    shuffle(words);
    sequence.push(...words.slice(0, 5));
    
    const sentences = [...CURRICULUM.sentences];
    shuffle(sentences);
    sequence.push(...sentences.slice(0, 3));
    
    sequence.forEach(item => {
        possiblePoints += item.replace(/ /g, '').length;
    });
    
    document.getElementById('practicing-total-count').innerText = possiblePoints;
    document.getElementById('practicing-correct-count').innerText = 0;
    
    currentIndex = 0;
    startItem(currentIndex);
    initCamera();
  }

  function stop() {
    active = false;
    stopTimer();
    Camera.stop(MODE);
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  async function initCamera() {
    const ok = await Camera.init(MODE);
    if (!ok) { console.error("Camera init failed"); return; }
    Camera.startDetection(MODE, handleDetection);
  }

  function startItem(index) {
    if (index >= sequence.length) {
      finishSession();
      return;
    }
    
    currentIndex = index;
    currentTarget = sequence[index];
    targetChars = currentTarget.replace(/ /g, '').split('');
    charIndex = 0;
    locked = false;
    
    updateItemUI();
    startChar();
  }
  
  function updateItemUI() {
    document.getElementById('practicing-counter').innerText = `${currentIndex + 1} / 21`;
    document.getElementById('practicing-progress').style.width = `${((currentIndex) / 21) * 100}%`;
    document.getElementById('practicing-letter').innerText = currentTarget;
    
    const tfContainer = document.getElementById('practicing-textframes');
    tfContainer.innerHTML = "";
    targetChars.forEach((c, idx) => {
      const sp = document.createElement('div');
      sp.className = 'textframe';
      sp.id = `prac-tf-${idx}`;
      sp.innerText = c;
      tfContainer.appendChild(sp);
    });
  }

  function startChar() {
    consecutiveCorrect = 0;
    timeRemaining = maxTimeMs;
    lastFrameTime = Date.now();
    locked = false;
    
    targetChars.forEach((c, idx) => {
        const sp = document.getElementById(`prac-tf-${idx}`);
        if(sp) {
             if (idx === charIndex) {
                 sp.style.borderColor = "#3b82f6";
                 sp.style.borderWidth = "2px";
             } else if (!sp.classList.contains('correct') && !sp.classList.contains('error')) {
                 sp.style.borderColor = "var(--border)";
                 sp.style.borderWidth = "1px";
             }
        }
    });

    startTimer();
    const hint = document.getElementById('practicing-timer-hint');
    if (hint) {
      hint.innerText = `Time left: ${(timeRemaining/1000).toFixed(1)}s`;
      hint.style.color = "var(--text-secondary)";
    }
  }

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  function startTimer() {
    stopTimer();
    lastFrameTime = Date.now();
    timerInterval = setInterval(() => {
      if(!active || locked) return;
      const now = Date.now();
      const delta = now - lastFrameTime;
      lastFrameTime = now;
      timeRemaining -= delta;
      
      const hint = document.getElementById('practicing-timer-hint');
      
      if (timeRemaining <= 0) {
        timeRemaining = 0;
        if (hint) hint.innerText = "Time's up!";
        handleCharResult(false);
      } else {
        if (hint) {
          hint.innerText = `Time left: ${(timeRemaining/1000).toFixed(1)}s`;
          if (timeRemaining < 1500) {
              hint.style.color = "#ef4444"; 
          }
        }
      }
    }, 50);
  }

  function handleDetection(result) {
    if (!active || locked) return;
    
    const char = targetChars[charIndex];
    if(!char) return;

    const detVal = document.getElementById('practicing-det-val');
    const statusChip = document.getElementById('practicing-status');
    const ring = document.getElementById('practicing-detect-ring');

    if (!result.hand_detected || result.error) {
      detVal.innerText = "—";
      statusChip.innerText = "No hand detected";
      statusChip.className = "status-chip warning";
      ring.className = "detect-ring warning";
      consecutiveCorrect = Math.max(0, consecutiveCorrect - 1);
    } else {
      detVal.innerText = result.label;
      if (result.label && result.label.toUpperCase() === char.toUpperCase()) {
        consecutiveCorrect++;
        statusChip.innerText = `Detected ${char}! Hold...`;
        statusChip.className = "status-chip success";
        ring.className = "detect-ring success";
      } else {
        consecutiveCorrect = Math.max(0, consecutiveCorrect - 1);
        statusChip.innerText = "Keep trying...";
        statusChip.className = "status-chip error";
        ring.className = "detect-ring error";
      }
    }
    
    if (consecutiveCorrect >= REQUIRED_FRAMES) {
       handleCharResult(true);
    }
  }
  
  function handleCharResult(correct) {
    locked = true;
    
    const tf = document.getElementById(`prac-tf-${charIndex}`);
    if (correct) {
      tf.classList.add('correct');
      totalPoints++;
      document.getElementById('practicing-correct-count').innerText = totalPoints;
      document.getElementById('nav-score-val').innerText = totalPoints;
    } else {
      tf.classList.add('error');
      tf.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
      tf.style.borderColor = "#ef4444";
      tf.style.color = "#ef4444";
    }
    
    charIndex++;
    if (charIndex >= targetChars.length) {
       showPopup(correct ? "Done!" : "Timed Out", "Moving to next item...", () => {
           startItem(currentIndex + 1);
       });
    } else {
       setTimeout(() => {
         if(active) startChar();
       }, 500);
    }
  }

  function showPopup(title, sub, callback) {
    const overlay = document.getElementById('result-overlay');
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-sub').textContent = sub;
    document.getElementById('result-letter').textContent = "";
    
    overlay.classList.remove('hidden');
    
    setTimeout(() => {
      overlay.classList.add('hidden');
      if (callback) callback();
    }, 1500);
  }
  
  function finishSession() {
      stop();
      const overlay = document.getElementById('complete-overlay');
      document.getElementById('complete-title').innerText = "Session Complete!";
      document.getElementById('complete-sub').innerText = `You scored ${totalPoints} out of ${possiblePoints} points!`;
      
      let prog = JSON.parse(localStorage.getItem('asl_progress') || "{}");
      prog.highscore = Math.max(prog.highscore || 0, totalPoints);
      localStorage.setItem('asl_progress', JSON.stringify(prog));
      
      const stats = document.getElementById('complete-stats');
      stats.innerHTML = `
        <div class="complete-stat">
          <div class="stat-num">${totalPoints}</div>
          <div class="stat-lbl">Points</div>
        </div>
        <div class="complete-stat">
          <div class="stat-num">${Math.round((totalPoints / possiblePoints)*100)}%</div>
          <div class="stat-lbl">Accuracy</div>
        </div>
      `;
      
      document.getElementById('complete-retry').onclick = () => {
         overlay.classList.add('hidden');
         start();
      };
      
      overlay.classList.remove('hidden');
  }

  window.Practicing = { start, stop };
  return window.Practicing;
})();

// Boot
window.onload = async () => {
  App.init();

  // Warm up the AI model to avoid the 6-second delay on first detection
  try {
    const dummyImg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
    await fetch('http://localhost:5000/api/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame: dummyImg })
    });
  } catch (e) {
    console.log("Warmup error", e);
  } finally {
    const overlay = document.getElementById('startup-overlay');
    if (overlay) overlay.classList.add('hidden');
  }
};