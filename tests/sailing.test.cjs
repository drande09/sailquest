const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
  const els = new Map();
  const element = id => { if (!els.has(id)) els.set(id, { classList: {add(){},remove(){},toggle(){}}, textContent:'',value:0 });return els.get(id); };
  const ctx = vm.createContext({ console, Math, $:element, Sound:{ding(){}}, Render:{},
    Progress:{data:{},addStars(){},save(){}}, UI:{} });
  for(const file of ['util','boats','modes','lessons']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),ctx);
  return vm.runInContext('({ Boat, Wind, LessonMode, SailingGuide, LESSONS, RAD, DEG, angDiff, clamp })',ctx);
}
const steady = S => {const w=new S.Wind(8);w.baseFrom=0;w.steady=true;w.update(0);return w;};
const settle = (b,w,sec=15) => {for(let t=0;t<sec;t+=1/60)b.update(1/60,w);};

test('steady lesson wind remains fixed, including speed changes',()=>{
  const S=setup(),w=steady(S);w.baseKn=11;w.update(500);assert.equal(w.from,0);assert.equal(w.kn,11);
});
test('a trimmed beam reach accelerates; pointing into wind loses drive',()=>{
  const S=setup(),w=steady(S),b=new S.Boat('opti',0,0,Math.PI/2);
  b.sheet=S.SailingGuide.idealSheet(b,w);settle(b,w);assert.ok(b.kn>4);
  b.heading=0;b.rudder=0;settle(b,w,12);assert.equal(b.eff,0);assert.ok(b.kn<1);assert.ok(b.luffing);
});
test('downwind calls for an eased sail; overtight trim is slower',()=>{
  const S=setup(),w=steady(S),a=new S.Boat('opti',0,0,172*S.RAD),b=new S.Boat('opti',0,0,172*S.RAD);
  a.sheet=S.SailingGuide.idealSheet(a,w);b.sheet=.95;settle(a,w);settle(b,w);
  assert.ok(a.sheet<.2);assert.ok(a.kn>b.kn*1.5);assert.equal(S.SailingGuide.feedback(b,w).state,'warn');
});
test('spawning on either tack or either side of downwind emits no maneuver',()=>{
  const S=setup(),w=steady(S);
  for(const degrees of [-179,-90,90,179]){const b=new S.Boat('opti',0,0,degrees*S.RAD),events=[];b.onEvent=n=>events.push(n);settle(b,w,1);assert.deepEqual(events,[]);}
});
test('heading up and falling off on the SAME side does not score a tack',()=>{
  const S=setup(),w=steady(S),b=new S.Boat('opti',0,0,55*S.RAD),events=[];b.spd=2;b.onEvent=n=>events.push(n);
  for(const h of [55,44,30,10,30,44,55]){b.heading=h*S.RAD;b.update(.05,w);}
  assert.ok(!events.includes('tackDone'));
});
test('a complete bow crossing scores a tack; stern crossing scores a gybe',()=>{
  const S=setup(),w=steady(S),b=new S.Boat('opti',0,0,55*S.RAD),events=[];b.spd=2;b.onEvent=n=>events.push(n);
  for(let h=55;h>=-55;h-=2){b.heading=h*S.RAD;b.update(.04,w);}
  assert.equal(events.filter(n=>n==='tackDone').length,1);assert.ok(!events.includes('crossStern'));
  events.length=0;b._prevRel=null;b.sheet=.8;
  for(let h=155;h<=205;h+=2){b.heading=h*S.RAD;b.update(.04,w);}
  assert.equal(events.filter(n=>n==='crossStern').length,1);assert.ok(!events.includes('tackDone'));
});
test('escaping after several seconds in irons produces recovery event',()=>{
  const S=setup(),w=steady(S),b=new S.Boat('opti',0,0,0),events=[];b.onEvent=n=>events.push(n);settle(b,w,5);b.heading=70*S.RAD;b.update(.05,w);assert.ok(events.includes('ironsEscape'));
});
test('all boat types have finite dynamics, including a reversal through north',()=>{
  const S=setup(),w=steady(S);
  for(const id of ['opti','sunfish','v15','j22','sloop','schooner','tallship']){
    const b=new S.Boat(id,0,0,2);b.rudder=.6;b.sheet=.5;settle(b,w,30);
    for(const n of ['heading','spd','heel','boomAng','x','y'])assert.ok(Number.isFinite(b[n]),`${id}.${n}`);
  }
});
test('all four lessons can be completed using only helm and sheet controls',()=>{
  const S=setup();
  for(const lesson of S.LESSONS){
    const g={lessonId:lesson.id,wind:steady(S),player:new S.Boat('opti')};const mode=new S.LessonMode(g);
    g.player.onEvent=(n,d)=>mode.onBoatEvent(n,d);
    for(let t=0;t<180&&!mode.done;t+=1/60){
      const b=g.player,err=S.angDiff(b.heading,g.wind.from+mode.targetAngle*S.RAD);
      b.rudder=S.clamp(err*2,-.72,.72);
      const trimAction=mode.step.action==='trim'||(mode.step.action==='gybe'&&!mode.eventSeen);
      b.sheet=trimAction?.8:S.SailingGuide.idealSheet(b,g.wind);
      b.update(1/60,g.wind);mode.update(1/60);
    }
    assert.ok(mode.done,`${lesson.id} got stuck on ${mode.index}: ${mode.feedback}`);
  }
});
test('waiting or sailing on the wrong heading cannot finish a lesson',()=>{
  const S=setup(),g={lessonId:'reach',wind:steady(S),player:new S.Boat('opti')},mode=new S.LessonMode(g);
  g.player.heading=0;for(let t=0;t<40;t+=.05){g.player.update(.05,g.wind);mode.update(.05);}
  assert.equal(mode.index,0);assert.equal(mode.done,false);
});

test('existing save progress survives migration and subsequent saves',()=>{
  const old={stars:825,equipped:{boat:'j22',hull:'red',sail:'striped',flag:'checker'},missionsDone:{tack1:true},unlockedCos:{'sail:striped':true},counters:{dist:560,tacks:8,gybes:2,cleanGybes:1,ducks:4},bestTimes:{tt2_opti:143}};
  let saved=JSON.stringify(old);
  const ctx=vm.createContext({localStorage:{getItem:()=>saved,setItem:(key,value)=>{saved=value;}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/progress.js'),'utf8'),ctx);
  vm.runInContext('Progress.load();Progress.data.view="fp";Progress.data.lessons={reach:true};Progress.save();',ctx);
  const result=JSON.parse(saved);
  assert.equal(result.stars,825);assert.equal(result.equipped.boat,'j22');assert.equal(result.equipped.sailor,'alex');
  assert.deepEqual(result.counters,old.counters);assert.deepEqual(result.missionsDone,old.missionsDone);assert.deepEqual(result.bestTimes,old.bestTimes);
  assert.equal(result.view,'fp');assert.equal(result.lessons.reach,true);
});
