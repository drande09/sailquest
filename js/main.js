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
  visualTime: 0,

  init() {
    Progress.load();
    this.view = ['fp','top','chase'].includes(Progress.data.view) ? Progress.data.view : 'chase';
    this.showGuides = Progress.data.guides !== false;
    this.raceLevel = 0;
    Render.init();
    try { this.scene3d = new window.SailingScene($('ocean')); }
    catch (err) { console.warn('3D unavailable; using overhead view.', err); this.disable3D(); }
    addEventListener('sailquest-3d-lost', () => { this.disable3D(); UI.toast('3D paused on this device. Switched to overhead.'); });
    if (this.scene3d) {
      this.scene3d.quality=Progress.data.quality||'high';this.scene3d.resize();
      this.scene3d.reducedMotion=Progress.data.gentleMotion??this.scene3d.reducedMotion;
    }
    this.mmCtx = $('minimap').getContext('2d');
    this.bindInput();
    this.buildMenus();
    UI.refreshStars();
    UI.show('screenMain');
    // idle menu backdrop
    this.wind = new Wind(8);
    this.player = new Boat('opti', 0, 0, this.wind.from + 2);
    this.syncViewButtons();
    requestAnimationFrame(t => this.frame(t));
  },

  bindInput() {
    addEventListener('keydown', e => {
      if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
      if (this.running && !this.paused && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      Sound.init();
      this.keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = true;
      if (e.repeat) return;
      if (e.key === 'Escape' && this.running) this.togglePause();
      if ((e.key === 'n' || e.key === 'N')) this.setGuides(!this.showGuides);
      if ((e.key === 'v' || e.key === 'V')) this.toggleView();
      if ((e.key === 'm' || e.key === 'M')) { Sound.muted = !Sound.muted; UI.toast(Sound.muted ? '🔇 Sound off' : '🔊 Sound on'); }
      if ((e.key === 'i' || e.key === 'I') && this.player) { this.player.autoJib = !this.player.autoJib; }
    });
    addEventListener('keyup', e => { this.keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });
    addEventListener('blur', () => { this.keys = {}; if(this.running&&!this.paused)this.togglePause(); });
    document.addEventListener('visibilitychange', () => { if(document.hidden){this.keys={};if(this.running&&!this.paused)this.togglePause();} });
    $('pauseBtn').onclick = () => this.togglePause();
    $('windUp').onclick = () => { this.wind.baseKn = Math.min(25, this.wind.baseKn + 1); $('freeWindKn').textContent = this.wind.baseKn; };
    $('windDown').onclick = () => { this.wind.baseKn = Math.max(2, this.wind.baseKn - 1); $('freeWindKn').textContent = this.wind.baseKn; };
    $('jibAuto').onclick = () => { this.player.autoJib = !this.player.autoJib; };
    $('viewBtn').onclick = () => this.toggleView();
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>this.setView(b.dataset.view));
    $('lookLeft').onclick=()=>{if(this.scene3d)this.scene3d.yaw=-Math.PI/2;};
    $('lookRight').onclick=()=>{if(this.scene3d)this.scene3d.yaw=Math.PI/2;};
    $('lookAhead').onclick=()=>this.scene3d?.center();
    $('guideToggle').checked=this.showGuides;
    $('guideToggle').onchange=e=>this.setGuides(e.target.checked);
    $('motionToggle').checked=this.scene3d?.reducedMotion||false;
    $('motionToggle').onchange=e=>{if(this.scene3d)this.scene3d.reducedMotion=e.target.checked;Progress.data.gentleMotion=e.target.checked;Progress.save();};
    $('qualitySelect').value=Progress.data.quality||'high';
    $('qualitySelect').onchange=e=>{if(this.scene3d){this.scene3d.quality=e.target.value;this.scene3d.resize();}Progress.data.quality=e.target.value;Progress.save();};
    document.querySelectorAll('[data-key]').forEach(b=>{
      const release=e=>{e.preventDefault();this.keys[b.dataset.key]=false;b.classList.remove('held');};
      b.addEventListener('pointerdown',e=>{e.preventDefault();Sound.init();b.setPointerCapture(e.pointerId);this.keys[b.dataset.key]=true;b.classList.add('held');});
      b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
    });
    $('lessonReset').onclick=()=>this.start('lesson');
    $('lessonContinue').onclick=()=>{const i=LESSONS.findIndex(l=>l.id===this.lessonId);this.lessonId=LESSONS[(i+1)%LESSONS.length].id;this.start('lesson');};
  },

  disable3D() {
    this.scene3d=null;this.view='top';$('ocean').hidden=true;
    $('graphicsNotice').classList.remove('hidden');
    this.syncViewButtons();
  },
  setGuides(on) {
    this.showGuides=on;Render.showCone=on;Progress.data.guides=on;Progress.save();$('guideToggle').checked=on;
  },
  syncViewButtons() {
    document.querySelectorAll('[data-view]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.view===this.view));b.disabled=!this.scene3d&&b.dataset.view!=='top';});
    $('lookControls').classList.toggle('hidden',this.view==='top');
    $('viewHint').classList.toggle('hidden',this.view==='top');
  },
  setView(view) {
    if(!this.scene3d&&view!=='top')return;
    this.view=view;Progress.data.view=view;Progress.save();this.syncViewButtons();
  },

  toggleView() {
    if(!this.scene3d)return;
    const views=['chase','fp','top'];this.setView(views[(views.indexOf(this.view)+1)%3]);
    UI.toast({chase:'3D chase view',fp:'First person · at the helm',top:'Overhead view'}[this.view]);
  },

  buildMenus() {
    $('btnLearn').onclick=()=>{this.renderLessons();UI.show('screenLessons');};
    document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      if (b.dataset.mode === 'race') { this.renderLevels(); UI.show('screenLevels'); }
      else this.start(b.dataset.mode);
    });
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
  renderLessons() {
    const grid=$('lessonGrid');grid.innerHTML='';
    for(const lesson of LESSONS){
      const b=document.createElement('button');b.className='lessonCard';
      b.innerHTML=`<span class="lessonNumber">${lesson.icon}</span><span><strong>${lesson.title}</strong><small>${lesson.subtitle}</small></span><span class="lessonComplete">${Progress.data.lessons?.[lesson.id]?'✓':'↗'}</span>`;
      b.onclick=()=>{this.lessonId=lesson.id;this.start('lesson');};grid.appendChild(b);
    }
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

  renderLevels() {
    const grid = $('levelGrid');
    grid.innerHTML = '';
    const rw = Progress.data.raceWins;
    RACE_LEVELS.forEach((lv, i) => {
      const unlocked = i === 0 || rw[i - 1] >= 1;
      const card = document.createElement('div');
      card.className = 'boatCard' + (unlocked ? '' : ' locked');
      card.innerHTML = `<div class="icon">${lv.icon}</div><div class="bname">${lv.name}</div>
        <div class="bdesc">${lv.desc}</div>
        ${unlocked ? `<div class="bdesc">🥇 Wins: ${rw[i]} · up to +${lv.stars[0]}⭐</div>` : `<div class="lockTag">🔒 Win ${RACE_LEVELS[i - 1].name}</div>`}`;
      card.onclick = () => {
        if (!unlocked) { UI.toast(`Win the ${RACE_LEVELS[i - 1].name} first!`, 'bad'); Sound.buzz(); return; }
        this.raceLevel = i;
        this.start('race');
      };
      grid.appendChild(card);
    });
  },

  drawPortrait(canvas, ch) {
    const c = canvas.getContext('2d');
    const s = canvas.width;
    c.clearRect(0, 0, s, s);
    // life jacket shoulders
    c.fillStyle = '#ff8c1a';
    c.beginPath(); c.ellipse(s / 2, s * 0.95, s * 0.38, s * 0.3, 0, Math.PI, 0); c.fill();
    // head (back view = hair)
    c.fillStyle = ch.hair;
    c.beginPath(); c.arc(s / 2, s * 0.48, s * 0.28, 0, TAU); c.fill();
    if (ch.style === 'ponytail') {
      c.beginPath(); c.ellipse(s / 2, s * 0.78, s * 0.09, s * 0.17, 0, 0, TAU); c.fill();
      c.fillStyle = ch.cap;
      c.beginPath(); c.arc(s / 2, s * 0.62, s * 0.055, 0, TAU); c.fill();
    } else if (ch.style === 'braids') {
      c.beginPath(); c.ellipse(s * 0.28, s * 0.68, s * 0.06, s * 0.15, 0.3, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(s * 0.72, s * 0.68, s * 0.06, s * 0.15, -0.3, 0, TAU); c.fill();
    } else if (ch.style === 'curls') {
      for (let k = 0; k < 5; k++) {
        const a = Math.PI * (0.15 + k * 0.175);
        c.beginPath(); c.arc(s / 2 + Math.cos(a) * s * 0.27, s * 0.5 - Math.sin(a) * s * 0.22 + s * 0.08, s * 0.09, 0, TAU); c.fill();
      }
    }
    // cap
    c.fillStyle = ch.cap;
    c.beginPath(); c.arc(s / 2, s * 0.42, s * 0.285, Math.PI, 0); c.fill();
    c.fillRect(s * 0.215, s * 0.40, s * 0.57, s * 0.05);
    // cap button
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.beginPath(); c.arc(s / 2, s * 0.22, s * 0.04, 0, TAU); c.fill();
    // neck sliver
    c.fillStyle = ch.skin;
    c.fillRect(s * 0.42, s * 0.72, s * 0.16, s * 0.08);
  },

  renderBoathouse() {
    // sailors
    const sg = $('sailorGrid');
    sg.innerHTML = '';
    for (const ch of CHARACTERS) {
      const el = document.createElement('div');
      el.className = 'cosItem' + (Progress.data.equipped.sailor === ch.id ? ' selected' : '');
      const cv = document.createElement('canvas');
      cv.width = cv.height = 44;
      cv.style.display = 'block';
      cv.style.margin = '0 auto 4px';
      this.drawPortrait(cv, ch);
      el.appendChild(cv);
      el.appendChild(document.createTextNode(ch.name));
      el.onclick = () => {
        Progress.data.equipped.sailor = ch.id;
        Progress.save();
        if (this.player) this.player.cosmetics.sailor = ch.id;
        this.renderBoathouse();
        Sound.ding();
      };
      sg.appendChild(el);
    }
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
    this.session=(this.session||0)+1;this.countdownState=null;this.resultState=null;this.keys={};
    $('countdown').classList.add('hidden');
    this.modeName = modeName;
    this.wind = new Wind(modeName === 'free' ? (this.wind ? this.wind.baseKn : 8) : rand(7, 11));
    $('freeWindKn').textContent = Math.round(this.wind.baseKn);
    const boatId = Progress.data.equipped.boat;
    this.player = new Boat(boatId, 0, 0, angNorm(this.wind.from + Math.PI / 2));
    this.player.cosmetics = { sail: Progress.data.equipped.sail, hull: Progress.data.equipped.hull, flag: Progress.data.equipped.flag, sailor: Progress.data.equipped.sailor };
    this.player.onEvent = (n, d) => this.onBoatEvent(n, d);
    Render.cam.x = this.player.x; Render.cam.y = this.player.y; Render.cam.zoom = this.player.p.zoom;
    this.cleanTackStreak = 0;
    this._distAcc = 0;
    this._lastPos = { x: 0, y: 0 };
    this.coach = new Coach();

    $('lessonPanel').classList.add('hidden');
    document.body.classList.toggle('lesson-active',modeName==='lesson');
    const modes = { free: FreeSail, rings: RingRun, trial: TimeTrial, race: RaceMode, battle: BattleMode, lesson: LessonMode };
    this.mode = new modes[modeName](this);
    this._lastPos={x:this.player.x,y:this.player.y};

    $('hud').classList.remove('hidden');
    $('jibRow').style.display = this.player.p.hasJib ? '' : 'none';
    $('soakBox').classList.toggle('hidden', modeName !== 'battle');
    $('freeWind').classList.toggle('hidden', modeName !== 'free');
    $('minimap').style.display = 'block';
    UI.show(null);
    this.running = true;
    this.paused = false;
    $('touchControls').classList.remove('hidden');$('touchFire').classList.toggle('hidden',modeName!=='battle');
    Render.showCone=this.showGuides;this.syncViewButtons();this.updateHUD();this.drawMinimap();
  },

  startCountdown(cb) {
    this.countdownState={left:3,shown:0,cb};this.player.frozen=true;
    $('countdown').classList.remove('hidden');$('countdown').textContent='3';
  },
  updateCountdown(dt) {
    const cd=this.countdownState;if(!cd)return;
    cd.left-=dt;const n=Math.ceil(cd.left);
    if(n>0&&n!==cd.shown){cd.shown=n;$('countdown').textContent=n;Sound.tone(440,.15,'triangle',.1);}
    if(cd.left<=0&&cd.cb){const cb=cd.cb;cd.cb=null;this.player.frozen=false;$('countdown').textContent='GO!';cb();}
    if(cd.left<-.8){this.countdownState=null;$('countdown').classList.add('hidden');}
  },

  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
    this.keys={};$('touchControls').classList.toggle('hidden',this.paused);
    if (this.paused) UI.show('screenPause');
    else UI.show(null);
  },

  quitToMenu() {
    this.session=(this.session||0)+1;this.countdownState=null;this.resultState=null;this.keys={};
    $('countdown').classList.add('hidden');$('touchControls').classList.add('hidden');
    document.body.classList.remove('lesson-active');
    this.running = false;
    this.mode = null;
    $('hud').classList.add('hidden');
    $('minimap').style.display = 'none';
    UI.show('screenMain');
    UI.refreshStars();
  },

  showResults(title, bodyHtml) {
    Render.spawnConfetti(140);
    this.resultState={left:1.6,finish:()=>{
      this.running = false;
      $('hud').classList.add('hidden');
      $('minimap').style.display = 'none';
      $('resultTitle').innerHTML = title;
      $('resultBody').innerHTML = bodyHtml;
      UI.show('screenResults');
      UI.refreshStars();
      $('touchControls').classList.add('hidden');
    }};
  },

  onBoatEvent(name, data) {
    this.mode?.onBoatEvent(name,data);
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
        this.coach.say('The boom swung across hard. Bring the sail toward the middle before the stern crosses the wind, then ease it on the new side.', 6, 'crashgybe');
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
    const travel = this.view !== 'top' ? angDiff(p.heading, angNorm(w.from + Math.PI)) : angNorm(w.from + Math.PI);
    const deg = travel * DEG - 90; // ➤ points right at 0
    $('windArrow').style.setProperty('--wa', deg + 'deg');
    $('windKn').textContent = w.kn.toFixed(0) + ' kn';
    $('speedNum').textContent = p.kn.toFixed(1);
    $('speedFill').style.width = clamp(p.kn / p.p.maxKn * 100, 0, 100) + '%';
    $('rudderTick').style.left = (50 + p.rudder * 42) + '%';
    $('sheetFill').style.width = (p.sheet * 100) + '%';
    $('sheetPercent').textContent=Math.round(p.sheet*100)+'% in';
    $('idealTrim').style.left=SailingGuide.idealSheet(p,w)*100+'%';
    $('idealTrim').classList.toggle('hidden',!this.showGuides);$('trimLegendGuide').classList.toggle('hidden',!this.showGuides);
    const a=Math.abs(p.relWind(w))*DEG;
    $('pointOfSail').textContent=SailingGuide.point(a,p.p.noGo);
    $('windAngle').textContent=Math.round(a)+'° off the wind · '+w.kn.toFixed(0)+' kn';
    $('tackSide').textContent=a<3?'Wind straight ahead':a>177?'Wind almost astern':p.relWind(w)>0?'Starboard tack · wind from your right':'Port tack · wind from your left';
    const feedback=SailingGuide.feedback(p,w);$('trimFeedback').dataset.state=feedback.state;$('trimTitle').textContent=feedback.title;$('trimHint').textContent=feedback.text;
    SailingGuide.drawDial($('windDial'),p,w,this.modeName==='lesson'&&!this.mode.done?this.mode.targetAngle:null);
    if (p.p.hasJib) {
      $('jibFill').style.width = (p.jibSheet * 100) + '%';
      const ja = $('jibAuto');
      ja.textContent = p.autoJib ? 'AUTO' : 'MANUAL';
      ja.classList.toggle('off', !p.autoJib);
    }
    $('modeInfo').innerHTML = this.mode ? this.mode.hud() : '';
    const target=this.mode?.wp?.()||this.mode?.nextRing?.();
    $('destination').classList.toggle('hidden',!target||this.mode.done);
    if(target){
      const bearing=bearingTo(p.x,p.y,target.x,target.y);
      const relative=this.view==='top'?bearing:angDiff(p.heading+(this.scene3d?.yaw||0),bearing);
      $('destinationArrow').style.transform=`rotate(${relative*DEG}deg)`;
      const upwind=Math.abs(angDiff(w.from,bearing))*DEG<p.p.noGo;
      $('destinationText').textContent=`${target.label||'Next ring'} · ${Math.round(dist(p.x,p.y,target.x,target.y))} m${upwind?' · tack upwind':''}`;
    }
    if (this.modeName === 'battle') $('soakFill').style.width = clamp(p.soak, 0, 100) + '%';
  },

  drawMinimap() {
    const ctx = this.mmCtx, S = 170;
    ctx.clearRect(0, 0, S, S);
    if (!this.mode) return;
    // collect points of interest
    const pts = [{ x: this.player.x, y: this.player.y }];
    if(this.mode.trail)pts.push(...this.mode.trail);
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
    if(this.mode.trail){ctx.strokeStyle='#e5c788';ctx.lineWidth=1.5;ctx.beginPath();this.mode.trail.forEach((p,i)=>{const s=toMM(p.x,p.y);if(i)ctx.lineTo(s.x,s.y);else ctx.moveTo(s.x,s.y);});ctx.stroke();}
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
    if(!this.running||!this.paused){Render.t+=dt;this.visualTime+=dt;}

    if (this.running && !this.paused) {
      this.wind.update(dt);
      this.updateCountdown(dt);
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
      if(this.resultState){this.resultState.left-=dt;if(this.resultState.left<=0){const result=this.resultState;this.resultState=null;result.finish();}}
    } else if (!this.running) {
      // menu backdrop: gentle drifting camera + demo boat
      this.wind.update(dt);
      this.player.sheet = 0.5;
      this.player.update(dt, this.wind);
      Render.follow(this.player, dt);
    }

    Render.updateEffects(dt);
    // ---- draw world ----
    const use3D=this.scene3d&&(!this.running||this.view!=='top');
    $('ocean').hidden=!use3D;
    if (use3D) {
      Render.ctx.clearRect(0,0,Render.W,Render.H);
      this.scene3d.draw(this,dt);
      for(const list of [this.mode?.racers,this.mode?.enemies])for(const r of list||[]){
        const b=r.boat;if(dist(this.player.x,this.player.y,b.x,b.y)>250)continue;
        const s=this.scene3d.project(b.x,b.y,b.p.lengthM*1.1+1);if(!s)continue;
        const c=Render.ctx;c.save();c.font='600 12px system-ui';c.textAlign='center';c.fillStyle='#f6efd9';c.shadowColor='#123c4d';c.shadowBlur=5;c.fillText(b.knockedOut>0?'Soaked out!':b.nameTag,s.x,s.y);c.shadowBlur=0;
        if(this.modeName==='battle'){c.fillStyle='#153c4ed9';c.fillRect(s.x-23,s.y+7,46,4);c.fillStyle='#92dbe8';c.fillRect(s.x-23,s.y+7,46*clamp(b.soak/100,0,1),4);}c.restore();
      }
      // Floating scores are projected through the same camera as the boat.
      for(const f of Render.floaters){const s=this.scene3d.project(f.x,f.y,2);if(!s)continue;const c=Render.ctx;c.save();c.globalAlpha=clamp(1-f.life/1.8,0,1);c.font='600 18px system-ui';c.textAlign='center';c.fillStyle=f.color;c.fillText(f.text,s.x,s.y-f.life*20);c.restore();}
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
