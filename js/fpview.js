// ---- first-person "boat view" renderer: pseudo-3D from just behind the helm ----
const FP = {
  t: 0,

  // perspective helpers set up per-frame
  _setup(game) {
    const p = game.player;
    this.W = Render.W; this.H = Render.H;
    this.ctx = Render.ctx;
    this.f = this.H * 0.9;                       // focal length
    this.horizon = this.H * 0.38;
    this.cb = p.p.lengthM * 1.7 + 2.2;           // camera distance behind boat center
    this.camH = 1.6 + p.p.lengthM * 0.55;        // camera height above water
    this.ppr = this.W / (95 * RAD);              // pixels per radian for sky billboards
    this.sinH = Math.sin(p.heading); this.cosH = Math.cos(p.heading);
    this.px = p.x; this.py = p.y;
  },
  // world -> boat-local (fwd, right)
  local(wx, wy) {
    const dx = wx - this.px, dy = wy - this.py;
    return { fwd: dx * this.sinH - dy * this.cosH, right: dx * this.cosH + dy * this.sinH };
  },
  // project a water-level point (optionally lifted `up` meters). null if behind camera
  project(wx, wy, up = 0) {
    const l = this.local(wx, wy);
    const d = l.fwd + this.cb;
    if (d < 0.9) return null;
    const s = this.f / d;
    return { x: this.W / 2 + l.right * s, y: this.horizon + (this.camH - up) * s, s, d };
  },

  draw(game) {
    this._setup(game);
    const { ctx, W, H } = this;
    const p = game.player, wind = game.wind;
    this.t = Render.t;
    const roll = -p.heel * 0.55;

    ctx.save();
    ctx.translate(W / 2, H * 0.45);
    ctx.rotate(roll);
    ctx.translate(-W / 2, -H * 0.45);
    // overdraw margin so rolling doesn't expose corners
    const M = 140;

    // ---------- SKY ----------
    const sky = ctx.createLinearGradient(0, -M, 0, this.horizon);
    sky.addColorStop(0, '#2a8fdc'); sky.addColorStop(0.7, '#8fd0f5'); sky.addColorStop(1, '#d8f0fb');
    ctx.fillStyle = sky;
    ctx.fillRect(-M, -M, W + 2 * M, this.horizon + M);

    // sun (fixed world azimuth)
    const sunAz = 0.7;
    let relSun = angDiff(p.heading, sunAz);
    if (Math.abs(relSun) < 60 * RAD) {
      const sx = W / 2 + relSun * this.ppr;
      ctx.fillStyle = 'rgba(255,240,180,0.95)';
      ctx.shadowColor = 'rgba(255,240,150,0.9)'; ctx.shadowBlur = 40;
      ctx.beginPath(); ctx.arc(sx, this.horizon * 0.32, 34, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
    // clouds
    for (let i = 0; i < 6; i++) {
      const az = i * 1.05 + 0.3 + this.t * 0.004;
      const rel = angDiff(p.heading, angNorm(az));
      if (Math.abs(rel) > 70 * RAD) continue;
      const cx = W / 2 + rel * this.ppr;
      const cy = this.horizon * (0.25 + (i % 3) * 0.2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 55 + i * 8, 16 + (i % 2) * 6, 0, 0, TAU);
      ctx.ellipse(cx + 30, cy - 8, 30, 13, 0, 0, TAU);
      ctx.fill();
    }

    // wind chevrons in the sky: show which way the wind BLOWS relative to your bow
    const travelRel = angDiff(p.heading, angNorm(wind.from + Math.PI));
    this.drawWindChevrons(travelRel, wind);

    // ---------- SEA ----------
    const sea = ctx.createLinearGradient(0, this.horizon, 0, H + M);
    sea.addColorStop(0, '#7fb8dc'); sea.addColorStop(0.12, '#1f77b8'); sea.addColorStop(1, '#0a4a8c');
    ctx.fillStyle = sea;
    ctx.fillRect(-M, this.horizon, W + 2 * M, H - this.horizon + M);

    // sparkle grid anchored to the world (flows past as you sail)
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    const GS = 9;
    const gx0 = Math.floor(p.x / GS) * GS, gy0 = Math.floor(p.y / GS) * GS;
    for (let i = -16; i <= 16; i++) {
      for (let j = -16; j <= 16; j++) {
        const wx = gx0 + i * GS, wy = gy0 + j * GS;
        const pr = this.project(wx + Math.sin(wx * 7.1 + wy) * 3, wy + Math.cos(wy * 5.3) * 3);
        if (!pr || pr.d > 220 || pr.x < -M || pr.x > W + M) continue;
        const tw = Math.sin(this.t * 2.2 + wx * 0.7 + wy * 1.3);
        if (tw < 0.15) continue;
        const alpha = clamp(1.6 - pr.d / 130, 0.05, 0.5) * tw;
        ctx.globalAlpha = alpha;
        ctx.fillRect(pr.x, pr.y, clamp(pr.s * 1.4, 1.5, 14), clamp(pr.s * 0.22, 1, 2.5));
      }
    }
    ctx.globalAlpha = 1;

    // wind streaks on the water
    const wa = wind.from + Math.PI;
    const wdx = Math.sin(wa), wdy = -Math.cos(wa);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 22; i++) {
      const sx0 = Math.sin(i * 127.1) * 4000, sy0 = Math.cos(i * 311.7) * 4000;
      const travel = this.t * wind.kn * KN2MS * 3 + i * 130;
      const span = 320;
      let wx = sx0 + wdx * travel, wy = sy0 + wdy * travel;
      wx = p.x + ((wx - p.x) % span + span * 1.5) % span - span / 2;
      wy = p.y + ((wy - p.y) % span + span * 1.5) % span - span / 2;
      const L = 5 + wind.kn * 0.5;
      const a = this.project(wx, wy), b = this.project(wx + wdx * L, wy + wdy * L);
      if (!a || !b || a.d > 200) continue;
      ctx.globalAlpha = clamp(1.3 - a.d / 160, 0, 0.45);
      ctx.lineWidth = clamp(a.s * 0.25, 1, 3);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ---------- NO-GO CONE on the water ----------
    if (Render.showCone) this.drawCone(p, wind);

    // wake
    for (const w of p.trail) {
      const pr = this.project(w.x, w.y);
      if (!pr) continue;
      ctx.fillStyle = `rgba(255,255,255,${w.a * 0.22})`;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, clamp((1.3 - w.a) * pr.s * 0.5, 1, 22), 0, TAU); ctx.fill();
    }

    // ---------- WORLD OBJECTS (far to near) ----------
    const objs = this.gatherObjects(game);
    objs.sort((a, b) => b._d - a._d);
    for (const o of objs) this.drawObject(o, game);

    // particles (splashes etc.)
    for (const pa of Render.particles) {
      const pr = this.project(pa.x, pa.y, 0.4);
      if (!pr) continue;
      const al = 1 - pa.life / pa.maxLife;
      ctx.fillStyle = pa.color + (al * 0.8) + ')';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, clamp(pa.size * pr.s * 0.6, 1, 20), 0, TAU); ctx.fill();
    }

    // ---------- OWN BOAT ----------
    this.drawOwnBoat(p, wind);

    ctx.restore(); // roll

    // ---------- screen-fixed: floaters & objective arrows ----------
    for (const fl of Render.floaters) {
      const pr = this.project(fl.x, fl.y, 2);
      const a = clamp(1.6 - fl.life, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = fl.color;
      ctx.font = `bold ${20 + fl.life * 6}px sans-serif`; ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,30,60,0.7)'; ctx.lineWidth = 3;
      const fx = pr ? clamp(pr.x, 60, this.W - 60) : this.W / 2;
      const fy = pr ? clamp(pr.y - fl.life * 50, 60, this.H) : this.H * 0.3;
      ctx.strokeText(fl.text, fx, fy);
      ctx.fillText(fl.text, fx, fy);
      ctx.globalAlpha = 1;
    }
    this.drawObjectiveArrow(game);
  },

  drawWindChevrons(travelRel, wind) {
    // a flowing band of chevrons near the top of the sky showing wind flow
    const { ctx, W } = this;
    const y = this.horizon * 0.55;
    const dir = Math.abs(travelRel) > Math.PI / 2 ? 0 : 1; // facing downwind vs upwind-ish
    const rel = travelRel;
    // horizontal flow speed: wind travel projected on screen-x
    const flowX = Math.sin(rel);   // -1..1: wind flows left/right across view
    const toward = -Math.cos(rel); // >0 wind coming AT you
    const n = 7;
    for (let i = 0; i < n; i++) {
      const phase = ((this.t * (0.35 + wind.kn * 0.03) + i / n) % 1);
      const x = W * phase;
      const alpha = 0.25 + 0.2 * Math.sin(phase * Math.PI);
      ctx.save();
      ctx.translate(x, y + Math.sin(phase * 6 + i) * 8);
      const ang = Math.atan2(toward * 0.35, flowX || 0.001);
      ctx.rotate(flowX >= 0 ? ang : ang + Math.PI);
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 3; ctx.lineCap = 'round';
      const s = 14 * (flowX >= 0 ? 1 : -1);
      ctx.beginPath();
      ctx.moveTo(-s, -7); ctx.lineTo(0, 0); ctx.lineTo(-s, 7);
      ctx.moveTo(-s * 2.2, -7); ctx.lineTo(-s * 1.2, 0); ctx.lineTo(-s * 2.2, 7);
      ctx.stroke();
      ctx.restore();
    }
  },

  drawCone(p, wind) {
    const { ctx } = this;
    const edge1 = wind.from - p.p.noGo * RAD, edge2 = wind.from + p.p.noGo * RAD;
    const d1 = dirVec(edge1), d2 = dirVec(edge2);
    const pts = [];
    const R = 130;
    for (let r = 2; r <= R; r += 8) pts.push(this.project(p.x + d1.x * r, p.y + d1.y * r));
    for (let r = R; r >= 2; r -= 8) pts.push(this.project(p.x + d2.x * r, p.y + d2.y * r));
    const vis = pts.filter(Boolean);
    if (vis.length < 3) return;
    const inZone = Math.abs(p.relWind(wind)) * DEG < p.p.noGo;
    ctx.save();
    ctx.beginPath();
    vis.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
    ctx.closePath();
    ctx.fillStyle = `rgba(255,60,50,${inZone ? 0.16 + 0.06 * Math.sin(this.t * 8) : 0.10})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,90,80,${inZone ? 0.8 : 0.4})`;
    ctx.lineWidth = 2.5; ctx.setLineDash([10, 8]);
    ctx.stroke();
    ctx.restore();
    const mid = dirVec(wind.from);
    const lp = this.project(p.x + mid.x * 55, p.y + mid.y * 55, 1);
    if (lp) {
      ctx.fillStyle = `rgba(255,120,110,${inZone ? 0.95 : 0.5})`;
      ctx.font = `bold ${clamp(lp.s * 3, 14, 30)}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('⛔ NO-GO', lp.x, lp.y);
    }
  },

  gatherObjects(game) {
    const m = game.mode, out = [];
    const push = (wx, wy, kind, data) => {
      const l = this.local(wx, wy);
      const d = l.fwd + this.cb;
      if (d < 0.9 || d > 500) return;
      out.push({ wx, wy, kind, data, _d: d });
    };
    if (!m) return out;
    if (m.ducks) for (const d of m.ducks) push(d.x, d.y, 'duck', d);
    if (m.rings) for (const r of m.rings) if (!r.got) push(r.x, r.y, 'ring', r);
    if (m.course) {
      for (const mk of m.course.marks) push(mk.x, mk.y, 'mark', mk);
    }
    if (m.racers) for (const r of m.racers) push(r.boat.x, r.boat.y, 'boat', r.boat);
    if (m.enemies) for (const e of m.enemies) push(e.boat.x, e.boat.y, 'boat', e.boat);
    if (m.projectiles) for (const pr of m.projectiles) push(pr.x, pr.y, 'proj', pr);
    return out;
  },

  drawObject(o, game) {
    const { ctx } = this;
    const pr = this.project(o.wx, o.wy);
    if (!pr) return;
    const s = pr.s;
    if (o.kind === 'duck') {
      ctx.font = `${clamp(s * 1.6, 8, 90)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('🦆', pr.x, pr.y + Math.sin(this.t * 3 + o.wx) * 2);
      ctx.textBaseline = 'alphabetic';
    } else if (o.kind === 'ring') {
      const R = clamp(s * 3.2, 4, 340);
      ctx.save();
      ctx.strokeStyle = o.data.next ? '#ffe14d' : 'rgba(255,225,77,0.6)';
      ctx.lineWidth = clamp(s * 0.5, 2, 26);
      ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = o.data.next ? 22 : 8;
      const pulse = 1 + 0.08 * Math.sin(this.t * 4 + o.wx);
      ctx.beginPath(); ctx.arc(pr.x, pr.y - R * 0.9, R * pulse, 0, TAU); ctx.stroke();
      ctx.shadowBlur = 0;
      // reflection
      ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.ellipse(pr.x, pr.y + R * 0.15, R * 0.9, R * 0.18, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    } else if (o.kind === 'mark') {
      const r = clamp(s * 1.1, 3, 70);
      ctx.fillStyle = 'rgba(0,20,50,0.3)';
      ctx.beginPath(); ctx.ellipse(pr.x, pr.y + r * 0.2, r * 1.3, r * 0.35, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = o.data.color || '#ff7a1a';
      ctx.beginPath(); ctx.arc(pr.x, pr.y - r * 0.6, r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(pr.x - r * 0.3, pr.y - r * 0.9, r * 0.3, 0, TAU); ctx.fill();
      // pole + flag
      ctx.strokeStyle = '#333'; ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath(); ctx.moveTo(pr.x, pr.y - r * 1.4); ctx.lineTo(pr.x, pr.y - r * 3.2); ctx.stroke();
      ctx.fillStyle = o.data.flagColor || '#ffd400';
      ctx.beginPath();
      ctx.moveTo(pr.x, pr.y - r * 3.2); ctx.lineTo(pr.x + r * 1.3, pr.y - r * 2.8); ctx.lineTo(pr.x, pr.y - r * 2.4);
      ctx.closePath(); ctx.fill();
      if (o.data.label) {
        ctx.fillStyle = '#fff'; ctx.font = `bold ${clamp(r, 10, 22)}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(o.data.label, pr.x, pr.y + r * 1.4);
      }
    } else if (o.kind === 'proj') {
      const r = clamp(s * 0.3, 2, 14);
      ctx.fillStyle = 'rgba(120,210,255,0.9)';
      ctx.beginPath(); ctx.arc(pr.x, pr.y - s * 0.8, r, 0, TAU); ctx.fill();
    } else if (o.kind === 'boat') {
      this.drawOtherBoat(o.data, pr, game);
    }
  },

  drawOtherBoat(b, pr, game) {
    const { ctx } = this;
    const s = pr.s;
    const len = b.p.lengthM;
    const rh = angDiff(this.pHeading(game), b.heading);
    const wide = 0.3 + 0.7 * Math.abs(Math.sin(rh));
    const hw = clamp(len * s * 0.5 * wide, 3, 160);   // half width on screen
    const hh = clamp(len * s * 0.16, 2, 50);          // hull height
    const mast = clamp(len * s * 0.9, 8, 280);
    const hull = HULLS.find(h => h.id === b.cosmetics.hull) || HULLS[0];
    ctx.save();
    ctx.translate(pr.x, pr.y);
    ctx.rotate(-b.heel * 0.6);
    // hull
    ctx.fillStyle = hull.color;
    ctx.beginPath();
    ctx.moveTo(-hw, -hh);
    ctx.quadraticCurveTo(0, -hh * 1.5, hw, -hh);
    ctx.lineTo(hw * 0.75, hh * 0.4);
    ctx.quadraticCurveTo(0, hh * 0.9, -hw * 0.75, hh * 0.4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    // mast + sail (lean by boom side, mirrored if we see their bow)
    const facing = Math.cos(rh) >= 0 ? 1 : -1;
    const sailSide = (b.boomAng > 0 ? -1 : 1) * facing; // their port on our left when same heading
    ctx.strokeStyle = '#4a3218'; ctx.lineWidth = Math.max(1.5, s * 0.12);
    ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(0, -hh - mast); ctx.stroke();
    const sail = SAILS.find(x => x.id === b.cosmetics.sail) || SAILS[0];
    const reach = clamp(Math.abs(Math.sin(b.boomAng)), 0.15, 1);
    const foot = hw * 1.4 * reach * sailSide;
    ctx.beginPath();
    ctx.moveTo(0, -hh - mast);
    ctx.quadraticCurveTo(foot * 0.7, -hh - mast * 0.45, foot, -hh * 1.2);
    ctx.lineTo(0, -hh);
    ctx.closePath();
    this.fillSailFlat(sail.id);
    ctx.strokeStyle = 'rgba(60,60,70,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    if (b.nameTag) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `bold ${clamp(s * 0.8, 10, 16)}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(b.nameTag, pr.x, pr.y + 16);
    }
    if (b.soakVisible && b.soak > 1) {
      const w = clamp(s * 4, 30, 80);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(pr.x - w / 2, pr.y - clamp(s * 2.4, 20, 300) - 10, w, 6);
      ctx.fillStyle = '#3db5ff';
      ctx.fillRect(pr.x - w / 2, pr.y - clamp(s * 2.4, 20, 300) - 10, w * clamp(b.soak / 100, 0, 1), 6);
    }
    if (b.knockedOut > 0) {
      ctx.font = `${clamp(s * 2, 16, 40)}px serif`; ctx.textAlign = 'center';
      ctx.fillText('😵', pr.x, pr.y - clamp(s * 2.6, 24, 320));
    }
  },
  pHeading(game) { return game.player.heading; },

  fillSailFlat(sailId) {
    const ctx = this.ctx;
    const base = { white: '#f6f4ec', red: '#e04b3a', sunset: '#ff9d5c', striped: '#f0e0d8', rainbow: '#f2e8ff', shark: '#cfd8de', bolt: '#22364a', star: '#2a5fa8' }[sailId] || '#f6f4ec';
    ctx.fillStyle = base;
    ctx.fill();
  },

  // ================= OWN BOAT (the star of the show) =================
  drawOwnBoat(p, wind) {
    const { ctx, W, H } = this;
    const len = p.p.lengthM;
    // key projected rows
    const yAt = fwd => { const d = fwd + this.cb; return this.horizon + this.camH * this.f / d; };
    const wAt = (fwd, halfW) => { const d = fwd + this.cb; return halfW * this.f / d; };
    const bowF = len * 0.5, midF = 0, sternF = -len * 0.42;
    const bowY = yAt(bowF), midY = yAt(midF), sternY = Math.min(yAt(sternF), H + 60);
    const bowW = wAt(bowF, p.p.hull === 'pram' ? p.p.beamM * 0.48 : p.p.beamM * 0.15); // opti pram = blunt bow
    const midW = wAt(midF, p.p.beamM * 0.62);
    const sternW = wAt(sternF, p.p.beamM * 0.58);
    const cx = W / 2;
    const hull = HULLS.find(h => h.id === p.cosmetics.hull) || HULLS[0];

    // spray at the bow when moving fast
    if (p.kn > 2) {
      const spr = clamp((p.kn - 2) / p.p.maxKn, 0, 1);
      ctx.fillStyle = `rgba(255,255,255,${0.35 * spr})`;
      for (let sdir = -1; sdir <= 1; sdir += 2) {
        ctx.beginPath();
        const sx = cx + sdir * bowW * 1.5;
        ctx.ellipse(sx, bowY + 4, 14 + 20 * spr + Math.sin(this.t * 14 + sdir) * 6, 6 + 8 * spr, sdir * 0.4, 0, TAU);
        ctx.fill();
      }
    }

    // hull (deck view)
    const hg = ctx.createLinearGradient(cx - midW, 0, cx + midW, 0);
    hg.addColorStop(0, Render.shade(hull.color, -30));
    hg.addColorStop(0.5, hull.color);
    hg.addColorStop(1, Render.shade(hull.color, 25));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(cx - bowW, bowY);
    ctx.lineTo(cx + bowW, bowY);
    ctx.quadraticCurveTo(cx + midW * 1.08, midY, cx + sternW, sternY);
    ctx.lineTo(cx - sternW, sternY);
    ctx.quadraticCurveTo(cx - midW * 1.08, midY, cx - bowW, bowY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2; ctx.stroke();
    // inner deck
    ctx.fillStyle = 'rgba(255,235,200,0.25)';
    ctx.beginPath();
    ctx.moveTo(cx - bowW * 0.7, bowY + (midY - bowY) * 0.15);
    ctx.lineTo(cx + bowW * 0.7, bowY + (midY - bowY) * 0.15);
    ctx.quadraticCurveTo(cx + midW * 0.8, midY, cx + sternW * 0.75, sternY);
    ctx.lineTo(cx - sternW * 0.75, sternY);
    ctx.quadraticCurveTo(cx - midW * 0.8, midY, cx - bowW * 0.7, bowY + (midY - bowY) * 0.15);
    ctx.closePath();
    ctx.fill();

    // ---- rig ----
    const sail = SAILS.find(x => x.id === p.cosmetics.sail) || SAILS[0];
    if (p.p.hull === 'ship') this.ownSquareRig(p, sail, yAt, wAt, cx);
    else this.ownForeAft(p, wind, sail, yAt, wAt, cx);

    // tiller hint: little rudder indicator on the stern
    ctx.strokeStyle = '#5a3d20'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, Math.min(sternY - 8, H - 12));
    ctx.lineTo(cx - p.rudder * 46, Math.min(sternY + 22, H - 2));
    ctx.stroke();
  },

  ownForeAft(p, wind, sail, yAt, wAt, cx) {
    const { ctx, H } = this;
    const len = p.p.lengthM;
    // mast position: opti mast well forward
    const mastF = p.p.hull === 'pram' ? len * 0.30 : p.p.hasJib ? len * 0.1 : len * 0.18;
    const mastBaseY = yAt(mastF);
    const dMast = mastF + this.cb;
    const sM = this.f / dMast;
    const mastH = (len * 1.55 + 1.6);
    const mastTopY = this.horizon + (this.camH - mastH) * sM;

    // boom: local angle from centerline; + = port = screen LEFT
    const bA = p.boomAng;
    const boomLen = len * 0.95;
    // boom end local coords (aft of mast, swung by bA)
    const beF = mastF - Math.cos(bA) * boomLen;
    const beR = -Math.sin(bA) * boomLen;
    const dBe = beF + this.cb;
    const sBe = this.f / Math.max(dBe, 1.2);
    const boomH = len * 0.32 + 0.5;
    const bex = cx + beR * sBe;
    const bey = this.horizon + (this.camH - boomH) * sBe;
    const flap = p.luffing ? Math.sin(this.t * 22) * 12 + Math.sin(this.t * 15) * 8 : 0;

    // jib first (in front of mast, drawn behind main)
    if (p.p.hasJib) {
      const bowF2 = len * 0.5;
      const sBow = this.f / (bowF2 + this.cb);
      const bowX = cx, bowYd = yAt(bowF2);
      const jTopY = this.horizon + (this.camH - mastH * 0.82) * sM;
      const jA = p.jibAng;
      const jLen = len * 0.5;
      const jF = bowF2 - Math.cos(jA) * jLen, jR = -Math.sin(jA) * jLen;
      const sJ = this.f / Math.max(jF + this.cb, 1.2);
      const jx = cx + jR * sJ;
      const jy = this.horizon + (this.camH - boomH * 0.8) * sJ;
      ctx.beginPath();
      ctx.moveTo(bowX, bowYd - 4);
      ctx.lineTo(cx, jTopY);
      ctx.quadraticCurveTo((cx + jx) / 2 + flap, (jTopY + jy) / 2, jx + flap, jy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(250,250,245,0.94)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,60,70,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // main sail: mast top -> boom end, with belly
    const bellyX = (cx + bex) / 2 + (bex - cx) * 0.18 + flap;
    const bellyY = (mastTopY + bey) / 2 - 10;
    ctx.beginPath();
    ctx.moveTo(cx, mastTopY);
    ctx.quadraticCurveTo(cx + (bex - cx) * 0.15, (mastTopY + bey) * 0.48, cx, mastBaseY - 6); // luff along mast
    ctx.lineTo(bex, bey);
    ctx.quadraticCurveTo(bellyX, bellyY, cx, mastTopY);
    ctx.closePath();
    this.paintOwnSail(sail.id, cx, mastTopY, bex, bey, mastBaseY);
    ctx.strokeStyle = 'rgba(60,60,70,0.6)'; ctx.lineWidth = 2; ctx.stroke();

    // boom
    ctx.strokeStyle = '#5a3d20'; ctx.lineWidth = clamp(sM * 0.05, 3, 11); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, this.horizon + (this.camH - boomH) * sM);
    ctx.lineTo(bex, bey);
    ctx.stroke();
    // mast
    ctx.strokeStyle = '#4a3218'; ctx.lineWidth = clamp(sM * 0.06, 3, 13);
    ctx.beginPath(); ctx.moveTo(cx, mastBaseY); ctx.lineTo(cx, mastTopY); ctx.stroke();

    // masthead flag = wind telltale (points where wind blows, relative)
    const flag = FLAGS.find(f => f.id === p.cosmetics.flag);
    const relTravel = angDiff(p.heading, angNorm(wind.from + Math.PI));
    const fx = Math.sin(relTravel) * 26;
    ctx.strokeStyle = '#e04b3a'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, mastTopY);
    ctx.quadraticCurveTo(cx + fx * 0.6, mastTopY - 6 + Math.sin(this.t * 6) * 2, cx + fx, mastTopY - 4 + Math.sin(this.t * 6 + 1) * 3);
    ctx.stroke();
    if (flag && flag.emoji) {
      ctx.font = '20px serif'; ctx.textAlign = 'center';
      ctx.fillText(flag.emoji, cx + fx * 0.8, mastTopY - 10);
    }
  },

  ownSquareRig(p, sail, yAt, wAt, cx) {
    const { ctx } = this;
    const len = p.p.lengthM;
    const yardLean = -Math.sin(p.boomAng * 0.55) * 1; // shear for braced yards
    for (const mf of [len * 0.28, 0, -len * 0.3]) {
      const d = mf + this.cb, sM = this.f / d;
      const baseY = yAt(mf);
      const mastH = len * 0.9;
      const topY = this.horizon + (this.camH - mastH) * sM;
      ctx.strokeStyle = '#3a2812'; ctx.lineWidth = Math.max(3, sM * 1.2);
      ctx.beginPath(); ctx.moveTo(cx, baseY); ctx.lineTo(cx, topY); ctx.stroke();
      // two square sails per mast
      for (let tier = 0; tier < 2; tier++) {
        const yTop = lerp(topY, baseY, 0.12 + tier * 0.42);
        const yBot = lerp(topY, baseY, 0.42 + tier * 0.42);
        const hw = wAt(mf, len * (0.32 - tier * 0.06));
        const lean = yardLean * hw * 0.5;
        const bl = 1 + p.eff * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx - hw + lean, yTop);
        ctx.lineTo(cx + hw + lean, yTop);
        ctx.quadraticCurveTo(cx + hw * 1.1 - lean * 0.5, (yTop + yBot) / 2, cx + hw * 0.9 - lean, yBot);
        ctx.quadraticCurveTo(cx, yBot + (yBot - yTop) * 0.18 * bl, cx - hw * 0.9 - lean, yBot);
        ctx.quadraticCurveTo(cx - hw * 1.1 + lean * 0.5, (yTop + yBot) / 2, cx - hw + lean, yTop);
        ctx.closePath();
        this.fillSailFlat(sail.id);
        ctx.strokeStyle = 'rgba(60,60,70,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.strokeStyle = '#3a2812'; ctx.lineWidth = Math.max(2, sM * 0.7);
        ctx.beginPath(); ctx.moveTo(cx - hw + lean, yTop); ctx.lineTo(cx + hw + lean, yTop); ctx.stroke();
      }
    }
  },

  paintOwnSail(sailId, mx, topY, bx, by, baseY) {
    const ctx = this.ctx;
    ctx.save();
    ctx.clip();
    const base = { white: '#f6f4ec', red: '#e04b3a', sunset: '#ff9d5c', striped: '#f6f4ec', rainbow: '#f6f4ec', shark: '#cfd8de', bolt: '#22364a', star: '#2a5fa8' }[sailId] || '#f6f4ec';
    // vertical light gradient
    const g = ctx.createLinearGradient(0, topY, 0, baseY);
    g.addColorStop(0, base);
    g.addColorStop(1, Render.shade(base.startsWith('#') ? base : '#f6f4ec', -18));
    ctx.fillStyle = g;
    ctx.fill();
    const spanX = Math.abs(bx - mx) + 40, midX = (mx + bx) / 2, midY = (topY + by) / 2;
    const b = Math.max(spanX, 80);
    ctx.lineWidth = b * 0.09;
    if (sailId === 'striped') {
      ctx.strokeStyle = '#e04b3a';
      for (let i = -4; i < 5; i++) { ctx.beginPath(); ctx.moveTo(midX + i * b * 0.24 - b, midY - b); ctx.lineTo(midX + i * b * 0.24 + b, midY + b); ctx.stroke(); }
    } else if (sailId === 'rainbow') {
      const cols = ['#ff4b4b', '#ff9d2e', '#ffe14d', '#4dd463', '#3db5ff', '#9b6bff'];
      cols.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = (baseY - topY) * 0.09; ctx.beginPath(); ctx.moveTo(mx - b, topY + (i + 1) * (baseY - topY) * 0.13); ctx.lineTo(bx + b, topY + (i + 1.6) * (baseY - topY) * 0.13); ctx.stroke(); });
    } else if (sailId === 'shark') {
      ctx.fillStyle = '#fff';
      for (let i = -2; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(midX + i * b * 0.2, by - 4);
        ctx.lineTo(midX + i * b * 0.2 + b * 0.09, by - b * 0.24);
        ctx.lineTo(midX + i * b * 0.2 + b * 0.18, by - 4);
        ctx.closePath(); ctx.fill();
      }
    } else if (sailId === 'bolt') {
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.moveTo(midX + b * 0.06, midY - b * 0.3); ctx.lineTo(midX - b * 0.1, midY + b * 0.02); ctx.lineTo(midX, midY + b * 0.02);
      ctx.lineTo(midX - b * 0.06, midY + b * 0.3); ctx.lineTo(midX + b * 0.13, midY - b * 0.04); ctx.lineTo(midX + b * 0.03, midY - b * 0.04);
      ctx.closePath(); ctx.fill();
    } else if (sailId === 'star') {
      ctx.fillStyle = '#ffe14d';
      const r1 = b * 0.2, r2 = b * 0.085;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? r2 : r1, a = i / 10 * TAU - Math.PI / 2;
        ctx[i ? 'lineTo' : 'moveTo'](midX + Math.cos(a) * r, midY + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },

  drawObjectiveArrow(game) {
    const m = game.mode;
    let target = null;
    if (m && m.nextRing) target = m.nextRing();
    else if (m && m.wp && (m.started === undefined || m.started) && !m.done) target = m.wp();
    if (!target) return;
    const { ctx, W } = this;
    const p = game.player;
    const relAz = angDiff(p.heading, bearingTo(p.x, p.y, target.x, target.y));
    const d = Math.round(dist(p.x, p.y, target.x, target.y));
    const pr = this.project(target.x, target.y);
    if (pr && Math.abs(relAz) < 46 * RAD && pr.x > 40 && pr.x < W - 40) {
      // bouncing marker above the visible target
      const bob = Math.sin(this.t * 5) * 8;
      const my = clamp(pr.y - clamp(pr.s * 6, 40, 240), 40, this.H - 60) + bob;
      ctx.fillStyle = '#7dffb0';
      ctx.strokeStyle = 'rgba(0,40,80,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pr.x, my + 16); ctx.lineTo(pr.x - 12, my); ctx.lineTo(pr.x + 12, my);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText((target.label || '') + ' ' + d + 'm', pr.x, my - 8);
    } else {
      // side edge arrow: turn toward it
      const side = relAz > 0 ? 1 : -1;
      const x = side > 0 ? W - 46 : 46;
      const y = this.horizon + 30;
      const pulse = 1 + 0.15 * Math.sin(this.t * 5);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(side > 0 ? Math.PI / 2 : -Math.PI / 2);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#7dffb0';
      ctx.strokeStyle = 'rgba(0,40,80,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -18); ctx.lineTo(13, 7); ctx.lineTo(0, 1); ctx.lineTo(-13, 7);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText((target.label || 'target') + ' ' + d + 'm', x, y + 30);
    }
  },
};
