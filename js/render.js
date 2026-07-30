// ---- rendering: water, boats, sails, marks, effects ----
const Render = {
  canvas: null, ctx: null, W: 0, H: 0,
  cam: { x: 0, y: 0, zoom: 8 },
  t: 0,
  particles: [],   // {x,y,vx,vy,life,maxLife,size,color}
  floaters: [],    // floating score texts {x,y,text,life,color}
  confetti: [],    // screen-space celebration bits
  showCone: true,

  init() {
    this.canvas = document.getElementById('sea');
    this.ctx = this.canvas.getContext('2d');
    const resize = () => { this.W = this.canvas.width = innerWidth; this.H = this.canvas.height = innerHeight; };
    addEventListener('resize', resize); resize();
  },

  toScreen(wx, wy) {
    return { x: (wx - this.cam.x) * this.cam.zoom + this.W / 2, y: (wy - this.cam.y) * this.cam.zoom + this.H / 2 };
  },

  follow(boat, dt) {
    const lead = dirVec(boat.heading);
    const tx = boat.x + lead.x * boat.spd * 1.2;
    const ty = boat.y + lead.y * boat.spd * 1.2;
    const k = clamp(dt * 2.2, 0, 1);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    const zTarget = boat.p.zoom;
    this.cam.zoom += (zTarget - this.cam.zoom) * clamp(dt * 1.5, 0, 1);
  },

  spawnParticles(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), s = rand(opts.spd || 3);
      this.particles.push({
        x, y, vx: Math.cos(a) * s + (opts.vx || 0), vy: Math.sin(a) * s + (opts.vy || 0),
        life: 0, maxLife: rand(0.3, opts.life || 0.8),
        size: rand(0.15, opts.size || 0.5), color: opts.color || 'rgba(255,255,255,',
      });
    }
  },
  floatText(x, y, text, color = '#ffe14d') {
    this.floaters.push({ x, y, text, life: 0, color });
  },

  spawnConfetti(n = 100) {
    const cols = ['#ff4b6e', '#ffb84d', '#ffe14d', '#4dd463', '#3db5ff', '#9b6bff', '#ff8ad4', '#fff'];
    for (let i = 0; i < n; i++) {
      this.confetti.push({
        x: rand(this.W), y: -20 - rand(this.H * 0.4),
        vx: rand(-60, 60), vy: rand(90, 260),
        rot: rand(TAU), vr: rand(-8, 8),
        w: rand(5, 11), h: rand(8, 16),
        color: randPick(cols), life: 0, maxLife: rand(2.2, 3.6),
        sway: rand(1.5, 4), phase: rand(TAU),
      });
    }
  },
  drawConfetti(dt) {
    if (!this.confetti.length) return;
    const ctx = this.ctx;
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.life += dt;
      c.x += (c.vx + Math.sin(c.life * c.sway + c.phase) * 60) * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      if (c.life > c.maxLife || c.y > this.H + 30) { this.confetti.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.globalAlpha = clamp((c.maxLife - c.life) / 0.6, 0, 1);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h * Math.abs(Math.sin(c.life * 5 + c.phase)) + 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },

  // ================= WATER =================
  drawWater(wind) {
    const { ctx, W, H, cam } = this;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1470b8'); g.addColorStop(0.5, '#0e5ea6'); g.addColorStop(1, '#0a4a8c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // gust patches (darker cat's paws) drifting with wind
    const wv = wind.vec();
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const seedX = Math.sin(i * 37.3) * 5000, seedY = Math.cos(i * 91.7) * 5000;
      const gx = seedX + wv.x * KN2MS * this.t * 0.6;
      const gy = seedY + wv.y * KN2MS * this.t * 0.6;
      // wrap into view region
      const span = 900;
      const px = ((gx - cam.x) % span + span * 1.5) % span - span / 2;
      const py = ((gy - cam.y) % span + span * 1.5) % span - span / 2;
      const s = this.toScreen(cam.x + px, cam.y + py);
      const r = (90 + 40 * Math.sin(i * 3 + this.t * 0.2)) * cam.zoom;
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      grad.addColorStop(0, 'rgba(6,50,100,0.35)'); grad.addColorStop(1, 'rgba(6,50,100,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // wave sparkle grid (moves with world)
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    const step = 34 * cam.zoom / 8;
    const ox = (-cam.x * cam.zoom) % step, oy = (-cam.y * cam.zoom) % step;
    for (let x = ox - step; x < W + step; x += step) {
      for (let y = oy - step; y < H + step; y += step) {
        const ph = (x * 0.09 + y * 0.13);
        const w = Math.sin(this.t * 2.1 + ph);
        if (w > 0.3) {
          const len = (3 + w * 5) * cam.zoom / 8;
          ctx.fillRect(x + Math.sin(ph) * 8, y + Math.cos(ph * 1.3) * 8, len, 2);
        }
      }
    }

    // wind streaks: white dashes moving in wind direction
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    const wa = wind.from + Math.PI; // direction of travel
    const dx = Math.sin(wa), dy = -Math.cos(wa);
    for (let i = 0; i < 26; i++) {
      const sx = Math.sin(i * 127.1) * 4000, sy = Math.cos(i * 311.7) * 4000;
      const travel = (this.t * wind.kn * KN2MS * 3 + i * 130);
      const wx = sx + dx * travel, wy = sy + dy * travel;
      const span = 700;
      const px = ((wx - cam.x) % span + span * 1.5) % span - span / 2;
      const py = ((wy - cam.y) % span + span * 1.5) % span - span / 2;
      const s = this.toScreen(cam.x + px, cam.y + py);
      const L = (8 + wind.kn) * cam.zoom / 3;
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(i + this.t * 2);
      ctx.beginPath();
      ctx.moveTo(s.x - dx * L, s.y - dy * L);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  // ================= COURSE OBJECTS =================
  drawMark(m) {
    const s = this.toScreen(m.x, m.y), z = this.cam.zoom;
    const ctx = this.ctx;
    const bobY = Math.sin(this.t * 2 + m.x) * 2;
    ctx.save(); ctx.translate(s.x, s.y + bobY);
    // buoy
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(2, 4, 2.2 * z, 1.2 * z, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = m.color || '#ff7a1a';
    ctx.beginPath(); ctx.arc(0, 0, 1.6 * z, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(-0.5 * z, -0.5 * z, 0.5 * z, 0, TAU); ctx.fill();
    // little flag
    ctx.strokeStyle = '#333'; ctx.lineWidth = Math.max(1, z * 0.15);
    ctx.beginPath(); ctx.moveTo(0, -1.4 * z); ctx.lineTo(0, -3.6 * z); ctx.stroke();
    ctx.fillStyle = m.flagColor || '#ffd400';
    const fw = Math.sin(this.t * 4 + m.y) * 0.3;
    ctx.beginPath(); ctx.moveTo(0, -3.6 * z); ctx.lineTo((1.6 + fw) * z, -3.1 * z); ctx.lineTo(0, -2.6 * z); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (m.label) {
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(11, z * 1.6)}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(m.label, s.x, s.y + bobY + 3.5 * z);
    }
  },

  drawRing(r) {
    if (r.got) return;
    const s = this.toScreen(r.x, r.y), z = this.cam.zoom;
    const ctx = this.ctx;
    const pulse = 1 + 0.12 * Math.sin(this.t * 4 + r.x);
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.strokeStyle = r.next ? '#ffe14d' : 'rgba(255,225,77,0.55)';
    ctx.lineWidth = (r.next ? 1.1 : 0.7) * z;
    ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = r.next ? 18 : 6;
    ctx.beginPath(); ctx.ellipse(0, 0, 3.4 * z * pulse, 2.1 * z * pulse, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  },

  drawDuck(d) {
    const s = this.toScreen(d.x, d.y), z = this.cam.zoom;
    const ctx = this.ctx;
    ctx.save(); ctx.translate(s.x, s.y + Math.sin(this.t * 3 + d.x) * 2);
    ctx.font = `${3.2 * z}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🦆', 0, 0);
    ctx.restore();
  },

  drawStartLine(a, b) {
    const s1 = this.toScreen(a.x, a.y), s2 = this.toScreen(b.x, b.y);
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3; ctx.setLineDash([12, 10]); ctx.lineDashOffset = -this.t * 20;
    ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
    ctx.restore();
  },

  // ================= BOAT =================
  drawBoat(boat, wind, isPlayer) {
    const ctx = this.ctx, z = this.cam.zoom;
    const s = this.toScreen(boat.x, boat.y);
    const L = boat.p.lengthM * z, B = boat.p.beamM * z;
    const heelShift = -Math.sin(boat.heel) * B * 0.4; // lean toward leeward (opposite side from +heel = wind-over-starboard)

    // wake trail
    ctx.save();
    for (const w of boat.trail) {
      const ws = this.toScreen(w.x, w.y);
      ctx.fillStyle = `rgba(255,255,255,${w.a * 0.35})`;
      ctx.beginPath(); ctx.arc(ws.x, ws.y, (1 - w.a) * 1.1 * z + 0.3 * z, 0, TAU); ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(boat.heading);

    // shadow (offset by heel to sell the lean)
    ctx.save();
    ctx.translate(heelShift * 1.5, L * 0.06);
    ctx.fillStyle = 'rgba(0,20,40,0.3)';
    this.hullPath(ctx, boat.p.hull, L * 1.02, B * 1.05);
    ctx.fill();
    ctx.restore();

    // knocked out spin
    if (boat.knockedOut > 0) ctx.rotate(Math.sin(this.t * 6) * 0.15);

    // hull leans: compress beam a touch + shift
    ctx.translate(heelShift, 0);
    ctx.scale(Math.max(0.7, Math.cos(boat.heel)), 1);

    const hull = HULLS.find(h => h.id === boat.cosmetics.hull) || HULLS[0];
    this.hullPath(ctx, boat.p.hull, L, B);
    const hg = ctx.createLinearGradient(-B / 2, 0, B / 2, 0);
    hg.addColorStop(0, this.shade(hull.color, -25));
    hg.addColorStop(0.45, hull.color);
    hg.addColorStop(1, this.shade(hull.color, 20));
    ctx.fillStyle = hg; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(1, z * 0.12); ctx.stroke();
    // deck stripe
    this.hullPath(ctx, boat.p.hull, L * 0.75, B * 0.7);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();

    // sailor (little kid with orange life jacket, sits to windward)
    if (boat.p.hull === 'pram' || boat.p.hull === 'board' || boat.p.hull === 'skiff') {
      const side = boat.boomAng > 0 ? 1 : -1; // sit to windward, opposite the boom
      const ch = (typeof CHARACTERS !== 'undefined' && CHARACTERS.find(c => c.id === boat.cosmetics.sailor)) || { cap: '#e04b3a' };
      ctx.fillStyle = '#ff8c1a';
      ctx.beginPath(); ctx.arc(side * B * 0.22, L * 0.12, Math.max(2, B * 0.16), 0, TAU); ctx.fill();
      ctx.fillStyle = ch.cap; // seen from above you see the cap
      ctx.beginPath(); ctx.arc(side * B * 0.22, L * 0.12 - B * 0.1, Math.max(1.2, B * 0.09), 0, TAU); ctx.fill();
    }

    // ---- rigs ----
    const sail = SAILS.find(x => x.id === boat.cosmetics.sail) || SAILS[0];
    if (boat.p.hull === 'ship') {
      this.drawSquareRig(ctx, boat, L, B, z, sail);
    } else if (boat.p.hull === 'schooner') {
      this.drawForeAft(ctx, boat, L, B, z, sail, -L * 0.18, L * 0.42, boat.boomAng);
      this.drawForeAft(ctx, boat, L, B, z, sail, L * 0.16, L * 0.36, boat.boomAng * 0.9);
      if (boat.p.hasJib) this.drawJib(ctx, boat, L, z, sail);
    } else {
      const mastY = boat.p.hull === 'pram' ? -L * 0.32 : boat.p.hasJib ? -L * 0.12 : -L * 0.2;
      this.drawForeAft(ctx, boat, L, B, z, sail, mastY, L * (boat.p.hull === 'pram' ? 0.62 : 0.55), boat.boomAng);
      if (boat.p.hasJib) this.drawJib(ctx, boat, L, z, sail);
    }

    // flag at masthead
    const flag = FLAGS.find(f => f.id === boat.cosmetics.flag);
    if (flag && flag.emoji) {
      ctx.save();
      ctx.rotate(-boat.heading); // billboard
      ctx.font = `${Math.max(10, z * 1.6)}px serif`; ctx.textAlign = 'center';
      ctx.fillText(flag.emoji, 0, -L * 0.5);
      ctx.restore();
    }

    ctx.restore();

    // luffing indicator "flap flap"
    if (isPlayer && boat.luffing && !boat.inIrons && Math.abs(boat.spd) > 0.1) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `bold ${Math.max(11, z * 1.3)}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('〰️ flap!', s.x, s.y - L * 0.75);
    }
    if (boat.inIrons && boat.ironsTime > 1.2) {
      ctx.font = `${Math.max(16, z * 2.4)}px serif`; ctx.textAlign = 'center';
      ctx.fillText('🆘', s.x, s.y - L * 0.8 + Math.sin(this.t * 5) * 3);
    }

    // soak meter above AI boats in battle
    if (boat.soakVisible && boat.soak > 1) {
      const w = 5 * z;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(s.x - w / 2, s.y - L * 0.85, w, 0.8 * z);
      ctx.fillStyle = '#3db5ff';
      ctx.fillRect(s.x - w / 2, s.y - L * 0.85, w * clamp(boat.soak / 100, 0, 1), 0.8 * z);
    }
    if (boat.nameTag) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `bold ${Math.max(10, z * 1.1)}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(boat.nameTag, s.x, s.y + L * 0.85);
    }
  },

  drawForeAft(ctx, boat, L, B, z, sail, mastY, boomLen, boomAng) {
    Render.drawForeAftReal.call(this, ctx, boat, L, B, z, sail, mastY, boomLen, boomAng);
  },

  drawJib(ctx, boat, L, z, sail) {
    const bowY = -L * 0.48, clewLen = L * 0.34;
    const flap = boat.luffing ? Math.sin(this.t * 22) * 0.15 : 0;
    const ja = boat.jibAng + Math.PI + flap;
    const jx = Math.sin(ja) * clewLen, jy = -Math.cos(ja) * clewLen;
    const side = boat.jibAng >= 0 ? 1 : -1;
    const belly = 0.2 * clewLen;
    ctx.beginPath();
    ctx.moveTo(0, bowY);
    ctx.quadraticCurveTo(jx / 2 + Math.cos(ja) * side * belly, bowY + jy / 2 + Math.sin(ja) * side * belly, jx, bowY + jy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,60,70,0.5)'; ctx.lineWidth = Math.max(1, z * 0.08); ctx.stroke();
  },

  drawSquareRig(ctx, boat, L, B, z, sail) {
    // three masts with yards rotated by "sheet" (braces)
    const yardAng = boat.boomAng * 0.55; // yards brace around
    const flap = boat.luffing ? Math.sin(this.t * 20) * 0.1 : 0;
    for (const my of [-L * 0.3, 0, L * 0.28]) {
      const yw = B * (1.5 - Math.abs(my) / L);
      ctx.save();
      ctx.translate(0, my);
      ctx.rotate(yardAng + flap);
      // sail (billows aft)
      const bl = (0.5 + boat.eff * 0.5);
      ctx.beginPath();
      ctx.moveTo(-yw, 0);
      ctx.quadraticCurveTo(0, L * 0.16 * bl, yw, 0);
      ctx.lineTo(yw * 0.85, L * 0.05);
      ctx.quadraticCurveTo(0, L * 0.2 * bl, -yw * 0.85, L * 0.05);
      ctx.closePath();
      this.paintSail(ctx, sail.id, yw * 2);
      // yard
      ctx.strokeStyle = '#4a3218'; ctx.lineWidth = Math.max(1.5, z * 0.5);
      ctx.beginPath(); ctx.moveTo(-yw, 0); ctx.lineTo(yw, 0); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#3a2812';
      ctx.beginPath(); ctx.arc(0, my, Math.max(2, z * 0.6), 0, TAU); ctx.fill();
    }
  },

  paintSail(ctx, sailId, size) {
    ctx.save();
    ctx.clip();
    // base
    const base = { white: '#f6f4ec', red: '#e04b3a', sunset: '#ff9d5c', striped: '#f6f4ec', rainbow: '#f6f4ec', shark: '#cfd8de', bolt: '#22364a', star: '#2a5fa8' }[sailId] || '#f6f4ec';
    ctx.fillStyle = base;
    ctx.fill();
    const b = size;
    ctx.lineWidth = size * 0.12;
    if (sailId === 'striped') {
      ctx.strokeStyle = '#e04b3a';
      for (let i = -4; i < 5; i++) { ctx.beginPath(); ctx.moveTo(i * b * 0.28 - b, -b); ctx.lineTo(i * b * 0.28 + b, b); ctx.stroke(); }
    } else if (sailId === 'rainbow') {
      const cols = ['#ff4b4b', '#ff9d2e', '#ffe14d', '#4dd463', '#3db5ff', '#9b6bff'];
      cols.forEach((c, i) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(-b, -b + i * b * 0.33); ctx.lineTo(b, -b * 0.6 + i * b * 0.33); ctx.stroke(); });
    } else if (sailId === 'shark') {
      ctx.fillStyle = '#fff';
      for (let i = -3; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * b * 0.22, b * 0.05); ctx.lineTo(i * b * 0.22 + b * 0.1, -b * 0.28); ctx.lineTo(i * b * 0.22 + b * 0.2, b * 0.05);
        ctx.closePath(); ctx.fill();
      }
    } else if (sailId === 'bolt') {
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.moveTo(b * 0.1, -b * 0.5); ctx.lineTo(-b * 0.15, b * 0.05); ctx.lineTo(b * 0.02, b * 0.05); ctx.lineTo(-b * 0.1, b * 0.5); ctx.lineTo(b * 0.22, -b * 0.08); ctx.lineTo(b * 0.06, -b * 0.08);
      ctx.closePath(); ctx.fill();
    } else if (sailId === 'star') {
      ctx.fillStyle = '#ffe14d';
      const r1 = b * 0.3, r2 = b * 0.13;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? r2 : r1, a = i / 10 * TAU - Math.PI / 2;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
    }
    // shading
    ctx.fillStyle = 'rgba(0,30,60,0.12)';
    ctx.fill();
    ctx.restore();
  },

  hullPath(ctx, type, L, B) {
    ctx.beginPath();
    const l2 = L / 2, b2 = B / 2;
    if (type === 'pram') { // Opti: blunt bow
      ctx.moveTo(-b2 * 0.75, -l2);
      ctx.lineTo(b2 * 0.75, -l2);
      ctx.quadraticCurveTo(b2 * 1.05, 0, b2 * 0.9, l2 * 0.9);
      ctx.quadraticCurveTo(0, l2 * 1.05, -b2 * 0.9, l2 * 0.9);
      ctx.quadraticCurveTo(-b2 * 1.05, 0, -b2 * 0.75, -l2);
    } else if (type === 'board') { // sunfish: long board
      ctx.moveTo(0, -l2);
      ctx.quadraticCurveTo(b2 * 1.1, -l2 * 0.3, b2 * 0.85, l2 * 0.8);
      ctx.quadraticCurveTo(0, l2, -b2 * 0.85, l2 * 0.8);
      ctx.quadraticCurveTo(-b2 * 1.1, -l2 * 0.3, 0, -l2);
    } else if (type === 'ship') { // tall ship: full hull
      ctx.moveTo(0, -l2);
      ctx.quadraticCurveTo(b2 * 1.2, -l2 * 0.45, b2, l2 * 0.55);
      ctx.quadraticCurveTo(b2 * 0.7, l2, 0, l2);
      ctx.quadraticCurveTo(-b2 * 0.7, l2, -b2, l2 * 0.55);
      ctx.quadraticCurveTo(-b2 * 1.2, -l2 * 0.45, 0, -l2);
    } else { // pointed dinghy/keelboat/classic
      ctx.moveTo(0, -l2);
      ctx.quadraticCurveTo(b2 * 1.05, -l2 * 0.15, b2 * 0.8, l2 * 0.85);
      ctx.quadraticCurveTo(0, l2, -b2 * 0.8, l2 * 0.85);
      ctx.quadraticCurveTo(-b2 * 1.05, -l2 * 0.15, 0, -l2);
    }
    ctx.closePath();
  },

  shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
    return `rgb(${r},${g},${b})`;
  },

  // ================= NO-GO CONE =================
  drawNoGoCone(boat, wind) {
    if (!this.showCone) return;
    const ctx = this.ctx;
    const s = this.toScreen(boat.x, boat.y);
    const R = 46 * this.cam.zoom;
    const a0 = wind.from - boat.p.noGo * RAD - Math.PI / 2;
    const a1 = wind.from + boat.p.noGo * RAD - Math.PI / 2;
    ctx.save();
    const inZone = Math.abs(boat.relWind(wind)) * DEG < boat.p.noGo;
    const flash = inZone ? 0.16 + 0.1 * Math.sin(this.t * 8) : 0.09;
    const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, R);
    grad.addColorStop(0, `rgba(255,60,50,${flash + 0.08})`);
    grad.addColorStop(1, 'rgba(255,60,50,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.arc(s.x, s.y, R, a0, a1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(255,80,70,${inZone ? 0.7 : 0.35})`;
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x + Math.cos(a0) * R, s.y + Math.sin(a0) * R);
    ctx.lineTo(s.x, s.y);
    ctx.lineTo(s.x + Math.cos(a1) * R, s.y + Math.sin(a1) * R);
    ctx.stroke();
    ctx.setLineDash([]);
    // "NO GO" label up the middle
    const mid = wind.from - Math.PI / 2;
    ctx.fillStyle = `rgba(255,120,110,${inZone ? 0.9 : 0.4})`;
    ctx.font = `bold ${Math.max(12, this.cam.zoom * 1.6)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('NO-GO', s.x + Math.cos(mid) * R * 0.7, s.y + Math.sin(mid) * R * 0.7);
    ctx.restore();
  },

  // wind pointer arrow orbiting the player: always shows where wind goes
  drawWindHint(boat, wind) {
    const ctx = this.ctx;
    const s = this.toScreen(boat.x, boat.y);
    const a = wind.from + Math.PI; // travel direction
    const R = 30 * this.cam.zoom;
    const ax = s.x + Math.sin(wind.from) * R * 0.9, ay = s.y - Math.cos(wind.from) * R * 0.9;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    const bob = Math.sin(this.t * 3) * 4;
    ctx.translate(0, bob);
    ctx.fillStyle = 'rgba(255,225,77,0.9)';
    ctx.strokeStyle = 'rgba(0,40,80,0.5)';
    ctx.lineWidth = 2;
    const sz = Math.max(10, this.cam.zoom * 2.2);
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.4); ctx.lineTo(sz * 0.8, -sz * 2.4); ctx.lineTo(sz * 0.3, -sz * 2.4);
    ctx.lineTo(sz * 0.3, -sz * 3.6); ctx.lineTo(-sz * 0.3, -sz * 3.6); ctx.lineTo(-sz * 0.3, -sz * 2.4);
    ctx.lineTo(-sz * 0.8, -sz * 2.4);
    ctx.closePath();
    ctx.rotate(Math.PI); // arrow points along travel
    ctx.fill(); ctx.stroke();
    ctx.restore();
  },

  // objective arrow at screen edge
  drawObjectiveArrow(boat, tx, ty, color = '#7dffb0') {
    const s = this.toScreen(boat.x, boat.y);
    const t = this.toScreen(tx, ty);
    const d = Math.hypot(t.x - s.x, t.y - s.y);
    if (d < 180) return;
    const a = Math.atan2(t.y - s.y, t.x - s.x);
    const R = 130;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(s.x + Math.cos(a) * R, s.y + Math.sin(a) * R);
    ctx.rotate(a + Math.PI / 2);
    const pulse = 1 + 0.15 * Math.sin(this.t * 5);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,40,80,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -16); ctx.lineTo(12, 6); ctx.lineTo(0, 0); ctx.lineTo(-12, 6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // distance label
    const distM = Math.round(dist(boat.x, boat.y, tx, ty));
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(distM + 'm', s.x + Math.cos(a) * (R + 24), s.y + Math.sin(a) * (R + 24));
  },

  // ================= particles / projectiles / floaters =================
  updateEffects(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - dt * 2; p.vy *= 1 - dt * 2;
      if (p.life >= p.maxLife) this.particles.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life += dt; f.y -= dt * 8;
      if (f.life > 1.6) this.floaters.splice(i, 1);
    }
  },
  drawEffects() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const s = this.toScreen(p.x, p.y);
      const a = 1 - p.life / p.maxLife;
      ctx.fillStyle = p.color + (a * 0.8) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, p.size * this.cam.zoom, 0, TAU); ctx.fill();
    }
    for (const f of this.floaters) {
      const s = this.toScreen(f.x, f.y);
      const a = clamp(1.6 - f.life, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.font = `bold ${18 + f.life * 6}px sans-serif`; ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,30,60,0.7)'; ctx.lineWidth = 3;
      ctx.strokeText(f.text, s.x, s.y);
      ctx.fillText(f.text, s.x, s.y);
      ctx.globalAlpha = 1;
    }
  },

  drawProjectiles(projs) {
    const ctx = this.ctx;
    for (const pr of projs) {
      const s = this.toScreen(pr.x, pr.y);
      ctx.fillStyle = 'rgba(120,210,255,0.9)';
      ctx.beginPath(); ctx.arc(s.x, s.y, 0.45 * this.cam.zoom, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(s.x - 1, s.y - 1, 0.2 * this.cam.zoom, 0, TAU); ctx.fill();
    }
  },

  // spray & wake emission based on speed
  boatEffects(boat, dt) {
    if (boat.kn > 3.5 && Math.random() < dt * boat.kn * 2) {
      const d = dirVec(boat.heading);
      const bow = { x: boat.x + d.x * boat.p.lengthM * 0.45, y: boat.y + d.y * boat.p.lengthM * 0.45 };
      this.spawnParticles(bow.x, bow.y, 2, { spd: 2.5, size: 0.35, life: 0.5 });
    }
  },
};

// resolve the drawForeAft alias mess (defined after object literal for clarity)
Render.drawForeAftReal = function (ctx, boat, L, B, z, sail, mastY, boomLen, boomAng) {
  const flap = boat.luffing ? Math.sin(this.t * 25) * 0.12 + Math.sin(this.t * 17) * 0.08 : 0;
  const ba = boomAng + Math.PI + flap * 0.5;
  const bx = Math.sin(ba) * boomLen, by = -Math.cos(ba) * boomLen;
  const bellySide = boomAng >= 0 ? 1 : -1;
  const belly = (0.18 + 0.28 * boat.eff) * boomLen * (boat.luffing ? 0.35 : 1);
  const chordX = bx / 2, chordY = by / 2;
  const perpX = Math.cos(ba) * bellySide, perpY = Math.sin(ba) * bellySide;
  const cx = chordX + perpX * belly + flap * boomLen * 0.35;
  const cy = mastY + chordY + perpY * belly;

  ctx.beginPath();
  ctx.moveTo(0, mastY);
  ctx.quadraticCurveTo(cx, cy, bx, mastY + by);
  ctx.closePath();
  this.paintSail(ctx, sail.id, boomLen * 0.8);
  ctx.strokeStyle = 'rgba(60,60,70,0.6)'; ctx.lineWidth = Math.max(1, z * 0.1); ctx.stroke();
  // boom
  ctx.strokeStyle = '#5a3d20'; ctx.lineWidth = Math.max(1.5, z * 0.2);
  ctx.beginPath(); ctx.moveTo(0, mastY); ctx.lineTo(bx, mastY + by); ctx.stroke();
  // mast
  ctx.fillStyle = '#4a3218';
  ctx.beginPath(); ctx.arc(0, mastY, Math.max(1.5, z * 0.2), 0, TAU); ctx.fill();
};
