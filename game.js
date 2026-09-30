const N = 6, S = 100, PAD = 50, SIZE = 600, MAX_FUEL = 25;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);

// crisp rendering on high-DPI screens
const dpr = window.devicePixelRatio || 1;
cv.width = cv.height = SIZE * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

let truck = null, cars = [], bins = [], station = null, fx = [];
let fuel = MAX_FUEL, score = 0, over = true, shake = 0;

// storage can be blocked (private mode, sandboxed frames), so never let it break the game
let best = 0;
try { best = +localStorage.getItem('cleancity-best') || 0; } catch (e) {}
$('best').textContent = best;

const px = v => PAD + v * S;
const same = (a, b) => a.x === b.x && a.y === b.y;
const rnd = n => Math.floor(Math.random() * n);
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function freeSpot(minFromTruck = 0) {
  for (let i = 0; i < 200; i++) {
    const p = { x: rnd(N), y: rnd(N) };
    if (same(p, truck) || dist(p, truck) < minFromTruck) continue;
    if (bins.some(b => same(b, p)) || cars.some(c => same(c, p))) continue;
    if (station && same(station, p)) continue;
    return p;
  }
  return { x: N - 1, y: N - 1 };
}

function pickNext(c) {
  const opts = DIRS.map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy }))
    .filter(p => p.x >= 0 && p.y >= 0 && p.x < N && p.y < N);
  const ahead = opts.find(p => p.x === c.x + c.dx && p.y === c.y + c.dy);
  const noBack = opts.filter(p => !(p.x === c.x - c.dx && p.y === c.y - c.dy));
  const pool = noBack.length ? noBack : opts;
  const t = ahead && Math.random() < 0.6 ? ahead : pool[rnd(pool.length)];
  c.dx = t.x - c.x; c.dy = t.y - c.y; c.tx = t.x; c.ty = t.y;
}

function addCar() {
  const p = freeSpot(3);
  const c = { x: p.x, y: p.y, rx: p.x, ry: p.y, dx: 1, dy: 0 };
  pickNext(c);
  cars.push(c);
}

function carTarget() { return Math.min(3 + Math.floor(score / 5), 7); }

function start() {
  truck = { x: 0, y: 0, rx: 0, ry: 0, angle: 0 };
  cars = []; bins = []; fx = []; station = null;
  fuel = MAX_FUEL; score = 0; over = false; shake = 0;
  for (let i = 0; i < 3; i++) bins.push(freeSpot());
  station = freeSpot();
  while (cars.length < carTarget()) addCar();
  $('overlay').classList.add('hidden');
  $('start').blur();
  updateHud();
}

function end(reason, text) {
  over = true;
  if (score > best) {
    best = score;
    try { localStorage.setItem('cleancity-best', best); } catch (e) {}
  }
  $('best').textContent = best;
  $('title').textContent = reason;
  $('msg').textContent = `${text} You made ${score} collection${score === 1 ? '' : 's'}.`;
  $('start').textContent = 'Play again';
  $('overlay').classList.remove('hidden');
}

function pop(p, text, color) { fx.push({ x: px(p.x), y: px(p.y) - 20, t: 0, text, color }); }

// dx = dy = 0 means "wait a turn"
function move(dx, dy) {
  if (over) return;
  const nx = truck.x + dx, ny = truck.y + dy;
  if (nx < 0 || ny < 0 || nx >= N || ny >= N) return;
  const from = { x: truck.x, y: truck.y }, to = { x: nx, y: ny };
  if (dx || dy) truck.angle = Math.atan2(dy, dx);
  fuel--;

  // a crash happens if a car arrives where the truck ends up, or they swap places
  let crash = false;
  for (const c of cars) {
    const target = { x: c.tx, y: c.ty };
    if (same(target, to)) crash = true;
    if (same(c, to) && same(target, from) && (dx || dy)) crash = true;
  }

  truck.x = nx; truck.y = ny;
  cars.forEach(c => { c.x = c.tx; c.y = c.ty; pickNext(c); });

  if (crash) {
    shake = 14; updateHud();
    return end('Crash!', 'You hit a car.');
  }

  const i = bins.findIndex(b => same(b, truck));
  if (i >= 0) {
    bins.splice(i, 1); score++;
    pop(truck, '+1', '#2ea86b');
    bins.push(freeSpot());
    if (cars.length < carTarget()) addCar();
  }
  if (station && same(station, truck)) {
    fuel = Math.min(MAX_FUEL, fuel + 12);
    pop(truck, '+fuel', '#3b82f6');
    station = freeSpot();
  }

  updateHud();
  if (fuel <= 0) end('Out of fuel', 'The tank is empty.');
}

function updateHud() {
  $('score').textContent = score;
  $('fuelNum').textContent = fuel;
  const bar = $('fuelBar');
  bar.style.width = (Math.max(fuel, 0) / MAX_FUEL * 100) + '%';
  bar.classList.toggle('low', fuel <= 6);
}

/* ---------- input ---------- */
const KEYS = {
  arrowright: [1, 0], d: [1, 0], arrowleft: [-1, 0], a: [-1, 0],
  arrowdown: [0, 1], s: [0, 1], arrowup: [0, -1], w: [0, -1], ' ': [0, 0]
};
addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (over) {
    if (key === 'enter' || key === ' ') { e.preventDefault(); start(); }
    return;
  }
  const k = KEYS[key];
  if (k) { e.preventDefault(); move(k[0], k[1]); }
});

cv.addEventListener('click', e => {
  if (over) return;
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * SIZE;
  const y = (e.clientY - r.top) / r.height * SIZE;
  const dx = x - px(truck.x), dy = y - px(truck.y);
  if (Math.hypot(dx, dy) < 22) return move(0, 0);           // tap the truck to wait
  if (Math.abs(dx) > Math.abs(dy)) move(Math.sign(dx), 0); else move(0, Math.sign(dy));
});
$('start').addEventListener('click', start);

/* ---------- drawing ---------- */
function rr(x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function dot(x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }

function draw() {
  ctx.save();
  ctx.fillStyle = '#eef1ee'; ctx.fillRect(0, 0, SIZE, SIZE);
  if (shake > 0) { ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); shake *= 0.85; if (shake < .5) shake = 0; }

  for (let i = -1; i < N; i++) for (let j = -1; j < N; j++) rr(px(i) + 14, px(j) + 14, S - 28, S - 28, 8, '#e0e6e1');

  ctx.strokeStyle = '#fff'; ctx.lineWidth = 22; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    ctx.moveTo(px(i), px(0)); ctx.lineTo(px(i), px(N - 1));
    ctx.moveTo(px(0), px(i)); ctx.lineTo(px(N - 1), px(i));
  }
  ctx.stroke();

  if (truck) {
    if (station) {
      rr(px(station.x) - 13, px(station.y) - 13, 26, 26, 6, '#3b82f6');
      ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('F', px(station.x), px(station.y) + 1);
    }

    const pulse = 1 + Math.sin(Date.now() / 250) * 0.1;
    bins.forEach(b => { dot(px(b.x), px(b.y), 15 * pulse, 'rgba(46,168,107,.25)'); dot(px(b.x), px(b.y), 8, '#2ea86b'); });

    cars.forEach(c => {
      c.rx += (c.x - c.rx) * 0.25; c.ry += (c.y - c.ry) * 0.25;
      ctx.strokeStyle = 'rgba(228,87,46,.45)'; ctx.lineWidth = 3; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(px(c.x), px(c.y)); ctx.lineTo(px(c.tx), px(c.ty)); ctx.stroke();
      ctx.setLineDash([]);
      dot(px(c.tx), px(c.ty), 5, 'rgba(228,87,46,.45)');
      ctx.save(); ctx.translate(px(c.rx), px(c.ry)); ctx.rotate(Math.atan2(c.dy, c.dx));
      rr(-13, -8, 26, 16, 5, '#e4572e');
      ctx.restore();
    });

    truck.rx += (truck.x - truck.rx) * 0.3; truck.ry += (truck.y - truck.ry) * 0.3;
    ctx.save(); ctx.translate(px(truck.rx), px(truck.ry)); ctx.rotate(truck.angle);
    rr(-17, -10, 26, 20, 5, '#1d2a24');
    rr(11, -8, 8, 16, 4, '#4b6b5a');
    ctx.restore();

    fx = fx.filter(f => f.t < 40);
    fx.forEach(f => {
      f.t++;
      ctx.globalAlpha = 1 - f.t / 40; ctx.fillStyle = f.color;
      ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y - f.t * 0.8);
      ctx.globalAlpha = 1;
    });
  }
  ctx.restore();
}

(function loop() { draw(); requestAnimationFrame(loop); })();
