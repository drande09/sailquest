// Short, untimed drills. The same manual helm and sail controls drive every view.
const LESSONS = [
  { id: 'reach', title: 'Find your reach', subtitle: 'Feel the wind from the side', icon: '01',
    steps: [
      { title: 'Settle on a beam reach', angle: 90, tolerance: 12, hold: 6,
        text: 'Keep the wind beside you, about 90° from the bow. Adjust W / S until the sail fills, then hold your course.' },
      { title: 'Head up to a close reach', angle: 65, tolerance: 8, hold: 6,
        text: 'Turn the bow a little toward the wind. Pull the sail in with W as you turn. Stay outside the red no-go zone.' },
      { title: 'Bear away to a broad reach', angle: 135, tolerance: 12, hold: 6,
        text: 'Turn away from the wind until it comes from behind your shoulder. Ease the sail with S, then sail steadily.' }
    ] },
  { id: 'tack', title: 'Zigzag upwind', subtitle: 'Turn your bow through the wind', icon: '02',
    steps: [
      { title: 'Build speed close-hauled', angle: 53, tolerance: 7, hold: 5,
        text: 'Sail just outside the no-go zone with the sail pulled in. Build speed before beginning the tack.' },
      { title: 'Tack through the wind', action: 'tack', angle: -53, tolerance: 9, hold: 3,
        text: 'Turn the bow THROUGH the wind to the other side. The sail will flap briefly. Keep turning, then release the helm as the sail fills.' },
      { title: 'Tack back and climb upwind', action: 'tack', angle: 53, tolerance: 9, hold: 3,
        text: 'Build speed, then turn back through the wind. Two close-hauled courses make an upwind zigzag. The wake shows your path.' }
    ] },
  { id: 'downwind', title: 'Sail downwind', subtitle: 'Ease the sail and find a steady run', icon: '03',
    steps: [
      { title: 'Start on a broad reach', angle: 140, tolerance: 12, hold: 5,
        text: 'Put the wind behind your shoulder. Let the sail out with S until it is drawing well.' },
      { title: 'Bear away onto a run', angle: 172, tolerance: 7, hold: 6,
        text: 'Turn gently until the wind comes almost from behind. Let the sail well out. Keep the wind on this side of the stern to avoid an accidental gybe.' },
      { title: 'Return to a broad reach', angle: 140, tolerance: 12, hold: 5,
        text: 'Turn gently toward the wind on the SAME side. Bring the sail in a little. Compare the steadier broad reach with running.' }
    ] },
  { id: 'gybe', title: 'Make a smooth gybe', subtitle: 'Control the boom across the stern', icon: '04',
    steps: [
      { title: 'Approach on a broad reach', angle: 150, tolerance: 12, hold: 5,
        text: 'Sail with the wind behind your shoulder and the sail eased. Get steady before turning.' },
      { title: 'Bring the boom toward the middle', action: 'trim', angle: 150, tolerance: 15, hold: 2,
        text: 'Hold this course and pull the mainsheet in with W. This reduces how far the boom travels when the wind changes sides.' },
      { title: 'Turn the stern through the wind', action: 'gybe', angle: -150, tolerance: 12, hold: 4,
        text: 'Bear away through downwind, keeping the sheet in as the boom crosses. Then ease with S on the new broad reach and straighten the helm.' }
    ] }
];

const SailingGuide = {
  point(angle, noGo) {
    if (angle < noGo) return 'In the no-go zone';
    if (angle < noGo + 12) return 'Close-hauled';
    if (angle < 80) return 'Close reach';
    if (angle <= 100) return 'Beam reach';
    if (angle < 165) return 'Broad reach';
    return 'Running downwind';
  },
  idealSheet(boat, wind) {
    const a = Math.abs(boat.relWind(wind)) * DEG;
    return clamp(1 - (boat.sailState(a, boat.sheet).ideal - 5) / 85, 0, 1);
  },
  feedback(boat, wind) {
    const a = Math.abs(boat.relWind(wind)) * DEG;
    if (a < boat.p.noGo) return {state:'warn', title:'Sail is flapping', text:'Turn out of the red zone to fill the sail.'};
    const error = boat.sheet - this.idealSheet(boat, wind);
    if (boat.luffing || error < -.12) return {state:'warn', title:'Bring the sail in · W', text:'Pull in until the flapping stops.'};
    if (boat.overtrimmed || error > .12) return {state:'warn', title:'Ease the sail out · S', text:'Let the boom move out to catch the wind.'};
    return {state:'good', title:'Sail drawing well', text:'Hold your course and feel the boat accelerate.'};
  },
  drawDial(canvas, boat, wind, target) {
    const c=canvas.getContext('2d'),s=canvas.width,r=s*.37,cx=s/2,cy=s/2;
    c.clearRect(0,0,s,s);c.save();c.translate(cx,cy);
    c.fillStyle='rgba(11,43,54,.65)';c.beginPath();c.arc(0,0,r+7,0,TAU);c.fill();
    const sector=(a,b,col)=>{c.beginPath();c.moveTo(0,0);c.arc(0,0,r,(a-90)*RAD,(b-90)*RAD);c.closePath();c.fillStyle=col;c.fill();};
    sector(-boat.p.noGo,boat.p.noGo,'rgba(238,130,100,.36)');
    sector(80,100,'rgba(114,208,178,.18)');sector(260,280,'rgba(114,208,178,.18)');
    c.strokeStyle='rgba(220,239,230,.25)';c.lineWidth=1;
    for(let a=0;a<360;a+=15){const d=dirVec(a*RAD);c.beginPath();c.moveTo(d.x*(r-5),d.y*(r-5));c.lineTo(d.x*r,d.y*r);c.stroke();}
    c.font='600 10px system-ui';c.textAlign='center';c.fillStyle='#f0d7bb';c.fillText('NO GO',0,-r*.66);
    c.fillStyle='#b6d5d5';c.fillText('90°',-r-14,4);c.fillText('90°',r+14,4);c.fillText('RUN',0,r-10);
    c.fillStyle='#f2cc79';c.fillText('WIND FROM',0,-r-18);c.beginPath();c.moveTo(-5,-r-12);c.lineTo(5,-r-12);c.lineTo(0,-r-4);c.fill();
    if(target!==undefined && target!==null){
      const d=dirVec(target*RAD);c.strokeStyle='#f4c879';c.lineWidth=2;c.setLineDash([4,4]);c.beginPath();c.moveTo(0,0);c.lineTo(d.x*r,d.y*r);c.stroke();c.setLineDash([]);
      c.fillStyle='#f4c879';c.beginPath();c.arc(d.x*r,d.y*r,4,0,TAU);c.fill();
    }
    c.rotate(angDiff(wind.from,boat.heading));
    c.strokeStyle='rgba(227,241,228,.4)';c.setLineDash([3,5]);c.beginPath();c.moveTo(0,-21);c.lineTo(0,-r+3);c.stroke();c.setLineDash([]);
    c.fillStyle='#f6f0de';c.beginPath();c.moveTo(0,-22);c.quadraticCurveTo(13,-5,8,16);c.lineTo(-8,16);c.quadraticCurveTo(-13,-5,0,-22);c.fill();
    c.strokeStyle='#efb26b';c.lineWidth=3;c.beginPath();c.moveTo(0,-6);c.lineTo(-Math.sin(boat.boomAng)*23,Math.cos(boat.boomAng)*23-6);c.stroke();c.restore();
  }
};

class LessonMode extends BaseMode {
  constructor(g) {
    super(g);
    this.lesson=LESSONS.find(l=>l.id===g.lessonId)||LESSONS[0];this.index=0;this.held=0;this.eventSeen=false;this.trail=[];
    g.wind.baseKn=8;g.wind.baseFrom=0;g.wind.steady=true;g.wind.update(0);
    g.player.heading=90*RAD;g.player.sheet=.42;g.player._prevRel=null;
    this.origin={x:g.player.x,y:g.player.y};this.pathClock=0;
    this.renderStep();
  }
  get step(){return this.lesson.steps[this.index];}
  get targetAngle(){const a=this.step.angle;return Math.sign(a)*Math.max(Math.abs(a),this.g.player.p.noGo+7);}
  renderStep(){
    $('lessonTitle').textContent=this.done?'Well sailed!':this.step.title;
    $('lessonText').textContent=this.done?'You felt how steering and sail trim work together. Try again with the guides off, or choose the next lesson.':this.step.text;
    $('lessonCount').textContent=this.done?'PRACTICE COMPLETE':`${this.lesson.title.toUpperCase()} · ${this.index+1} / ${this.lesson.steps.length}`;
    $('lessonContinue').classList.toggle('hidden',!this.done);
    $('lessonProgress').max=this.step?.hold||1;$('lessonProgress').value=0;
    $('lessonPanel').classList.remove('hidden');
  }
  onBoatEvent(name,data){
    if(this.done)return;
    if(this.step.action==='tack'&&name==='tackDone')this.eventSeen=true;
    if(this.step.action==='gybe'&&name==='crossStern') {
      if(!data.hard&&this.g.player.sheet>=.6)this.eventSeen=true;
      else {this.eventSeen=false;this.feedback='Reset the drill and keep the sheet in as the boom crosses.';}
    }
  }
  update(dt){
    this.pathClock+=dt;if(this.pathClock>.4){this.pathClock=0;this.trail.push({x:this.g.player.x,y:this.g.player.y});if(this.trail.length>350)this.trail.shift();}
    if(this.done)return;
    const p=this.g.player,step=this.step;
    const err=angDiff(p.heading,this.g.wind.from+this.targetAngle*RAD)*DEG;
    const inHeading=Math.abs(err)<=step.tolerance;
    const eventOK=!['tack','gybe'].includes(step.action)||this.eventSeen;
    const trimOK=step.action==='trim'?p.sheet>=.72:p.eff>.73&&!p.luffing;
    const good=inHeading&&eventOK&&trimOK&&p.kn>(step.action==='trim'?.4:1.5);
    this.held=good?this.held+dt:Math.max(0,this.held-dt*.7);
    $('lessonProgress').value=this.held;
    if(good)this.feedback=`Good! Hold steady for ${Math.max(0,Math.ceil(step.hold-this.held))} more seconds.`;
    else if(!inHeading){
      let turn=err>0?'right · D':'left · A';
      this.feedback=`Steer ${turn} toward the gold heading on the wind dial.`;
    } else if(!eventOK) this.feedback=step.action==='tack'?'Turn through the wind from the other side to complete a tack.':'Keep the sheet in while the stern passes through the wind.';
    else if(step.action==='trim'&&!trimOK)this.feedback='Pull the sail in · W. Aim for at least 72% in.';
    else if(!trimOK)this.feedback=SailingGuide.feedback(p,this.g.wind).title;
    else this.feedback='Let the boat build speed before the next turn.';
    $('lessonFeedback').textContent=this.feedback;
    if(this.held>=step.hold){
      Sound.ding();this.held=0;this.eventSeen=false;
      if(this.index<this.lesson.steps.length-1){this.index++;this.renderStep();}
      else{this.done=true;const completed=Progress.data.lessons||(Progress.data.lessons={});if(!completed[this.lesson.id]){completed[this.lesson.id]=true;Progress.addStars(30,'Lesson complete');Progress.save();}this.renderStep();$('lessonFeedback').textContent='Keep exploring, repeat this lesson, or choose the next one.';}
    }
  }
  draw(){
    const c=Render.ctx;c.strokeStyle='rgba(249,212,132,.7)';c.lineWidth=2;c.beginPath();
    this.trail.forEach((p,i)=>{const s=Render.toScreen(p.x,p.y);if(i)c.lineTo(s.x,s.y);else c.moveTo(s.x,s.y);});c.stroke();
  }
  hud(){return 'Sailing school';}
}
