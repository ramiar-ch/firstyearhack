function createCityLandmarks({THREE, mergeGeometries, buildings, names, roofs, project, contains, addCircle}) {
  const TAU = Math.PI * 2;
  const group = new THREE.Group();
  group.name = 'Detailed landmarks';
  const stone = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.87});
  const metal = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.44, metalness: 0.38});
  const windows = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.35, emissive: 0xe1b883, emissiveIntensity: 0});
  const clockFaces = [], omitted = new Set(), styles = new Map();
  const clockHands = [];
  let fountain, towerFootprint;

  const limestone = 0xc7bba5, lightStone = 0xd6cbb7, shadeStone = 0x9e9280;
  const towerStone = 0xb8a582, towerTrim = 0xccb590, lead = 0x41494c, gold = 0xaa8a47;
  const darkGlass = 0x333b40, iron = 0x39434a;

  function bounds(ring) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x,z] of ring) {
      x0 = Math.min(x0,x); x1 = Math.max(x1,x);
      z0 = Math.min(z0,z); z1 = Math.max(z1,z);
    }
    return {x0,x1,z0,z1,x:(x0+x1)/2,z:(z0+z1)/2};
  }

  function within(part, site, margin) {
    return part.x0 >= site.x0-margin && part.x1 <= site.x1+margin &&
      part.z0 >= site.z0-margin && part.z1 <= site.z1+margin;
  }

  // Each landmark shares its materials across merged meshes. Local +Z faces the street.
  function model(name, x, z, yaw = 0) {
    const root = new THREE.Group(), materials = new Map();
    root.name = name;
    root.position.set(x,0,z);
    root.rotation.y = yaw;
    group.add(root);
    function frame(tx=0, tz=0, angle=0) {
      const matrix = new THREE.Matrix4().makeRotationY(angle).setPosition(tx,0,tz);
      function mesh(geometry, color, mat=stone) {
        const geo = geometry.index ? geometry.toNonIndexed() : geometry;
        if (geo !== geometry) geometry.dispose();
        geo.applyMatrix4(matrix);
        geo.deleteAttribute('uv');
        const tint = new THREE.Color(color), count = geo.attributes.position.count;
        const values = new Float32Array(count*3);
        for (let i=0; i<count; i++) tint.toArray(values,i*3);
        geo.setAttribute('color',new THREE.BufferAttribute(values,3));
        if (!materials.has(mat)) materials.set(mat,[]);
        materials.get(mat).push(geo);
      }
      const box = (w,h,d,x,y,z,c,mat) => mesh(new THREE.BoxGeometry(w,h,d).translate(x,y,z),c,mat);
      function round(top,base,h,x,y,z,c,mat,segments=24) {
        const geo = new THREE.CylinderGeometry(top,base,h,segments);
        if (segments===4) geo.rotateY(Math.PI/4);
        mesh(geo.translate(x,y,z),c,mat);
      }
      function profile(points,x,z,c,mat,segments=32) {
        mesh(new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),segments).translate(x,0,z),c,mat);
      }
      function beam(from,to,radius,c,mat,segments=6) {
        const a=new THREE.Vector3(...from), b=new THREE.Vector3(...to), axis=b.clone().sub(a);
        const mid=a.lerp(b,0.5), rot=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis.clone().normalize());
        mesh(new THREE.CylinderGeometry(radius,radius,axis.length(),segments).applyQuaternion(rot).translate(mid.x,mid.y,mid.z),c,mat);
      }
      function shape(points,depth,x,y,z,color,mat) {
        const path = new THREE.Shape(points.map(p=>new THREE.Vector2(...p)));
        const geo = depth ? new THREE.ExtrudeGeometry(path,{depth,bevelEnabled:false}) : new THREE.ShapeGeometry(path);
        mesh(geo.translate(x,y,z),color,mat);
      }
      return {mesh,box,round,profile,beam,shape};
    }
    function finish() {
      for (const [mat,parts] of materials) {
        const merged = mergeGeometries(parts);
        parts.forEach(geo=>geo.dispose());
        const mesh = new THREE.Mesh(merged,mat);
        mesh.castShadow = mat!==windows;
        mesh.receiveShadow = true;
        root.add(mesh);
      }
    }
    return {root,frame,finish};
  }

  function archPoints(width, height, rise, pointed) {
    const points=[[-width/2,0],[width/2,0]];
    for (let i=0; i<=16; i++) {
      const t=1-i/8;
      const crown=pointed ? Math.pow(1-Math.abs(t),0.63) : Math.sqrt(1-t*t);
      points.push([t*width/2,height-rise+rise*crown]);
    }
    return points;
  }

  function opening(face,x,y,z,w,h,rise,{pointed=false,frame=lightStone,fill=darkGlass,border=0.20,lit=false}={}) {
    face.shape(archPoints(w+2*border,h+border,rise+border,pointed),0.11,x,y,z,frame);
    face.shape(archPoints(w,h,rise,pointed),0,x,y+0.012,z+0.12,fill,lit?windows:stone);
  }

  function column(face,x,y,z,r,h,color=limestone) {
    face.box(r*2.55,0.27,r*2.55,x,y+0.135,z,color);
    face.profile([[r*1.22,y+0.27],[r*1.22,y+0.40],[r*1.04,y+0.54],[r,y+0.66],
      [r*0.84,y+h-0.71],[r*0.95,y+h-0.53],[r*1.18,y+h-0.33],[r*1.23,y+h-0.16]],x,z,color,stone,12);
    face.box(r*2.6,0.18,r*2.6,x,y+h-0.09,z,color);
  }

  function cornice(face,w,y,d,z,color=lightStone) {
    face.box(w,0.25,d,0,y-0.25,z,color);
    face.box(w+0.22,0.20,d+0.22,0,y,z,color);
    face.box(w+0.40,0.13,d+0.35,0,y+0.15,z,color);
  }

  function pediment(face,w,y,z,h,color=lightStone) {
    face.shape([[-w/2,0],[w/2,0],[0,h]],0.30,0,y,z,color);
    face.shape([[-w*0.42,0.25],[w*0.42,0.25],[0,h*0.82]],0,0,y,z+0.31,shadeStone);
    const e=w/2;
    face.beam([-e,y,z+0.30],[0,y+h,z+0.30],0.13,color,stone,5);
    face.beam([0,y+h,z+0.30],[e,y,z+0.30],0.13,color,stone,5);
  }

  function solidColumn(root,x,z,radius) {
    const p = new THREE.Vector3(x,0,z).applyAxisAngle(new THREE.Vector3(0,1,0),root.rotation.y).add(root.position);
    addCircle(p.x,p.z,radius);
  }

  function dialTexture() {
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=512;
    const ctx=canvas.getContext('2d');
    ctx.translate(256,256);
    ctx.fillStyle='#e7dfc9';ctx.fillRect(-256,-256,512,512);
    for (const [r,width,color] of [[241,13,'#273b4c'],[226,3,'#9e834b'],[210,2,'#384651'],[144,4,'#9d824d'],[135,3,'#3b4a54'],[71,3,'#415262']]) {
      ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.stroke();
    }
    for (let i=0;i<60;i++) {
      ctx.save();ctx.rotate(i*TAU/60);ctx.fillStyle='#354552';
      ctx.fillRect(i%5===0?-3:-1.5,-224,i%5===0?6:3,i%5===0?18:10);ctx.restore();
    }
    ctx.font='bold 36px Georgia,serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#263747';
    const labels=['XII','I','II','III','IV','V','VI','VII','VIII','IX','F','XI'];
    for (const [i,label] of labels.entries()) {
      const a=i*TAU/12;
      ctx.fillText(label,178*Math.sin(a),-178*Math.cos(a));
      ctx.strokeStyle='#746d5a';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(72*Math.sin(a),-72*Math.cos(a));ctx.lineTo(133*Math.sin(a),-133*Math.cos(a));ctx.stroke();
    }
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=4;
    return texture;
  }

  function elizabethTower(outline) {
    const site=bounds(outline.ring);
    const parts=buildings.filter(b=>b.pt&&within(bounds(b.ring),site,0.32));
    const roof=parts.find(b=>b.m>=57&&b.H>=75&&b.ring.length===4);
    if (!roof) return;
    parts.forEach(b=>omitted.add(b));
    towerFootprint=outline.ring;
    const [a,b]=roof.ring;
    const tower=model('Elizabeth Tower',site.x,site.z,Math.atan2(a[1]-b[1],b[0]-a[0]));
    const core=tower.frame();
    core.box(12.55,5.4,12.55,0,2.7,0,shadeStone);
    core.box(11.7,46.0,11.7,0,25.8,0,towerStone);
    core.box(12.3,12.4,12.3,0,54.0,0,towerStone);
    core.box(9.3,8.1,9.3,0,63.8,0,shadeStone);
    for (const [y,w,height] of [[3.4,12.8,0.55],[11.3,12.0,0.32],[29.8,12.08,0.30],
      [46.9,12.65,0.50],[48.4,12.95,0.68],[59.75,12.95,0.55],[61.2,11.5,0.44],[67.9,10.7,0.65]]) {
      core.box(w,height,w,0,y,0,towerTrim);
    }
    const square = width=>width/Math.SQRT2;
    core.round(square(7.1),square(10.4),5.1,0,70.75,0,lead,metal,4);
    core.round(square(3.7),square(7.1),12.5,0,79.55,0,lead,metal,4);
    core.round(square(2.4),square(3.7),3.4,0,87.5,0,lead,metal,4);
    for (const x of [-1,1]) for (const z of [-1,1]) {
      core.beam([x*5.2,68.25,z*5.2],[x*3.55,73.30,z*3.55],0.095,0x857862,metal);
      core.beam([x*3.55,73.30,z*3.55],[x*1.85,85.80,z*1.85],0.066,0x76716b,metal);
    }
    core.round(0.22,1.68,4.9,0,91.65,0,lead,metal,8);
    core.round(0.12,0.12,2.2,0,94.7,0,gold,metal,8);
    core.mesh(new THREE.SphereGeometry(0.27,10,7).translate(0,95.96,0),gold,metal);
    for (const x of [-5.31,5.31]) for (const z of [-5.31,5.31]) {
      core.box(1.16,43.8,1.16,x,25.9,z,towerTrim);
      core.box(1.02,17.1,1.02,x,57.05,z,towerTrim);
      core.round(0.12,0.91,4.6,x,67.9,z,towerTrim,stone,8);
      core.round(0.09,0.12,1.0,x,70.5,z,gold,metal,6);
    }
    const tex=dialTexture();
    const dial=new THREE.MeshStandardMaterial({map:tex,emissiveMap:tex,emissive:0xf1deb3,emissiveIntensity:0,roughness:0.72});
    clockFaces.push(dial);
    const handMat=new THREE.MeshStandardMaterial({color:0x273d51,roughness:0.42,metalness:0.38});
    for (let side=0;side<4;side++) {
      const yaw=side*Math.PI/2;
      const face=tower.frame(0,0,yaw);
      for (const x of [-4.16,4.16]) {
        face.box(0.35,39.0,0.24,x,26.4,5.92,towerTrim);
        for (const y of [7.4,18.3,31.8,39.7]) face.box(0.65,0.28,0.37,x,y,6.01,shadeStone);
      }
      for (const y of [12.5,20.5,32.5,40.2]) {
        for (const x of [-1.07,1.07]) opening(face,x,y,5.86,0.67,3.2,0.53,{pointed:true,border:0.16,frame:towerTrim});
      }
      for (const x of [-2.85,0,2.85]) {
        opening(face,x,61.5,4.67,1.49,5.7,1.23,{pointed:true,border:0.15,frame:towerTrim,fill:iron});
        for (let i=0;i<7;i++) face.box(1.35,0.11,0.10,x,61.96+i*0.54,4.84,0x79776b);
      }
      face.mesh(new THREE.CircleGeometry(4.01,64).translate(0,55.0,6.19),iron,metal);
      face.mesh(new THREE.TorusGeometry(3.73,0.15,8,64).translate(0,55.0,6.24),gold,metal);
      face.mesh(new THREE.TorusGeometry(3.94,0.07,6,64).translate(0,55.0,6.23),towerTrim);
      for (const x of [-4.62,4.62]) {
        face.box(0.18,7.6,0.12,x,55.0,6.22,gold,metal);
        face.mesh(new THREE.OctahedronGeometry(0.25).translate(x,58.6,6.34),gold,metal);
      }
      for (const y of [50.2,59.8]) face.box(7.6,0.17,0.13,0,y,6.27,gold,metal);
      const layer=new THREE.Group();
      layer.rotation.y=yaw;
      tower.root.add(layer);
      const faceMesh=new THREE.Mesh(new THREE.CircleGeometry(3.55,64),dial);
      faceMesh.position.set(0,55.0,6.26);
      layer.add(faceMesh);
      const hands=[];
      for (const [length,width] of [[1.88,0.19],[2.79,0.135]]) {
        const pivot=new THREE.Group(), hand=new THREE.Shape([new THREE.Vector2(-width/2,-0.29),new THREE.Vector2(width/2,-0.29),
          new THREE.Vector2(width*0.64,length-0.48),new THREE.Vector2(0,length),new THREE.Vector2(-width*0.64,length-0.48)]);
        pivot.position.set(0,55,6.31+hands.length*0.021);
        pivot.add(new THREE.Mesh(new THREE.ShapeGeometry(hand),handMat));
        layer.add(pivot);
        hands.push(pivot);
      }
      const pin=new THREE.Mesh(new THREE.CircleGeometry(0.155,14),handMat);
      pin.position.set(0,55,6.37);layer.add(pin);
      clockHands.push(hands);
    }
    tower.finish();
  }

  function cathedral(outline) {
    const site=bounds(outline.ring);
    const oldDome=buildings.find(b=>b.pt&&(b.m??0)>58&&roofs[b.rs]==='dome'&&
      within(bounds(b.ring),site,0)&&bounds(b.ring).x1-bounds(b.ring).x0>25);
    if (!oldDome) return;
    const {x,z}=bounds(oldDome.ring);
    const domeSite={x0:x-21,x1:x+21,z0:z-21,z1:z+21};
    for (const b of buildings) {
      if (b.pt&&(b.m??0)>=41&&within(bounds(b.ring),domeSite,0)) omitted.add(b);
    }
    const dome=model("St Paul's dome",x,z), core=dome.frame();
    core.round(18.4,19.9,1.20,0,41.3,0,shadeStone);
    core.round(17.6,18.9,1.02,0,42.36,0,lightStone);
    core.round(13.1,15.1,19.7,0,53.15,0,limestone);
    core.round(17.0,17.7,0.84,0,45.35,0,lightStone);
    for (let i=0;i<32;i++) {
      const a=i*TAU/32, nx=Math.sin(a), nz=Math.cos(a);
      column(core,nx*15.8,45.55,nz*15.8,0.56,14.94,lightStone);
      if (i%4===2) {
        const bay=dome.frame(nx*14.52,nz*14.52,a);
        opening(bay,0,48.3,0.02,1.28,6.25,0.67,{border:0.19,fill:0x4b5255});
      }
    }
    for (const [radius,y,h] of [[16.8,60.65,0.48],[17.2,61.20,0.58],[17.75,61.81,0.55],[18.0,62.32,0.36],[17.55,63.56,0.28]]) {
      core.round(radius,radius,h,0,y,0,lightStone);
    }
    for (let i=0;i<64;i++) {
      const a=i*TAU/64;
      core.round(0.105,0.14,1.03,17.1*Math.sin(a),62.94,17.1*Math.cos(a),limestone,stone,8);
    }
    core.round(15.8,16.3,2.36,0,64.65,0,shadeStone);
    const curve=[[15.60,65.5],[15.78,67.4],[15.69,70.0],[15.09,73.2],[14.19,76.5],
      [12.75,79.8],[10.81,82.9],[8.47,85.4],[5.9,87.3],[3.74,88.06]];
    core.profile(curve,0,0,lead,metal,64);
    for (let i=0;i<16;i++) {
      const a=i*TAU/16;
      const pos=([r,y])=>[(r+0.065)*Math.sin(a),y,(r+0.065)*Math.cos(a)];
      for (let k=1;k<curve.length;k++) core.beam(pos(curve[k-1]),pos(curve[k]),0.070,0x687073,metal,5);
    }
    core.round(3.75,4.45,0.80,0,88.51,0,limestone);
    core.round(4.28,4.36,0.28,0,89.15,0,lightStone);
    core.round(2.32,2.65,7.52,0,93.08,0,shadeStone,stone,12);
    for (let i=0;i<8;i++) {
      const a=i*TAU/8;
      column(core,Math.sin(a)*2.91,89.36,Math.cos(a)*2.91,0.29,7.9,lightStone);
    }
    core.round(3.37,3.37,0.45,0,97.43,0,lightStone);
    core.profile([[3.0,97.56],[2.84,98.57],[2.2,99.74],[1.38,100.92],[0.69,102.12]],0,0,limestone,stone,24);
    core.round(0.63,0.86,2.5,0,103.02,0,limestone,stone,12);
    core.mesh(new THREE.SphereGeometry(0.65,16,10).translate(0,104.6,0),gold,metal);
    core.round(0.12,0.15,5.84,0,108.05,0,gold,metal,8);
    core.box(3.1,0.28,0.25,0,108.62,0,gold,metal);
    dome.finish();

    const [wx,wz]=project(51.5137445,-0.0994326);
    const west=model("St Paul's west portico",wx,wz,-Math.PI/2+0.10), face=west.frame();
    for (let i=0;i<4;i++) face.box(22-i*0.33,0.18,3.65-i*0.66,0,0.1+i*0.17,0.98-i*0.29,shadeStone);
    for (const x of [-9.7,-5.8,-1.94,1.94,5.8,9.7]) {
      column(face,x,0.78,1.40,0.65,11.97,lightStone);
      solidColumn(west.root,x,1.40,0.78);
    }
    for (const x of [-5.8,0,5.8]) opening(face,x,1.03,0.36,2.65,6.35,1.38,{border:0.35,fill:0x554a3d});
    cornice(face,22.3,13.02,2.6,1.28);
    for (const x of [-6.0,-2.05,2.05,6.0]) column(face,x,13.19,1.11,0.46,9.8,lightStone);
    cornice(face,15.68,23.25,2.2,1.28);
    pediment(face,15.60,23.4,2.16,4.6,lightStone);
    west.finish();
  }

  function bushHouse() {
    const [x,z]=project(51.5130730,-0.1173640);
    const bush=model('Bush House · Kingsway entrance',x,z,-2.786), face=bush.frame();
    opening(face,0,0.12,0.34,11.55,21.45,5.77,{border:0.42,fill:0x777061,frame:lightStone});
    opening(face,0,0.27,0.47,10.34,20.8,5.17,{border:0.20,fill:0x695f51,frame:shadeStone});
    for (let row=0;row<3;row++) {
      const r=4.93-row*0.60;
      for (let i=1;i<12;i++) {
        const a=i*Math.PI/12;
        const geo=new THREE.BoxGeometry(0.52,0.36,0.1).rotateZ(a-Math.PI/2).translate(r*Math.cos(a),15.83+r*Math.sin(a),0.52);
        face.mesh(geo,row%2===0?0x908470:0x857968);
      }
    }
    for (const side of [-1,1]) {
      const sx=side*3.98;
      column(face,sx,0.20,0.96,0.67,16.6,lightStone);
      solidColumn(bush.root,sx,0.96,0.83);
      face.box(0.92,0.28,0.58,side*2.67,17.41,0.92,shadeStone);
      face.mesh(new THREE.SphereGeometry(0.58,12,8).scale(0.71,1.48,0.64).translate(side*2.67,18.14,0.92),lightStone);
      face.mesh(new THREE.SphereGeometry(0.23,10,7).translate(side*2.67,19.04,0.93),lightStone);
      face.box(0.42,14.04,0.35,side*7.24,7.05,0.31,shadeStone);
    }
    cornice(face,11.15,17.07,1.29,0.85);
    for (const x of [-2.76,0,2.76]) {
      face.box(2.18,3.95,0.10,x,2.02,0.66,0x363f43);
      face.box(0.09,3.85,0.10,x,2.1,0.74,0x716352,metal);
      face.box(2.17,0.11,0.10,x,3.32,0.73,0x716352,metal);
    }
    cornice(face,16,24,0.58,0.33);
    bush.finish();
  }

  function somersetCourt() {
    const [x,z]=project(51.5110775,-0.1171475);
    const yaw=0.433,width=54.5,depth=68.5;
    const court=model('Somerset House · Fountain Court',x,z,yaw), face=court.frame();
    face.box(width,0.055,depth,0,0.040,0,0xa29c8f);
    face.box(45.0,0.014,60.0,0,0.066,0,0xb6afa0);
    for (let i=-10;i<=10;i++) face.box(0.045,0.009,59.8,i*2.07,0.078,0,0x989183);
    for (let i=-14;i<=14;i++) face.box(44.8,0.009,0.045,0,0.080,i*2.05,0xa0998a);
    const nozzles=[];
    for (let row=-3;row<=3;row++) for (let col=-2;col<=2;col++) {
      const u=col*2.35,v=row*2.26;
      face.round(0.12,0.12,0.026,u,0.087,v,0x706d66,metal,10);
      nozzles.push([u,v]);
    }
    const jets=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.028,0.041,1,7),
      new THREE.MeshStandardMaterial({color:0xaec4c8,emissive:0x7c9094,emissiveIntensity:0.28,metalness:0.13,roughness:0.31,transparent:true,opacity:0.64,depthWrite:false}),nozzles.length);
    jets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    jets.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,0.9,0),10.2);
    jets.name='Fountain Court jets';
    court.root.add(jets);
    fountain={jets,nozzles,x,z,yaw,width,depth};
    court.finish();

    for (const entrance of [
      [51.5107590,-0.1169093,-2.71,'South Wing'],
      [51.5111683,-0.1167217,-1.14,'East Wing'],
      [51.5109463,-0.1175603,2.00,'West Wing'],
    ]) {
      const [lat,lon,angle,name]=entrance, [px,pz]=project(lat,lon);
      const portico=model('Somerset House · '+name,px,pz,angle), wall=portico.frame();
      const south=name==='South Wing';
      wall.box(15.15,13.3,0.29,0,6.66,0.15,limestone);
      for (const sx of [-4.45,0,4.45]) {
        opening(wall,sx,0.18,0.32,2.73,4.94,1.34,{border:0.24,fill:0x4b4b44});
        opening(wall,sx,6.08,0.32,1.87,3.48,0.51,{border:0.15,fill:darkGlass,lit:true});
        wall.box(2.07,0.12,0.29,sx,6.03,0.43,lightStone);
        wall.box(0.065,2.8,0.105,sx,7.53,0.50,shadeStone);
      }
      for (const sx of [-6.71,-2.25,2.25,6.71]) {
        column(wall,sx,0.22,0.62,south?0.55:0.38,11.95,lightStone);
        solidColumn(portico.root,sx,0.62,south?0.65:0.44);
      }
      cornice(wall,15.2,12.47,0.82,0.63);
      if (south) pediment(wall,15.3,12.64,0.97,3.08);
      portico.finish();
    }
  }

  function courtsPortal() {
    const [x,z]=project(51.5134735,-0.1135462);
    const court=model('Royal Courts of Justice · Strand entrance',x,z,0.321), face=court.frame();
    face.box(10.5,15.8,0.42,0,7.94,0.19,limestone);
    for (const [w,h] of [[6.7,10.4],[5.9,9.82],[5.0,9.12]]) {
      const layer=(6.7-w)*0.068;
      opening(face,0,0.16,0.44+layer,w,h,3.7,{pointed:true,border:0.25,fill:0x494641,frame:layer>0.06?shadeStone:lightStone});
    }
    for (const x of [-4.37,4.37]) {
      face.box(0.49,10.16,0.58,x,5.19,0.51,shadeStone);
      face.box(0.77,0.30,0.72,x,4.83,0.62,lightStone);
      opening(face,x,10.76,0.47,0.65,3.16,0.93,{pointed:true,border:0.12});
      face.mesh(new THREE.OctahedronGeometry(0.56).scale(0.57,1.35,0.57).translate(x,15.99,0.62),lightStone);
    }
    face.mesh(new THREE.CircleGeometry(0.96,32).translate(0,12.63,0.48),shadeStone);
    face.mesh(new THREE.TorusGeometry(0.94,0.13,8,32).translate(0,12.63,0.52),lightStone);
    for (let i=0;i<8;i++) {
      const a=i*TAU/8;
      face.beam([0,12.63,0.54],[0.81*Math.cos(a),12.63+0.81*Math.sin(a),0.54],0.065,lightStone);
    }
    pediment(face,10.7,15.3,0.42,4.08,lightStone);
    court.finish();
  }

  function markNamedSite(outline, style) {
    styles.set(outline,style);
    const site=bounds(outline.ring);
    for (const b of buildings) {
      if (!b.pt) continue;
      const part=bounds(b.ring);
      if (within(part,site,1)&&contains(part.x,part.z,outline.ring)) styles.set(b,style);
    }
  }

  const named = name => buildings.find(b=>names[b.n]===name);
  const tower=named('Elizabeth Tower'), church=named("St Paul's Cathedral"),
    somerset=named('Somerset House'), law=named('Royal Courts of Justice');
  if (tower) elizabethTower(tower);
  if (church) {markNamedSite(church,'cathedral');cathedral(church);}
  if (somerset) {markNamedSite(somerset,'somerset');somersetCourt();}
  if (law) {markNamedSite(law,'courts');courtsPortal();}
  const [bx,bz]=project(51.5129,-0.1174);
  const bush=buildings.find(b=>b.k&&contains(bx,bz,b.ring));
  if (bush) {styles.set(bush,'bush');bushHouse();}

  function coversPedestrianWay(road) {
    if (!fountain||road.kind!=='ped') return false;
    const {x,z,yaw,width,depth}=fountain, c=Math.cos(yaw), s=Math.sin(yaw);
    return road.pts.every(([rx,rz])=>{
      const dx=rx-x,dz=rz-z;
      return Math.abs(dx*c-dz*s)<(width-road.w)/2 && Math.abs(dx*s+dz*c)<(depth-road.w)/2;
    });
  }

  const matrix=new THREE.Matrix4();
  function update(hours,night,time,camera) {
    for (const [hour,minute] of clockHands) {
      hour.rotation.z=-hours*TAU/12;
      minute.rotation.z=-(hours%1)*TAU;
    }
    for (const dial of clockFaces) dial.emissiveIntensity=night*0.82;
    windows.emissiveIntensity=night*0.12;
    if (!fountain) return;
    const {jets,nozzles,x,z}=fountain;
    jets.visible=(camera.x-x)**2+(camera.z-z)**2+camera.y**2<260**2;
    if (!jets.visible) return;
    nozzles.forEach(([u,v],i)=>{
      const h=0.23+1.48*Math.max(0,Math.sin(time*1.46+i*0.32));
      matrix.makeScale(1,h,1).setPosition(u,0.102+h/2,v);
      jets.setMatrixAt(i,matrix);
    });
    jets.instanceMatrix.needsUpdate=true;
  }
  return {group,omitted,styles,towerFootprint,coversPedestrianWay,update};
}
