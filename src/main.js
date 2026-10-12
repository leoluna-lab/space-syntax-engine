import { analyse as runAnalysis, migrateModel, DEFAULT_OPTIONS } from './engine/index.ts';
import { escapeHtml as esc } from './util/html.ts';

const C={paper:'#f3efe6',panel:'#faf8f2',ink:'#1c1b18',ink2:'#5a564c',muted:'#8c8679',rule:'#d8d2c4',accent:'#b23a2e',wall:'#2a2824'};
const VALIDATED={
  nodes:[
    {id:'X',name:'Exterior (carrier)',x:90,y:235},{id:'E',name:'Central corridor',x:250,y:235},
    {id:'B',name:'Top-middle room',x:250,y:95},{id:'C',name:'Top-right room',x:400,y:120},
    {id:'D',name:'Bottom-left room',x:245,y:375},{id:'I',name:'Bottom-right room',x:470,y:265},
    {id:'A',name:'Top-left room',x:110,y:375},{id:'F',name:'Bottom-center room',x:390,y:390},
    {id:'G',name:'Upper small room',x:610,y:255},{id:'H',name:'Lower small room',x:470,y:440}
  ],
  edges:[['A','D'],['D','E'],['D','F'],['E','B'],['E','C'],['E','I'],['F','H'],['I','G'],['X','E']],
  root:'X'
};
function clone(o){return JSON.parse(JSON.stringify(o));}

/* Motor: src/engine (testado em tests/). Aqui só a adjacência usada pelo j-graph. */
function buildAdj(m){const a={};m.nodes.forEach(n=>a[n.id]=new Set());m.edges.forEach(([x,y])=>{if(x!==y&&a[x]&&a[y]){a[x].add(y);a[y].add(x);}});return a;}

/* ---------------- MEASURES ---------------- */
const MEASURES=[
  {key:'integ',label:'Integration (HH)',invert:false,fmt:fmt3},
  {key:'choice',label:'Choice (betweenness)',invert:false,fmt:fmt1},
  {key:'ctrl',label:'Control value',invert:false,fmt:fmt3},
  {key:'controllability',label:'Controllability',invert:false,fmt:fmt3},
  {key:'conn',label:'Connectivity',invert:false,fmt:v=>v},
  {key:'focus',label:'Depth from selected',invert:true,fmt:v=>v==null?'—':v},
  {key:'depth',label:'Depth from root',invert:true,fmt:v=>v==null?'—':v},
  {key:'md',label:'Mean depth',invert:true,fmt:fmt3},
  {key:'rra',label:'RRA',invert:true,fmt:fmt3},
  {key:'ent',label:'Entropy (bits)',invert:true,fmt:fmt3}
];
function fmt3(v){return v==null||!isFinite(v)?'—':(+v).toFixed(3);}
function fmt1(v){return v==null||!isFinite(v)?'—':(+v).toFixed(1);}
function valOf(id,key){const p=R.per[id];if(key==='depth')return p.depth;if(key==='focus'){const f=focusId();return f?R.distance(f,id):null;}return p[key];}
function focusId(){return selSet.size===1?[...selSet][0]:null;}
function measureColor(v,mn,mx,inv){if(v==null||!isFinite(v))return '#cfc8b8';let t=(mx===mn)?0.5:(v-mn)/(mx-mn);if(inv)t=1-t;t=Math.max(0,Math.min(1,t));return `hsl(${(240*(1-t)).toFixed(0)},62%,52%)`;}
function measureRange(key){const vals=R.ids.map(i=>valOf(i,key)).filter(v=>v!=null&&isFinite(v));if(!vals.length)return[0,1];return[Math.min(...vals),Math.max(...vals)];}
function labelInk(hsl){const m=/hsl\((\d+)/.exec(hsl);if(!m)return C.ink;const h=+m[1];return(h>=55&&h<=175)?C.ink:'#fff';}

/* ---------------- STATE ---------------- */
let model=migrateModel(VALIDATED), R=null, modelB=null;
let conv={entropy:DEFAULT_OPTIONS.entropy,differenceFactor:DEFAULT_OPTIONS.differenceFactor};
function analyse(m){return runAnalysis(m,{...conv,radius});}
let selSet=new Set(), inspect=null;
let currentMeasure='integ', showValues=false, snap=false, gridSize=20, radius=0;
let bg={img:null,op:0.5,rot:0,scale:1,dx:0,dy:0};
let mode='select';
const hist={past:[],future:[]};
let lastMouse={x:380,y:240};
const SVGNS='http://www.w3.org/2000/svg';
function Eo(t,a){const e=document.createElementNS(SVGNS,t);for(const k in a)e.setAttribute(k,a[k]);return e;}
const svgG=document.getElementById('svgGraph'),svgJ=document.getElementById('svgJ'),tip=document.getElementById('tip');
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function snapV(v){return snap?Math.round(v/gridSize)*gridSize:v;}
function snapshot(){return JSON.stringify(model);}
function commit(pre){hist.past.push(pre);if(hist.past.length>60)hist.past.shift();hist.future=[];autosave();}
function mutate(fn){const pre=snapshot();fn();commit(pre);recompute();}
function undo(){if(!hist.past.length)return;hist.future.push(snapshot());model=JSON.parse(hist.past.pop());selSet.clear();autosave();recompute();}
function redo(){if(!hist.future.length)return;hist.past.push(snapshot());model=JSON.parse(hist.future.pop());selSet.clear();autosave();recompute();}

/* ---------------- PERSISTENCE ---------------- */
function autosave(){try{localStorage.setItem('ssx_state',JSON.stringify({model,currentMeasure,showValues,snap,radius,conv,bg:{op:bg.op,rot:bg.rot,scale:bg.scale,dx:bg.dx,dy:bg.dy}}));if(bg.img){if(bg.img.length<3500000)localStorage.setItem('ssx_bg',bg.img);}else localStorage.removeItem('ssx_bg');}catch(e){}}
function loadSaved(){try{const s=localStorage.getItem('ssx_state');if(s){const o=JSON.parse(s);if(o.model&&o.model.nodes){model=migrateModel(o.model);if(o.conv)conv=Object.assign(conv,o.conv);currentMeasure=o.currentMeasure||'integ';showValues=!!o.showValues;snap=!!o.snap;radius=o.radius||0;if(o.bg)bg=Object.assign(bg,o.bg);}const bi=localStorage.getItem('ssx_bg');if(bi)bg.img=bi;}}catch(e){}}

/* ---------------- RECOMPUTE + RENDER ALL ---------------- */
function recompute(){
  const ids=new Set(model.nodes.map(n=>n.id));
  model.edges=model.edges.filter(([a,b])=>ids.has(a)&&ids.has(b)&&a!==b);
  const seen=new Set();model.edges=model.edges.filter(([a,b])=>{const k=a<b?a+'|'+b:b+'|'+a;if(seen.has(k))return false;seen.add(k);return true;});
  if(!ids.has(model.root))model.root=model.nodes.length?model.nodes[0].id:null;
  [...selSet].forEach(id=>{if(!ids.has(id))selSet.delete(id);});
  R=analyse(model);
  const w=document.getElementById('warnBox');
  if(R.comp>1){w.style.display='block';w.textContent='⚠ Graph has '+R.comp+' disconnected parts; depth measures are per-component.';}else w.style.display='none';
  document.getElementById('btnUndo').disabled=!hist.past.length;
  document.getElementById('btnRedo').disabled=!hist.future.length;
  renderEditor();renderGraph();renderJ();renderResults();if(document.querySelector('.tab[data-view=compare]').classList.contains('active'))renderCompare();
  autosave();
}

/* ---------------- EDITOR ---------------- */
function renderEditor(){
  const nl=document.getElementById('nodeList');nl.innerHTML='';
  const meas=MEASURES.find(m=>m.key===currentMeasure),[mn,mx]=measureRange(currentMeasure);
  model.nodes.forEach(n=>{
    const p=R.per[n.id],v=valOf(n.id,currentMeasure);
    const li=document.createElement('div');li.className='li'+(n.id===model.root?' isroot':'');
    li.innerHTML=`<input type="radio" name="rootpick" class="rootpick" data-root="${esc(n.id)}" ${n.id===model.root?'checked':''} title="Set as root">`+
      `<span class="dot" style="background:${measureColor(v,mn,mx,meas.invert)}"></span>`+
      `<span class="nm" data-id="${esc(n.id)}"><b>${esc(n.id)}</b> · ${esc(n.name)}</span><span class="mini">${p.conn}c</span>`+
      `<button class="danger" data-del="${esc(n.id)}">×</button>`;
    nl.appendChild(li);
  });
  document.getElementById('nCount').textContent='('+model.nodes.length+')';
  document.getElementById('eCount').textContent='('+model.edges.length+')';
  const el=document.getElementById('edgeList');el.innerHTML='';
  model.edges.forEach((e,i)=>{const li=document.createElement('div');li.className='li';li.innerHTML=`<span class="nm">${esc(e[0])} ↔ ${esc(e[1])}</span><button class="danger" data-dele="${i}">×</button>`;el.appendChild(li);});
  fillSel(document.getElementById('rootSel'),model.root);fillSel(document.getElementById('edgeA'));fillSel(document.getElementById('edgeB'));
  const ms=document.getElementById('measureSel');if(!ms.dataset.f){MEASURES.forEach(m=>{const o=document.createElement('option');o.value=m.key;o.textContent=m.label;ms.appendChild(o);});ms.dataset.f='1';}ms.value=currentMeasure;
  document.getElementById('optSnap').checked=snap;document.getElementById('optValues').checked=showValues;document.getElementById('optRadius').value=radius;document.getElementById('optEntropy').value=conv.entropy;document.getElementById('optHFactor').value=conv.differenceFactor;
}
function fillSel(sel,val){const keep=sel.value;sel.innerHTML='';model.nodes.forEach(n=>{const o=document.createElement('option');o.value=n.id;o.textContent=n.id+' · '+n.name;sel.appendChild(o);});if(val!=null)sel.value=val;else if(keep)sel.value=keep;}

/* ---------------- CONFIG GRAPH ---------------- */
let nodeEls={},edgeEls=[],polyEls={},guides=[],pendingLine=null,polyPreview=null,boxEl=null;
function bgTransform(){const cx=380,cy=240;return `translate(${bg.dx},${bg.dy}) rotate(${bg.rot} ${cx} ${cy}) scale(${bg.scale})`;}
function renderGraph(){
  svgG.innerHTML='';nodeEls={};edgeEls=[];polyEls={};guides=[];pendingLine=null;polyPreview=null;boxEl=null;
  if(bg.img){const im=Eo('image',{x:0,y:0,width:760,height:480,preserveAspectRatio:'xMidYMid meet',opacity:bg.op,transform:bgTransform()});im.setAttributeNS('http://www.w3.org/1999/xlink','href',bg.img);im.setAttribute('href',bg.img);svgG.appendChild(im);}
  const meas=MEASURES.find(m=>m.key===currentMeasure),[mn,mx]=measureRange(currentMeasure);
  // polygons
  model.nodes.forEach(n=>{if(n.poly&&n.poly.length>=3){const col=measureColor(valOf(n.id,currentMeasure),mn,mx,meas.invert);const pg=Eo('polygon',{points:n.poly.map(p=>p[0]+','+p[1]).join(' '),fill:col,'fill-opacity':0.22,stroke:col,'stroke-width':1.4,'stroke-opacity':0.7});svgG.appendChild(pg);polyEls[n.id]=pg;}});
  // edges + hit
  model.edges.forEach((e,i)=>{const a=pos(e[0]),b=pos(e[1]);const ln=Eo('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:C.wall,'stroke-width':1.6,'stroke-opacity':.55});svgG.appendChild(ln);const hit=Eo('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'transparent','stroke-width':10,class:'edgehit','data-ei':i,style:'cursor:pointer'});svgG.appendChild(hit);edgeEls.push({a:e[0],b:e[1],ln,hit});});
  // nodes
  model.nodes.forEach(n=>{
    const p=R.per[n.id],v=valOf(n.id,currentMeasure),col=measureColor(v,mn,mx,meas.invert),rad=11+(p.conn||0)*1.5;
    const g=Eo('g',{class:'node'+(selSet.has(n.id)?' selnode':''),'data-id':n.id,transform:`translate(${n.x},${n.y})`});
    g.appendChild(Eo('circle',{class:'halo',r:rad+6,fill:'none',stroke:C.accent,'stroke-width':2,'stroke-opacity':.6}));
    if(n.id===model.root){g.appendChild(Eo('circle',{r:rad+4,fill:'none',stroke:C.accent,'stroke-width':2}));g.appendChild(Eo('line',{x1:-rad-4,y1:0,x2:rad+4,y2:0,stroke:C.accent,'stroke-width':1.3}));g.appendChild(Eo('line',{x1:0,y1:-rad-4,x2:0,y2:rad+4,stroke:C.accent,'stroke-width':1.3}));}
    const circ=Eo('circle',{r:rad,fill:col,stroke:'#fff','stroke-width':2});
    if(p.orphan||p.unreachable){circ.setAttribute('stroke',C.accent);circ.setAttribute('stroke-dasharray','3 2');}
    g.appendChild(circ);
    g.appendChild(txt(0,4.5,n.id,13,labelInk(col),'700','middle'));
    g.appendChild(txt(0,rad+13,n.name.length>18?n.name.slice(0,17)+'…':n.name,10,C.ink2,'400','middle'));
    if(showValues)g.appendChild(txt(0,-rad-6,meas.fmt(v),10,C.accent,'700','middle'));
    svgG.appendChild(g);nodeEls[n.id]=g;attachNode(g,n);
  });
  const inv=meas.invert,lv=inv?mx:mn,rv=inv?mn:mx;
  document.getElementById('legLo').textContent='segregated · '+meas.fmt(lv);
  document.getElementById('legHi').textContent=meas.fmt(rv)+' · integrated';
  document.getElementById('legRamp').style.background='linear-gradient(90deg,hsl(240,62%,52%),hsl(120,62%,52%),hsl(0,62%,52%))';
  document.getElementById('modeHint').textContent={select:'drag to move · shift-click multi · drag empty = box',add:'click to place a node',link:'click two nodes to connect',poly:'click vertices · Enter to close · Esc cancel'}[mode];
}
function pos(id){const n=model.nodes.find(x=>x.id===id);return{x:n.x,y:n.y};}
function txt(x,y,s,sz,fill,wt,anc){const t=Eo('text',{x,y,'font-family':sz<11?C.mono:C.mono,'font-size':sz,fill,'text-anchor':anc||'start'});if(wt)t.setAttribute('font-weight',wt);t.textContent=s;return t;}
function svgPoint(svg,e){const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform(svg.getScreenCTM().inverse());}
function updatePositions(){model.nodes.forEach(n=>{if(nodeEls[n.id])nodeEls[n.id].setAttribute('transform',`translate(${n.x},${n.y})`);if(polyEls[n.id]&&n.poly)polyEls[n.id].setAttribute('points',n.poly.map(p=>p[0]+','+p[1]).join(' '));});edgeEls.forEach(ed=>{const a=pos(ed.a),b=pos(ed.b);ed.ln.setAttribute('x1',a.x);ed.ln.setAttribute('y1',a.y);ed.ln.setAttribute('x2',b.x);ed.ln.setAttribute('y2',b.y);ed.hit.setAttribute('x1',a.x);ed.hit.setAttribute('y1',a.y);ed.hit.setAttribute('x2',b.x);ed.hit.setAttribute('y2',b.y);});}
function clearGuides(){guides.forEach(g=>g.remove());guides=[];}
function showGuidesFor(id){const n=model.nodes.find(x=>x.id===id);model.nodes.forEach(o=>{if(o.id===id)return;if(Math.abs(o.x-n.x)<3){n.x=o.x;const l=Eo('line',{x1:o.x,y1:0,x2:o.x,y2:480,stroke:C.accent,'stroke-width':0.5,'stroke-dasharray':'3 3','stroke-opacity':.6});svgG.appendChild(l);guides.push(l);}if(Math.abs(o.y-n.y)<3){n.y=o.y;const l=Eo('line',{x1:0,y1:o.y,x2:760,y2:o.y,stroke:C.accent,'stroke-width':0.5,'stroke-dasharray':'3 3','stroke-opacity':.6});svgG.appendChild(l);guides.push(l);}});}

let drag=null,linkFrom=null,poly={pts:[]},box=null;
function attachNode(g,n){
  g.addEventListener('pointerdown',e=>{
    e.stopPropagation();
    if(mode==='link'){linkClick(n.id);return;}
    if(mode!=='select')return;
    if(e.shiftKey){if(selSet.has(n.id))selSet.delete(n.id);else selSet.add(n.id);}
    else if(!selSet.has(n.id)){selSet.clear();selSet.add(n.id);}
    refreshSel();renderResults();
    drag={pre:snapshot(),moved:false,anchor:null,orig:new Map()};
    selSet.forEach(id=>{const nd=model.nodes.find(x=>x.id===id);drag.orig.set(id,{x:nd.x,y:nd.y,poly:nd.poly?nd.poly.map(p=>[p[0],p[1]]):null});});
    try{g.setPointerCapture(e.pointerId);}catch(_){}
  });
  g.addEventListener('pointermove',e=>{
    if(!drag||mode!=='select')return;
    const pt=svgPoint(svgG,e);if(!drag.anchor)drag.anchor={x:pt.x,y:pt.y};
    let dx=pt.x-drag.anchor.x,dy=pt.y-drag.anchor.y;
    if(Math.abs(dx)>2||Math.abs(dy)>2)drag.moved=true;
    clearGuides();
    selSet.forEach(id=>{const o=drag.orig.get(id),nd=model.nodes.find(x=>x.id===id);let nx=snapV(o.x+dx),ny=snapV(o.y+dy);nd.x=clamp(nx,16,744);nd.y=clamp(ny,16,464);if(o.poly)nd.poly=o.poly.map(p=>[clamp(snapV(p[0]+dx),0,760),clamp(snapV(p[1]+dy),0,480)]);});
    if(drag.moved&&selSet.size===1)showGuidesFor(n.id);
    updatePositions();
  });
  g.addEventListener('pointerup',()=>{if(drag&&mode==='select'){clearGuides();if(drag.moved)commit(drag.pre);drag=null;}});
  g.addEventListener('pointerenter',e=>{inspect=n.id;showTip(e,n.id);});
  g.addEventListener('pointermove',moveTip);
  g.addEventListener('pointerleave',()=>{inspect=null;hideTip();});
}
function refreshSel(){Object.keys(nodeEls).forEach(id=>nodeEls[id].classList.toggle('selnode',selSet.has(id)));}
function linkClick(id){if(linkFrom==null){linkFrom=id;if(nodeEls[id])nodeEls[id].classList.add('selnode');}else if(id!==linkFrom){addEdge(linkFrom,id);if(nodeEls[linkFrom])nodeEls[linkFrom].classList.remove('selnode');linkFrom=null;if(pendingLine){pendingLine.remove();pendingLine=null;}}}
function addEdge(a,b){if(model.edges.some(([x,y])=>(x===a&&y===b)||(x===b&&y===a)))return;mutate(()=>model.edges.push([a,b]));}
function addNodeAt(x,y){const id=nextId();mutate(()=>model.nodes.push({id,name:'Ambiente '+(model.nodes.length+1),x:clamp(snapV(x),16,744),y:clamp(snapV(y),16,464)}));}

// svg background interactions
svgG.addEventListener('pointerdown',e=>{
  if(e.target.closest('.node'))return;
  const pt=svgPoint(svgG,e);lastMouse=pt;
  if(e.target.classList&&e.target.classList.contains('edgehit')){if(mode==='select'){const i=+e.target.getAttribute('data-ei');mutate(()=>model.edges.splice(i,1));}return;}
  if(mode==='add'){addNodeAt(pt.x,pt.y);return;}
  if(mode==='poly'){poly.pts.push([snapV(pt.x),snapV(pt.y)]);drawPolyPreview();return;}
  if(mode==='link'){if(linkFrom&&nodeEls[linkFrom])nodeEls[linkFrom].classList.remove('selnode');linkFrom=null;if(pendingLine){pendingLine.remove();pendingLine=null;}return;}
  if(mode==='select'){box={x0:pt.x,y0:pt.y,add:e.shiftKey};boxEl=Eo('rect',{x:pt.x,y:pt.y,width:0,height:0,fill:'rgba(178,58,46,.08)',stroke:C.accent,'stroke-width':0.8,'stroke-dasharray':'4 3'});svgG.appendChild(boxEl);}
});
svgG.addEventListener('pointermove',e=>{
  const pt=svgPoint(svgG,e);lastMouse=pt;
  if(box&&boxEl){const x=Math.min(box.x0,pt.x),y=Math.min(box.y0,pt.y),w=Math.abs(pt.x-box.x0),h=Math.abs(pt.y-box.y0);boxEl.setAttribute('x',x);boxEl.setAttribute('y',y);boxEl.setAttribute('width',w);boxEl.setAttribute('height',h);}
  if(mode==='poly'&&poly.pts.length){if(!polyPreview){polyPreview=Eo('polyline',{fill:'none',stroke:C.accent,'stroke-width':1.4});svgG.appendChild(polyPreview);}polyPreview.setAttribute('points',poly.pts.map(p=>p[0]+','+p[1]).join(' ')+' '+pt.x+','+pt.y);}
  if(mode==='link'&&linkFrom){const a=pos(linkFrom);if(!pendingLine){pendingLine=Eo('line',{stroke:C.accent,'stroke-width':1.4,'stroke-dasharray':'4 3'});svgG.appendChild(pendingLine);}pendingLine.setAttribute('x1',a.x);pendingLine.setAttribute('y1',a.y);pendingLine.setAttribute('x2',pt.x);pendingLine.setAttribute('y2',pt.y);}
});
svgG.addEventListener('pointerup',e=>{
  if(box&&boxEl){const pt=svgPoint(svgG,e);const x0=Math.min(box.x0,pt.x),y0=Math.min(box.y0,pt.y),x1=Math.max(box.x0,pt.x),y1=Math.max(box.y0,pt.y);
    if(Math.abs(x1-x0)<4&&Math.abs(y1-y0)<4){if(!box.add)selSet.clear();}
    else{if(!box.add)selSet.clear();model.nodes.forEach(n=>{if(n.x>=x0&&n.x<=x1&&n.y>=y0&&n.y<=y1)selSet.add(n.id);});}
    boxEl.remove();boxEl=null;box=null;refreshSel();renderResults();}
});
svgG.addEventListener('dblclick',e=>{if(e.target.closest('.node'))return;if(mode==='poly'){finishPoly();}else if(mode==='select'||mode==='add'){const pt=svgPoint(svgG,e);addNodeAt(pt.x,pt.y);}});
function drawPolyPreview(){if(polyPreview)polyPreview.remove();polyPreview=Eo('polyline',{points:poly.pts.map(p=>p[0]+','+p[1]).join(' '),fill:'none',stroke:C.accent,'stroke-width':1.4});svgG.appendChild(polyPreview);}
function finishPoly(){if(poly.pts.length<3){poly.pts=[];if(polyPreview){polyPreview.remove();polyPreview=null;}return;}const pts=poly.pts.slice();const cx=Math.round(pts.reduce((s,p)=>s+p[0],0)/pts.length),cy=Math.round(pts.reduce((s,p)=>s+p[1],0)/pts.length);const id=nextId();mutate(()=>model.nodes.push({id,name:'Ambiente '+(model.nodes.length+1),x:clamp(cx,16,744),y:clamp(cy,16,464),poly:pts}));poly.pts=[];if(polyPreview){polyPreview.remove();polyPreview=null;}}

function segOverlap(a1,a2,b1,b2,tol){const dax=a2[0]-a1[0],day=a2[1]-a1[1],len=Math.hypot(dax,day);if(len<1e-6)return 0;const ux=dax/len,uy=day/len;const perp=p=>Math.abs((p[0]-a1[0])*(-uy)+(p[1]-a1[1])*ux);if(perp(b1)>tol||perp(b2)>tol)return 0;const proj=p=>(p[0]-a1[0])*ux+(p[1]-a1[1])*uy;let b0=proj(b1),b1p=proj(b2);if(b0>b1p){const t=b0;b0=b1p;b1p=t;}const lo=Math.max(0,b0),hi=Math.min(len,b1p);return Math.max(0,hi-lo);}
function polysShareEdge(pa,pb,tol){for(let i=0;i<pa.length;i++){const a1=pa[i],a2=pa[(i+1)%pa.length];for(let j=0;j<pb.length;j++){const b1=pb[j],b2=pb[(j+1)%pb.length];if(segOverlap(a1,a2,b1,b2,tol)>tol)return true;}}return false;}
function deriveAdjacency(){const polyNodes=model.nodes.filter(n=>n.poly&&n.poly.length>=3);if(polyNodes.length<2){document.getElementById('warnBox').style.display='block';document.getElementById('warnBox').textContent='Need at least two polygons to derive links.';return;}const pre=snapshot();let added=0;for(let i=0;i<polyNodes.length;i++)for(let j=i+1;j<polyNodes.length;j++){const A=polyNodes[i],B=polyNodes[j];if(polysShareEdge(A.poly,B.poly,8)){if(!model.edges.some(([x,y])=>(x===A.id&&y===B.id)||(x===B.id&&y===A.id))){model.edges.push([A.id,B.id]);added++;}}}if(added){commit(pre);recompute();}document.getElementById('warnBox').style.display='block';document.getElementById('warnBox').textContent=added?('Added '+added+' link(s) from shared polygon edges.'):'No new shared edges found.';}

/* ---------------- JUSTIFIED GRAPH ---------------- */
function renderJ(){
  svgJ.innerHTML='';const W=760,Hh=480,padB=56,padT=40;
  const layers={};let maxD=0,hasNull=false;
  model.nodes.forEach(n=>{const d=R.per[n.id].depth;if(d==null){hasNull=true;return;}(layers[d]=layers[d]||[]).push(n.id);maxD=Math.max(maxD,d);});
  const rows=maxD+(hasNull?2:1),yFor=d=>Hh-padB-d*((Hh-padB-padT)/Math.max(1,rows-1));
  const pj={};for(let d=0;d<=maxD;d++){const arr=layers[d]||[];arr.forEach((id,i)=>pj[id]={x:W/(arr.length+1)*(i+1),y:yFor(d)});}
  if(hasNull){const arr=model.nodes.filter(n=>R.per[n.id].depth==null).map(n=>n.id);arr.forEach((id,i)=>pj[id]={x:W/(arr.length+1)*(i+1),y:padT-16});}
  for(let d=0;d<=maxD;d++){svgJ.appendChild(Eo('line',{x1:40,y1:yFor(d),x2:W-14,y2:yFor(d),stroke:C.rule,'stroke-width':1,'stroke-dasharray':'2 4'}));svgJ.appendChild(txt(10,yFor(d)+4,'d'+d,11,C.muted));}
  const adj=buildAdj(model),treeSet=new Set();if(model.root){const seen=new Set([model.root]),q=[model.root];let h=0;while(h<q.length){const v=q[h++];adj[v].forEach(w=>{if(!seen.has(w)){seen.add(w);treeSet.add(v<w?v+'|'+w:w+'|'+v);q.push(w);}});}}
  model.edges.forEach(([a,b])=>{if(!pj[a]||!pj[b])return;const tree=treeSet.has(a<b?a+'|'+b:b+'|'+a);svgJ.appendChild(Eo('line',{x1:pj[a].x,y1:pj[a].y,x2:pj[b].x,y2:pj[b].y,stroke:tree?C.wall:C.accent,'stroke-width':tree?1.8:1.2,'stroke-dasharray':tree?'':'5 3','stroke-opacity':tree?.9:.7}));});
  const ramp=['#e9dcc6','#dcae82','#cc7f52','#b25334','#8a2d1f','#6a2016','#4d170f'];
  model.nodes.forEach(n=>{const p=pj[n.id];if(!p)return;const d=R.per[n.id].depth,col=d==null?'#bdb6a6':ramp[Math.min(d,ramp.length-1)];
    const g=Eo('g',{class:'node','data-id':n.id,transform:`translate(${p.x},${p.y})`});
    if(n.id===model.root){g.appendChild(Eo('circle',{r:16,fill:col,stroke:C.accent,'stroke-width':2.4}));g.appendChild(Eo('line',{x1:-16,y1:0,x2:16,y2:0,stroke:C.accent,'stroke-width':1.3}));g.appendChild(Eo('line',{x1:0,y1:-16,x2:0,y2:16,stroke:C.accent,'stroke-width':1.3}));}
    else g.appendChild(Eo('circle',{r:14,fill:col,stroke:C.wall,'stroke-width':1.4}));
    g.appendChild(txt(0,4.5,n.id,12,(d!=null&&d>=2)?'#fff':C.ink,'700','middle'));
    if(showValues&&d!=null)g.appendChild(txt(0,-20,'d'+d,10,C.ink2,'700','middle'));
    svgJ.appendChild(g);
    g.addEventListener('pointerenter',e=>showTip(e,n.id));g.addEventListener('pointermove',moveTip);g.addEventListener('pointerleave',hideTip);
  });
}

/* ---------------- RESULTS ---------------- */
function renderResults(){
  const g=R;
  // validation
  const issues=[];const orphans=g.ids.filter(i=>g.per[i].orphan);if(orphans.length)issues.push('Orphan (no links): '+orphans.join(', '));if(g.comp>1)issues.push(g.comp+' disconnected components.');const unreach=g.ids.filter(i=>g.per[i].unreachable);if(unreach.length)issues.push('Unreachable from root: '+unreach.join(', '));
  const vb=document.getElementById('valBox');vb.innerHTML='<h4>Validation</h4>'+(issues.length?('<span class="bad">⚠ '+issues.length+' issue(s)</span><ul>'+issues.map(i=>'<li>'+esc(i)+'</li>').join('')+'</ul>'):'<span class="ok">✓ No structural issues — connected, no orphans.</span>');
  const cards=[['Spaces (k)',g.k],['Links (L)',g.L],['Rings',g.circuit],['Ringiness r',g.ringiness.toFixed(3)],['Mean conn.',g.meanConn.toFixed(2)],['Mean depth',g.meanMD==null?'—':g.meanMD.toFixed(3)],['Mean integ.',g.meanInt==null?'—':g.meanInt.toFixed(3)],['Mean RRA',g.meanRRA==null?'—':g.meanRRA.toFixed(3)],['Diameter',g.diameter],[conv.differenceFactor==='ra'?'Diff. factor H* (RA)':'Diff. factor H* (integ.)',g.Hs==null?'—':g.Hs.toFixed(3)],['Intellig. R² (global)',g.intelligibility==null?'—':g.intelligibility.toFixed(3)],['Types a/b/c/d',`${g.typeCounts.a.length}/${g.typeCounts.b.length}/${g.typeCounts.c.length}/${g.typeCounts.d.length}`],['Radius',radius===0?'global':radius]];
  document.getElementById('globalCards').innerHTML=cards.map(c=>`<div class="card"><div class="k">${c[0]}</div><div class="v"><b>${c[1]}</b></div></div>`).join('');
  const cols=[['id','Space'],['type','Type'],['conn','Conn'],['ctrl','Control'],['controllability','Ctrlab'],['choice','Choice'],['depth','Depth'],['td','Tot.D'],['md','MeanD'],['ra','RA'],['rra','RRA'],['integ','Integ.'],['ent','Entropy']];
  document.querySelector('#resTable thead').innerHTML='<tr>'+cols.map(c=>`<th class="${c[0]==='id'||c[0]==='type'?'name':''}" data-k="${c[0]}">${c[1]}</th>`).join('')+'</tr>';
  const meas=MEASURES.find(m=>m.key===currentMeasure),[mn,mx]=measureRange(currentMeasure);
  const rows=[...model.nodes].sort((a,b)=>{let va=sortKey==='id'?a.id:sortKey==='type'?R.per[a.id].type:valOf(a.id,sortKey==='depth'?'depth':sortKey)??R.per[a.id][sortKey],vb2=sortKey==='id'?b.id:sortKey==='type'?R.per[b.id].type:valOf(b.id,sortKey==='depth'?'depth':sortKey)??R.per[b.id][sortKey];if(va==null)va=-Infinity;if(vb2==null)vb2=-Infinity;if(va<vb2)return sortDir;if(va>vb2)return -sortDir;return 0;});
  const tb=document.querySelector('#resTable tbody');tb.innerHTML='';
  rows.forEach(n=>{const p=R.per[n.id],cv=valOf(n.id,currentMeasure);const tr=document.createElement('tr');tr.dataset.id=n.id;if(n.id===model.root)tr.classList.add('root');if(selSet.has(n.id))tr.classList.add('sel');
    tr.innerHTML=`<td class="name"><span class="chip" style="background:${measureColor(cv,mn,mx,meas.invert)}"></span>${esc(n.id)} · ${esc(n.name)}</td><td class="name">${p.type}</td><td>${p.conn}</td><td>${fmt3(p.ctrl)}</td><td>${fmt3(p.controllability)}</td><td>${fmt1(p.choice)}</td><td>${p.depth==null?'—':p.depth}</td><td>${p.td}</td><td>${fmt3(p.md)}</td><td>${fmt3(p.ra)}</td><td>${fmt3(p.rra)}</td><td><b>${fmt3(p.integ)}</b></td><td>${fmt3(p.ent)}</td>`;
    tb.appendChild(tr);tr.addEventListener('click',()=>{selSet.clear();selSet.add(n.id);refreshSel();renderResults();if(currentMeasure==='focus')renderGraph();});});
  document.querySelectorAll('#resTable th').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.k;if(sortKey===k)sortDir*=-1;else{sortKey=k;sortDir=(k==='id'||k==='type')?1:-1;}renderResults();}));
  document.getElementById('methodFoot').innerHTML='<b>Engine.</b> BFS depths; <code>MD=ΣD/(k−1)</code>, <code>RA=2(MD−1)/(k−2)</code> (undefined when MD≤1, as in depthmapX), <code>RRA=RA/D_k</code>, <code>Integration [HH]=1/RRA</code>. Control <code>=Σ1/conn(neighbour)</code>; Controllability <code>=conn/(spaces within 2 steps)</code>; Choice = Brandes betweenness (unordered pairs). '+(conv.entropy==='depthmapx'?'Entropy <code>=−Σ p_d log₂ p_d</code>, <code>p_d=n_d/k</code> including the space itself (depthmapX). ':'Entropy <code>=−Σ p_d log₂ p_d</code>, <code>p_d=n_d/(k−1)</code> excluding the space itself (engine v1). ')+'H* on the (max, mean, min) triple of '+(conv.differenceFactor==='ra'?'RA (Hillier, Hanson &amp; Graham 1987)':'integration (engine v1)')+'; H* and intelligibility always use global values. Radius limits integration/choice/entropy to n steps. Types: d = ≥3 links on ≥2 rings.';
}
let sortKey='integ',sortDir=-1;

/* ---------------- COMPARE ---------------- */
function renderCompare(){
  const box=document.getElementById('compareBox');
  if(!modelB){box.innerHTML='<div class="valbox">No baseline stored yet. Click “Store as B” to snapshot the current model, then edit and come back.</div>';return;}
  const RB=analyse(modelB);
  const idsA=new Set(R.ids),idsB=new Set(RB.ids);
  const common=R.ids.filter(i=>idsB.has(i));
  const added=R.ids.filter(i=>!idsB.has(i)),removed=RB.ids.filter(i=>!idsA.has(i));
  let html='<div class="cards">'+
    `<div class="card"><div class="k">Mean integ. A</div><div class="v"><b>${R.meanInt==null?'—':R.meanInt.toFixed(3)}</b></div></div>`+
    `<div class="card"><div class="k">Mean integ. B</div><div class="v"><b>${RB.meanInt==null?'—':RB.meanInt.toFixed(3)}</b></div></div>`+
    `<div class="card"><div class="k">Rings A / B</div><div class="v"><b>${R.circuit} / ${RB.circuit}</b></div></div>`+
    `<div class="card"><div class="k">Added / Removed</div><div class="v"><b>${added.length} / ${removed.length}</b></div></div>`+
  '</div>';
  html+='<div class="tablewrap"><table><thead><tr><th class="name">Space</th><th>Integ. A</th><th>Integ. B</th><th>Δ Integ.</th><th>Choice A</th><th>Choice B</th><th>Δ Choice</th></tr></thead><tbody>';
  common.forEach(id=>{const a=R.per[id],b=RB.per[id];const di=(a.integ!=null&&b.integ!=null)?(a.integ-b.integ):null;const dc=a.choice-b.choice;const nm=(model.nodes.find(n=>n.id===id)||{}).name||id;
    html+=`<tr><td class="name">${esc(id)} · ${esc(nm)}</td><td>${fmt3(a.integ)}</td><td>${fmt3(b.integ)}</td><td class="${di>0?'up':di<0?'down':''}">${di==null?'—':(di>0?'+':'')+di.toFixed(3)}</td><td>${fmt1(a.choice)}</td><td>${fmt1(b.choice)}</td><td class="${dc>0?'up':dc<0?'down':''}">${(dc>0?'+':'')+dc.toFixed(1)}</td></tr>`;});
  html+='</tbody></table></div>';
  if(added.length||removed.length)html+=`<p class="foot">Added in A: ${esc(added.join(', ')||'—')} · Removed (only in B): ${esc(removed.join(', ')||'—')}</p>`;
  box.innerHTML=html;
}

/* ---------------- TOOLTIP ---------------- */
function showTip(e,id){const p=R.per[id],n=model.nodes.find(x=>x.id===id);tip.innerHTML=`<b>${esc(id)} · ${esc(n.name)}</b> <i>${p.type}-type</i><br>Integ ${fmt3(p.integ)} · Choice ${fmt1(p.choice)}<br>Conn ${p.conn} · Control ${fmt3(p.ctrl)} · Ctrlab ${fmt3(p.controllability)}<br>Depth ${p.depth==null?'—':p.depth} · MD ${fmt3(p.md)} · Entropy ${fmt3(p.ent)}`;tip.style.opacity=1;moveTip(e);}
function moveTip(e){tip.style.left=(e.clientX+14)+'px';tip.style.top=(e.clientY+14)+'px';}
function hideTip(){tip.style.opacity=0;}

/* ---------------- EXPORT ---------------- */
function download(data,name,type){try{const blob=data instanceof Blob?data:new Blob([data],{type:type||'text/plain'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);}catch(e){}}
function note(msg){const b=document.getElementById('infoBox');b.style.display='block';b.textContent=msg;}
function putIO(text,label){const io=document.getElementById('io');io.value=text;io.scrollIntoView({block:'center'});io.focus();io.select();if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).catch(()=>{});note(label+' is ready in the Model I/O box below and copied to the clipboard. If your browser blocks the download, paste it from there (Ctrl/Cmd+C).');}
function showImageOverlay(url,name){const o=document.getElementById('ovl');document.getElementById('ovlImg').src=url;const dl=document.getElementById('ovlDl');dl.href=url;dl.download=name;document.getElementById('ovlHint').textContent='Right-click the image → “Save image as…”, or try the download button.';o.style.display='flex';}
function tableCSV(){const cols=['id','name','type','conn','ctrl','controllability','choice','depth','td','md','ra','rra','integ','ent'];let out=cols.join(',')+'\n';model.nodes.forEach(n=>{const p=R.per[n.id];out+=[n.id,'"'+n.name.replace(/"/g,'""')+'"',p.type,p.conn,p.ctrl,p.controllability,p.choice,p.depth==null?'':p.depth,p.td,p.md,p.ra,p.rra,p.integ,p.ent].map(v=>typeof v==='number'?(+v).toFixed(4):v).join(',')+'\n';});return out;}
function exportPNG(svg,name){const cl=svg.cloneNode(true);cl.setAttribute('xmlns',SVGNS);cl.setAttribute('width',760);cl.setAttribute('height',480);const s=new XMLSerializer().serializeToString(cl);const url=URL.createObjectURL(new Blob([s],{type:'image/svg+xml;charset=utf-8'}));const img=new Image();img.onload=()=>{const cv=document.createElement('canvas');cv.width=1520;cv.height=960;const cx=cv.getContext('2d');cx.fillStyle=C.paper;cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(img,0,0,cv.width,cv.height);URL.revokeObjectURL(url);try{cv.toBlob(b=>{const u=URL.createObjectURL(b);showImageOverlay(u,name);download(b,name);});}catch(e){showImageOverlay(cv.toDataURL('image/png'),name);}};img.onerror=()=>{URL.revokeObjectURL(url);note('PNG export failed in this browser; use a screenshot of the graph instead.');};img.src=url;}

/* ---------------- UI WIRING ---------------- */
function nextId(){const used=new Set(model.nodes.map(n=>n.id));for(let i=0;i<26;i++){const c=String.fromCharCode(65+i);if(!used.has(c))return c;}let n=1;while(used.has('S'+n))n++;return 'S'+n;}
document.getElementById('addNode').addEventListener('click',()=>{const inp=document.getElementById('newName');const name=inp.value.trim()||('Ambiente '+(model.nodes.length+1));const id=nextId();mutate(()=>model.nodes.push({id,name,x:380+Math.random()*30-15,y:240+Math.random()*30-15}));inp.value='';});
document.getElementById('nodeList').addEventListener('click',e=>{const d=e.target.getAttribute('data-del');if(d){mutate(()=>{model.nodes=model.nodes.filter(n=>n.id!==d);});}});
document.getElementById('nodeList').addEventListener('change',e=>{const r=e.target.closest('.rootpick');if(r)mutate(()=>model.root=r.dataset.root);});
document.getElementById('nodeList').addEventListener('dblclick',e=>{const sp=e.target.closest('.nm');if(!sp)return;const id=sp.dataset.id,n=model.nodes.find(x=>x.id===id);if(!n)return;const inp=document.createElement('input');inp.type='text';inp.value=n.name;inp.style.cssText='width:150px;font-size:11.5px;padding:2px 5px;';sp.replaceWith(inp);inp.focus();inp.select();let done=false;const commitR=ok=>{if(done)return;done=true;if(ok){const pre=snapshot();n.name=inp.value.trim()||n.name;commit(pre);}recompute();};inp.addEventListener('blur',()=>commitR(true));inp.addEventListener('keydown',ev=>{if(ev.key==='Enter')commitR(true);else if(ev.key==='Escape')commitR(false);});});
document.getElementById('edgeList').addEventListener('click',e=>{const i=e.target.getAttribute('data-dele');if(i!=null)mutate(()=>model.edges.splice(+i,1));});
document.getElementById('addEdge').addEventListener('click',()=>addEdge(document.getElementById('edgeA').value,document.getElementById('edgeB').value));
document.getElementById('rootSel').addEventListener('change',e=>mutate(()=>model.root=e.target.value));
document.getElementById('measureSel').addEventListener('change',e=>{currentMeasure=e.target.value;renderEditor();renderGraph();renderJ();renderResults();autosave();});
document.getElementById('optSnap').addEventListener('change',e=>{snap=e.target.checked;autosave();});
document.getElementById('optValues').addEventListener('change',e=>{showValues=e.target.checked;renderGraph();renderJ();autosave();});
document.getElementById('optEntropy').addEventListener('change',e=>{conv.entropy=e.target.value;recompute();});
document.getElementById('optHFactor').addEventListener('change',e=>{conv.differenceFactor=e.target.value;recompute();});
document.getElementById('optRadius').addEventListener('change',e=>{radius=Math.max(0,parseInt(e.target.value,10)||0);recompute();});
document.getElementById('btnUndo').addEventListener('click',undo);
document.getElementById('btnRedo').addEventListener('click',redo);
document.getElementById('btnDerive').addEventListener('click',deriveAdjacency);
document.querySelectorAll('.modebtn').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;document.querySelectorAll('.modebtn').forEach(x=>x.classList.toggle('active',x===b));if(linkFrom){if(nodeEls[linkFrom])nodeEls[linkFrom].classList.remove('selnode');linkFrom=null;}if(pendingLine){pendingLine.remove();pendingLine=null;}poly.pts=[];if(polyPreview){polyPreview.remove();polyPreview=null;}document.getElementById('modeHint').textContent={select:'drag to move · shift-click multi · drag empty = box',add:'click to place a node',link:'click two nodes to connect',poly:'click vertices · Enter to close · Esc cancel'}[mode];}));
// background
document.getElementById('bgFile').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{bg.img=r.result;document.getElementById('bgControls').style.display='block';renderGraph();autosave();};r.readAsDataURL(f);});
['bgOp','bgRot','bgScale','bgDx','bgDy'].forEach(idp=>document.getElementById(idp).addEventListener('input',e=>{const v=parseFloat(e.target.value);if(idp==='bgOp')bg.op=v;if(idp==='bgRot')bg.rot=v;if(idp==='bgScale')bg.scale=v;if(idp==='bgDx')bg.dx=v;if(idp==='bgDy')bg.dy=v;renderGraph();autosave();}));
document.getElementById('bgClear').addEventListener('click',()=>{bg.img=null;document.getElementById('bgControls').style.display='none';document.getElementById('bgFile').value='';renderGraph();autosave();});
// export
document.getElementById('exCSV').addEventListener('click',()=>{const t=tableCSV();download(t,'space-syntax-measures.csv','text/csv');putIO(t,'CSV');});
document.getElementById('exPNG').addEventListener('click',()=>exportPNG(svgG,'configuration-graph.png'));
document.getElementById('exPNGJ').addEventListener('click',()=>exportPNG(svgJ,'justified-graph.png'));
document.getElementById('exCopy').addEventListener('click',()=>{const t=tableCSV();if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(()=>note('Table copied to the clipboard.')).catch(()=>putIO(t,'CSV'));else putIO(t,'CSV');});
document.getElementById('exPrint').addEventListener('click',()=>{document.querySelector('.tab[data-view=results]').click();setTimeout(()=>window.print(),120);});
// model io
document.getElementById('btnExport').addEventListener('click',()=>{const j=JSON.stringify(model,null,2);download(j,'space-syntax-model.json','application/json');putIO(j,'Model JSON');});
document.getElementById('btnLoad').addEventListener('click',()=>{const w=document.getElementById('warnBox');try{const m=migrateModel(JSON.parse(document.getElementById('io').value));const pre=snapshot();model=m;selSet.clear();commit(pre);recompute();}catch(err){w.style.display='block';w.textContent='⚠ '+(err instanceof SyntaxError?'Invalid JSON.':err.message)+' Expecting {schema, nodes:[{id,name,x,y}], edges:[[a,b]], root}.';}});
document.getElementById('btnReset').addEventListener('click',()=>{const pre=snapshot();model=migrateModel(VALIDATED);selSet.clear();currentMeasure='integ';radius=0;commit(pre);recompute();});
document.getElementById('btnStoreB').addEventListener('click',()=>{modelB=clone(model);document.querySelector('.tab[data-view=compare]').click();});
document.getElementById('ovlClose').addEventListener('click',()=>{document.getElementById('ovl').style.display='none';document.getElementById('ovlImg').src='';});
// tabs
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));t.classList.add('active');document.getElementById('view-'+t.dataset.view).classList.add('active');if(t.dataset.view==='jgraph')renderJ();if(t.dataset.view==='graph')renderGraph();if(t.dataset.view==='compare')renderCompare();}));
// keyboard
document.addEventListener('keydown',e=>{const tag=(e.target.tagName||'').toLowerCase();if(tag==='input'||tag==='textarea'||tag==='select')return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  if(e.key==='Delete'||e.key==='Backspace'){if(selSet.size){e.preventDefault();const ids=[...selSet];mutate(()=>{model.nodes=model.nodes.filter(n=>!selSet.has(n.id));selSet.clear();});}return;}
  if(e.key.toLowerCase()==='n'){addNodeAt(lastMouse.x,lastMouse.y);}
  if(e.key.toLowerCase()==='l'&&selSet.size===2){const a=[...selSet];addEdge(a[0],a[1]);}
  if(e.key.toLowerCase()==='r'&&selSet.size===1){mutate(()=>model.root=[...selSet][0]);}
  if(e.key==='Enter'&&mode==='poly'){finishPoly();}
  if(e.key==='Escape'){poly.pts=[];if(polyPreview){polyPreview.remove();polyPreview=null;}if(linkFrom){if(nodeEls[linkFrom])nodeEls[linkFrom].classList.remove('selnode');linkFrom=null;}if(pendingLine){pendingLine.remove();pendingLine=null;}selSet.clear();refreshSel();renderResults();}
});

/* ---------------- INIT ---------------- */
loadSaved();
if(bg.img)document.getElementById('bgControls').style.display='block';
document.getElementById('bgOp').value=bg.op;document.getElementById('bgRot').value=bg.rot;document.getElementById('bgScale').value=bg.scale;document.getElementById('bgDx').value=bg.dx;document.getElementById('bgDy').value=bg.dy;
recompute();
