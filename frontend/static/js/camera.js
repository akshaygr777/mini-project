/**
 * Camera Module — optimized for speed, no-flicker version
 */

const Camera = (() => {
  const API_URL        = 'http://localhost:5000/api/detect';
  const DETECT_INTERVAL = 80;   // Decreased from 320ms for much faster detection

  let streams   = {};
  let timers    = {};
  let callbacks = {};
  let running   = {};

  // Last known overlay state per mode — redrawn every animation frame
  let lastResult = {};   

  // Animation frame IDs
  let rafIds = {};

  // ── Init ──────────────────────────────────────────────────────────────
  async function init(mode) {
    const video    = document.getElementById(`${mode}-video`);
    const overlay  = document.getElementById(`${mode}-canvas`);
    const capture  = document.getElementById(`${mode}-capture`);
    if (!video) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      video.srcObject  = stream;
      streams[mode]    = stream;

      await new Promise(resolve => { video.onloadedmetadata = resolve; });

      const W = video.videoWidth;
      const H = video.videoHeight;

      // Overlay canvas — same size as video, transparent, on top
      overlay.width  = W;
      overlay.height = H;

      // Capture canvas — shrunk to 50% for lightweight API payloads
      capture.width  = Math.floor(W / 2);
      capture.height = Math.floor(H / 2);

      running[mode]    = true;
      lastResult[mode] = null;

      // Start the continuous overlay render loop
      startRenderLoop(mode);

      return true;
    } catch (err) {
      console.error('Camera init error:', err);
      return false;
    }
  }

  // ── Stop ──────────────────────────────────────────────────────────────
  function stop(mode) {
    running[mode] = false;

    if (timers[mode])  { clearInterval(timers[mode]);      timers[mode]  = null; }
    if (rafIds[mode])  { cancelAnimationFrame(rafIds[mode]); rafIds[mode] = null; }
    if (streams[mode]) {
      streams[mode].getTracks().forEach(t => t.stop());
      streams[mode] = null;
    }

    // Clear overlay on stop
    const overlay = document.getElementById(`${mode}-canvas`);
    if (overlay) overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
  }

  // ── Detection loop ────────────────────────────────────────────────────
  function startDetection(mode, onResult) {
    callbacks[mode] = onResult;
    if (timers[mode]) clearInterval(timers[mode]);

    timers[mode] = setInterval(async () => {
      if (!running[mode]) return;
      const data = await captureAndDetect(mode);
      lastResult[mode] = data;
      if (callbacks[mode]) callbacks[mode](data);
    }, DETECT_INTERVAL);
  }

  // ── Render loop — runs at ~60fps independent of API calls ─────────────
  function startRenderLoop(mode) {
    if (rafIds[mode]) cancelAnimationFrame(rafIds[mode]);

    function frame() {
      if (!running[mode]) return;
      const data = lastResult[mode];
      const overlay = document.getElementById(`${mode}-canvas`);
      if (overlay) {
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        if (data && data.hand_detected && data.landmarks && data.landmarks.length) {
          drawLandmarks(overlay, data.landmarks);

        }
      }
      rafIds[mode] = requestAnimationFrame(frame);
    }

    rafIds[mode] = requestAnimationFrame(frame);
  }

  // ── Capture frame and call API ────────────────────────────────────────
  async function captureAndDetect(mode) {
    const video   = document.getElementById(`${mode}-video`);
    const capture = document.getElementById(`${mode}-capture`);

    if (!video || !capture || video.readyState < 2) {
      return { label: null, hand_detected: false, error: 'not ready' };
    }

    // Draw mirrored frame to HIDDEN downscaled capture canvas
    const ctx = capture.getContext('2d');
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -capture.width, 0, capture.width, capture.height);
    ctx.restore();

    // Compress to 0.60 for faster network transmission
    const frameData = capture.toDataURL('image/jpeg', 0.60);

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame: frameData }),
        signal: AbortSignal.timeout(2500)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return { label: null, hand_detected: false, error: err.message };
    }
  }

  // ── Draw skeleton ─────────────────────────────────────────────────────
  const CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],
    [0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],
    [5,9],[9,13],[13,17]
  ];
  const TIPS = new Set([4, 8, 12, 16, 20]);

  function drawLandmarks(canvas, lm) {
    const ctx = canvas.getContext('2d');
    const W   = canvas.width;

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth   = 1.8;
    for (const [a, b] of CONNECTIONS) {
      if (!lm[a] || !lm[b]) continue;
      ctx.beginPath();
      ctx.moveTo(W - lm[a][0], lm[a][1]);
      ctx.lineTo(W - lm[b][0], lm[b][1]);
      ctx.stroke();
    }

    for (let i = 0; i < lm.length; i++) {
      const x = W - lm[i][0];
      const y = lm[i][1];
      const r = TIPS.has(i) ? 5 : 3;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = TIPS.has(i) ? '#ffffff' : 'rgba(255,255,255,0.65)';
      ctx.fill();

      if (TIPS.has(i)) {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth   = 1;
        ctx.stroke();
      }
    }
  }

  // ── Confidence overlay ────────────────────────────────────────────────
  function drawConfidence(canvas, label, conf, scores) {
    if (!label) return;
    const ctx  = canvas.getContext('2d');
    const pct  = Math.round((conf || 0) * 100);
    const col  = pct >= 70 ? '#4ade80' : pct >= 45 ? '#fbbf24' : '#f87171';

    ctx.fillStyle = 'rgba(0,0,0,0.60)';
    _rr(ctx, 10, 10, 96, 58, 8);
    ctx.fill();

    ctx.font         = 'bold 34px Georgia, serif';
    ctx.fillStyle    = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.fillText(label, 18, 14);

    ctx.font      = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = col;
    ctx.fillText(`${pct}%`, 54, 18);

    if (!scores || !Object.keys(scores).length) return;
    const top5 = Object.entries(scores).sort((a,b) => b[1]-a[1]).slice(0, 5);

    const bx = 10, by = 76, bh = 17, gap = 3, bw = 130;
    top5.forEach(([letter, score], i) => {
      const y   = by + i * (bh + gap);
      const fw  = Math.max(2, bw * score);
      const top = i === 0;
      const pc  = Math.round(score * 100);

      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      _rr(ctx, bx, y, bw + 28, bh, 4);
      ctx.fill();

      ctx.fillStyle = top ? (pct >= 70 ? 'rgba(74,222,128,0.7)' : pct >= 45 ? 'rgba(251,191,36,0.7)' : 'rgba(248,113,113,0.7)') : 'rgba(255,255,255,0.2)';
      if (fw > 4) { _rr(ctx, bx, y, fw, bh, 4); ctx.fill(); }

      ctx.font         = top ? 'bold 11px system-ui' : '11px system-ui';
      ctx.fillStyle    = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, bx + 5, y + bh / 2);

      ctx.font      = '10px system-ui';
      ctx.fillStyle = top ? '#fff' : 'rgba(255,255,255,0.6)';
      ctx.fillText(`${pc}%`, bx + bw - 2, y + bh / 2);
    });
  }

  // ── Rounded rect util ─────────────────────────────────────────────────
  function _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r);
    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  }

  // ── Health check ──────────────────────────────────────────────────────
  async function checkBackend() {
    try {
      const r = await fetch('http://localhost:5000/api/health', { signal: AbortSignal.timeout(2000) });
      return r.ok;
    } catch { return false; }
  }

  return { init, stop, startDetection, checkBackend };
})();

window.Camera = Camera;