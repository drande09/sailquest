import * as THREE from 'three';

// The sailing simulation stays in world metres: X east, Z south, Y up.
// A boat points down local -Z, so clockwise compass headings use -rotation.y.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .65, ...extra });
const mesh = (g, m, parent, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o;
};
function rod(parent, a, b, radius, material) {
  const delta = b.clone().sub(a);
  const o = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), material, parent);
  o.position.copy(a).add(b).multiplyScalar(.5);
  o.quaternion.setFromUnitVectors(V(0, 1, 0), delta.normalize());
  return o;
}
function dispose(group) {
  const mats = new Set(), geos = new Set(), textures = new Set();
  group.traverse(o => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
  });
  for (const m of mats) { if (m.map) textures.add(m.map); m.dispose(); }
  for (const g of geos) g.dispose();
  for (const t of textures) t.dispose();
  group.clear();
}

function sailTexture(id) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = { red: '#de604a', sunset: '#efb165', bolt: '#344f65', star: '#305677', shark: '#b4cbd4' }[id] || '#faf4dc';
  ctx.fillRect(0, 0, 512, 512);
  if (id === 'striped' || id === 'rainbow') {
    const colors = id === 'rainbow' ? ['#de604a', '#edb353', '#f5da78', '#79b69b', '#538da5'] : ['#f8f0dd', '#d56852'];
    for (let y = 0; y < 512; y += 64) { ctx.fillStyle = colors[(y / 64) % colors.length]; ctx.fillRect(0, y, 512, 64); }
  }
  ctx.strokeStyle = 'rgba(59,78,85,.15)'; ctx.lineWidth = 2;
  for (let y = 0; y < 512; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(91,91,70,.35)'; ctx.lineWidth = 10; ctx.strokeRect(2, 2, 508, 508);
  ctx.fillStyle = id === 'bolt' || id === 'star' ? '#f7d071' : '#204d61';
  ctx.font = 'bold 74px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText({ shark: '▲', bolt: 'ϟ', star: '★' }[id] || 'SQ', 230, 230);
  ctx.font = '38px sans-serif'; ctx.fillText('09', 230, 282);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function flagTexture(id) {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=160;
  const c=canvas.getContext('2d');c.fillStyle=id==='pirate'?'#263b43':'#f2e6c9';c.fillRect(0,0,256,160);
  if(id==='checker'){
    c.fillStyle='#243b45';for(let y=0;y<4;y++)for(let x=0;x<6;x++)if((x+y)%2===0)c.fillRect(x*43,y*40,43,40);
  }else if(id==='usa'){
    c.fillStyle='#c96a59';for(let y=0;y<13;y+=2)c.fillRect(0,y*160/13,256,160/13);
    c.fillStyle='#355976';c.fillRect(0,0,110,86);c.fillStyle='#f5eddb';
    for(let y=0;y<5;y++)for(let x=0;x<6;x++)c.fillRect(8+x*17,7+y*15,4,4);
  }else{c.font='100px sans-serif';c.textAlign='center';c.fillStyle='#f3e4c3';c.fillText(id==='pirate'?'☠':'🎉',128,118);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

function cloth(parent, width, height, texture, square = false) {
  const g = new THREE.PlaneGeometry(1, 1, 16, 16);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i), v = uv.getY(i), taper = square ? 1 - .25 * v : 1 - .96 * v;
    pos.setXYZ(i, 0, v * height, u * width * taper);
  }
  g.computeVertexNormals();
  const o = mesh(g, mat('#ffffff', { map: texture, side: THREE.DoubleSide, roughness: .95 }), parent);
  o.userData.base = Float32Array.from(pos.array);
  return o;
}

function makeBoat(b) {
  const group = new THREE.Group(), L = b.p.lengthM, B = b.p.beamM;
  const hullColor = { wood: '#ba7745', blue: '#276d8e', red: '#c65043', green: '#42866e', pink: '#d9769b', black: '#243d4b' }[b.cosmetics.hull] || '#ba7745';
  const hullMat = mat(hullColor), deckMat = mat('#eee9d6'), wood = mat('#b07b4b'), dark = mat('#293e46'), rope = mat('#f2d8a7');
  const hull = new THREE.Group(); group.add(hull);
  // Lofted hull, with the open cockpit built separately above the waterline.
  const stations = b.p.hull === 'pram' ? [[-.5,.27],[-.35,.48],[0,.5],[.35,.46],[.5,.38]] : [[-.51,.005],[-.34,.35],[0,.5],[.32,.43],[.5,.29]];
  const positions = [], indices = [];
  for (const [z, w] of stations) {
    positions.push(-w*B, .16*B, z*L, -w*B*.74, -.16*B, z*L, 0, -.29*B, z*L,
      w*B*.74, -.16*B, z*L, w*B, .16*B, z*L);
  }
  for(let s=0;s<stations.length-1;s++) for(let j=0;j<4;j++) {
    const a=s*5+j; indices.push(a,a+5,a+1,a+1,a+5,a+6);
  }
  const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(positions,3)); geom.setIndex(indices); geom.computeVertexNormals();
  hullMat.side = THREE.DoubleSide; mesh(geom,hullMat,hull);
  for (const sign of [-1,1]) {
    for(let s=0;s<stations.length-1;s++) {
      const a=stations[s],c=stations[s+1];
      rod(hull,V(sign*a[1]*B,.18*B,a[0]*L),V(sign*c[1]*B,.18*B,c[0]*L),.035*B,deckMat);
    }
    mesh(new THREE.BoxGeometry(B*.17,B*.08,L*.63),deckMat,hull,sign*B*.34,.13*B,.09*L);
  }
  mesh(new THREE.BoxGeometry(B*.68,B*.06,L*.59),wood,hull,0,-.11*B,.12*L);
  for(const z of [-.13,.3]) mesh(new THREE.BoxGeometry(B*.82,B*.07,L*.09),deckMat,hull,0,.16*B,z*L);
  mesh(new THREE.BoxGeometry(B*.55,B*.32,L*.035),hullMat,hull,0,0,.49*L);
  const bowDeck = new THREE.Shape(); bowDeck.moveTo(0,-.49*L); bowDeck.lineTo(.35*B,-.27*L); bowDeck.lineTo(-.35*B,-.27*L); bowDeck.closePath();
  const bd=mesh(new THREE.ShapeGeometry(bowDeck),deckMat,hull,0,.16*B,0); bd.rotation.x=Math.PI/2;
  const mastH = b.typeId === 'opti' ? 2.55 : L*(L>12?.8:1.05), mastZ=-.22*L;
  rod(hull,V(0,.12,mastZ),V(0,mastH,mastZ),.018*B,dark);
  if(b.typeId !== 'opti') for(const side of [-1,1]) rod(hull,V(side*B*.4,.18*B,0),V(0,mastH*.8,mastZ),.006*B,rope);
  const sailMatTexture = sailTexture(b.cosmetics.sail);
  const boom = new THREE.Group(); boom.position.set(0,.52*B,mastZ); hull.add(boom);
  const width = L*.66, height=mastH-.52*B;
  rod(boom,V(),V(0,0,width),.025*B,dark);
  const main = cloth(boom,width,height,sailMatTexture,b.typeId==='opti');
  if(b.typeId === 'opti') rod(boom,V(0,height*.25,0),V(0,height,width*.73),.012*B,wood);
  // Small moving yarn on the leech makes filled versus flapping sail visible.
  const telltale = rod(boom,V(0,height*.5,width*.48),V(.0,height*.5,width*.48+.28*B),.011*B,mat('#d66147'));
  let jib=null,jibCloth=null;
  if(b.p.hasJib) {
    jib=new THREE.Group(); jib.position.set(0,.23*B,-.48*L); hull.add(jib);
    jibCloth=cloth(jib,L*.29,mastH*.78,sailMatTexture);
    rod(hull,V(0,.23*B,-.48*L),V(0,mastH*.8,mastZ),.006*B,rope);
  }
  // Preserve the larger boats' distinctive extra rigs.
  const extraSails=[];
  if(b.p.hull==='schooner') {
    rod(hull,V(0,0,.15*L),V(0,mastH*.87,.15*L),.018*B,dark);
    const rig=new THREE.Group();rig.position.set(0,.7*B,.15*L);hull.add(rig);
    extraSails.push({rig,cloth:cloth(rig,L*.32,mastH*.65,sailMatTexture)});
  }
  if(b.p.hull==='ship') {
    main.visible=false; boom.visible=false;
    for(const z of [-.24,.08,.33]) {
      rod(hull,V(0,0,z*L),V(0,mastH,z*L),.025*B,wood);
      for(const level of [.4,.65,.85]) {
        const yard=mesh(new THREE.PlaneGeometry(B*1.6,mastH*.18,8,8),mat('#f1e5ce',{side:THREE.DoubleSide}),hull,0,mastH*level,z*L);
        rod(hull,V(-B*.85,mastH*(level+.09),z*L),V(B*.85,mastH*(level+.09),z*L),.025*B,wood);
      }
    }
  }
  const tiller=new THREE.Group();tiller.position.set(0,.15*B,.48*L);hull.add(tiller);
  rod(tiller,V(),V(0,.13*B,-.34*L),.022*B,wood);
  mesh(new THREE.BoxGeometry(B*.035,B*.55,L*.16),dark,tiller,0,-.23*B,.04*L);
  const sailor=new THREE.Group();sailor.position.set(-.27*B,.24*B,.25*L);hull.add(sailor);
  const ch = {alex:['#ffd9a8','#de604a'],mia:['#ffd9a8','#d9769b'],zoe:['#a86a3c','#906bbb'],kai:['#a86a3c','#4a9eae'],lily:['#ffe0c4','#66a580'],sam:['#8a5a2b','#e9bf5a']}[b.cosmetics.sailor] || ['#ffd9a8','#de604a'];
  const personScale=Math.min(1.2,B*.7);sailor.scale.setScalar(personScale);
  mesh(new THREE.CapsuleGeometry(.14,.23,4,8),mat('#ec8742'),sailor,0,.21,0);
  mesh(new THREE.SphereGeometry(.13,12,8),mat(ch[0]),sailor,0,.53,0);
  mesh(new THREE.SphereGeometry(.14,12,8,0,Math.PI*2,0,Math.PI/2),mat(ch[1]),sailor,0,.56,0);
  mesh(new THREE.BoxGeometry(.23,.025,.15),mat(ch[1]),sailor,0,.56,-.12);
  for(const s of [-1,1]) rod(sailor,V(s*.12,.24,0),V(s*.16,0,-.19),.06,mat('#284c60'));
  const flag=new THREE.Group(); flag.position.set(0,mastH,mastZ);hull.add(flag);
  if(b.cosmetics.flag !== 'none') {
    if(!b.cosmetics.flag||b.cosmetics.flag==='burgee'){
      const fg=new THREE.BufferGeometry(); fg.setAttribute('position',new THREE.Float32BufferAttribute([0,.15,0,0,.15,.37*B,0,-.02,0],3));fg.computeVertexNormals();
      mesh(fg,mat('#e57854',{side:THREE.DoubleSide}),flag);
    }else{
      const f=mesh(new THREE.PlaneGeometry(.4*B,.25*B),mat('#ffffff',{map:flagTexture(b.cosmetics.flag),side:THREE.DoubleSide}),flag,0,.06,.2*B);f.rotation.y=Math.PI/2;
    }
  }
  return {group,hull,boom,main,jib,jibCloth,tiller,sailor,flag,telltale,extraSails,L,B,mastH};
}

const waveGLSL = `
float wave(vec2 p, float t) {
  return sin(p.x*.28+p.y*.17-t*1.3)*.095 + sin(p.x*.53-p.y*.38+t*1.05)*.045 + sin(p.y*.91+p.x*.25-t*1.9)*.018;
}`;

class SailingScene {
  constructor(canvas) {
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure=1.15;
    this.scene=new THREE.Scene(); this.scene.fog=new THREE.Fog('#b6d7d7',240,1300);
    this.camera=new THREE.PerspectiveCamera(55,1,.06,3000);
    this.scene.add(new THREE.HemisphereLight('#d4edff','#638d83',2.6));
    const sun=new THREE.DirectionalLight('#fff0ce',3);sun.position.set(-100,180,-150);this.scene.add(sun);
    const sky=mesh(new THREE.SphereGeometry(2400,24,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
      vertexShader:'varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec3 vP; void main(){float h=normalize(vP).y;vec3 c=mix(vec3(.77,.88,.86),vec3(.19,.52,.69),smoothstep(0.,.7,h));float s=pow(max(dot(normalize(vP),normalize(vec3(-.4,.48,-.65))),0.),180.);gl_FragColor=vec4(c+s*vec3(1.,.84,.52),1.);}'
    }),this.scene);this.sky=sky;
    this.waterMaterial=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uEye:{value:V()}},
      vertexShader:`uniform float uTime; varying vec3 vWorld; ${waveGLSL}
      void main(){vec4 wp=modelMatrix*vec4(position,1.);wp.y=wave(wp.xz,uTime);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
      fragmentShader:`uniform float uTime; uniform vec3 uEye; varying vec3 vWorld; ${waveGLSL}
      void main(){vec2 p=vWorld.xz;float e=.1;float h=wave(p,uTime);
      vec3 n=normalize(vec3((h-wave(p+vec2(e,0.),uTime))/e,1.,(h-wave(p+vec2(0.,e),uTime))/e));
      n.x+=sin(p.x*3.+p.y*2.+uTime)*.027;n.z+=cos(p.y*3.3-p.x+uTime)*.027;n=normalize(n);
      vec3 eye=normalize(uEye-vWorld);float fres=pow(1.-max(dot(eye,n),0.),3.);
      vec3 col=mix(vec3(.006,.095,.125),vec3(.17,.36,.41),fres);
      col+=vec3(.001,.023,.018)*(sin(p.x*.035+p.y*.019)+1.);
      vec3 light=normalize(vec3(-.4,.65,-.5));float spec=pow(max(dot(n,normalize(eye+light)),0.),160.);
      col+=spec*vec3(1.,.9,.64)*1.5;
      float foam=smoothstep(.135,.16,h)*.1;col+=foam;
      float fog=1.-exp(-length(vWorld-uEye)*.0013);col=mix(col,vec3(.66,.81,.81),fog);
      gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`
    });
    const waterGeo=new THREE.PlaneGeometry(2600,2600,220,220);waterGeo.rotateX(-Math.PI/2);
    this.water=mesh(waterGeo,this.waterMaterial,this.scene);
    this.scenery=new THREE.Group();this.scene.add(this.scenery);this.buildScenery();
    this.objects=new THREE.Group();this.scene.add(this.objects);this.boats=new Map();this.items=new Map();
    this.wake=mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:'#d6f2e9',transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide}),this.scene);this.wake.visible=false;
    this.wakeGroup=new THREE.Group();this.scene.add(this.wakeGroup);this.wakes=[];
    const wakeGeo=new THREE.RingGeometry(.72,1,20);wakeGeo.rotateX(-Math.PI/2);
    for(let i=0;i<40;i++) {const w=mesh(wakeGeo,new THREE.MeshBasicMaterial({color:'#d8f3e7',transparent:true,opacity:0,depthWrite:false}),this.wakeGroup);this.wakes.push(w);}
    this.windArrows=[];
    for(let i=0;i<18;i++) {const a=new THREE.ArrowHelper(V(0,0,-1),V(),2.1,0xe4eed7,.6,.36);this.scene.add(a);a.line.material.transparent=true;a.line.material.opacity=.24;a.cone.material.transparent=true;a.cone.material.opacity=.36;this.windArrows.push(a);}
    this.guide=new THREE.Group();this.scene.add(this.guide);
    const coneGeo=new THREE.CircleGeometry(28,36,Math.PI/2-Math.PI/4,Math.PI/2);coneGeo.rotateX(-Math.PI/2);
    this.noGo=mesh(coneGeo,new THREE.MeshBasicMaterial({color:'#e78365',transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false}),this.guide,0,.17,0);
    this.courseLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:'#ffdc8c',dashSize:2,gapSize:2,transparent:true,opacity:.7}));this.scene.add(this.courseLine);
    this.startLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:'#f0ecdd',dashSize:2,gapSize:1,transparent:true,opacity:.75}));this.scene.add(this.startLine);
    this.yaw=0;this.pitch=0;this.lastView=null;this.lastBoat=null;this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();addEventListener('resize',()=>this.resize());
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.failed=true;canvas.hidden=true;window.dispatchEvent(new Event('sailquest-3d-lost'));});
    let pointer=null;
    canvas.addEventListener('pointerdown',e=>{pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!pointer || pointer.id!==e.pointerId)return;this.yaw-=(e.clientX-pointer.x)*.006;this.pitch=THREE.MathUtils.clamp(this.pitch+(e.clientY-pointer.y)*.003,-.35,.5);pointer.x=e.clientX;pointer.y=e.clientY;});
    const release=()=>{pointer=null;};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
    canvas.addEventListener('dblclick',()=>this.center());
  }
  resize() {this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.quality==='low'?1:1.65));this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
  center(){this.yaw=0;this.pitch=0;}
  buildScenery(){
    const rock=mat('#648981',{flatShading:true}),sand=mat('#c6bf96',{flatShading:true}),tree=mat('#3b6c63',{flatShading:true});
    for(let i=0;i<13;i++) {
      const a=i*.49, r=700+(i%3)*150, x=Math.sin(a)*r,z=Math.cos(a)*r;
      const hill=mesh(new THREE.IcosahedronGeometry(1,2),rock,this.scenery,x,-12,z);hill.scale.set(130+(i%4)*20,35+(i%3)*19,85);
      const beach=mesh(new THREE.IcosahedronGeometry(1,2),sand,this.scenery,x,-15,z);beach.scale.set(145+(i%4)*20,20,95);
      for(let j=0;j<7;j++) {const tr=mesh(new THREE.ConeGeometry(9,30,6),tree,this.scenery,x+(j-3)*19,22+(j%3)*8,z);}
    }
    const lighthouse=new THREE.Group();lighthouse.position.set(-390,1,-660);this.scenery.add(lighthouse);
    mesh(new THREE.IcosahedronGeometry(1,1),sand,lighthouse,0,-7,0).scale.set(85,14,55);
    mesh(new THREE.CylinderGeometry(5,7,40,14),mat('#eee8d4'),lighthouse,0,20,0);
    mesh(new THREE.CylinderGeometry(5.5,5.5,6,14),mat('#c9614b'),lighthouse,0,29,0);
    mesh(new THREE.CylinderGeometry(7,7,1,14),mat('#304c58'),lighthouse,0,40,0);
    mesh(new THREE.CylinderGeometry(4,4,6,10),mat('#efcb7a',{emissive:'#8f7433',emissiveIntensity:.6}),lighthouse,0,43,0);
    mesh(new THREE.ConeGeometry(8,6,14),mat('#c9614b'),lighthouse,0,49,0);
    const cloud=mat('#eaf2ed',{flatShading:false});
    for(let i=0;i<16;i++){const a=i*.6;for(let j=0;j<4;j++)mesh(new THREE.SphereGeometry(1,10,8),cloud,this.scenery,Math.sin(a)*950+j*35,160+(i%4)*25,Math.cos(a)*950).scale.set(55,15+j*4,28);}
  }
  reset(){dispose(this.objects);this.boats.clear();this.items.clear();this.lastBoat=null;}
  boat(b,t,isPlayer,view){
    let model=this.boats.get(b);
    if(!model){model=makeBoat(b);this.boats.set(b,model);this.objects.add(model.group);}
    model.group.position.set(b.x,model.B*.2+Math.sin(t*1.3+b.x*.28+b.y*.17)*.025,b.y);model.group.rotation.y=-b.heading;
    model.hull.rotation.z=b.heel;model.hull.rotation.x=this.reducedMotion?0:Math.sin(t*1.4)*.012;
    model.boom.rotation.y=-b.boomAng;if(model.jib)model.jib.rotation.y=-b.jibAng;
    model.tiller.rotation.y=b.rudder*.55;model.sailor.visible=!(isPlayer&&view==='fp');
    model.sailor.position.x=(b.relWind(this.wind)>0?1:-1)*model.B*.27;
    model.flag.rotation.y=-(b.relWind(this.wind)+Math.PI);
    const animate=(s)=>{const p=s.geometry.attributes.position,base=s.userData.base;for(let i=0;i<p.count;i++){const v=s.geometry.attributes.uv.getY(i),u=s.geometry.attributes.uv.getX(i);const belly=Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*model.B*.12;const flap=b.luffing?Math.sin(t*22+v*15+u*12)*u*model.B*.08:0;p.setX(i,base[i*3]+belly*Math.sign(b.boomAng||1)+flap);}p.needsUpdate=true;s.geometry.computeVertexNormals();};
    animate(model.main);if(model.jibCloth)animate(model.jibCloth);
    for(const s of model.extraSails){s.rig.rotation.y=-b.boomAng;animate(s.cloth);}
    model.telltale.rotation.y=b.luffing?Math.sin(t*18)*.8:Math.sin(t*4)*.04;
    return model;
  }
  item(key,type,data,t){
    let o=this.items.get(key);
    if(!o){
      o=new THREE.Group();
      if(type==='ring') {const tor=mesh(new THREE.TorusGeometry(8,.16,6,56),mat('#f7d178',{emissive:'#c99c31',emissiveIntensity:.3}),o);tor.rotation.x=Math.PI/2;}
      else if(type==='duck') {
        const yellow=mat('#efc65e');mesh(new THREE.SphereGeometry(.65,12,8),yellow,o,0,.24,0).scale.set(1,.7,1.5);
        mesh(new THREE.SphereGeometry(.38,12,8),yellow,o,0,.8,-.5);
        mesh(new THREE.ConeGeometry(.18,.45,4),mat('#e67d43'),o,0,.74,-.95).rotation.x=-Math.PI/2;
        for(const s of [-1,1])mesh(new THREE.SphereGeometry(.045,8,6),mat('#263b42'),o,s*.26,.89,-.74);
      } else if(type==='shot'){mesh(new THREE.SphereGeometry(.3,8,6),mat('#b9e7fa',{emissive:'#6bb4d3',emissiveIntensity:.4}),o);}
      else {
        const color=data.color||'#e59451';mesh(new THREE.CylinderGeometry(.6,1.1,1.5,16),mat(color),o,0,.5,0);
        mesh(new THREE.TorusGeometry(.83,.12,8,24),mat('#fff3d6'),o,0,.7,0).rotation.x=Math.PI/2;
        rod(o,V(0,1,0),V(0,3.4,0),.045,mat('#455d62'));
        const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.Float32BufferAttribute([0,3.4,0,1.3,3.1,0,0,2.7,0],3));fg.computeVertexNormals();mesh(fg,mat(data.flagColor||'#efc56b',{side:THREE.DoubleSide}),o);
      }
      this.objects.add(o);this.items.set(key,o);
    }
    o.visible=!data.got;o.position.set(data.x,type==='shot'?.8:.12+Math.sin(t*1.6+data.x)*.06,data.y);return o;
  }
  draw(game,dt){
    if(this.failed)return false;
    const p=game.player,t=game.visualTime||0,view=game.running?game.view:'chase';this.wind=game.wind;
    if(this.lastBoat!==p){this.reset();this.lastBoat=p;}
    const model=this.boat(p,t,true,view);
    const mode=game.running?game.mode:null;
    for(const o of this.items.values())o.visible=false;
    if(mode){
      for(const list of [mode.racers,mode.enemies])for(const r of list||[])this.boat(r.boat,t,false,view);
      for(const m of mode.course?.marks||[])this.item(m,'mark',m,t);
      for(const r of mode.rings||[])this.item(r,'ring',r,t);
      for(const d of mode.ducks||[])this.item(d,'duck',d,t);
      for(const pr of mode.projectiles||[])this.item(pr,'shot',pr,t);
      for(const [key,o] of this.items)if(!o.visible){this.objects.remove(o);dispose(o);this.items.delete(key);}
    }
    const target=mode?.wp?.()||mode?.nextRing?.()||mode?.target;
    this.startLine.visible=!!mode?.course;
    if(mode?.course){const {pinA,pinB}=mode.course;this.startLine.geometry.dispose();this.startLine.geometry=new THREE.BufferGeometry().setFromPoints([V(pinA.x,.2,pinA.y),V(pinB.x,.2,pinB.y)]);this.startLine.computeLineDistances();}
    if(target && !mode?.done){this.courseLine.visible=true;this.courseLine.geometry.dispose();this.courseLine.geometry=new THREE.BufferGeometry().setFromPoints([V(p.x,.2,p.y),V(target.x,.2,target.y)]);this.courseLine.computeLineDistances();}
    else this.courseLine.visible=false;
    const len=model.L;
    let yaw=this.yaw, heading=p.heading;
    if(!game.running){yaw=.65;heading=p.heading;}
    if(view!==this.lastView){this.center();this.lastView=view;this.cameraReady=false;}
    const a=heading+yaw;
    let eye,look;
    if(view==='fp'){
      const windward=(p.relWind(game.wind)>0?1:-1)*.43*model.B;
      this.seatOffset=this.seatOffset===undefined?windward:THREE.MathUtils.lerp(this.seatOffset,windward,Math.min(dt*3,1));
      const off=this.seatOffset;
      eye=V(p.x-Math.sin(heading)*len*.38+Math.cos(heading)*off,Math.max(1.04,model.B*.92),p.y+Math.cos(heading)*len*.38+Math.sin(heading)*off);
      if(!this.reducedMotion)eye.y+=Math.sin(t*1.3)*.025;
      look=eye.clone().add(V(Math.sin(a)*40,-2+this.pitch*35,-Math.cos(a)*40));
    }else{
      const back=Math.max(9,len*2.7),elev=Math.max(3.5,len*1.0);
      eye=V(p.x-Math.sin(a)*back,elev+this.pitch*10,p.y+Math.cos(a)*back);
      look=V(p.x,model.mastH*.37,p.y);
    }
    // Stable horizon: look around without borrowing the boat's roll.
    this.camera.position.copy(eye);this.camera.lookAt(look);this.camera.updateMatrixWorld();
    this.water.position.set(p.x,0,p.y);this.sky.position.copy(this.camera.position);
    this.scenery.position.set(Math.round(p.x/800)*800,0,Math.round(p.y/800)*800);
    this.waterMaterial.uniforms.uTime.value=t;this.waterMaterial.uniforms.uEye.value.copy(this.camera.position);
    this.guide.position.set(p.x,0,p.y);this.guide.rotation.y=-game.wind.from;
    this.noGo.visible=game.running&&game.showGuides&&view!=='fp';
    if(this.noGo.userData.angle!==p.p.noGo){this.noGo.geometry.dispose();const rad=p.p.noGo*Math.PI/180;this.noGo.geometry=new THREE.CircleGeometry(28,36,Math.PI/2-rad,rad*2);this.noGo.geometry.rotateX(-Math.PI/2);this.noGo.userData.angle=p.p.noGo;}
    const air=V(-Math.sin(game.wind.from),0,Math.cos(game.wind.from));
    this.windArrows.forEach((w,i)=>{w.visible=game.running&&game.showGuides;w.setDirection(air);const travel=t*game.wind.kn*.6;w.position.set(p.x+((i*19+air.x*travel)%64+64)%64-32,.35,p.y+((i*31+air.z*travel)%64+64)%64-32);});
    this.wakes.forEach((w,i)=>{const tr=p.trail[Math.max(0,p.trail.length-1-i)];w.visible=!!tr&&i<p.trail.length&&i%2===0;if(tr){w.position.set(tr.x,.13,tr.y);const age=1-tr.a;w.scale.set(model.B*(.4+age*1.3),1,model.B*(.3+age));w.material.opacity=tr.a*.14;}});
    this.renderer.render(this.scene,this.camera);
    return true;
  }
  project(x,z,y=1){
    const point=V(x,y,z).project(this.camera);if(point.z>1||point.z< -1)return null;
    return {x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2};
  }
}
window.SailingScene=SailingScene;
