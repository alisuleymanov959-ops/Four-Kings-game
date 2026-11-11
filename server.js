'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || '*' } });
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const COLORS = [
  { id: 'blue', name: 'Blue and White Kingdom', color: '#5ca9e8', dark: '#244e86', hall: [3,3], barracks: [[5,3],[3,5]], workshop:[6,5], mine:[2,6], yard:[5,6], houses:[[2,3],[2,4],[2,5],[3,2],[4,2],[5,2],[6,2],[6,3],[6,4],[4,6]], walls: [] },
  { id: 'purple', name: 'Purple Kingdom', color: '#b38be8', dark: '#62408d', hall: [46,3], barracks: [[44,3],[46,5]], workshop:[43,5], mine:[47,6], yard:[44,6], houses:[[47,3],[47,4],[47,5],[46,2],[45,2],[44,2],[43,2],[43,3],[43,4],[45,6]], walls: [] },
  { id: 'yellow', name: 'Yellow and Red Kingdom', color: '#f0ca55', dark: '#a04a37', hall: [46,46], barracks: [[44,46],[46,44]], workshop:[43,44], mine:[47,43], yard:[44,43], houses:[[47,46],[47,45],[47,44],[46,47],[45,47],[44,47],[43,47],[43,46],[43,45],[45,43]], walls: [] },
  { id: 'orange', name: 'Orange and Black Kingdom', color: '#e98b45', dark: '#713c28', hall: [3,46], barracks: [[5,46],[3,44]], workshop:[6,44], mine:[2,43], yard:[5,43], houses:[[2,46],[2,45],[2,44],[3,47],[4,47],[5,47],[6,47],[6,46],[6,45],[4,43]], walls: [] }
];
const UNIT_TYPES = {
  swordsman:{hp:9,damage:4,move:2,range:1,cost:2,vision:3,level:1}, archer:{hp:4,damage:5,move:2,range:4,cost:3,vision:4,level:1}, horseman:{hp:13,damage:5,move:5,range:1,cost:5,vision:5,level:1},
  spearman:{hp:11,damage:5,move:2,range:1,cost:4,vision:3,level:2}, crossbowman:{hp:4,damage:7,move:2,range:5,cost:6,vision:4,level:2}, axeknight:{hp:16,damage:5,move:2,range:1,cost:6,vision:3,level:2},
  giant:{hp:26,damage:10,move:2,range:1,cost:12,vision:3,level:3,heavy:true}, healer:{hp:3,damage:0,move:2,range:0,cost:7,vision:3,level:3}, mage:{hp:5,damage:9,move:2,range:3,cost:11,vision:4,level:3},
  cannon:{hp:10,damage:10,move:0,range:8,cost:9,vision:4,level:1,heavy:true}, catapult:{hp:20,damage:25,move:2,range:14,cost:25,vision:5,level:2,heavy:true}, ram:{hp:35,damage:35,move:2,range:1,cost:18,vision:2,level:2,heavy:true}
};
const CONTROL_POINTS = [[24,8],[41,24],[24,41],[8,24]];
function id(){return crypto.randomBytes(8).toString('hex');}
function dist(a,b){return Math.abs(a.x-b.x)+Math.abs(a.y-b.y);}
function inside(x,y){return x>=0&&y>=0&&x<50&&y<50;}
function cellKey(x,y){return `${x},${y}`;}
function addBuilding(room, owner, type, x,y,hp,level=1){room.buildings.push({id:id(),owner,type,x,y,hp,maxHp:hp,level});}
function addUnit(room, owner, type, x,y){const t=UNIT_TYPES[type];room.units.push({id:id(),owner,type,x,y,hp:t.hp,maxHp:t.hp,damage:t.damage,vision:t.vision,move:t.move,range:t.range,upgraded:false});}
function makeRoom(hostName){
 const room={code:crypto.randomBytes(3).toString('hex').toUpperCase(),host:null,phase:'lobby',players:[],round:1,roundEndsAt:null,orders:{},finished:{},units:[],buildings:[],trees:[],water:[],deposits:[],points:CONTROL_POINTS.map((p,i)=>({id:i,x:p[0],y:p[1],owner:null})),log:[],winner:null,weather:'sunny',createdAt:Date.now()};
 COLORS.forEach((k,i)=>{
  const p={id:null,name:null,kingdom:k.id,connected:false,disconnectedAt:null,gold:10,ap:6,usedFireball:false,usedFireArrows:false,eliminated:false,explored:[]};room.players.push(p);
  addBuilding(room,i,'townhall',...k.hall,250);
  k.barracks.forEach(([x,y])=>addBuilding(room,i,'barracks',x,y,25));
  addBuilding(room,i,'workshop',...k.workshop,40);addBuilding(room,i,'goldmine',...k.mine,12);addBuilding(room,i,'trainingyard',...k.yard,22);
  k.houses.forEach(([x,y])=>addBuilding(room,i,'house',x,y,6));
  // Two gates and a compact, symmetrical wall perimeter.
  const cx=k.hall[0]<25?3:46, cy=k.hall[1]<25?3:46;
  const sx=cx<25?1:-1, sy=cy<25?1:-1;
  const wallCells=[];
  for(let n=0;n<8;n++){wallCells.push([cx+sx*(n-3),cy+sy*4]);wallCells.push([cx+sx*4,cy+sy*(n-3)]);}
  wallCells.forEach(([x,y],j)=>{if(inside(x,y)&&!room.buildings.some(b=>b.x===x&&b.y===y))addBuilding(room,i,j===2||j===12?'gate':'wall',x,y,j===2||j===12?40:60);});
  // One tower on each flank.
  [[cx+sx*4,cy],[cx,cy+sy*4]].forEach(([x,y])=>addBuilding(room,i,'tower',x,y,10));
  addUnit(room,i,'swordsman',cx+(sx*2),cy+(sy*1));addUnit(room,i,'archer',cx+(sx*1),cy+(sy*2));
 });
 // Deterministic neutral terrain, kept away from starting structures and control points.
 for(let y=10;y<40;y+=7)for(let x=10;x<40;x+=8){if((x+y)%3===0)room.water.push({x,y,w:2,h:2});else room.trees.push({x:x+1,y:y+1});}
 for(let y=8;y<43;y+=6)for(let x=8;x<43;x+=6){if((x*7+y*3)%5===0)room.deposits.push({id:id(),x,y,amount:3,claimed:false});}
 return room;
}
function log(room,msg){room.log.unshift({id:id(),round:room.round,text:msg,at:Date.now()});room.log=room.log.slice(0,40);}
function playerBySocket(room,socketId){return room.players.findIndex(p=>p.socketId===socketId);}
function publicPlayer(p){return {id:p.id,name:p.name,kingdom:p.kingdom,connected:p.connected,disconnectedAt:p.disconnectedAt,gold:p.gold,ap:p.ap,eliminated:p.eliminated};}
function visibleTo(room,viewer,entity){const p=room.players[viewer];if(entity.owner===viewer)return true;const sources=[];
 room.units.filter(u=>u.owner===viewer).forEach(u=>sources.push({x:u.x,y:u.y,r:u.vision}));room.buildings.filter(b=>b.owner===viewer&&b.type==='tower').forEach(b=>sources.push({x:b.x,y:b.y,r:6}));
 return sources.some(s=>Math.abs(s.x-entity.x)+Math.abs(s.y-entity.y)<=s.r);
}
function snapshot(room,viewer){
 const explored=new Set(room.players[viewer].explored);
 const sources=[];room.units.filter(u=>u.owner===viewer).forEach(u=>sources.push({x:u.x,y:u.y,r:u.vision}));room.buildings.filter(b=>b.owner===viewer&&b.type==='tower').forEach(b=>sources.push({x:b.x,y:b.y,r:6}));
 for(const s of sources)for(let y=Math.max(0,s.y-s.r);y<=Math.min(49,s.y+s.r);y++)for(let x=Math.max(0,s.x-s.r);x<=Math.min(49,s.x+s.r);x++)if(Math.abs(x-s.x)+Math.abs(y-s.y)<=s.r)explored.add(cellKey(x,y));
 room.players[viewer].explored=[...explored];
 return {code:room.code,phase:room.phase,round:room.round,roundEndsAt:room.roundEndsAt,weather:room.weather,winner:room.winner,me:viewer,players:room.players.map(publicPlayer),units:room.units.filter(u=>visibleTo(room,viewer,u)),buildings:room.buildings.filter(b=>visibleTo(room,viewer,b)),trees:room.trees,water:room.water,deposits:room.deposits.filter(d=>explored.has(cellKey(d.x,d.y))),points:room.points.map(p=>({id:p.id,x:p.x,y:p.y,owner:(Math.abs(p.x-24)+Math.abs(p.y-24)<=50&&sources.some(s=>Math.abs(s.x-p.x)+Math.abs(s.y-p.y)<=s.r))?p.owner:null})),explored:[...explored],log:room.log.slice(0,20),orders:room.orders[viewer]||[],finished:room.finished[viewer]||false};
}
function emitRoom(room){room.players.forEach((p,i)=>{if(p.socketId&&p.connected)io.to(p.socketId).emit('state',snapshot(room,i));});}
function err(socket,msg){socket.emit('errorMessage',msg);}
function occupied(room,x,y,ignore){return room.units.some(u=>u.id!==ignore&&u.x===x&&u.y===y)||room.buildings.some(b=>b.x===x&&b.y===y&&b.hp>0)||room.trees.some(t=>t.x===x&&t.y===y)||room.water.some(w=>x>=w.x&&x<w.x+w.w&&y>=w.y&&y<w.y+w.h);}
function gateAllowed(room,owner,x,y,fromX,fromY){const b=room.buildings.find(b=>b.x===x&&b.y===y&&b.type==='gate');if(!b)return true;if(b.owner===owner)return true;return false;}
function pathValid(room,unit,x,y){const steps=dist(unit,{x,y});if(steps>unit.move||steps===0)return false;let cx=unit.x,cy=unit.y;const dx=Math.sign(x-cx),dy=Math.sign(y-cy);for(let i=0;i<steps;i++){if(cx!==x)cx+=dx;else if(cy!==y)cy+=dy;if(!inside(cx,cy)||occupied(room,cx,cy,unit.id))return false;}return true;}
function apCost(unit,kind){if(unit.type==='giant'||unit.type==='catapult'||unit.type==='ram')return kind==='move'?2:(unit.type==='catapult'?4:unit.type==='ram'?3:2);return kind==='attack'&&unit.type==='cannon'?2:1;}
function submitOrder(room,pi,order){const p=room.players[pi];if(room.phase!=='playing'||p.eliminated||room.finished[pi])throw Error('You cannot act right now.');if(!order||typeof order!=='object')throw Error('Invalid action.');
 const unit=room.units.find(u=>u.id===order.unitId&&u.owner===pi);let cost=1;
 if(order.type==='move'||order.type==='attack'||order.type==='heal'){
  if(!unit)throw Error('Unit not found.');cost=apCost(unit,order.type==='move'?'move':'attack');
  if(order.type==='move'){const x=Number(order.x),y=Number(order.y);if(!inside(x,y)||!pathValid(room,unit,x,y))throw Error('Invalid movement path or occupied destination.');}
  if(order.type==='attack'||order.type==='heal'){const target=room.units.find(u=>u.id===order.targetId)||room.buildings.find(b=>b.id===order.targetId);if(!target)throw Error('Target not found.');const d=dist(unit,target);if(order.type==='heal'){if(unit.type!=='healer'||target.owner!==pi||d>5)throw Error('Invalid healing target.');}else{if(unit.type==='ram'&&!['wall','gate','house','townhall','barracks','workshop','goldmine','trainingyard'].includes(target.type))throw Error('Rams can only attack buildings.');if(unit.type!=='ram'&&d>unit.range)throw Error('Target is out of range.');if(unit.type==='ram'&&d>1)throw Error('Target is out of range.');}
  }
 } else if(order.type==='recruit'){
  const b=room.buildings.find(b=>b.id===order.buildingId&&b.owner===pi&&b.type==='barracks');const t=UNIT_TYPES[order.unitType];if(!b||!t||t.level>b.level)throw Error('Unit unavailable at this Barracks level.');if(p.gold<t.cost)throw Error('Not enough gold.');cost=1;
 } else if(order.type==='upgradeBuilding'){
  const b=room.buildings.find(b=>b.id===order.buildingId&&b.owner===pi);if(!b)throw Error('Building not found.');let price=0;if(b.type==='townhall'&&b.level===1)price=8;else if(b.type==='barracks'&&b.level<3)price=b.level===1?6:10;else if(b.type==='workshop'&&b.level===1)price=10;else if(b.type==='goldmine'&&b.level===1)price=5;else if(b.type==='wall'&&b.maxHp===60)price=1;else if(b.type==='gate'&&b.maxHp===40)price=2;else throw Error('This building cannot be upgraded.');if(p.gold<price)throw Error('Not enough gold.');order.price=price;cost=1;
 } else if(order.type==='upgradeUnit'){
  const u=room.units.find(u=>u.id===order.unitId&&u.owner===pi);if(!u)throw Error('Unit not found.');const prices={swordsman:3,archer:4,crossbowman:4,axeknight:2,ram:4};if(!(u.type in prices)||u.upgraded)throw Error('This unit cannot be upgraded.');if(p.gold<prices[u.type])throw Error('Not enough gold.');order.price=prices[u.type];cost=1;
 } else if(order.type==='fireball'||order.type==='fireArrows'){
  if(order.type==='fireball'&&(room.round<6||p.usedFireball))throw Error('Fireball is not available.');if(order.type==='fireArrows'&&(room.round<8||p.usedFireArrows))throw Error('Fire Arrows are not available.');if(!inside(Number(order.x),Number(order.y)))throw Error('Invalid target.');cost=1;
 } else throw Error('Unknown action.');
 const reserved=(room.orders[pi]||[]).reduce((s,o)=>s+o.cost,0);if(p.ap-reserved<cost)throw Error('Not enough Action Points.');order.cost=cost;order.id=id();room.orders[pi]=room.orders[pi]||[];room.orders[pi].push(order);return order;
}
function resolve(room){
 const all=[];room.players.forEach((p,pi)=>(room.orders[pi]||[]).forEach((o,oi)=>all.push({pi,oi,o,priority:crypto.createHash('sha256').update(`${room.code}:${room.round}:${pi}:${oi}`).digest('hex')})));
 all.sort((a,b)=>a.priority.localeCompare(b.priority));
 // Validate against a shared snapshot; movement conflicts are won by deterministic hash order.
 for(const item of all){const {pi,o}=item,p=room.players[pi];if(p.eliminated)continue;
  if(o.type==='move'){const u=room.units.find(u=>u.id===o.unitId&&u.owner===pi);if(u&&pathValid(room,u,Number(o.x),Number(o.y))&&!occupied(room,Number(o.x),Number(o.y),u.id)){u.x=Number(o.x);u.y=Number(o.y);const dep=room.deposits.find(d=>d.x===u.x&&d.y===u.y&&!d.claimed);if(dep){dep.claimed=true;p.gold+=dep.amount;log(room,`${p.name} collected ${dep.amount} gold.`);}}}
  if(o.type==='attack'){const u=room.units.find(u=>u.id===o.unitId&&u.owner===pi),t=room.units.find(u=>u.id===o.targetId)||room.buildings.find(b=>b.id===o.targetId);if(!u||!t)continue;const d=dist(u,t);if(d>u.range&&u.type!=='ram')continue;if(u.type==='ram'&&d>1)continue;if(t.owner===pi)continue;const dmg=u.type==='mage'?u.damage:u.damage;t.hp-=dmg;if(t.hp<=0){if(room.units.includes(t)){room.units=room.units.filter(x=>x.id!==t.id);p.gold+=1;log(room,`${p.name} destroyed an enemy ${t.type}.`);}else{room.buildings=room.buildings.filter(x=>x.id!==t.id);if(t.type==='house')p.gold+=4;if(t.type==='townhall'){p.gold+=25;const victim=room.players[t.owner];victim.eliminated=true;room.units=room.units.filter(x=>x.owner!==t.owner);log(room,`${p.name} destroyed ${victim.name}'s Town Hall!`);}else log(room,`${p.name} destroyed an enemy ${t.type}.`);}}}
  if(o.type==='heal'){const u=room.units.find(u=>u.id===o.unitId&&u.owner===pi),t=room.units.find(u=>u.id===o.targetId&&u.owner===pi);if(u&&t&&u.type==='healer'&&dist(u,t)<=5)t.hp=Math.min(t.maxHp,t.hp+3);}
  if(o.type==='recruit'){const b=room.buildings.find(b=>b.id===o.buildingId&&b.owner===pi&&b.type==='barracks'),t=UNIT_TYPES[o.unitType];if(b&&t&&p.gold>=t.cost){const spot=[ [b.x+1,b.y],[b.x-1,b.y],[b.x,b.y+1],[b.x,b.y-1] ].find(([x,y])=>inside(x,y)&&!occupied(room,x,y));if(spot){p.gold-=t.cost;addUnit(room,pi,o.unitType,...spot);}}}
  if(o.type==='upgradeBuilding'){const b=room.buildings.find(b=>b.id===o.buildingId&&b.owner===pi);if(!b||p.gold<o.price)continue;p.gold-=o.price;b.level++;if(b.type==='townhall'){p.ap=8;}else if(b.type==='goldmine')b.income=9;else if(b.type==='wall'){b.maxHp=100;b.hp=100;}else if(b.type==='gate'){b.maxHp=80;b.hp=80;}}
  if(o.type==='upgradeUnit'){const u=room.units.find(u=>u.id===o.unitId&&u.owner===pi);if(!u||u.upgraded||p.gold<o.price)continue;p.gold-=o.price;u.upgraded=true;if(u.type==='swordsman'){u.maxHp+=2;u.hp+=2;u.damage+=1;}if(u.type==='archer'){u.maxHp+=1;u.hp+=1;u.damage+=2;}if(u.type==='crossbowman'){u.range=6;u.damage+=1;}if(u.type==='axeknight'){u.maxHp+=4;u.hp+=4;u.damage+=1;}if(u.type==='ram'){u.maxHp+=5;u.hp+=5;u.damage+=20;}}
  if(o.type==='fireball'||o.type==='fireArrows'){if(o.type==='fireball'){if(p.usedFireball||room.round<6)continue;p.usedFireball=true;}else{if(p.usedFireArrows||room.round<8)continue;p.usedFireArrows=true;}const radius=o.type==='fireball'?1:2,dmg=o.type==='fireball'?10:6;room.units.forEach(u=>{if(Math.abs(u.x-o.x)<=radius&&Math.abs(u.y-o.y)<=radius&&u.owner!==pi)u.hp-=dmg;});room.buildings.forEach(b=>{if(Math.abs(b.x-o.x)<=radius&&Math.abs(b.y-o.y)<=radius&&b.owner!==pi)b.hp-=dmg;});room.units=room.units.filter(u=>u.hp>0);room.buildings=room.buildings.filter(b=>b.hp>0);}
 }
 // Clean destroyed structures and resolve simultaneous deaths.
 room.units=room.units.filter(u=>u.hp>0);room.buildings=room.buildings.filter(b=>b.hp>0);
 room.points.forEach(point=>{const insideUnits=room.units.filter(u=>u.x>=point.x&&u.x<point.x+2&&u.y>=point.y&&u.y<point.y+2);const owners=[...new Set(insideUnits.map(u=>u.owner))];if(owners.length===1)point.owner=owners[0];else if(owners.length>1)point.owner='contested';});
 room.players.forEach((p,pi)=>{if(p.eliminated)return;p.gold+=1;const mine=room.buildings.find(b=>b.owner===pi&&b.type==='goldmine');if(mine)p.gold+=(mine.level>1?9:7);room.points.filter(x=>x.owner===pi).forEach(()=>p.gold+=3);p.ap=p.buildingsTownHall?8:p.ap;});
 room.round++;room.weather=room.round>3?'rain':'sunny';room.orders={};room.finished={};room.players.forEach((p,pi)=>{if(!p.eliminated){p.ap=room.buildings.some(b=>b.owner===pi&&b.type==='townhall'&&b.level>1)?8:6;}});
 const alive=room.players.map((p,i)=>p.eliminated?null:i).filter(x=>x!==null);if(alive.length<=1){room.phase='finished';room.winner=alive.length?alive[0]:null;log(room,room.winner===null?'The match ended in a draw.':`${room.players[room.winner].name} wins Four Kings!`);}else{room.roundEndsAt=Date.now()+180000;log(room,`Round ${room.round} begins.`);}
}
function startRoundTicker(room){if(room._ticker)return;room._ticker=setInterval(()=>{if(room.phase!=='playing')return;if(Date.now()>=room.roundEndsAt){resolve(room);emitRoom(room);}},500);}
function startGame(room){if(room.players.length!==4||room.players.some(p=>!p.id))throw Error('Four players are required.');room.phase='playing';room.round=1;room.roundEndsAt=Date.now()+180000;room.players.forEach(p=>p.ap=6);log(room,'The battle begins!');startRoundTicker(room);}
function cleanup(){for(const [code,r] of rooms){r.players.forEach((p,i)=>{if(!p.connected&&p.disconnectedAt&&Date.now()-p.disconnectedAt>300000){p.id=null;p.name=null;p.disconnectedAt=null;p.socketId=null;}});if(r.phase==='lobby'&&Date.now()-r.createdAt>3600000)rooms.delete(code);}}
setInterval(cleanup,10000);
io.on('connection',socket=>{
 socket.on('createRoom',({name})=>{try{const room=makeRoom(name);const token=id();room.host=token;room.players[0].id=token;room.players[0].name=String(name||'King').slice(0,18);room.players[0].connected=true;room.players[0].socketId=socket.id;room.players[0].token=token;rooms.set(room.code,room);socket.join(room.code);socket.emit('joined',{code:room.code,token,seat:0});emitRoom(room);}catch(e){err(socket,e.message);}});
 socket.on('joinRoom',({code,name,token})=>{try{const room=rooms.get(String(code||'').toUpperCase());if(!room)throw Error('Room not found.');let pi=room.players.findIndex(p=>p.token===token&&p.id);if(pi<0)pi=room.players.findIndex(p=>!p.id);if(pi<0)throw Error('This room is full.');const p=room.players[pi];if(p.connected&&p.socketId!==socket.id)throw Error('That seat is already connected.');if(p.id&&p.disconnectedAt&&Date.now()-p.disconnectedAt>300000)throw Error('Your reservation has expired.');if(!p.id){const newToken=id();p.id=newToken;p.token=newToken;p.name=String(name||'King').slice(0,18);}p.connected=true;p.disconnectedAt=null;p.socketId=socket.id;socket.join(room.code);socket.emit('joined',{code:room.code,token:p.token,seat:pi});emitRoom(room);}catch(e){err(socket,e.message);}});
 socket.on('selectKingdom',({code,token,kingdom})=>{const r=rooms.get(code);if(!r||r.phase!=='lobby')return err(socket,'Lobby is closed.');const pi=r.players.findIndex(p=>p.token===token);if(pi<0)return err(socket,'Session not found.');if(!COLORS.some(k=>k.id===kingdom))return err(socket,'Invalid kingdom.');if(r.players.some((p,i)=>i!==pi&&p.kingdom===kingdom&&p.id))return err(socket,'That kingdom is occupied.');r.players[pi].kingdom=kingdom;emitRoom(r);});
 socket.on('startGame',({code,token})=>{const r=rooms.get(code);if(!r)return err(socket,'Room not found.');if(r.host!==token)return err(socket,'Only the host can start.');try{startGame(r);emitRoom(r);}catch(e){err(socket,e.message);}});
 socket.on('queueAction',({code,token,order})=>{const r=rooms.get(code);if(!r)return err(socket,'Room not found.');const pi=r.players.findIndex(p=>p.token===token);if(pi<0)return err(socket,'Session not found.');try{submitOrder(r,pi,order);emitRoom(r);}catch(e){err(socket,e.message);}});
 socket.on('cancelAction',({code,token,orderId})=>{const r=rooms.get(code);if(!r)return;const pi=r.players.findIndex(p=>p.token===token);if(pi<0||r.finished[pi])return;const a=r.orders[pi]||[];const removed=a.find(o=>o.id===orderId);r.orders[pi]=a.filter(o=>o.id!==orderId);if(removed)r.players[pi].ap+=removed.cost;emitRoom(r);});
 socket.on('finishTurn',({code,token})=>{const r=rooms.get(code);if(!r||r.phase!=='playing')return;const pi=r.players.findIndex(p=>p.token===token);if(pi<0)return;r.finished[pi]=true;if(r.players.every((p,i)=>p.eliminated||r.finished[i])){resolve(r);}emitRoom(r);});
 socket.on('disconnect',()=>{for(const r of rooms.values()){const pi=playerBySocket(r,socket.id);if(pi>=0){r.players[pi].connected=false;r.players[pi].disconnectedAt=Date.now();r.players[pi].socketId=null;emitRoom(r);}}});
});
server.listen(PORT,()=>console.log(`Four Kings listening on ${PORT}`));
