// ---- persistent progress: stars, missions, unlocks, cosmetics ----

const SAILS = [
  { id: 'white',    name: 'Classic',   locked: false },
  { id: 'red',      name: 'Red',       locked: false },
  { id: 'sunset',   name: 'Sunset',    locked: false },
  { id: 'striped',  name: 'Striped',   locked: true },
  { id: 'rainbow',  name: 'Rainbow',   locked: true },
  { id: 'shark',    name: 'Shark!',    locked: true },
  { id: 'bolt',     name: 'Lightning', locked: true },
  { id: 'star',     name: 'Superstar', locked: true },
];
const HULLS = [
  { id: 'wood',  name: 'Wood',  color: '#c98d4e', locked: false },
  { id: 'blue',  name: 'Blue',  color: '#2e7fd6', locked: false },
  { id: 'red',   name: 'Red',   color: '#e04b3a', locked: true },
  { id: 'green', name: 'Green', color: '#3aa655', locked: true },
  { id: 'pink',  name: 'Pink',  color: '#f06bb2', locked: true },
  { id: 'black', name: 'Stealth', color: '#3a4552', locked: true },
];
const FLAGS = [
  { id: 'none',    name: 'None',     emoji: '' },
  { id: 'burgee',  name: 'Club',     emoji: '🚩' },
  { id: 'pirate',  name: 'Pirate',   emoji: '🏴‍☠️', locked: true },
  { id: 'checker', name: 'Racer',    emoji: '🏁', locked: true },
  { id: 'usa',     name: 'USA',      emoji: '🇺🇸', locked: true },
  { id: 'party',   name: 'Party',    emoji: '🎉', locked: true },
];

// sailor characters — everyone is unlocked from the start so siblings can each pick their own
const CHARACTERS = [
  { id: 'alex', name: 'Alex', skin: '#ffd9a8', cap: '#e04b3a', hair: '#7a4a1e', style: 'cap' },
  { id: 'mia',  name: 'Mia',  skin: '#ffd9a8', cap: '#f06bb2', hair: '#f2c94c', style: 'ponytail' },
  { id: 'zoe',  name: 'Zoe',  skin: '#a86a3c', cap: '#9b6bff', hair: '#2b1c10', style: 'braids' },
  { id: 'kai',  name: 'Kai',  skin: '#a86a3c', cap: '#3db5ff', hair: '#171717', style: 'cap' },
  { id: 'lily', name: 'Lily', skin: '#ffe0c4', cap: '#4dd463', hair: '#c0392b', style: 'ponytail' },
  { id: 'sam',  name: 'Sam',  skin: '#8a5a2b', cap: '#ffe14d', hair: '#222222', style: 'curls' },
];

const MISSIONS = [
  { id: 'sail200',   icon: '🌊', name: 'Set Sail',        desc: 'Sail 200 meters',                      stars: 10 },
  { id: 'tack1',     icon: '🔁', name: 'First Tack',      desc: 'Turn your bow through the wind',       stars: 20 },
  { id: 'irons',     icon: '🆘', name: 'Great Escape',    desc: 'Escape from being stuck in irons',     stars: 15 },
  { id: 'gybe1',     icon: '🔄', name: 'First Gybe',      desc: 'Turn your stern through the wind',     stars: 20 },
  { id: 'tack3',     icon: '✨', name: 'Tack Master',     desc: '3 clean tacks in a row',               stars: 40, reward: { kind: 'sail', id: 'striped' } },
  { id: 'ring8',     icon: '💍', name: 'Ring Champion',   desc: 'Collect 8 rings in one Ring Run',      stars: 50, reward: { kind: 'sail', id: 'rainbow' } },
  { id: 'ttfinish',  icon: '⏱️', name: 'Finisher',        desc: 'Finish a Time Trial',                  stars: 30, reward: { kind: 'hull', id: 'red' } },
  { id: 'ttfast',    icon: '⚡', name: 'Speedy',          desc: 'Time Trial under 3:00 in the Opti',    stars: 60, reward: { kind: 'sail', id: 'bolt' } },
  { id: 'racewin',   icon: '🏆', name: 'Race Winner',     desc: 'Win a race against the fleet',         stars: 80, reward: { kind: 'flag', id: 'checker' } },
  { id: 'soak3',     icon: '💦', name: 'Splash Attack',   desc: 'Soak 3 rivals in one Water Battle',    stars: 60, reward: { kind: 'flag', id: 'pirate' } },
  { id: 'duck10',    icon: '🦆', name: 'Duck Friend',     desc: 'Bump 10 rubber ducks (Free Sail)',     stars: 25, reward: { kind: 'hull', id: 'pink' } },
  { id: 'gybe5',     icon: '🌀', name: 'Gybe Master',     desc: '5 clean gybes (total)',                stars: 40, reward: { kind: 'hull', id: 'green' } },
  { id: 'dist5k',    icon: '🗺️', name: 'Explorer',        desc: 'Sail 5,000 meters total',              stars: 50, reward: { kind: 'flag', id: 'usa' } },
  { id: 'stars500',  icon: '🌟', name: 'Rising Star',     desc: 'Earn 500 Sea Stars',                   stars: 0,  reward: { kind: 'sail', id: 'star' } },
  { id: 'allboats',  icon: '⚓', name: 'Admiral',         desc: 'Unlock every boat',                    stars: 100, reward: { kind: 'flag', id: 'party' } },
];

const Progress = {
  data: null,
  KEY: 'sailquest_save_v1',

  load() {
    try { this.data = JSON.parse(localStorage.getItem(this.KEY)) || null; } catch (e) { this.data = null; }
    if (!this.data) this.data = {
      stars: 0,
      missionsDone: {},
      unlockedCos: {},
      equipped: { sail: 'white', hull: 'wood', flag: 'burgee', boat: 'opti' },
      bestTimes: {},
      counters: { dist: 0, tacks: 0, gybes: 0, cleanGybes: 0, ducks: 0 },
    };
    // migrations for saves from earlier versions
    if (!this.data.equipped.sailor) this.data.equipped.sailor = 'alex';
    if (!this.data.raceWins) this.data.raceWins = [0, 0, 0];
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {} },

  addStars(n, why) {
    if (n <= 0) return;
    this.data.stars += n;
    UI.toast(`+${n} ⭐ ${why || ''}`, 'gold');
    Sound.star();
    this.checkBoatUnlocks();
    this.checkMission('stars500', this.data.stars >= 500);
    this.save();
    UI.refreshStars();
  },

  isCosUnlocked(kind, id) {
    const list = kind === 'sail' ? SAILS : kind === 'hull' ? HULLS : FLAGS;
    const item = list.find(i => i.id === id);
    return !item.locked || this.data.unlockedCos[kind + ':' + id];
  },
  unlockCos(kind, id) {
    if (this.isCosUnlocked(kind, id)) return;
    this.data.unlockedCos[kind + ':' + id] = true;
    const list = kind === 'sail' ? SAILS : kind === 'hull' ? HULLS : FLAGS;
    const item = list.find(i => i.id === id);
    UI.toast(`🎁 Unlocked: ${item.name} ${kind}!`, 'gold');
    Sound.fanfare();
    this.save();
  },

  checkMission(id, condition = true) {
    if (!condition || this.data.missionsDone[id]) return;
    const m = MISSIONS.find(x => x.id === id);
    if (!m) return;
    this.data.missionsDone[id] = true;
    UI.toast(`🏅 Mission: ${m.name}!`, 'gold');
    if (typeof Render !== 'undefined' && Render.spawnConfetti) Render.spawnConfetti(90);
    if (m.stars) this.addStars(m.stars, m.name);
    if (m.reward) this.unlockCos(m.reward.kind, m.reward.id);
    this.save();
  },

  isBoatUnlocked(id) { return BOAT_TYPES[id].cost <= 0 || this.data.stars >= BOAT_TYPES[id].cost || this.data['boat:' + id]; },
  checkBoatUnlocks() {
    let all = true;
    for (const id in BOAT_TYPES) {
      if (!this.isBoatUnlocked(id)) { all = false; }
    }
    this.checkMission('allboats', all);
  },

  bestTime(key) { return this.data.bestTimes[key] || null; },
  setBestTime(key, t) {
    const old = this.data.bestTimes[key];
    if (!old || t < old) { this.data.bestTimes[key] = t; this.save(); return true; }
    return false;
  },
};
