// ---- boat definitions & sailing physics ----

// polar: [angle-off-wind deg, fraction of wind speed] - realistic dinghy/keelboat shapes
const BOAT_TYPES = {
  opti: {
    name: 'Optimist', icon: '⛵', cost: 0, lengthM: 2.3, beamM: 1.1,
    desc: 'The little box that teaches the world to sail. Nimble & friendly!',
    polar: [[45, .42], [52, .50], [60, .55], [75, .60], [90, .62], [110, .63], [135, .58], [160, .48], [180, .42]],
    noGo: 45, maxTurn: 85, tau: 1.3, maxKn: 6, hasJib: false, hull: 'pram', zoom: 13, sailArea: 1,
  },
  sunfish: {
    name: 'Sunfish', icon: '🌞', cost: 150, lengthM: 4.2, beamM: 1.2,
    desc: 'A speedy beach rocket with a funny slanted sail.',
    polar: [[45, .50], [55, .58], [70, .65], [90, .70], [110, .72], [135, .66], [160, .55], [180, .48]],
    noGo: 45, maxTurn: 80, tau: 1.5, maxKn: 8, hasJib: false, hull: 'board', zoom: 10, sailArea: 1,
  },
  v15: {
    name: 'Vanguard 15', icon: '🚤', cost: 400, lengthM: 4.6, beamM: 1.7,
    desc: 'A zippy two-person racer with a jib. Fast and tippy!',
    polar: [[42, .55], [52, .65], [70, .75], [90, .82], [110, .85], [135, .80], [160, .62], [180, .55]],
    noGo: 42, maxTurn: 75, tau: 1.6, maxKn: 11, hasJib: true, hull: 'skiff', zoom: 9.5, sailArea: 1.15,
  },
  j22: {
    name: 'J/22', icon: '⛵', cost: 800, lengthM: 6.9, beamM: 2.4,
    desc: 'A real keelboat! Heavy, steady, and glides through tacks.',
    polar: [[40, .58], [50, .68], [70, .76], [90, .80], [110, .82], [135, .78], [160, .62], [180, .55]],
    noGo: 40, maxTurn: 45, tau: 3.5, maxKn: 7.5, hasJib: true, hull: 'keel', zoom: 6.5, sailArea: 1.2,
  },
  sloop: {
    name: 'Colonial Sloop', icon: '🚢', cost: 1200, lengthM: 15, beamM: 4.5,
    desc: 'A 1700s trading sloop with a big gaff mainsail. History afloat!',
    polar: [[55, .40], [70, .52], [90, .62], [110, .66], [135, .62], [160, .50], [180, .44]],
    noGo: 55, maxTurn: 25, tau: 6, maxKn: 8, hasJib: true, hull: 'classic', zoom: 4, sailArea: 1.3,
  },
  schooner: {
    name: 'Schooner America', icon: '🛥️', cost: 1600, lengthM: 30, beamM: 7,
    desc: 'The 1851 yacht that won the America\'s Cup its name!',
    polar: [[48, .50], [60, .62], [80, .74], [100, .80], [130, .76], [160, .58], [180, .50]],
    noGo: 48, maxTurn: 18, tau: 9, maxKn: 12, hasJib: true, hull: 'schooner', zoom: 2.8, sailArea: 1.4,
  },
  tallship: {
    name: 'Tall Ship', icon: '🏴‍☠️', cost: 2000, lengthM: 50, beamM: 10,
    desc: 'A mighty square-rigger! Almost impossible to sail upwind - feel history\'s problem!',
    polar: [[70, .28], [90, .45], [110, .58], [135, .64], [160, .62], [180, .58]],
    noGo: 68, maxTurn: 10, tau: 14, maxKn: 10, hasJib: false, hull: 'ship', zoom: 2, sailArea: 1.5,
  },
};

function polarLookup(pts, deg) {
  if (deg <= pts[0][0]) return pts[0][1] * clamp(deg / pts[0][0], 0, 1);
  for (let i = 1; i < pts.length; i++) {
    if (deg <= pts[i][0]) {
      const [a0, v0] = pts[i - 1], [a1, v1] = pts[i];
      return lerp(v0, v1, (deg - a0) / (a1 - a0));
    }
  }
  return pts[pts.length - 1][1];
}

// ---- wind ----
class Wind {
  constructor(kn = 8) {
    this.baseKn = kn; this.kn = kn;
    this.from = rand(TAU) - Math.PI; // direction wind comes FROM
    this.baseFrom = this.from;
    this.nKn = makeNoise(rand(100));
    this.nDir = makeNoise(rand(100));
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    this.kn = Math.max(1, this.baseKn * (1 + 0.25 * this.nKn(this.t * 0.12)));
    this.from = angNorm(this.baseFrom + 10 * RAD * this.nDir(this.t * 0.05));
  }
  vec() { const d = dirVec(this.from); return { x: -d.x * this.kn, y: -d.y * this.kn }; } // direction air moves
}

// ---- boat ----
class Boat {
  constructor(typeId, x = 0, y = 0, heading = 0) {
    this.typeId = typeId;
    this.p = BOAT_TYPES[typeId];
    this.x = x; this.y = y;
    this.heading = heading;
    this.spd = 0;             // m/s along heading (can go slightly negative = drifting back)
    this.rudder = 0;          // -1..1
    this.sheet = 0.6;         // 0 = fully out, 1 = fully in
    this.jibSheet = 0.6;
    this.autoJib = true;
    this.boomAng = 0;         // rad from centerline; + = boom to PORT (wind over starboard)
    this.jibAng = 0;
    this.heel = 0;            // rad, for visuals
    this.eff = 0;             // current sail efficiency 0..1
    this.luffing = false;
    this.overtrimmed = false;
    this.inIrons = false;
    this.ironsTime = 0;
    this.frozen = false;      // pre-start
    this.paceMul = 1;         // difficulty handicap for AI boats
    this.cosmetics = { sail: 'white', hull: 'wood', flag: 'burgee' };
    this.wakeTimer = 0;
    this.soak = 0;            // 0..100 battle
    this.knockedOut = 0;
    this.trail = [];
    // tack/gybe tracking
    this._prevRel = 0;
    this._zoneEnterSpd = null;
    this.onEvent = null;      // callback(name, data)
  }

  get kn() { return this.spd / KN2MS; }

  // rel wind: 0 = bow into wind; + = wind over starboard bow
  relWind(wind) { return angDiff(this.heading, wind.from); }

  sailState(relAbsDeg, sheet) {
    // where the wind would let the boom swing to (fully eased)
    const natural = clamp(relAbsDeg - 12, 0, 88);
    // where the sheet lets the boom go
    const sheetLimit = 5 + (1 - sheet) * 85;
    const boom = Math.min(sheetLimit, natural);
    // best boom angle for this point of sail
    const ideal = clamp((relAbsDeg - 28) * 0.55, 8, 86);
    let eff = Math.exp(-((boom - ideal) ** 2) / (2 * 15 * 15));
    let luff = false, over = false;
    if (boom < ideal - 12) { eff = Math.max(eff, 0.45); over = true; }        // pinned in: slow but drives
    if (sheetLimit > natural + 8) {                                            // eased past the wind: flapping
      eff *= clamp(1 - (sheetLimit - natural - 8) / 25, 0.06, 1);
      luff = true;
    }
    return { boom, ideal, eff, luff, over };
  }

  update(dt, wind) {
    if (this.frozen) { this.spd = 0; return; }
    const p = this.p;
    const rel = this.relWind(wind);
    const aDeg = Math.abs(rel) * DEG;
    // wind over starboard (rel > 0) pushes the boom out to PORT = +boomAng
    const side = rel >= 0 ? 1 : -1;

    // ----- main sail -----
    const main = this.sailState(aDeg, this.sheet);
    // ----- jib -----
    let jib = null;
    if (p.hasJib) {
      if (this.autoJib) this.jibSheet = clamp(1 - (clamp((aDeg - 28) * 0.5, 6, 80) - 5) / 85, 0, 1);
      jib = this.sailState(aDeg, this.jibSheet);
    }
    let eff = jib ? main.eff * 0.72 + jib.eff * 0.28 : main.eff;
    this.luffing = main.luff || aDeg < p.noGo + 3;
    this.overtrimmed = main.over;

    // ----- no-go zone -----
    const inZone = aDeg < p.noGo;
    if (inZone) eff = 0;
    this.eff = eff;
    this.inIrons = inZone && this.spd < 0.6;
    this.ironsTime = this.inIrons ? this.ironsTime + dt : 0;

    // ----- speed -----
    let target = polarLookup(p.polar, aDeg) * wind.kn * eff * KN2MS * p.sailArea * this.paceMul;
    target = Math.min(target, p.maxKn * KN2MS);
    if (this.inIrons && this.ironsTime > 1) target = -0.45; // drift backwards
    if (this.knockedOut > 0) target = 0;
    const tau = target > this.spd ? p.tau : (eff < 0.15 ? p.tau * 3.2 : p.tau * 1.8); // coast through tacks
    this.spd += (target - this.spd) * clamp(dt / tau, 0, 1);
    // rudder drag
    this.spd -= this.spd * Math.abs(this.rudder) * 0.22 * dt;

    // ----- turning (needs speed for steerage; extra authority in irons so kids can escape) -----
    const steerage = clamp(Math.abs(this.spd) / 1.4, this.inIrons ? 0.3 : 0.15, 1);
    this.heading = angNorm(this.heading + this.rudder * p.maxTurn * RAD * steerage * dt);

    // ----- heel (visual): heel to leeward -----
    const heelProfile = Math.sin(clamp(aDeg, 0, 120) * RAD * 1.5); // max near close/beam reach
    const heelTarget = side * clamp(eff * (wind.kn / 15) * heelProfile, 0, 1) * 26 * RAD;
    this.heel += (heelTarget - this.heel) * clamp(dt * 2.5, 0, 1);

    // ----- movement + leeway -----
    const d = dirVec(this.heading);
    const wv = dirVec(wind.from);
    const leeway = (this.inIrons ? 0.35 : 0.10) * wind.kn * 0.05;
    this.x += (d.x * this.spd - wv.x * leeway) * dt;
    this.y += (d.y * this.spd - wv.y * leeway) * dt;

    // ----- boom swing -----
    const boomTarget = side * main.boom * RAD;
    const prevBoom = this.boomAng;
    this.boomAng += (boomTarget - this.boomAng) * clamp(dt * 6, 0, 1);
    if (jib) this.jibAng += (side * jib.boom * RAD * 0.85 - this.jibAng) * clamp(dt * 6, 0, 1);
    const boomSwingRate = Math.abs(this.boomAng - prevBoom) / Math.max(dt, 1e-4);

    // ----- tack / gybe detection -----
    if (Math.sign(rel) !== Math.sign(this._prevRel) && Math.abs(rel) > 1e-4 && Math.abs(this._prevRel) > 1e-4) {
      if (aDeg < 90) this._emit('crossBow');
      else this._emit('crossStern', { hard: boomSwingRate > 2.0 && wind.kn > 9 && this.sheet < 0.35 });
    }
    // entering / leaving no-go zone for clean tack scoring
    if (inZone && this._zoneEnterSpd === null) { this._zoneEnterSpd = Math.max(this.spd, 0.01); this._zoneEnterT = 0; this._crossedBow = false; }
    if (this._zoneEnterSpd !== null) {
      this._zoneEnterT += dt;
      if (aDeg < 20) this._crossedBow = true;
      if (!inZone) {
        if (this._crossedBow && this._zoneEnterT < 8) {
          this._emit('tackDone', { keep: this.spd / this._zoneEnterSpd, quick: this._zoneEnterT < 5 });
        }
        if (this.ironsTime > 3.5) this._emit('ironsEscape');
        this._zoneEnterSpd = null;
      }
    }
    if (Math.abs(rel) > 1e-4) this._prevRel = rel;

    // trail
    this.wakeTimer -= dt;
    if (this.wakeTimer <= 0 && Math.abs(this.spd) > 0.4) {
      this.trail.push({ x: this.x - d.x * this.p.lengthM * 0.5, y: this.y - d.y * this.p.lengthM * 0.5, a: 1 });
      this.wakeTimer = 0.07;
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].a -= dt * 0.45;
      if (this.trail[i].a <= 0) this.trail.splice(i, 1);
    }

    if (this.knockedOut > 0) this.knockedOut -= dt;
    if (this.soak > 0) this.soak = Math.max(0, this.soak - dt * 3);
  }

  _emit(name, data) { if (this.onEvent) this.onEvent(name, data || {}); }
}
