import * as THREE from "three";
import { box, cylinder, ball, beam } from "../workshop/models.js";
export const RESIDENT_IDS = [
  "resident",
  "iara",
  "bento",
  "luz",
  "caua",
  "nina",
];
// Identity changes only the visible meshes: joint lengths and interaction anchors stay shared.
const looks = {
  resident: { hat: true, hair: "short", outfit: "shirt", width: 1 },
  iara: { hat: true, hair: "braid", outfit: "overalls", width: 0.9 },
  bento: { hair: "curls", outfit: "vest", width: 1.18, beard: true },
  luz: { hair: "bun", outfit: "apron", width: 1.07 },
  caua: { hair: "short", outfit: "shirt", width: 0.9, shorts: true, scarf: true },
  nina: { hair: "puffs", outfit: "overalls", width: 0.88, glasses: true },
};
const palettes = new Map();
function detailMaterial(color) {
  const key = `detail-${color}`;
  if (!palettes.has(key)) palettes.set(key, new THREE.MeshStandardMaterial({color, roughness: 1, side: THREE.DoubleSide}));
  return palettes.get(key);
}
function joint(parent, name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
export function createResident(id = "resident") {
  const look = looks[id] || looks.resident;
  const root = new THREE.Group(),
    hips = joint(root, "hips", 0, 0.9),
    head = joint(hips, "head", 0, 0.59);
  const torso = cylinder(hips, 0.25, 0.21, 0.44, "shirt", 0, 0.2, 0, 6);
  torso.scale.z = 0.68;
  torso.scale.x = look.width;
  ball(hips,.22,"trousers",0,-.015,0,[1,.55,.7],0);
  const clothes = joint(hips, "clothing");
  if (look.outfit === "overalls" || look.outfit === "apron") {
    const material = look.outfit === "apron" ? "plaster" : "trousers";
    box(clothes, 0.29*look.width, 0.28, 0.035, material, 0, 0.18, 0.16);
    for (const x of [-0.12, 0.12])
      box(clothes, 0.045, 0.19, 0.035, material, x, 0.34, 0.15);
    if (look.outfit === "overalls")
      for (const x of [-0.12, 0.12])
        box(clothes, 0.045, 0.3, 0.035, material, x, 0.29, -0.15);
    box(clothes, 0.13, 0.08, 0.015, material, 0, 0.15, 0.185);
    if(look.outfit==='apron')box(clothes,.38,.26,.04,material,0,-.06,.155);
  } else if (look.outfit === "vest") {
    for (const x of [-0.14, 0.14])
      box(clothes, 0.17, 0.36, 0.055, "earth", x, 0.20, 0.14);
    const back=box(clothes,.43,.34,.04,"earth",0,.21,-.145);
    back.geometry.dispose();
    back.geometry=new THREE.CylinderGeometry(.255,.215,.38,6,1,true,Math.PI/2,Math.PI);
    back.position.set(0,.2,0);
    back.scale.set(look.width,1,.7);
  }
  if(look.scarf){
    const scarf=box(clothes,.15,.15,.035,"teal",.07,.36,.15);
    scarf.rotation.z=-.5;
  }
  cylinder(hips, 0.075, 0.08, 0.12, "skin", 0, 0.47, 0, 6);
  ball(head, 0.235, "skin", 0, 0, 0, [0.91, 1.02, 0.88], 1);
  const shortHair = look.hair === "short" && !look.hat;
  if (look.hair !== "bun")
    ball(head, 0.245, "hair", 0, shortHair ? 0.13 : 0.08, -0.035,
      [0.94, shortHair ? 0.75 : 0.62, 0.91], 0);
  for (const s of [-1, 1]) {
    for(const [radius,material,x,y,z,scale] of [
      [.018,"hair",s*.075,.025,.192,[1,1.15,.5]],
      [.046,"skin",s*.205,0,-.005,[.6,1,.65]],
    ]){
      const detail=ball(head,radius,material,x,y,z,scale,0);
      detail.geometry.dispose();detail.geometry=new THREE.OctahedronGeometry(radius);
    }
  }
  ball(head, 0.033, "skin", 0, -0.025, 0.211, [.9,.85,.8],0);
  const mouth=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.035,-.087,.188),new THREE.Vector3(0,-.094,.196),new THREE.Vector3(.035,-.087,.188)]),new THREE.LineBasicMaterial({color:0x714c36}));
  head.add(mouth);
  const hairstyle = joint(head, "hairstyle");
  if (look.hat) {
    const brim = id === "iara" ? 0.38 : 0.34;
    cylinder(hairstyle, brim, brim, 0.045, "earth", 0, 0.19, 0, 8);
    cylinder(hairstyle, 0.15, 0.19, 0.15, "earth", 0, 0.285, 0, 6);
    cylinder(
      hairstyle,
      0.19,
      0.195,
      0.045,
      id === "iara" ? "teal" : "timber",
      0,
      0.23,
      0,
      6,
    );
  }
  if (look.hair === "braid") {
    for (let i = 0; i < 3; i++)
      ball(
        hairstyle,
        0.095 - i * 0.014,
        "hair",
        0.2,
        -0.08 - i * 0.11,
        0.08,
        [1, 1, 1],
        0,
      );
  }
  if (look.hair === "bun") {
    // A low bun joins the back of a fitted hair cap; the scarf follows
    // the forehead rather than forming a flat hat across the scalp.
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.247,8,3,0,Math.PI*2,0,Math.PI*.5),detailMaterial("#3a2a23"));
    cap.scale.set(.93,1,.91);cap.position.set(0,.06,-.018);hairstyle.add(cap);
    ball(hairstyle, 0.105, "hair", 0, 0.015, -0.235, [1, .95, .85], 0);
    const scarf=new THREE.Mesh(new THREE.TorusGeometry(.207,.045,3,8,Math.PI*1.3),detailMaterial("#b87351"));
    scarf.rotation.x=Math.PI/2;scarf.rotation.z=-Math.PI*.15;
    scarf.position.set(0,.105,-.01);hairstyle.add(scarf);
  }
  if (look.hair === "curls" || look.hair === "puffs") {
    for (const x of [-1, 1])
      ball(
        hairstyle,
        look.hair === "puffs" ? 0.15 : 0.125,
        "hair",
        x * (look.hair === "puffs" ? 0.24 : 0.14),
        look.hair === "puffs" ? 0.2 : 0.1,
        -0.065,
        [1, 1, 1],
        0,
      );
    ball(hairstyle, 0.14, "hair", 0, 0.19, -0.045, [1, 0.75, 1], 0);
  }
  if(look.glasses){
    const frames=joint(head,"glasses");
    for(const side of [-1,1]){
      const rim=new THREE.Mesh(new THREE.RingGeometry(.048,.062,8),detailMaterial("#5b4235"));
      rim.position.set(side*.077,.025,.213);frames.add(rim);
    }
    box(frames,.045,.014,.014,"timber",0,.025,.218);
  }
  if (look.beard)
    ball(hairstyle, 0.175, "hair", 0, -0.13, 0.07, [1, 0.65, 0.8], 0);
  const legs = [],
    arms = [];
  for (const s of [-1, 1]) {
    const hip = joint(hips, `hip-${s}`, s * 0.125),
      knee = joint(hip, `knee-${s}`, 0, -0.38);
    cylinder(hip, 0.105*look.width, 0.095*look.width, 0.38, "trousers", 0, -0.19, 0, 6);
    cylinder(knee, 0.095*look.width, 0.075*look.width, 0.42, look.shorts ? "skin" : "trousers", 0, -0.21, 0, 6);
    const shoe=cylinder(knee,.1,.11,.13,"timber",0,-.455,.055,6);
    shoe.scale.z=1.5;
    legs.push({ hip, knee, shoe });
    const shoulder = joint(hips, `shoulder-${s}`, s * 0.26, 0.29),
      elbow = joint(shoulder, `elbow-${s}`, 0, -0.26);
    cylinder(shoulder, 0.08, 0.07, 0.26, "shirt", 0, -0.13, 0, 6);
    if(look.shorts)cylinder(shoulder,.085,.085,.045,"plaster",0,-.24,0,6);
    cylinder(elbow, 0.055, 0.05, 0.25, "skin", 0, -0.125, 0, 6);
    ball(elbow, 0.065, "skin", 0, -0.25, 0, [0.8, 1, 1], 0);
    arms.push({ shoulder, elbow });
  }
  const cargo = joint(hips, "carried-crate", 0, 0.14, 0.42);
  box(cargo, 0.55, 0.04, 0.4, "timber", 0, -0.15, 0);
  for (const z of [-0.19, 0.19])
    box(cargo, 0.55, 0.3, 0.035, "timberLight", 0, 0, z);
  for (const x of [-0.26, 0.26])
    box(cargo, 0.035, 0.3, 0.4, "timberLight", x, 0, 0);
  cargo.visible = false;
  const can = joint(hips, "watering-can", 0.26, 0.04, 0.5);
  cylinder(can, 0.13, 0.15, 0.25, "teal", 0, 0, 0, 8);
  beam(can, [0, -0.04, 0.08], [0, 0.05, 0.35], 0.04, "teal");
  can.visible = false;
  const stream = joint(can, "water");
  for (let i = 0; i < 4; i++)
    cylinder(
      stream,
      0.012,
      0.012,
      0.12,
      "glass",
      (i % 2) * 0.025 - 0.012,
      -0.15 - i * 0.12,
      0.35,
      4,
    );
  const bowl = new THREE.Group();
  cylinder(bowl,.12,.08,.06,'plaster',0,0,0,8);
  ball(bowl,.07,'shirt',0,.035,0,[1,.3,1],0);
  arms[0].elbow.add(bowl);bowl.position.set(0,-.21,.07);bowl.visible=false;
  const book = new THREE.Group();
  box(book,.28,.025,.2,'teal',0,0,0);
  box(book,.24,.015,.17,'plaster',0,.018,0);
  arms[0].elbow.add(book);book.position.set(0,-.2,.08);book.visible=false;
  const joints = [
    hips,
    head,
    ...legs.flatMap((l) => [l.hip, l.knee, l.shoe]),
    ...arms.flatMap((a) => [a.shoulder, a.elbow]),
  ];
  const rig = { root, hips, head, legs, arms, cargo, can, stream, bowl, book, joints };
  root.rig = rig;
  root.name = id;
  const i = RESIDENT_IDS.indexOf(id) - 1;
  if (i >= 0) {
    const shirt = ["#d6af52", "#397c86", "#b9684b", "#7a954d", "#967caa"][i],
      skin = ["#bb8055", "#8d573a", "#bd8159", "#b77b4e", "#915a3c"][i];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const hex = o.material.color.getHexString(),
        color = hex === "d3ad58" ? shirt : hex === "b87950" ? skin : hex === "496e62" ? ["#496e62","#48535b","#7e7560","#b59a6b","#a56c4d"][i] : hex === "b68a59" && id === "bento" ? "#9a704e" : null;
      if (color) {
        if (!palettes.has(color)) {
          const m = o.material.clone();
          m.color.set(color);
          palettes.set(color, m);
        }
        o.material = palettes.get(color);
      }
    });
  }
  // Softer facial lighting without increasing the shared low-poly budget.
  head.traverse(o=>{
    if(!o.isMesh)return;
    const key=`face-${o.material.uuid}`;
    if(!palettes.has(key)){const m=o.material.clone();m.flatShading=false;palettes.set(key,m);}
    o.material=palettes.get(key);
  });
  poseResident(rig, "idle", 0);
  return root;
}
function reach(arm, y, z) {
  const dy = y - 0.29,
    d = Math.min(0.509, Math.max(0.02, Math.hypot(dy, z)));
  arm.shoulder.rotation.x =
    -Math.atan2(z, -dy) +
    Math.acos(
      THREE.MathUtils.clamp(
        (0.26 ** 2 + d * d - 0.25 ** 2) / (2 * 0.26 * d),
        -1,
        1,
      ),
    );
  arm.elbow.rotation.x =
    -Math.PI +
    Math.acos(
      THREE.MathUtils.clamp(
        (0.26 ** 2 + 0.25 ** 2 - d * d) / (2 * 0.26 * 0.25),
        -1,
        1,
      ),
    );
}
export function poseResident(rig, action, time, blend = 1) {
  const { hips, head, legs, arms, cargo, can, stream } = rig,
    phase = time * 8;
  const previous = [];
  if (blend < 1)
    for (const g of rig.joints)
      previous.push([g, g.position.clone(), g.quaternion.clone()]);
  hips.position.set(0, 0.9, 0);
  hips.rotation.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  for (const l of legs) {
    l.hip.rotation.set(0, 0, 0);
    l.knee.rotation.set(0, 0, 0);
  }
  for (const a of arms) {
    a.shoulder.rotation.set(0, 0, 0);
    a.elbow.rotation.set(0, 0, 0);
  }
  cargo.visible = action === "carry" || action === "carry-walk";
  can.visible = action === "water";
  rig.bowl.visible = action === "eat";
  const reading=action==="read" || action==="ground-read";
  const groundSeated=action==="fire-sit" || action==="ground-read" || action==="ground-relax";
  rig.book.visible = reading;
  if (action === "walk" || action === "carry-walk") {
    hips.position.y += 0.015 * (1 - Math.cos(phase * 2));
    hips.rotation.z = Math.sin(phase) * 0.025;
    head.rotation.z = -hips.rotation.z * 0.6;
    legs.forEach((l, i) => {
      const p = phase + i * Math.PI;
      l.hip.rotation.x = Math.sin(p) * 0.48;
      l.knee.rotation.x = Math.max(0, -Math.sin(p)) ** 2 * 0.65;
    });
    arms.forEach((a, i) => {
      a.shoulder.rotation.x = -Math.sin(phase + i * Math.PI) * 0.35;
      a.elbow.rotation.x = -0.12;
    });
  } else hips.position.y += Math.sin(time * 2) * 0.003;
  if (action === "duck-walk") {
    hips.position.y = 0.68 + Math.sin(phase * 2) * 0.01;
    hips.rotation.x = 0.28;
    head.rotation.x = -0.18;
    legs.forEach((l, i) => {
      l.hip.rotation.x = -0.65 + Math.sin(phase + i * Math.PI) * 0.18;
      l.knee.rotation.x = 1.05;
    });
    arms.forEach((a) => {
      a.shoulder.rotation.x = -0.25;
      a.elbow.rotation.x = -0.35;
    });
  }
  if (action === "sit") {
    hips.position.y = 0.62 + Math.sin(time * 2) * 0.003;
    legs.forEach((l) => {
      l.hip.rotation.x = -1.35;
      l.knee.rotation.x = 1.35;
    });
    arms.forEach((a) => reach(a, 0.12, 0.29));
  }
  if (groundSeated) {
    hips.position.y=.15;
    hips.rotation.x=.06;
    legs.forEach((l,i)=>{
      l.hip.rotation.x=-1.61;
      l.hip.rotation.z=(i?1:-1)*.14;
      l.knee.rotation.x=.1;
    });
    head.rotation.y=Math.sin(time*.35)*.12;
    // Alternate warming hands and resting them on the lap while watching the fire.
    const warmth=action==='fire-sit' ? .5+.5*Math.sin(time*.65) : 0;
    arms.forEach((a,i)=>{
      a.shoulder.rotation.x=-.35-warmth*.35;
      a.elbow.rotation.x=-.8-warmth*.25;
      a.shoulder.rotation.z=(i?1:-1)*.1;
    });
  }
  if (action === "rest") {
    hips.position.y = 0.86 + Math.sin(time * 2) * 0.003;
    hips.rotation.z = -1.25;
    head.rotation.z = 0.15;
    legs.forEach((l) => {
      l.hip.rotation.z = -0.5;
      l.knee.rotation.z = 0.12;
    });
    arms.forEach((a) => {
      a.shoulder.rotation.z = 0.25;
      a.elbow.rotation.x = -0.25;
    });
  }
  if (["work", "wash", "water", "tend"].includes(action)) {
    hips.rotation.x = action === "tend" ? 0.55 : 0.12;
    head.rotation.x = 0.15;
    legs.forEach((l) => (l.hip.rotation.x = -hips.rotation.x));
    if (action === "tend") {
      hips.position.y = 0.68;
      hips.position.z = 0.25;
      legs.forEach((l) => {
        l.hip.rotation.x = -1.35;
        l.knee.rotation.x = 1.5;
      });
    }
    arms.forEach((a, i) =>
      reach(
        a,
        (action === "tend" ? -0.12 : 0.08) + Math.sin(time * 3 + i) * 0.045,
        0.34 + Math.cos(time * 3 + i) * 0.035,
      ),
    );
    if (action === "wash")
      arms.forEach((a, i) => (a.shoulder.rotation.z = i === 0 ? 0.25 : -0.25));
    if (action === "water") {
      can.rotation.x = 0.3 + Math.sin(time * 2) * 0.12;
      stream.scale.y = 0.85 + Math.sin(time * 10) * 0.15;
    }
  }
  if (action === "look" || action === "breathe") {
    head.rotation.y = Math.sin(time * 0.45) * 0.32;
    hips.rotation.z = Math.sin(time * 0.55) * 0.025;
    if (action === "breathe") arms.forEach((a) => (a.elbow.rotation.x = -0.25));
  }
  if (action === "chat") {
    head.rotation.x = Math.sin(time * 2) * 0.06;
    arms[0].shoulder.rotation.x = -0.3 + Math.sin(time * 1.5) * 0.12;
    arms[0].elbow.rotation.x = -0.65 + Math.sin(time * 2) * 0.16;
    head.rotation.y = Math.sin(time * 0.7) * 0.09;
  }
  if (action === "wave") {
    head.rotation.y=-.08;
    arms[0].shoulder.rotation.z=-2.35+Math.sin(time*4.5)*.15;
    arms[0].shoulder.rotation.x=-.15;
    arms[0].elbow.rotation.x=-.4+Math.sin(time*4.5)*.12;
    arms[1].elbow.rotation.x=-.12;
  }
  if (action === "listen") {
    const nod=Math.max(0,Math.sin(time*1.4));
    head.rotation.x=.04+nod*nod*.13;
    head.rotation.z=.06;
    arms.forEach(a=>{a.shoulder.rotation.x=-.08;a.elbow.rotation.x=-.22;});
  }
  if (action === "laugh") {
    const chuckle=Math.max(0,Math.sin(time*5));
    hips.rotation.x=-.04+chuckle*.035;
    head.rotation.x=-.12+chuckle*.05;
    head.rotation.z=Math.sin(time*1.4)*.05;
    arms.forEach(a=>{a.shoulder.rotation.x=-.4+chuckle*.07;a.elbow.rotation.x=-.65;});
  }
  if (action === "neck-stretch") {
    head.rotation.z=Math.sin(time*.75)*.28;
    head.rotation.x=.08;
    arms.forEach(a=>{a.shoulder.rotation.x=.05;a.elbow.rotation.x=-.12;});
  }
  if (action === "shoulder-roll") {
    head.rotation.x=.04;
    arms.forEach((a,i)=>{
      a.shoulder.rotation.x=Math.sin(time*1.4+i*.35)*.2;
      a.shoulder.rotation.z=(i?1:-1)*(.14+Math.cos(time*1.4+i*.35)*.08);
      a.elbow.rotation.x=-.3;
    });
  }
  if (action === "yawn") {
    head.rotation.x=-.12;
    head.rotation.z=-.06;
    arms[1].shoulder.rotation.x=-1.05;
    arms[1].shoulder.rotation.z=-.4;
    arms[1].elbow.rotation.x=-1.65+Math.sin(time*1.5)*.04;
    arms[0].shoulder.rotation.x=.1;
    arms[0].elbow.rotation.x=-.15;
  }
  if (action === "stretch") {
    const amount = 0.5 - 0.5 * Math.cos(time * 0.9);
    arms.forEach((a, i) => {
      a.shoulder.rotation.z = (i ? 1 : -1) * amount * 1.7;
      a.elbow.rotation.x = -0.25;
    });
    hips.rotation.z = Math.sin(time * 0.9) * 0.045;
  }
  if (action === "eat" || reading) {
    head.rotation.x=.15+Math.sin(time*1.8)*.025;
    arms[0].shoulder.rotation.x=-.65;
    arms[0].elbow.rotation.x=-.9;
    arms[1].shoulder.rotation.x=action==='eat' ? -.75-Math.sin(time*2.6)*.25 : -.6;
    arms[1].elbow.rotation.x=action==='eat' ? -1.2-Math.sin(time*2.6)*.3 : -.9;
    if(reading){
      // Briefly reach across the open book to turn a page, then read again.
      const turn=Math.max(0,Math.sin(time*.65))**8;
      arms[1].shoulder.rotation.z=-turn*.55;
      arms[1].shoulder.rotation.x-=turn*.15;
      arms[1].elbow.rotation.x-=turn*.35;
      head.rotation.y=Math.sin(time*.65)*.045;
    }
  }
  if (action === "bathe") {
    hips.rotation.z=Math.sin(time*1.5)*.035;
    head.rotation.x=.12;
    arms.forEach((a,i)=>{
      a.shoulder.rotation.x=-1.8+Math.sin(time*2+i*Math.PI)*.2;
      a.shoulder.rotation.z=(i?1:-1)*.2;
      a.elbow.rotation.x=-1.2+Math.sin(time*3+i)*.25;
    });
  }
  if (action === "pee") {
    hips.rotation.x=.07;head.rotation.x=.15+Math.sin(time*.8)*.015;
    arms.forEach((a,i)=>{a.shoulder.rotation.x=-.15;a.shoulder.rotation.z=(i?1:-1)*.1;a.elbow.rotation.x=-.5;});
  }
  if (action === "toilet") {
    hips.position.y=.58+Math.sin(time*1.7)*.003;hips.rotation.x=.18;head.rotation.x=.1+Math.sin(time)*.02;
    legs.forEach(l=>{l.hip.rotation.x=-1.25;l.knee.rotation.x=1.5;});
    arms.forEach(a=>{a.shoulder.rotation.x=-.5;a.elbow.rotation.x=-.3;});
  }
  if (action === "play") {
    hips.rotation.z=Math.sin(time*2)*.08;
    hips.position.y+=Math.sin(time*4)*.015;
    arms.forEach((a,i)=>{a.shoulder.rotation.x=-.4+Math.sin(time*2+i)*.3;a.elbow.rotation.x=-.6;});
    head.rotation.y=Math.sin(time)*.2;
  }
  if (cargo.visible) arms.forEach((a) => reach(a, 0.2, 0.36));
  if(action==='eat'||reading){
    const forearm=hips.rotation.x+arms[0].shoulder.rotation.x+arms[0].elbow.rotation.x;
    rig.bowl.rotation.x=-forearm;
    rig.book.rotation.x=-forearm-.5;
  }
  for(const l of legs)l.shoe.rotation.x=action==='rest'?0:-(hips.rotation.x+l.hip.rotation.x+l.knee.rotation.x);
  if(['duck-walk','tend','wave','listen','laugh','neck-stretch','shoulder-roll','yawn'].includes(action)){
    rig.root.updateMatrixWorld(true);
    const rootY=rig.root.getWorldPosition(new THREE.Vector3()).y;
    const sole=Math.min(...legs.map(l=>new THREE.Box3().setFromObject(l.shoe).min.y));
    hips.position.y+=(rootY-sole)/rig.root.getWorldScale(new THREE.Vector3()).y;
  }
  if(groundSeated){
    rig.root.updateMatrixWorld(true);
    const rootY=rig.root.getWorldPosition(new THREE.Vector3()).y;
    const lowest=Math.min(...legs.map(l=>new THREE.Box3().setFromObject(l.hip).min.y));
    hips.position.y+=Math.max(0,(rootY+.015-lowest)/rig.root.getWorldScale(new THREE.Vector3()).y);
  }
  const alpha = THREE.MathUtils.clamp(blend, 0, 1);
  for (const [g, p, q] of previous) {
    g.position.lerpVectors(p, g.position, alpha);
    g.quaternion.slerpQuaternions(q, g.quaternion.clone(), alpha);
  }
  rig.root.updateMatrixWorld(true);
}

// Capture the displayed pose once, then ease toward the live target over a fixed
// duration. This avoids frame-rate-dependent lag and supports interrupted changes.
export function animateResident(rig, action, time, dt) {
  if (rig.motion?.action !== action) {
    rig.motion = {
      action,
      elapsed: 0,
      from: rig.joints.map((j) => [j.position.clone(), j.quaternion.clone()]),
    };
  }
  const motion = rig.motion;
  motion.elapsed += Math.max(0, dt);
  poseResident(rig, action, time);
  const t = Math.min(1, motion.elapsed / 0.45);
  const weight = t * t * t * (t * (t * 6 - 15) + 10);
  if (t < 1)
    rig.joints.forEach((j, i) => {
      j.position.lerpVectors(motion.from[i][0], j.position, weight);
      j.quaternion.slerpQuaternions(
        motion.from[i][1],
        j.quaternion.clone(),
        weight,
      );
    });
  rig.root.updateMatrixWorld(true);
}
