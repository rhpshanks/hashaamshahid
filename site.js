(() => {
'use strict';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
document.documentElement.classList.add('js');

/* ------------------------------------------------------------------ 3D hero terrain
   A wireframe plane in perspective. Points ripple on a sine wave, the camera
   drifts, and the pointer nudges the view. Hand-rolled projection, no library. */
function terrain() {
  const cv = document.getElementById('grid3d');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;

  const COLS = 34, ROWS = 22, SPACING = 46;
  let w = 0, h = 0, dpr = 1;
  let t = 0, raf = null, visible = true;
  const target = { x: 0, y: 0 };
  const cam = { x: 0, y: 0 };

  function resize() {
    const r = cv.getBoundingClientRect();
    w = r.width; h = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // perspective projection: world (x, y, z) -> screen
  function project(x, y, z) {
    const f = 620;
    const zz = z + 520;
    if (zz <= 1) return null;
    const s = f / zz;
    return { x: w / 2 + x * s, y: h * 0.52 + (y - 90) * s, s };
  }

  function frame() {
    raf = null;
    if (!visible) return;
    t += 0.011;
    cam.x += (target.x - cam.x) * 0.045;
    cam.y += (target.y - cam.y) * 0.045;
    ctx.clearRect(0, 0, w, h);

    // build the grid
    const pts = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const x = (c - (COLS - 1) / 2) * SPACING + cam.x * 26;
        const z = r * SPACING * 1.35;
        const wave = Math.sin(x * 0.0052 + t) * 26 + Math.cos(z * 0.006 - t * 0.85) * 20;
        const y = wave + cam.y * 16;
        row.push(project(x, y, z));
      }
      pts.push(row);
    }

    // depth-faded wireframe
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = pts[r][c];
        if (!p) continue;
        const fade = Math.max(0, 1 - r / (ROWS - 1));
        const a = Math.pow(fade, 1.55) * 0.88;
        if (a < 0.012) continue;
        if (c < COLS - 1 && pts[r][c + 1]) {
          ctx.strokeStyle = 'rgba(106,169,255,' + a.toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(pts[r][c + 1].x, pts[r][c + 1].y); ctx.stroke();
        }
        if (r < ROWS - 1 && pts[r + 1][c]) {
          ctx.strokeStyle = 'rgba(106,169,255,' + (a * 0.72).toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(pts[r + 1][c].x, pts[r + 1][c].y); ctx.stroke();
        }
      }
    }

    // a few travelling nodes that pulse along the mesh
    for (let i = 0; i < 7; i++) {
      const ph = (t * 0.28 + i * 0.37) % 1;
      const r = Math.floor(ph * (ROWS - 2)) + 1;
      const c = 4 + ((i * 5 + Math.floor(t * 0.5 + i)) % (COLS - 8));
      const p = pts[r] && pts[r][c];
      if (!p) continue;
      const fade = Math.pow(Math.max(0, 1 - r / (ROWS - 1)), 1.7);
      const glow = (0.34 + 0.66 * Math.abs(Math.sin(t * 1.6 + i))) * fade;
      if (glow < 0.03) continue;
      ctx.fillStyle = 'rgba(255,107,44,' + glow.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.4 * p.s * 1.6 + 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,107,44,' + (glow * 0.13).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, 13 * p.s * 1.6, 0, Math.PI * 2); ctx.fill();
    }

    raf = requestAnimationFrame(frame);
  }

  function start() { if (!raf && visible) raf = requestAnimationFrame(frame); }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

  resize();
  window.addEventListener('resize', () => { resize(); if (reduced) drawOnce(); });

  function drawOnce() { visible = true; t = 1.2; frame(); stop(); }

  if (reduced) { drawOnce(); return; }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible) start(); else stop();
    }, { threshold: 0.01 }).observe(cv);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });
  if (!coarse) {
    window.addEventListener('pointermove', e => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }
  start();
}

/* ------------------------------------------------------------------ card tilt */
function tilt() {
  if (reduced || coarse) return;
  document.querySelectorAll('[data-tilt]').forEach(el => {
    const max = el.classList.contains('cs') ? 2.6 : 5.5;
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      el.style.transition = 'transform .08s linear';
      el.style.transform =
        'perspective(1200px) rotateX(' + ((0.5 - py) * max).toFixed(2) + 'deg) rotateY(' +
        ((px - 0.5) * max).toFixed(2) + 'deg) translateY(-3px)';
    });
    el.addEventListener('pointerleave', () => {
      el.style.transition = 'transform .5s cubic-bezier(.2,.7,.3,1)';
      el.style.transform = '';
    });
  });
}

/* ------------------------------------------------------------------ reveal on scroll */
function reveal() {
  const items = Array.prototype.slice.call(document.querySelectorAll('[data-anim]'));
  if (!items.length) return;
  if (reduced || !('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const sibs = el.parentElement ? Array.prototype.slice.call(el.parentElement.children).filter(c => c.hasAttribute('data-anim')) : [el];
      const i = Math.max(0, sibs.indexOf(el));
      el.style.transitionDelay = Math.min(i * 90, 360) + 'ms';
      el.classList.add('in');
      obs.unobserve(el);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  items.forEach(el => io.observe(el));
  // safety net: anything still hidden after 3s gets shown
  setTimeout(() => items.forEach(el => el.classList.add('in')), 3000);
}

/* ------------------------------------------------------------------ nav + progress */
function chrome() {
  const nav = document.getElementById('nav');
  const bar = document.getElementById('progress');
  let ticking = false;
  function update() {
    ticking = false;
    const y = window.scrollY || window.pageYOffset;
    if (nav) nav.classList.toggle('stuck', y > 24);
    if (bar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
    }
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
}

/* ------------------------------------------------------------------ hero chat demo
   Alisa messages a dental clinic at 2am; the bot answers within the same minute. */
function chatDemo() {
  const box = document.getElementById('chat');
  if (!box) return;

  const SCRIPT = [
    { who: 'me',  wait: 600,  ts: '2:14 AM',
      text: 'Hi, do you have any appointment tomorrow? I have really bad toothache \u{1F623}' },
    { who: 'bot', wait: 1400, ts: '2:14 AM',
      text: 'Hi Alisa — sorry you’re in pain, that’s miserable at this hour.\n\nWe have three slots tomorrow: 10:30 AM, 1:00 PM or 4:45 PM. Which suits you?' },
    { who: 'me',  wait: 1600, ts: '2:15 AM', text: '10:30 please' },
    { who: 'bot', wait: 1100, ts: '2:15 AM',
      text: 'Is that for emergency pain relief, or a routine check-up?' },
    { who: 'me',  wait: 1400, ts: '2:15 AM', text: 'Pain relief' },
    { who: 'bot', wait: 1600, ts: '2:15 AM',
      text: '✅ Booked — Tue 22 Sep, 10:30 AM\nDr. Sana · Emergency pain relief (30 min)\nABC Dental, Blue Area\n\nReply RESCHEDULE or CANCEL any time. I’ll send you a reminder at 9:00 AM.' }
  ];

  let timers = [];
  let running = false;

  function clear() {
    timers.forEach(clearTimeout);
    timers = [];
    Array.prototype.slice.call(box.querySelectorAll('.bub, .typing')).forEach(n => n.remove());
  }
  function hold(ms) {
    return new Promise(res => { timers.push(setTimeout(res, ms)); });
  }
  function bubble(m) {
    const b = document.createElement('div');
    b.className = 'bub ' + (m.who === 'me' ? 'me' : 'them');
    b.textContent = m.text;
    const t = document.createElement('span');
    t.className = 'ts';
    t.textContent = m.ts;
    if (m.who === 'me') {
      const tick = document.createElement('span');
      tick.className = 'tick';
      tick.textContent = ' ✓✓';
      t.appendChild(tick);
    }
    b.appendChild(t);
    box.appendChild(b);
    box.scrollTop = box.scrollHeight;
  }

  async function run() {
    if (running) return;
    running = true;
    clear();
    for (const m of SCRIPT) {
      await hold(m.wait);
      if (!running) return;
      if (m.who === 'bot') {
        const dots = document.createElement('div');
        dots.className = 'typing';
        dots.innerHTML = '<i></i><i></i><i></i>';
        box.appendChild(dots);
        box.scrollTop = box.scrollHeight;
        await hold(900);
        dots.remove();
        if (!running) return;
      }
      bubble(m);
    }
    await hold(5400);
    if (!running) return;
    running = false;
    run();
  }

  if (reduced) { SCRIPT.forEach(bubble); return; }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) { run(); }
      else { running = false; clear(); }
    }, { threshold: 0.25 }).observe(box);
  } else {
    run();
  }
}

terrain();
chatDemo();
tilt();
reveal();
chrome();
})();
