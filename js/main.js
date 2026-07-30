// ---- main: game loop, input, UI, coach ----

const $ = id => document.getElementById(id);

const UI = {
  toast(text, cls = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.textContent = text;
    $('toastLayer').appendChild(el);
    setTimeout(() => el.remove(), 1900);
  },
  refreshStars() {
    $('starTotal').textContent = Progress.data.stars;
    $('menuStarTotal').textContent = Progress.data.stars;
  },
  show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    $('overlay').classList.remove('gone');
    if (id) $(id).classList.remove('hidden');
    else $('overlay').classList.add('gone');
  },
};

class Coach {
  constructor() {
    this.queue = [];
    this.current = null;
    this.timer = 0;
    this.cooldowns = {};
  }
  say(text, dur = 5, key = null) {
    if (key) {
      if ((this.cooldowns[key] || 0) > 0) return;
      this.cooldowns[key] = 30;
    }
    if (this.current && this.current.text === text) return;
    if (this.queue.some(q => q.text === text)) return;
    this.queue.push({ text, dur });
  }
  update(dt) {
    for (const k in this.cooldowns) this.cooldowns[k] -= dt;
    if (this.current) {
      this.timer -= dt;
      if (this.timer <= 0) { this.current = null; $('coach').classList.add('hidden'); }
    } else if (this.queue.length) {
      this.current = this.queue.shift();
      this.timer = this.current.dur;
      $('coachText').textContent = this.current.text;
      $('coach').classList.remove('hidden');
    }
  }
}

const Game = {
  player: null, wind: null, mode: null, modeName: null,
  keys: {},
  coach: new Coach(),
  running: false, paused: false,
  lastT: 0,
  cleanTackStreak: 0,
  mmCtx: null,

  init() {
    Progress.load();
    this.view = Progress.data.view || 'fp';
    Render.init();
    this.mmCtx = $('minimap').getContext('2d');
    this.bindInput();
    this.buildMenus();
    UI.refreshStars();
    UI.show('screenMain');
    // idle menu backdrop
    this.wind = new Wind(8);
    this.player = new Boat('opti', 0, 0, this.wind.from + 2);
    requestAnimationFrame(t => this.frame(t));
  },

  bindInput() {
    addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      Sound.init();
      this.keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = true;
      if (e.key === 'Escape' && this.running) this.togglePause();
      if ((e.key === 'n' || e.key === 'N')) Render.showCone = !Render.showCone;
      if ((e.key === 'v' || e.key === 'V')) this.toggleView();
      if ((e.key === 'm' || e.key === 'M')) { Sound.muted = !Sound.muted; UI.toast(Sound.muted ? '🔇 Sound off' : '🔊 Sound on'); }
      if ((e.key === 'i' || e.key === 'I') && this.player) { this.player.autoJib = !this.player.autoJib; }
    });
    addEventListener('keyup', e => { this.keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });
    $('pauseBtn').onclick = () => this.togglePause();
    $('windUp').onclick = () => { this.wind.baseKn = Math.min(25, this.wind.baseKn + 1); $('freeWindKn').textContent = this.wind.baseKn; };
    $('windDown').onclick = () => { this.wind.baseKn = Math.max(2, this.wind.baseKn - 1); $('freeWindKn').textContent = this.wind.baseKn; };
    $('jibAuto').onclick = () => { this.player.autoJib = !this.player.autoJib; };
    $('viewBtn').onclick = () => this.toggleView();
  },

  toggleView() {
    this.view = this.view === 'fp' ? 'top' : 'fp';
    Progress.data.view = this.view;
    Progress.save();
    UI.toast(this.view === 'fp' ? '⛵ Boat view' : '🦅 Bird view');
  },

  buildMenus() {
    document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => this.start(b.dataset.mode));
    $('btnBoats').onclick = () => { this.renderBoatGrid(); UI.show('screenBoats'); };
    $('btnBoathouse').onclick = () => { this.renderBoathouse(); UI.show('screenBoathouse'); };
    $('btnMissions').onclick = () => { this.renderMissions(); UI.show('screenMissions'); };
    $('btnHelp').onclick = () => UI.show('screenHelp');
    document.querySelectorAll('.backBtn').forEach(b => b.onclick = () => UI.show('screenMain'));
    $('btnResume').onclick = () => this.togglePause();
    $('btnRestart').onclick = () => this.start(this.modeName);
    $('btnQuit').onclick = () => this.quitToMenu();
    $('btnAgain').onclick = () => this.start(this.modeName);
    $('btnMenu2').onclick = () => this.quitToMenu();
    this.updateMenuBoat();
  },
  updateMenuBoat() {
    $('menuBoat').textContent = BOAT_TYPES[Progress.data.equipped.boat].icon;
  },

  renderBoatGrid() {
    const grid = $('boatGrid');
    grid.innerHTML = '';
    for (const id in BOAT_TYPES) {
      const t = BOAT_TYPES[id];
      const unlocked = Progress.isBoatUnlocked(id);
      const card = document.createElement('div');
      card.className = 'boatCard' + (Progress.data.equipped.boat === id ? ' selected' : '') + (unlocked ? '' : ' locked');
      card.innerHTML = `<div class="icon">${t.icon}</div><div class="bname">${t.name}</div>
        <div class="bdesc">${t.desc}</div>
        ${unlocked ? '' : `<div class="lockTag">🔒 ${t.cost}⭐</div>`}
        <div class="bdesc">${t.hasJib ? '⛵ main + jib' : '⛵ one sail'} · ${t.lengthM}m</div>`;
      card.onclick = () => {
        if (!unlocked) { UI.toast(`Earn ${t.cost}⭐ to unlock the ${t.name}!`, 'bad'); Sound.buzz(); return; }
        Progress.data.equipped.boat = id;
        Progress.save();
        this.updateMenuBoat();
        this.renderBoatGrid();
        Sound.ding();
      };
      grid.appendChild(card);
    }
  },

  renderBoathouse() {
    const build = (gridId, list, kind, key) => {
      const grid = $(gridId);
      grid.innerHTML = '';
      for (const item of list) {
        const unlocked = Progress.isCosUnlocked(kind, item.id);
        const el = document.createElement('div');
        el.className = 'cosItem' + (Progress.data.equipped[key] === item.id ? ' selected' : '') + (unlocked ? '' : ' locked');
        let sw = '';
        if (kind === 'hull') sw = `<div class="swatch" style="background:${item.color}"></div>`;
        else if (kind === 'flag') sw = `<div class="swatch">${item.emoji || '—'}</div>`;
        else sw = `<div class="swatch" style="background:${{ white: '#f6f4ec', red: '#e04b3a', sunset: '#ff9d5c', striped: 'repeating-linear-gradient(45deg,#f6f4ec,#f6f4ec 6px,#e04b3a 6px,#e04b3a 12px)', rainbow: 'linear-gradient(180deg,#ff4b4b,#ffe14d,#4dd463,#3db5ff)', shark: '#cfd8de', bolt: '#22364a', star: '#2a5fa8' }[item.id]}"></div>`;
        el.innerHTML = sw + (unlocked ? item.name : '🔒');
        el.onclick = () => {
          if (!unlocked) { UI.toast('Complete missions to unlock!', 'bad'); Sound.buzz(); return; }
          Progress.data.equipped[key] = item.id;
          Progress.save();
          this.renderBoathouse();
          Sound.ding();
        };
        grid.appendChild(el);
      }
    };
    build('sailGrid', SAILS, 'sail', 'sail');
    build('hullGrid', HULLS, 'hull', 'hull');
    build('flagGrid', FLAGS, 'flag', 'flag');
  },

  renderMissions() {
    const list = $('missionList');
    list.innerHTML = '';
    for (const m of MISSIONS) {
      const done = Progress.data.missionsDone[m.id];
      const el = document.createElement('div');
      el.className = 'mission' + (done ? ' done' : '');
      el.innerHTML = `<div class="mIcon">${done ? '✅' : m.icon}</div>
        <div><div class="mName">${m.name}</div><div class="mDesc">${m.desc}</div></div>
        <div class="mStars">${m.stars ? '+' + m.stars + '⭐' : ''}${m.reward ? ' 🎁' : ''}</div>`;
      list.appendChild(el);
    }
  },

  start(modeName) {
    this.modeName = modeName;
    this.wind = new Wind(modeName === 'free' ? (this.wind ? this.wind.baseKn : 8) : rand(7, 11));
    $('freeWindKn').textContent = Math.round(this.wind.baseKn);
    const boatId = Progress.data.equipped.boat;
    this.player = new Boat(boatId, 0, 0, angNorm(this.wind.from + Math.PI / 2));
    this.player.cosmetics = { sail: Progress.data.equipped.sail, hull: Progress.data.equipped.hull, flag: Progress.data.equipped.flag };
    this.player.onEvent = (n, d) => this.onBoatEvent(n, d);
    Render.cam.x = this.player.x; Render.cam.y = this.player.y; Render.cam.zoom = this.player.p.zoom;
    this.cleanTackStreak = 0;
    this._distAcc = 0;
    this._lastPos = { x: 0, y: 0 };
    this.coach = new Coach();

    const modes = { free: FreeSail, rings: RingRun, trial: TimeTrial, race: RaceMode, battle: BattleMode };
    this.mode = new modes[modeName](this);

    $('hud').classList.remove('hidden');
    $('jibRow').style.display = this.player.p.hasJib ? '' : 'none';
    $('soakBox').classList.toggle('hidden', modeName !== 'battle');
    $('freeWind').classList.toggle('hidden', modeName !== 'free');
    $('minimap').style.display = 'block';
    UI.show(null);
    this.running = true;
    this.paused = false;
  },

  startCountdown(cb) {
    const el = $('countdown');
    let n = 3;
    el.classList.remove('hidden');
    const tick = () => {
      if (n > 0) {
        el.textContent = n;
        Sound.tone(440, 0.2, 'square', 0.2);
        n--; setTimeout(tick, 1000);
      } else {
        el.textContent = 'GO!';
        Sound.tone(880, 0.5, 'square', 0.25);
        setTimeout(() => el.classList.add('hidden'), 800);
        cb();
      }
    };
    tick();
  },

  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
    if (this.paused) UI.show('screenPause');
    else UI.show(null);
  },

  quitToMenu() {
    this.running = false;
    this.mode = null;
    $('hud').classList.add('hidden');
    $('minimap').style.display = 'none';
    UI.show('screenMain');
    UI.refreshStars();
  },

  showResults(title, bodyHtml) {
    Render.spawnConfetti(140);
    setTimeout(() => {
      this.running = false;
      $('hud').classList.add('hidden');
      $('minimap').style.display = 'none';
      $('resultTitle').innerHTML = title;
      $('resultBody').innerHTML = bodyHtml;
      UI.show('screenResults');
      UI.refreshStars();
    }, 1600);
  },

  onBoatEvent(name, data) {
    const p = this.player;
    if (name === 'tackDone') {
      Progress.data.counters.tacks++;
      Progress.checkMission('tack1');
      if (data.keep > 0.45 && data.quick) {
        this.cleanTackStreak++;
        const bonus = 25 + Math.min(this.cleanTackStreak - 1, 4) * 5;
        Progress.addStars(bonus, 'Clean tack!' + (this.cleanTackStreak > 1 ? ` x${this.cleanTackStreak}` : ''));
        Render.floatText(p.x, p.y, '✨ Clean tack!');
        Progress.checkMission('tack3', this.cleanTackStreak >= 3);
      } else {
        this.cleanTackStreak = 0;
        Progress.addStars(5, 'Tack!');
        Render.floatText(p.x, p.y, '🔁 Tack!');
        if (data.keep <= 0.5) this.coach.say('Good tack! Next time carry more SPEED into the turn and turn smoothly through the wind. 💨', 5, 'tackspeed');
      }
      Progress.save();
    }
    if (name === 'crossStern') {
      Progress.data.counters.gybes++;
      Progress.checkMission('gybe1');
      if (data.hard) {
        Sound.thunk();
        Render.floatText(p.x, p.y, '💥 CRASH GYBE!');
        this.coach.say('Whoa! CRASH GYBE! The boom slammed across! Pull the sail in (W) a bit before you gybe. 🤕', 6, 'crashgybe');
        this.cleanTackStreak = 0;
      } else {
        Progress.data.counters.cleanGybes++;
        Progress.addStars(15, 'Smooth gybe!');
        Render.floatText(p.x, p.y, '🔄 Gybe!');
        Progress.checkMission('gybe5', Progress.data.counters.cleanGybes >= 5);
      }
      Progress.save();
    }
    if (name === 'ironsEscape') {
      Progress.checkMission('irons');
      Progress.addStars(5, 'Escaped irons!');
      Render.floatText(p.x, p.y, '💪 Escaped!');
    }
  },

  handleInput(dt) {
    const p = this.player;
    // rudder: springs back to center
    let steer = 0;
    if (this.keys['a'] || this.keys['ArrowLeft']) steer -= 1;
    if (this.keys['d'] || this.keys['ArrowRight']) steer += 1;
    if (steer !== 0) p.rudder = clamp(p.rudder + steer * dt * 3.2, -1, 1);
    else p.rudder += (0 - p.rudder) * clamp(dt * 6, 0, 1);
    // main sheet
    if (this.keys['w'] || this.keys['ArrowUp']) p.sheet = clamp(p.sheet + dt * 0.55, 0, 1);
    if (this.keys['s'] || this.keys['ArrowDown']) p.sheet = clamp(p.sheet - dt * 0.55, 0, 1);
    // jib
    if (p.p.hasJib) {
      if (this.keys['e']) { p.autoJib = false; p.jibSheet = clamp(p.jibSheet + dt * 0.55, 0, 1); }
      if (this.keys['q']) { p.autoJib = false; p.jibSheet = clamp(p.jibSheet - dt * 0.55, 0, 1); }
    }
  },

  coachTips(dt) {
    const p = this.player, w = this.wind;
    const aDeg = Math.abs(p.relWind(w)) * DEG;
    if (p.ironsTime > 2.5) {
      this.coach.say('You\'re stuck IN IRONS! ⛔ The wind is pushing you backwards. Hold the rudder to ONE side (A or D) and wait — the boat will spin out of the no-go zone!', 7, 'irons');
    } else if (aDeg > p.p.noGo + 5 && p.luffing && p.kn < p.p.maxKn * 0.5 && p.eff < 0.4) {
      this.coach.say('Your sail is FLAPPING! 〰️ Pull it in (press W) until it fills with wind!', 5, 'luff');
    } else if (p.overtrimmed && aDeg > 100 && p.eff < 0.6) {
      this.coach.say('Sailing away from the wind — let the sail OUT (press S) to catch more wind! 🌬️', 5, 'over');
    }
    // heading into no-go toward objective
    if (aDeg < p.p.noGo + 3 && p.kn > 1 && !p.inIrons) {
      this.coach.say('Careful — you\'re pointing at the wind! Turn a little left or right, or TACK through quickly! 🔁', 5, 'nogowarn');
    }
  },

  updateHUD() {
    const p = this.player, w = this.wind;
    // wind arrow: in boat view, relative to your bow (up = dead ahead); in bird view, screen-absolute
    const travel = this.view === 'fp' ? angDiff(p.heading, angNorm(w.from + Math.PI)) : angNorm(w.from + Math.PI);
    const deg = travel * DEG - 90; // ➤ points right at 0
    $('windArrow').style.setProperty('--wa', deg + 'deg');
    $('windKn').textContent = w.kn.toFixed(0) + ' kn';
    $('speedNum').textContent = p.kn.toFixed(1);
    $('speedFill').style.width = clamp(p.kn / p.p.maxKn * 100, 0, 100) + '%';
    $('rudderTick').style.left = (50 + p.rudder * 42) + '%';
    $('sheetFill').style.width = (p.sheet * 100) + '%';
    if (p.p.hasJib) {
      $('jibFill').style.width = (p.jibSheet * 100) + '%';
      const ja = $('jibAuto');
      ja.textContent = p.autoJib ? 'AUTO' : 'MANUAL';
      ja.classList.toggle('off', !p.autoJib);
    }
    $('modeInfo').innerHTML = this.mode ? this.mode.hud() : '';
    if (this.modeName === 'battle') $('soakFill').style.width = clamp(p.soak, 0, 100) + '%';
  },

  drawMinimap() {
    const ctx = this.mmCtx, S = 170;
    ctx.clearRect(0, 0, S, S);
    if (!this.mode) return;
    // collect points of interest
    const pts = [{ x: this.player.x, y: this.player.y }];
    if (this.mode.course) for (const m of this.mode.course.marks) pts.push(m);
    if (this.mode.rings) for (const r of this.mode.rings) if (!r.got) pts.push(r);
    if (this.mode.ducks) for (const d of this.mode.ducks) pts.push(d);
    if (this.mode.enemies) for (const e of this.mode.enemies) pts.push(e.boat);
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const pt of pts) { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y); }
    const pad = pts.length > 1 ? 30 : 120;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const scale = Math.min(S / (maxX - minX), S / (maxY - minY));
    const toMM = (x, y) => ({ x: (x - minX) * scale + (S - (maxX - minX) * scale) / 2, y: (y - minY) * scale + (S - (maxY - minY) * scale) / 2 });
    // wind arrow in corner
    ctx.save();
    ctx.translate(20, 20);
    ctx.rotate(this.wind.from + Math.PI);
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    // marks
    if (this.mode.course) {
      for (const m of this.mode.course.marks) {
        const s = toMM(m.x, m.y);
        ctx.fillStyle = m.color || '#ff7a1a';
        ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, TAU); ctx.fill();
      }
    }
    if (this.mode.rings) {
      for (const r of this.mode.rings) {
        if (r.got) continue;
        const s = toMM(r.x, r.y);
        ctx.strokeStyle = r.next ? '#ffe14d' : 'rgba(255,225,77,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, TAU); ctx.stroke();
      }
    }
    // AI racers / battle rivals
    for (const list of [this.mode.racers, this.mode.enemies]) {
      if (!list) continue;
      for (const r of list) {
        const s = toMM(r.boat.x, r.boat.y);
        ctx.fillStyle = '#ff8f8f';
        ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, TAU); ctx.fill();
      }
    }
    // ducks
    if (this.mode.ducks) {
      for (const d of this.mode.ducks) {
        const s = toMM(d.x, d.y);
        ctx.fillStyle = '#ffd400';
        ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, TAU); ctx.fill();
      }
    }
    // player
    const ps = toMM(this.player.x, this.player.y);
    ctx.save();
    ctx.translate(ps.x, ps.y);
    ctx.rotate(this.player.heading);
    ctx.fillStyle = '#7dffb0';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  },

  frame(t) {
    requestAnimationFrame(tt => this.frame(tt));
    const dt = clamp((t - this.lastT) / 1000, 0, 0.05);
    this.lastT = t;
    Render.t += dt;

    if (this.running && !this.paused) {
      this.wind.update(dt);
      this.handleInput(dt);
      this.player.update(dt, this.wind);
      if (this.mode) this.mode.update(dt);
      this.coach.update(dt);
      this.coachTips(dt);
      Render.boatEffects(this.player, dt);
      // distance tracking
      this._distAcc += dist(this._lastPos.x, this._lastPos.y, this.player.x, this.player.y);
      this._lastPos = { x: this.player.x, y: this.player.y };
      if (this._distAcc > 20) {
        Progress.data.counters.dist += this._distAcc;
        this._distAcc = 0;
        Progress.checkMission('sail200', Progress.data.counters.dist >= 200);
        Progress.checkMission('dist5k', Progress.data.counters.dist >= 5000);
      }
      Render.follow(this.player, dt);
      this.updateHUD();
      this.drawMinimap();
    } else if (!this.running) {
      // menu backdrop: gentle drifting camera + demo boat
      this.wind.update(dt);
      this.player.sheet = 0.5;
      this.player.update(dt, this.wind);
      Render.follow(this.player, dt);
    }

    Render.updateEffects(dt);
    // ---- draw world ----
    if (this.running && this.mode && this.view === 'fp') {
      FP.draw(this);
    } else {
      Render.drawWater(this.wind);
      if (this.running && this.mode) {
        Render.drawNoGoCone(this.player, this.wind);
        this.mode.draw();
      }
      Render.drawBoat(this.player, this.wind, true);
      Render.drawEffects();
    }
    Render.drawConfetti(dt);
  },
};

addEventListener('DOMContentLoaded', () => Game.init());
