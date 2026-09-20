/* Smily Dental demo bot.
   Runs entirely in the browser: no server, no API key, nothing leaves the page.
   Intent matching over a small knowledge base, with human-sounding delivery. */
(() => {
'use strict';

const box = document.getElementById('botlog');
const form = document.getElementById('botform');
const input = document.getElementById('botinput');
const chips = document.getElementById('botchips');
if (!box || !form || !input) return;

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------- the clinic's data */
const KB = {
  name: 'Smily Dental',
  hours: 'Mon to Sat, 10:00 AM – 8:00 PM. Closed Sundays.',
  emergency: 'For emergencies outside hours, call 0300 000 0000 and one of our dentists calls you back.',
  address: 'Smily Dental, 2nd floor, Kohistan Plaza, Blue Area, Islamabad. Parking is behind the building.',
  dentists: [
    { name: 'Dr. Sana Tariq', role: 'general dentistry and pain relief' },
    { name: 'Dr. Bilal Ahmed', role: 'braces and alignment' }
  ],
  prices: [
    ['Consultation', 'Rs 2,000 (waived if you get treatment the same day)'],
    ['Scaling / cleaning', 'Rs 6,000'],
    ['Filling', 'Rs 4,500 – 8,000 depending on the tooth'],
    ['Root canal', 'Rs 18,000 – 25,000'],
    ['Extraction', 'Rs 5,000'],
    ['Whitening', 'Rs 25,000'],
    ['Braces', 'from Rs 120,000, decided after a consultation']
  ],
  payment: 'Cash, card, Easypaisa and JazzCash. We can split braces into monthly instalments.',
  kids: 'Yes, we see children from about 3 years old. Dr. Sana handles most of our younger patients.',
  walkin: 'Walk-ins are welcome, but with an appointment you will not be sitting around waiting.'
};

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/* ---------------------------------------------------------------- intents */
const INTENTS = [
  { id: 'greet', words: [['hi', 'hello', 'hey', 'salam', 'asalam', 'assalam', 'aoa', 'morning', 'evening']],
    replies: [
      'Hello! You have reached ' + KB.name + '. How can I help?',
      'Hi there — ' + KB.name + ' here. What can I do for you?'
    ] },

  { id: 'hours', boost: 1, words: [['time', 'timing', 'timings', 'hour', 'hours', 'open', 'opening', 'close', 'closing', 'closed', 'khula', 'available']],
    replies: [
      'We are open ' + KB.hours + '\n\n' + KB.emergency,
      'Our timings are ' + KB.hours + ' If it is urgent outside those hours, call 0300 000 0000.'
    ] },

  { id: 'sunday', boost: 1.6, words: [['sunday', 'sundays', 'weekend']],
    replies: [
      'We are closed on Sundays. Saturday we are open till 8 PM, so that is usually the easiest weekend slot.',
      'Sundays we are shut, sorry. Saturdays we run normal hours, 10 AM to 8 PM.'
    ] },

  { id: 'location', words: [['where', 'location', 'address', 'located', 'reach', 'parking', 'branch', 'map', 'directions']],
    replies: [
      KB.address,
      'We are at ' + KB.address + ' Easiest landmark is the Blue Area metro stop.'
    ] },

  { id: 'price', words: [['price', 'prices', 'cost', 'costs', 'charge', 'charges', 'fee', 'fees', 'rate', 'rates', 'kitna', 'much', 'expensive', 'budget']],
    replies: [() => 'Here is what we charge:\n\n' + KB.prices.map(p => '• ' + p[0] + ' — ' + p[1]).join('\n') + '\n\nWant me to book you in for any of these?'] },

  { id: 'cleaning', boost: 1.5, words: [['cleaning', 'clean', 'scaling', 'polish', 'polishing', 'plaque', 'tartar']],
    replies: [
      'A scaling and cleaning is Rs 6,000 and takes about 40 minutes. Most people come every six months. Shall I find you a slot?',
      'Cleaning is Rs 6,000, around 40 minutes in the chair. Want me to book it?'
    ] },

  { id: 'rootcanal', boost: 1.5, words: [['root', 'canal', 'rct']],
    replies: ['A root canal runs Rs 18,000 to 25,000 depending on which tooth it is, usually across two visits. Dr. Sana would confirm after an X-ray at the consultation.'] },

  { id: 'braces', boost: 1.5, words: [['brace', 'braces', 'align', 'aligner', 'aligners', 'crooked', 'straighten', 'invisalign', 'orthodontist']],
    replies: ['Braces start from Rs 120,000, and the exact figure is set after a consultation. Dr. Bilal Ahmed handles all our alignment cases and can talk you through the options. We can spread payments monthly.'] },

  { id: 'whitening', boost: 1.5, words: [['whiten', 'whitening', 'bleach', 'white', 'stains', 'yellow']],
    replies: ['Whitening is Rs 25,000 for a single session, and it takes about an hour. Results last longest if you get a cleaning done first.'] },

  { id: 'pain', words: [['pain', 'ache', 'aching', 'hurt', 'hurts', 'hurting', 'toothache', 'swollen', 'swelling', 'bleeding', 'emergency', 'urgent', 'dard', 'sore', 'abscess']],
    replies: [
      'Sorry, that sounds rough. We keep emergency slots open every morning — what day works for you and I will put you in one?',
      'That needs looking at quickly. We hold same-day emergency slots. Which day can you come in?'
    ], sets: 'booking' },

  { id: 'book', words: [['book', 'booking', 'appointment', 'appointments', 'slot', 'schedule', 'reserve', 'visit', 'come', 'availability', 'available']],
    replies: [
      'Happy to book you in. Which day suits you?',
      'Of course — what day were you thinking?'
    ], sets: 'booking' },

  { id: 'dentist', words: [['doctor', 'dr', 'dentist', 'who', 'sana', 'bilal', 'specialist', 'staff']],
    replies: [() => 'Two dentists here:\n\n' + KB.dentists.map(d => '• ' + d.name + ' — ' + d.role).join('\n') + '\n\nHappy to book you with either.'] },

  { id: 'payment', words: [['pay', 'payment', 'card', 'cash', 'easypaisa', 'jazzcash', 'installment', 'instalment', 'insurance', 'instalments']],
    replies: [KB.payment] },

  { id: 'kids', words: [['kid', 'kids', 'child', 'children', 'baby', 'son', 'daughter', 'bacha']],
    replies: [KB.kids] },

  { id: 'walkin', boost: 0.7, words: [['walk', 'walkin', 'without', 'directly', 'now', 'today']],
    replies: [KB.walkin + ' Want me to check today?'] },

  { id: 'thanks', words: [['thanks', 'thank', 'shukriya', 'great', 'perfect', 'awesome', 'ok', 'okay', 'cool']],
    replies: ['Any time. Anything else I can help with?', 'You are welcome. Anything else?'] },

  { id: 'bye', words: [['bye', 'goodbye', 'later', 'night', 'khuda']],
    replies: ['Take care, see you soon.', 'Bye! Message any time, I am here all night.'] }
];

/* ---------------------------------------------------------------- matching */
const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'do', 'does', 'you', 'your', 'i', 'my', 'me', 'we', 'to', 'of', 'for', 'and', 'can', 'could', 'would', 'please', 'plz', 'what', 'whats', 'how', 'in', 'on', 'at', 'it', 'have', 'has', 'any', 'be']);

function norm(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\s:]/g, ' ').replace(/\s+/g, ' ').trim();
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const m = a.length, n = b.length;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function hits(tokens, list) {
  for (const w of list) {
    for (const t of tokens) {
      if (t === w) return 2;
      if (w.length >= 5 && t.length >= 5 && lev(t, w) <= 1) return 1.4; // tolerate the user's typos
    }
  }
  return 0;
}
function match(text) {
  const tokens = norm(text).split(' ').filter(t => t && !STOP.has(t));
  if (!tokens.length) return null;
  let best = null, bestScore = 0;
  for (const it of INTENTS) {
    let score = 0;
    for (const group of it.words) score += hits(tokens, group);
    score *= (it.boost || 1);
    if (it.id === 'greet' && tokens.length > 3) score *= 0.4; // "hi, how much is a cleaning" is not a greeting
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return bestScore >= 1.4 ? best : null;
}

/* ---------------------------------------------------------------- slot parsing */
function findDay(text) {
  const t = norm(text);
  if (/\btomorrow\b/.test(t)) return 'tomorrow';
  if (/\btoday\b|\btonight\b/.test(t)) return 'today';
  for (const d of DAYS) if (t.includes(d.slice(0, 3))) return d[0].toUpperCase() + d.slice(1);
  return null;
}
function findTime(text) {
  const t = norm(text);
  let m = t.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/);
  if (m) {
    let hh = +m[1];
    const ap = m[3] || (hh >= 10 && hh <= 12 ? 'am' : 'pm');
    return hh + ':' + m[2] + ' ' + ap.toUpperCase();
  }
  m = t.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (m) return +m[1] + ':00 ' + m[2].toUpperCase();
  m = t.match(/\b(\d{1,2})\s*o?\s*clock\b/);
  if (m) return +m[1] + ':00 ' + (+m[1] >= 10 && +m[1] <= 12 ? 'AM' : 'PM');
  return null;
}

/* ---------------------------------------------------------------- human delivery */
function typo(text) {
  // one small slip, roughly one message in ten, and never in a message carrying
  // prices, a booking confirmation or any structured list — a typo there reads as bad data
  if (/[•✅]|Rs\s|\d{1,2}:\d{2}/.test(text)) return { text, fix: null };
  if (Math.random() > 0.1) return { text, fix: null };
  const parts = text.split(/(\s+)/);
  const idx = [];
  parts.forEach((p, i) => {
    if (/^[a-z]{5,}$/i.test(p) && !/\d/.test(p)) idx.push(i);
  });
  if (!idx.length) return { text, fix: null };
  const i = idx[Math.floor(Math.random() * idx.length)];
  const w = parts[i];
  const k = 1 + Math.floor(Math.random() * (w.length - 2));
  const kind = Math.random();
  let out;
  if (kind < 0.4) out = w.slice(0, k) + w[k + 1] + w[k] + w.slice(k + 2);        // swapped letters
  else if (kind < 0.75) out = w.slice(0, k) + w.slice(k + 1);                    // dropped letter
  else out = w.slice(0, k) + w[k] + w.slice(k);                                  // doubled letter
  parts[i] = out;
  return { text: parts.join(''), fix: Math.random() < 0.5 ? '*' + w : null };
}
function stamp() {
  const d = new Date();
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
}
function add(who, text) {
  const b = document.createElement('div');
  b.className = 'bub ' + (who === 'me' ? 'me' : 'them');
  b.textContent = text;
  const t = document.createElement('span');
  t.className = 'ts';
  t.textContent = stamp();
  if (who === 'me') {
    const tick = document.createElement('span');
    tick.className = 'tick';
    tick.textContent = ' ✓✓';
    t.appendChild(tick);
  }
  b.appendChild(t);
  box.appendChild(b);
  box.scrollTop = box.scrollHeight;
  return b;
}
function think(ms) {
  return new Promise(res => {
    if (reduced) return res();
    const d = document.createElement('div');
    d.className = 'typing';
    d.innerHTML = '<i></i><i></i><i></i>';
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
    setTimeout(() => { d.remove(); res(); }, ms);
  });
}

/* ---------------------------------------------------------------- conversation */
let awaiting = null;   // 'booking' when we have asked for a day
let pendingDay = null;

function pick(intent) {
  const r = intent.replies[Math.floor(Math.random() * intent.replies.length)];
  return typeof r === 'function' ? r() : r;
}

function answer(text) {
  const day = findDay(text);
  const time = findTime(text);

  if (awaiting === 'booking') {
    if (day && time) {
      awaiting = null; pendingDay = null;
      return '✅ Done — ' + day + ' at ' + time + ' with Dr. Sana Tariq.\n\n' + KB.address +
        '\n\nReply RESCHEDULE or CANCEL any time. I will send a reminder the morning of.';
    }
    if (day) {
      pendingDay = day;
      return 'Got it, ' + day + '. We have 10:30 AM, 1:00 PM and 4:45 PM free. Which one?';
    }
    if (time && pendingDay) {
      const d = pendingDay;
      awaiting = null; pendingDay = null;
      return '✅ Done — ' + d + ' at ' + time + ' with Dr. Sana Tariq.\n\n' + KB.address +
        '\n\nReply RESCHEDULE or CANCEL any time. I will send a reminder the morning of.';
    }
  }

  const intent = match(text);
  if (intent) {
    if (intent.sets === 'booking') awaiting = 'booking';
    return pick(intent);
  }
  if (day || time) {
    awaiting = 'booking';
    if (day) { pendingDay = day; return 'Got it, ' + day + '. We have 10:30 AM, 1:00 PM and 4:45 PM free. Which one?'; }
    return 'Which day would you like to come in?';
  }
  return 'I am not sure I followed that one. I can help with timings, prices, where we are, our dentists, or booking you an appointment — which of those is it?\n\nOtherwise Dr. Sana picks up messages herself from 10 AM.';
}

async function send(text) {
  add('me', text);
  const reply = answer(text);
  await think(700 + Math.min(1300, reply.length * 9));
  const out = typo(reply);
  add('them', out.text);
  if (out.fix) {
    await think(600);
    add('them', out.fix);
  }
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const v = input.value.trim();
  if (!v) return;
  input.value = '';
  send(v);
});
if (chips) {
  chips.addEventListener('click', e => {
    const b = e.target.closest('button[data-q]');
    if (!b) return;
    send(b.dataset.q);
  });
}

// opening message, so the panel is never an empty box
add('them', 'Hello! You have reached ' + KB.name + '. Ask me anything — timings, prices, where we are, or book an appointment.');
})();
