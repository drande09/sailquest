// ---- game modes: free sail, ring run, time trial, race, water battle ----

function makeAIBoat(typeId, x, y, heading, name, cosmetics, skill) {
  const b = new Boat(typeId, x, y, heading);
  b.nameTag = name;
  b.cosmetics = cosmetics;
  const ai = new AISkipper(b, skill);
  return { boat: b, ai };
}

const AI_NAMES = [
  { name: 'Captain Coco', cos: { sail: 'red', hull: 'blue', flag: 'burgee' } },
  { name: 'Salty Sam', cos: { sail: 'sunset', hull: 'green', flag: 'burgee' } },
  { name: 'Windy Wilma', cos: { sail: 'white', hull: 'red', flag: 'burgee' } },
  { name: 'Pirate Pete', cos: { sail: 'shark', hull: 'black', flag: 'pirate' } },
];

// build a windward/leeward course aligned to the wind at start
function buildCourse(wind, startX, startY, legLen) {
  const up = dirVec(wind.from); // toward wind source
  const right = { x: -up.y, y: up.x };
  const half = 22;
  const pinA = { x: startX - right.x * half, y: startY - right.y * half, color: '#ff7a1a', label: '' };
  const pinB = { x: startX + right.x * half, y: startY + right.y * half, color: '#ff7a1a', label: '' };
  const wm = { x: startX + up.x * legLen, y: startY + up.y * legLen, color: '#ffd400', label: 'Mark 1', flagColor: '#ff3b30' };
  const lm = { x: startX - up.x * legLen * 0.25, y: startY - up.y * legLen * 0.25, color: '#ffd400', label: 'Mark 2', flagColor: '#ff3b30' };
  return { pinA, pinB, wm, lm, up, right,
    marks: [pinA, pinB, wm, lm],
    // one quick lap: windward mark, leeward mark, finish at the line (2-3 minutes)
    seq: [ { x: wm.x, y: wm.y, label: 'Mark 1' }, { x: lm.x, y: lm.y, label: 'Mark 2' },
           { x: startX, y: startY, label: 'FINISH', finish: true } ],
  };
}

// selectable race difficulty — win a level to unlock the next
const RACE_LEVELS = [
  { name: 'Rookie Regatta', icon: '🐣', desc: 'Slow & friendly rivals', pace: 0.62, skill: 0.3, band: [0.45, 0.85], stars: [60, 40, 25, 15] },
  { name: 'Club Race', icon: '⛵', desc: 'Rivals who know their stuff', pace: 0.78, skill: 0.5, band: [0.6, 0.95], stars: [100, 60, 35, 20] },
  { name: 'Champion Cup', icon: '🏆', desc: 'The fastest fleet around!', pace: 0.92, skill: 0.75, band: [0.8, 1.0], stars: [160, 90, 50, 30] },
];

class BaseMode {
  constructor(game) { this.g = game; this.done = false; this.score = 0; }
  update(dt) {}
  draw() {}
  hud() { return ''; }
  onBoatEvent(name, data) {}
  end() {}
}

// ============ FREE SAIL ============
class FreeSail extends BaseMode {
  constructor(g) {
    super(g);
    this.ducks = [];
    for (let i = 0; i < 9; i++) this.spawnDuck();
    g.coach.say('Welcome aboard! The big yellow arrow shows where the wind blows. Try sailing ACROSS the wind first — it\'s the easiest! 🌬️', 7);
    this.tipTimer = 20;
  }
  spawnDuck() {
    const a = rand(TAU), r = rand(60, 260);
    this.ducks.push({ x: this.g.player.x + Math.cos(a) * r, y: this.g.player.y + Math.sin(a) * r });
  }
  update(dt) {
    const p = this.g.player;
    for (let i = this.ducks.length - 1; i >= 0; i--) {
      const d = this.ducks[i];
      if (dist(p.x, p.y, d.x, d.y) < p.p.lengthM * 0.8 + 2) {
        this.ducks.splice(i, 1);
        Sound.quack();
        Render.floatText(d.x, d.y, '🦆 +2⭐');
        Render.spawnParticles(d.x, d.y, 8, { spd: 3, size: 0.4 });
        Progress.addStars(2, 'Duck friend!');
        Progress.data.counters.ducks++;
        Progress.checkMission('duck10', Progress.data.counters.ducks >= 10);
        this.spawnDuck();
      }
      // keep ducks near player
      if (dist(p.x, p.y, d.x, d.y) > 500) { this.ducks.splice(i, 1); this.spawnDuck(); }
    }
    this.tipTimer -= dt;
    if (this.tipTimer < 0) {
      this.tipTimer = 45;
      this.g.coach.say(randPick([
        'Try a TACK: sail toward the wind at an angle, then turn quickly through it! 🔁',
        'See a duck? Sail over and say hi! 🦆',
        'Pull the sail in (W) going toward the wind, let it out (S) going away!',
        'Watch the red NO-GO zone — you can\'t sail straight into the wind!',
      ]), 6);
    }
  }
  draw() { for (const d of this.ducks) Render.drawDuck(d); }
  hud() { return '🌊 Free Sail — 🦆 ' + Progress.data.counters.ducks; }
}

// ============ RING RUN ============
class RingRun extends BaseMode {
  constructor(g) {
    super(g);
    this.rings = [];
    this.time = 90;
    this.got = 0;
    // zigzag pattern that forces upwind work then a downwind run home
    const up = dirVec(g.wind.from);
    const right = { x: -up.y, y: up.x };
    let px = g.player.x, py = g.player.y;
    const beat = (g.player.p.noGo + 12) * RAD;
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const a = g.wind.from + side * beat;
      const d = dirVec(a);
      px += d.x * 60; py += d.y * 60;
      this.rings.push({ x: px, y: py, got: false });
    }
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1;
      px += (-up.x * 0.9 + right.x * side * 0.55) * 90;
      py += (-up.y * 0.9 + right.y * side * 0.55) * 90;
      this.rings.push({ x: px, y: py, got: false });
    }
    g.coach.say('Sail through the glowing rings! The first ones are UPWIND — you\'ll have to zigzag! ⏱️ +6s per ring!', 7);
  }
  nextRing() { return this.rings.find(r => !r.got); }
  update(dt) {
    this.time -= dt;
    const p = this.g.player;
    const nr = this.nextRing();
    this.rings.forEach(r => r.next = false);
    if (nr) nr.next = true;
    for (const r of this.rings) {
      if (r.got || dist(p.x, p.y, r.x, r.y) >= 11) continue;
      r.got = true; this.got++;
      this.time += 8;
      this.score += 25;
      Sound.ding();
      Render.floatText(r.x, r.y, '+25 ✨ +8s');
      Render.spawnParticles(r.x, r.y, 14, { spd: 5, size: 0.5, color: 'rgba(255,225,77,' });
      if (!this.nextRing()) this.finish(true);
    }
    if (this.time <= 0) this.finish(false);
  }
  finish(all) {
    if (this.done) return;
    this.done = true;
    Progress.checkMission('ring8', this.got >= 8);
    const stars = this.got * 5 + (all ? 30 : 0);
    Progress.addStars(stars, 'Ring Run');
    this.g.showResults('💍 Ring Run', `
      <div>Rings collected: <b>${this.got} / ${this.rings.length}</b></div>
      ${all ? '<div>🎉 ALL RINGS! Bonus +30⭐</div>' : ''}
      <div class="bigStars">+${stars} ⭐</div>`);
  }
  draw() {
    for (const r of this.rings) Render.drawRing(r);
    const nr = this.nextRing();
    if (nr) Render.drawObjectiveArrow(this.g.player, nr.x, nr.y, '#ffe14d');
  }
  hud() { return `💍 ${this.got}/${this.rings.length} &nbsp; ⏱️ ${fmtTime(this.time)}`; }
}

// ============ TIME TRIAL ============
class TimeTrial extends BaseMode {
  constructor(g) {
    super(g);
    this.course = buildCourse(g.wind, g.player.x, g.player.y - 0, 120);
    // put player just below the start line, on an easy close reach
    const up = this.course.up;
    g.player.x -= up.x * 30; g.player.y -= up.y * 30;
    g.player.heading = angNorm(g.wind.from + (g.player.p.noGo + 25) * RAD);
    this.wpIndex = 0;
    this.time = 0;
    this.started = false;
    this.g.startCountdown(() => { this.started = true; Sound.horn(); });
    g.coach.say('Race the clock! Round Mark 1 (upwind — zigzag!), back around Mark 2, up again, then home! 🏁', 8);
  }
  wp() { return this.course.seq[this.wpIndex]; }
  update(dt) {
    if (!this.started || this.done) return;
    this.time += dt;
    const p = this.g.player;
    const w = this.wp();
    if (w && dist(p.x, p.y, w.x, w.y) < 16) {
      Sound.ding();
      Render.floatText(w.x, w.y, w.finish ? '🏁 FINISH!' : '✔ ' + w.label);
      this.wpIndex++;
      if (!this.course.seq[this.wpIndex]) this.finish();
    }
  }
  finish() {
    this.done = true;
    Sound.fanfare();
    const key = 'tt2_' + this.g.player.typeId; // v2: shorter course, old bests don't apply
    const isBest = Progress.setBestTime(key, this.time);
    Progress.checkMission('ttfinish');
    if (this.g.player.typeId === 'opti') Progress.checkMission('ttfast', this.time < 180);
    const stars = Math.max(20, Math.round(100 - this.time / 3));
    Progress.addStars(stars, 'Time Trial');
    this.g.showResults('⏱️ Time Trial', `
      <div>Your time: <b>${fmtTime(this.time)}</b></div>
      ${isBest ? '<div>🎉 NEW BEST TIME!</div>' : `<div>Best: ${fmtTime(Progress.bestTime(key))}</div>`}
      <div class="bigStars">+${stars} ⭐</div>`);
  }
  draw() {
    const c = this.course;
    Render.drawStartLine(c.pinA, c.pinB);
    for (const m of [c.wm, c.lm]) Render.drawMark(m);
    Render.drawMark(c.pinA); Render.drawMark(c.pinB);
    const w = this.wp();
    if (w && this.started) Render.drawObjectiveArrow(this.g.player, w.x, w.y);
  }
  hud() {
    const w = this.wp();
    return `⏱️ ${fmtTime(this.time)} &nbsp; ➡ ${w ? w.label : ''}`;
  }
}

// ============ RACE ============
class RaceMode extends BaseMode {
  constructor(g) {
    super(g);
    this.level = clamp(g.raceLevel || 0, 0, RACE_LEVELS.length - 1);
    this.lv = RACE_LEVELS[this.level];
    this.course = buildCourse(g.wind, g.player.x, g.player.y, 120);
    const up = this.course.up, right = this.course.right;
    g.player.x -= up.x * 30 + right.x * 10; g.player.y -= up.y * 30 + right.y * 10;
    g.player.heading = angNorm(g.wind.from + (g.player.p.noGo + 25) * RAD);
    this.racers = [];
    const typeId = g.player.typeId;
    for (let i = 0; i < 3; i++) {
      const off = (i + 1) * 14;
      const r = makeAIBoat(typeId,
        g.player.x + right.x * off, g.player.y + right.y * off,
        g.player.heading, AI_NAMES[i].name, AI_NAMES[i].cos, this.lv.skill + i * 0.06);
      r.boat.paceMul = this.lv.pace;
      r.wpIndex = 0;
      r.boat.frozen = true;
      r.finished = null;
      this.racers.push(r);
    }
    this.wpIndex = 0;
    this.time = 0;
    this.started = false;
    g.player.frozen = true;
    this.g.startCountdown(() => {
      this.started = true;
      g.player.frozen = false;
      this.racers.forEach(r => r.boat.frozen = false);
      Sound.horn();
    });
    g.coach.say('Beat the fleet! Watch how they ZIGZAG upwind to Mark 1 — that\'s the fastest way! 🏁', 8);
  }
  wp() { return this.course.seq[this.wpIndex]; }
  progressOf(wpIdx, x, y) {
    const w = this.course.seq[Math.min(wpIdx, this.course.seq.length - 1)];
    return wpIdx * 10000 - dist(x, y, w.x, w.y);
  }
  place() {
    const mine = this.progressOf(this.wpIndex, this.g.player.x, this.g.player.y);
    let p = 1;
    for (const r of this.racers) {
      const rp = r.finished !== null ? 1e9 - r.finished : this.progressOf(r.wpIndex, r.boat.x, r.boat.y);
      const myP = this.finTime !== undefined ? 1e9 - this.finTime : mine;
      if (rp > myP) p++;
    }
    return p;
  }
  update(dt) {
    if (!this.started) return;
    this.time += dt;
    const p = this.g.player;
    // player waypoints
    const w = this.wp();
    if (!this.done && w && dist(p.x, p.y, w.x, w.y) < 16) {
      Sound.ding();
      Render.floatText(w.x, w.y, w.finish ? '🏁' : '✔ ' + w.label);
      this.wpIndex++;
      if (!this.course.seq[this.wpIndex]) this.finish();
    }
    // AI (rubber-banded: they slow down when ahead so the race stays close & winnable)
    const myProg = this.progressOf(this.wpIndex, p.x, p.y);
    for (const r of this.racers) {
      const rw = this.course.seq[Math.min(r.wpIndex, this.course.seq.length - 1)];
      r.ai.target = rw;
      r.ai.update(dt, this.g.wind);
      const gap = this.progressOf(r.wpIndex, r.boat.x, r.boat.y) - myProg;
      const targetPace = gap > 50 ? this.lv.band[0] : gap < -70 ? this.lv.band[1] : this.lv.pace;
      r.boat.paceMul += (targetPace - r.boat.paceMul) * clamp(dt * 0.5, 0, 1);
      r.boat.update(dt, this.g.wind);
      if (r.finished === null && dist(r.boat.x, r.boat.y, rw.x, rw.y) < 16) {
        r.wpIndex++;
        if (!this.course.seq[r.wpIndex]) { r.finished = this.time; r.wpIndex = this.course.seq.length - 1; }
      }
    }
  }
  finish() {
    this.done = true;
    this.finTime = this.time;
    const place = this.place();
    const medals = ['🥇', '🥈', '🥉', '4th'];
    Sound.fanfare();
    let unlockMsg = '';
    if (place === 1) {
      Progress.checkMission('racewin');
      const rw = Progress.data.raceWins;
      rw[this.level]++;
      if (this.level < RACE_LEVELS.length - 1 && rw[this.level] === 1) {
        const next = RACE_LEVELS[this.level + 1];
        unlockMsg = `<div>🔓 Unlocked: <b>${next.icon} ${next.name}</b>!</div>`;
        UI.toast(`🔓 New race level: ${next.name}!`, 'gold');
      }
      Progress.save();
    }
    const stars = this.lv.stars[place - 1];
    Progress.addStars(stars, this.lv.name);
    this.g.showResults(`🏁 ${this.lv.icon} ${this.lv.name}`, `
      <div style="font-size:52px">${medals[place - 1]}</div>
      <div>You finished <b>${place === 1 ? 'FIRST' : place === 2 ? 'second' : place === 3 ? 'third' : 'fourth'}</b>!</div>
      <div>Time: <b>${fmtTime(this.time)}</b></div>
      ${unlockMsg}
      <div class="bigStars">+${stars} ⭐</div>`);
  }
  draw() {
    const c = this.course;
    Render.drawStartLine(c.pinA, c.pinB);
    Render.drawMark(c.wm); Render.drawMark(c.lm);
    Render.drawMark(c.pinA); Render.drawMark(c.pinB);
    for (const r of this.racers) Render.drawBoat(r.boat, this.g.wind, false);
    const w = this.wp();
    if (w && this.started && !this.done) Render.drawObjectiveArrow(this.g.player, w.x, w.y);
  }
  hud() {
    if (!this.started) return '🏁 Get ready…';
    const medals = ['🥇', '🥈', '🥉', '4️⃣'];
    return `${medals[this.place() - 1]} &nbsp; ⏱️ ${fmtTime(this.time)} &nbsp; ➡ ${this.wp() ? this.wp().label : '🏁'}`;
  }
}

// ============ WATER BATTLE ============
class BattleMode extends BaseMode {
  constructor(g) {
    super(g);
    this.time = 90;
    this.projectiles = [];
    this.cooldown = 0;
    this.hits = 0;
    this.soaked = 0;
    this.enemies = [];
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + 0.5, r = 90;
      const e = makeAIBoat(g.player.typeId,
        g.player.x + Math.cos(a) * r, g.player.y + Math.sin(a) * r,
        rand(TAU), AI_NAMES[(i + 1) % 4].name, AI_NAMES[(i + 1) % 4].cos, 0.6);
      e.boat.soakVisible = true;
      e.boat.paceMul = 0.85;
      e.shootCd = rand(4, 7);
      e.orbitA = a;
      this.enemies.push(e);
    }
    g.coach.say('WATER FIGHT! 💦 Press SPACE to squirt the nearest boat. Soak them 3 times to splash them out!', 7);
  }
  shoot(from, to, friendly) {
    const d = dist(from.x, from.y, to.x, to.y);
    const spread = friendly ? 0.06 : 0.16; // rival aim is wobbly
    const t = d / 26; // lead the target
    const tv = dirVec(to.heading);
    const aimX = to.x + tv.x * to.spd * t, aimY = to.y + tv.y * to.spd * t;
    const a = Math.atan2(aimX - from.x, -(aimY - from.y));
    for (let i = 0; i < 4; i++) {
      const sp = (friendly ? 30 : 24) + rand(-2, 2), aa = a + rand(-spread, spread);
      const dv = dirVec(aa);
      this.projectiles.push({
        x: from.x + dv.x * from.p.lengthM * 0.5, y: from.y + dv.y * from.p.lengthM * 0.5,
        vx: dv.x * sp, vy: dv.y * sp, life: 0, maxLife: Math.min(d / sp + 0.3, 2.2), friendly,
      });
    }
    Sound.squirt();
  }
  update(dt) {
    if (this.done) return;
    this.time -= dt;
    this.cooldown -= dt;
    const g = this.g, p = g.player;

    // player shooting
    if (g.keys[' '] && this.cooldown <= 0) {
      let best = null, bd = 90;
      for (const e of this.enemies) {
        if (e.boat.knockedOut > 0) continue;
        const d = dist(p.x, p.y, e.boat.x, e.boat.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) { this.shoot(p, best.boat, true); this.cooldown = 0.4; }
      else { this.cooldown = 0.3; g.coach.say('Get closer to squirt! 💦', 3); }
    }

    // enemies sail & shoot
    for (const e of this.enemies) {
      e.orbitA += dt * 0.12;
      const or = 55 + 25 * Math.sin(e.orbitA * 0.7);
      e.ai.target = { x: p.x + Math.cos(e.orbitA) * or, y: p.y + Math.sin(e.orbitA) * or };
      e.ai.update(dt, g.wind);
      e.boat.update(dt, g.wind);
      e.shootCd -= dt;
      if (e.shootCd <= 0 && e.boat.knockedOut <= 0 && dist(p.x, p.y, e.boat.x, e.boat.y) < 55) {
        this.shoot(e.boat, p, false);
        e.shootCd = rand(4, 7);
      }
    }

    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life += dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      let dead = pr.life > pr.maxLife;
      if (!dead) {
        if (pr.friendly) {
          for (const e of this.enemies) {
            if (e.boat.knockedOut > 0) continue;
            if (dist(pr.x, pr.y, e.boat.x, e.boat.y) < e.boat.p.lengthM * 0.7 + 2.5) {
              dead = true;
              e.boat.soak += 20;
              this.hits++;
              this.score += 10;
              Sound.splash();
              Render.spawnParticles(pr.x, pr.y, 10, { spd: 4, size: 0.5, color: 'rgba(120,210,255,' });
              Render.floatText(e.boat.x, e.boat.y, '💦 +10');
              if (e.boat.soak >= 100) {
                e.boat.soak = 0; e.boat.knockedOut = 8;
                this.soaked++;
                this.score += 50;
                Sound.fanfare();
                Render.floatText(e.boat.x, e.boat.y, '🌊 SOAKED OUT! +50');
                Progress.checkMission('soak3', this.soaked >= 3);
              }
              break;
            }
          }
        } else if (dist(pr.x, pr.y, p.x, p.y) < p.p.lengthM * 0.7 + 1.5) {
          dead = true;
          p.soak += 9;
          Sound.splash();
          Render.spawnParticles(pr.x, pr.y, 10, { spd: 4, size: 0.5, color: 'rgba(120,210,255,' });
          if (p.soak >= 100) {
            p.soak = 0;
            this.score = Math.max(0, this.score - 40);
            Render.floatText(p.x, p.y, '😵 Soaked! -40');
            Sound.buzz();
          }
        }
      }
      if (dead) {
        Render.spawnParticles(pr.x, pr.y, 3, { spd: 2, size: 0.3, color: 'rgba(160,220,255,' });
        this.projectiles.splice(i, 1);
      }
    }

    if (this.time <= 0) this.finish();
  }
  finish() {
    this.done = true;
    const stars = Math.round(this.score / 5);
    Progress.addStars(stars, 'Water Battle');
    this.g.showResults('💦 Water Battle', `
      <div>Direct hits: <b>${this.hits}</b></div>
      <div>Rivals soaked out: <b>${this.soaked}</b> 🌊</div>
      <div>Battle score: <b>${this.score}</b></div>
      <div class="bigStars">+${stars} ⭐</div>`);
  }
  draw() {
    for (const e of this.enemies) {
      Render.drawBoat(e.boat, this.g.wind, false);
      if (e.boat.knockedOut > 0) {
        const s = Render.toScreen(e.boat.x, e.boat.y);
        Render.ctx.font = `${Render.cam.zoom * 3}px serif`; Render.ctx.textAlign = 'center';
        Render.ctx.fillText('😵', s.x, s.y - 20);
      }
    }
    Render.drawProjectiles(this.projectiles);
  }
  hud() { return `💦 Score ${this.score} &nbsp; 🌊 ${this.soaked} &nbsp; ⏱️ ${fmtTime(this.time)}`; }
}
