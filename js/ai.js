// ---- AI skipper: sails to waypoints, tacks upwind properly, trims sails ----
class AISkipper {
  constructor(boat, skill = 0.85) {
    this.boat = boat;
    this.skill = skill;         // 0..1 — trim quality & reaction
    this.target = null;         // {x, y}
    this.lastTack = 0;
    this.tackSide = Math.random() < 0.5 ? 1 : -1; // +1: closehauled on wind.from + beat
    this.shootCooldown = 0;
    this.noise = makeNoise(rand(1000));
    this.t = rand(100);
  }

  update(dt, wind) {
    const b = this.boat;
    if (b.frozen || !this.target) return;
    this.t += dt;
    this.lastTack += dt;

    const brg = bearingTo(b.x, b.y, this.target.x, this.target.y);
    const relB = angDiff(brg, wind.from); // how close the bearing is to dead upwind
    const beat = (b.p.noGo + 8) * RAD;
    let desired = brg;

    if (Math.abs(relB) < beat) {
      // target is in the no-go cone: beat toward it on closehauled headings
      const h1 = angNorm(wind.from + beat); // starboard-ish option
      const h2 = angNorm(wind.from - beat);
      const cur = this.tackSide > 0 ? h1 : h2, other = this.tackSide > 0 ? h2 : h1;
      // tack when the other heading points a lot closer to the target (past the layline)
      const gain = Math.abs(angDiff(cur, brg)) - Math.abs(angDiff(other, brg));
      if (gain > 25 * RAD && this.lastTack > 7 + (1 - this.skill) * 6) {
        this.tackSide *= -1;
        this.lastTack = 0;
      }
      desired = this.tackSide > 0 ? h1 : h2;
    } else if (Math.abs(relB) > 165 * RAD) {
      // dead downwind: sail slightly hot angles, gybe occasionally
      desired = angNorm(wind.from + Math.PI + this.tackSide * 20 * RAD);
      if (this.lastTack > 12) { this.tackSide *= -1; this.lastTack = 0; }
    }

    // steer
    const err = angDiff(b.heading, desired);
    b.rudder = clamp(err * 2.2, -1, 1) * (0.75 + 0.25 * this.skill);

    // trim: near-optimal sheet with skill-based wobble
    const aDeg = Math.abs(b.relWind(wind)) * DEG;
    const ideal = clamp((aDeg - 28) * 0.55, 8, 86);
    let sheet = clamp(1 - (ideal - 5) / 85, 0, 1);
    sheet += (1 - this.skill) * 0.18 * this.noise(this.t * 0.3);
    b.sheet = clamp(sheet, 0, 1);
    b.autoJib = true;
  }

  reachedTarget(r = 16) {
    if (!this.target) return false;
    return dist(this.boat.x, this.boat.y, this.target.x, this.target.y) < r;
  }
}
