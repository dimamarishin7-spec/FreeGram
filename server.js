// FreeGram server v2 (zero dependencies, Node 18+)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const E=process.env,PORT=E.PORT||3000,DBF=E.DB_FILE||path.join(__dirname,'data.json');
const TURL=(E.TURSO_DATABASE_URL||'').trim().replace(/^libsql:\/\//,'https://').replace(/\/+$/,''),TTOK=(E.TURSO_AUTH_TOKEN||'').trim();
let db={users:{},phones:{},tokens:{},msgs:[],gifts:{},names:{},chats:{},anon:{},sales:[],seq:1};
const IMGS={};
const nameOk=u=>/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(u);
// ---------- storage: Turso (HTTP) or local file ----------
async function tpipe(stmts){
  const reqs=stmts.map(s=>({type:'execute',stmt:{sql:s[0],args:(s[1]||[]).map(v=>({type:'text',value:String(v)}))}}));
  reqs.push({type:'close'});
  const r=await fetch(TURL+'/v2/pipeline',{method:'POST',headers:{Authorization:'Bearer '+TTOK,'Content-Type':'application/json'},body:JSON.stringify({requests:reqs})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.results)throw new Error('Turso HTTP '+r.status+' '+JSON.stringify(j).slice(0,200));
  j.results.forEach(x=>{if(x.type!=='ok')throw new Error('Turso: '+JSON.stringify(x).slice(0,200))});
  return j.results.map(x=>x.response&&x.response.result);
}
async function loadDb(){
  if(TURL){
    await tpipe([['CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)']]);
    const [r]=await tpipe([['SELECT v FROM kv WHERE k LIKE ? ORDER BY k',['db:%']]]);
    return r.rows.length?JSON.parse(r.rows.map(x=>x[0].value).join('')):null;
  }
  try{return JSON.parse(fs.readFileSync(DBF,'utf8'))}catch(e){return null}
}
async function persist(s){
  if(TURL){
    const st=[['BEGIN'],['DELETE FROM kv WHERE k LIKE ?',['db:%']]];
    for(let i=0,n=0;i<s.length;i+=300000,n++)st.push(['INSERT OR REPLACE INTO kv (k,v) VALUES (?,?)',['db:'+String(n).padStart(4,'0'),s.slice(i,i+300000)]]);
    st.push(['COMMIT']);await tpipe(st);
  }else{fs.writeFileSync(DBF+'.tmp',s);fs.renameSync(DBF+'.tmp',DBF)}
}
let dirty=false,saving=false,tm;
const save=()=>{dirty=true;clearTimeout(tm);tm=setTimeout(flush,2500)};
async function flush(){
  if(saving||!dirty)return;saving=true;dirty=false;
  try{await persist(JSON.stringify(db).replace(/[\u007f-\uffff]/g,c=>'\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4)))}
  catch(e){console.error('save failed:',e.message);dirty=true}
  saving=false;if(dirty)setTimeout(flush,5000);
}
async function loadImgs(){
  try{
    if(TURL){const [r]=await tpipe([['SELECT k,v FROM kv WHERE k LIKE ?',['img:%']]]);r.rows.forEach(x=>{IMGS[x[0].value.slice(4)]=x[1].value})}
    else Object.assign(IMGS,JSON.parse(fs.readFileSync(DBF+'.imgs','utf8')))
  }catch(e){}
}
function saveImg(key,data){
  if(TURL)tpipe(data?[['INSERT OR REPLACE INTO kv (k,v) VALUES (?,?)',['img:'+key,data]]]:[['DELETE FROM kv WHERE k=?',['img:'+key]]]).catch(e=>console.error('img save',e.message));
  else try{fs.writeFileSync(DBF+'.imgs',JSON.stringify(IMGS))}catch(e){}
}
// ---------- helpers ----------
const pick=a=>a[Math.floor(Math.random()*a.length)],rint=n=>Math.floor(Math.random()*n);
const L=s=>String(s||'').trim().toLowerCase();
const BADGES=['blue','white','red','triangle','crown','diamond'];
const REG=[['heart','❤️','Heart',15,['#ffd1dc','#ff7a9c']],['bear','🧸','Teddy Bear',15,['#ffe3c9','#f0a56b']],['gift','🎁','Gift',25,['#ffd6d6','#ff7a7a']],['rose','🌹','Rose',25,['#ffd6dc','#e0526b']],['cake','🎂','Cake',50,['#fff0c2','#ffc857']],['bouquet','💐','Bouquet',50,['#e8f5d3','#8fd16a']],['rocket','🚀','Rocket',50,['#d6e6ff','#6aa6ff']],['champagne','🍾','Champagne',50,['#fff2c9','#e6c34b']],['trophy','🏆','Trophy',100,['#fff0b8','#f0b429']],['ring','💍','Ring',100,['#e5e0ff','#9a8cff']],['diamond','💎','Diamond',100,['#d3f3ff','#4fc3f7']]];
const NFT=[['plushpepe','🐸','Plush Pepe'],['durovscap','🧢','Durov’s Cap'],['heartlocket','💝','Heart Locket'],['preciouspeach','🍑','Precious Peach'],['heroichelmet','🪖','Heroic Helmet'],['astralshard','💠','Astral Shard'],['eternalrose','🌹','Eternal Rose'],['lootbag','💰','Loot Bag'],['iongem','💎','Ion Gem'],['nailbracelet','⛓️','Nail Bracelet'],['scaredcat','🙀','Scared Cat'],['genielamp','🪔','Genie Lamp'],['swisswatch','⌚','Swiss Watch'],['signetring','💍','Signet Ring'],['tophat','🎩','Top Hat'],['toybear','🧸','Toy Bear'],['bondedring','💍','Bonded Ring'],['electricskull','💀','Electric Skull'],['minioscar','🏆','Mini Oscar'],['perfumebottle','🧴','Perfume Bottle'],['lovepotion','🧪','Love Potion'],['kissedfrog','🐸','Kissed Frog'],['magicpotion','⚗️','Magic Potion'],['nekohelmet','🐱','Neko Helmet'],['sakuraflower','🌸','Sakura Flower'],['lightsword','⚔️','Light Sword'],['witchhat','🧙','Witch Hat'],['snowglobe','🔮','Snow Globe']];
const BACKDROPS=[['Emerald','#6fd3a5','#1c7a5a'],['Onyx Black','#3a3a3a','#0d0d0d'],['Pure Gold','#f7d774','#b8860b'],['Shamrock Green','#6bd16b','#1f7a1f'],['Cappuccino','#d1b49a','#7a5c46'],['Midnight Blue','#3b5bdb','#10163a'],['Navy Blue','#4a78c2','#14284b'],['Silver Blue','#b6c6dc','#6a7f9c'],['Sky Blue','#8fd3ff','#3a8fd1'],['Electric Purple','#c27bff','#5b1fa8'],['Amber','#ffc857','#b36b00'],['Lemongrass','#e0ee7a','#8a9a1f'],['Mystic Pearl','#f3d9ff','#a78bc4'],['Fire Engine','#ff6b5a','#9b1c10'],['Satin Gold','#e8c97a','#a67c2a'],['Rosewood','#c47a7a','#6b2e2e'],['Pacific Green','#4fd1c5','#16756c'],['Tomato','#ff7a59','#a82a10'],['Strawberry','#ff7fa0','#b5214b'],['Mint Green','#a8f0c6','#4fae80'],['Burgundy','#b0405a','#4a0e1f'],['Pistachio','#c5e89a','#79a33a'],['Copper','#e29a6a','#8a4a22'],['Desert Sand','#e9d3a1','#a88a4a'],['Carrot Juice','#ffa24a','#b3500b'],['Camo Green','#8aa56a','#3b4d28'],['Dark Lilac','#9a7fbf','#3d2a5e']];
const MODELS=['Mardi Gras','Neon Pulse','Frost Byte','Golden Hour','Void','Candy','Aurora','Ember','Ocean Breeze','Royal','Retro','Pixel','Cosmic','Velvet','Chrome'],SYMS=['Apple','Star','Moon','Bolt','Crown','Heart','Clover','Skull','Flower','Fire','Gem','Cat','Snowflake','Cherry','Ghost'];
const REACTS=['👍','❤️','🔥','😂','😮','😢','🎉','👎','💯','🤔','🙏','😍'];
const nameCost=u=>u.length<=4?500:u.length<=6?100:10,rarity=u=>u.length<=4?'legendary':u.length<=6?'rare':'common';
const FG='sys_freegram',UB='sys_unban',VB='sys_verif',AN='sys_anon',CH='ch_freegram';
const fx=()=>Math.round((0.5+Math.random()*4.5)*10)/10;
function rollNft(g){const b=pick(BACKDROPS);g.kind='nft';g.num=1+rint(9999);g.model=pick(MODELS);g.bg=b[0];g.c=[b[1],b[2]];g.sym=pick(SYMS);g.r=[fx(),fx(),fx()];g.price=null;return g}
const mkGift=owner=>{const n=pick(NFT),id='g'+(db.seq++);return db.gifts[id]=rollNft({id,owner,key:n[0],e:n[1],n:n[2]})};
const mkReg=(owner,x)=>{const id='g'+(db.seq++);return db.gifts[id]={id,owner,kind:'reg',key:x[0],e:x[1],n:x[2],cost:x[3],c:x[4],price:null}};
const pubG=g=>({id:g.id,owner:g.owner,kind:g.kind||'nft',key:g.key||'',e:g.e,n:g.n,c:g.c,num:g.num,model:g.model,bg:g.bg,sym:g.sym,r:g.r,cost:g.cost,price:g.price,pg:!!(db.users[g.owner]&&(db.users[g.owner].pg||[]).includes(g.id))});
const addName=(owner,u,coll)=>db.names[L(u)]={u,owner,price:null,r:rarity(u),coll:!!coll};
const randName=owner=>{let u;do{u='user'+(10000+rint(90000))}while(db.names[u]);return addName(owner,u)};
const ownedNames=id=>Object.values(db.names).filter(n=>n.owner===id);
const handle=id=>{const u=db.users[id];return u&&u.primary&&db.names[u.primary]?db.names[u.primary].u:''};
function ensurePrimary(id){const u=db.users[id];if(!u)return;const o=ownedNames(id);if(!u.primary||!o.some(n=>L(n.u)===u.primary))u.primary=o.length?L(o[0].u):L(randName(id).u)}
const ent=id=>db.users[id]||db.chats[id];
const chatHandle=id=>{const n=Object.values(db.names).find(x=>x.owner===id);return n?n.u:''};
const card=id=>{
  const u=db.users[id];
  if(u)return{id,kind:u.bot?'bot':'user',name:u.name,handle:handle(id),badge:u.admin?(u.badge||'blue'):(u.badge||''),status:u.status||'',color:u.color||'',sys:!!u.sys};
  const c=db.chats[id];
  if(c)return{id,kind:c.type,name:c.name,handle:chatHandle(id),badge:c.badge||'',owner:c.owner,members:id===CH?undefined:(c.members||[]).length};
  return{id,kind:'user',name:'?',handle:'',badge:'',status:'',color:''};
};
const hash=(p,s)=>crypto.scryptSync(p,s,32).toString('hex');
const normPhone=s=>{const d=String(s||'').replace(/\D/g,'');if(!d)return'';const min=d.startsWith('888')?7:8;return d.length<min||d.length>15?'':'+'+d};
const isAnon=ph=>ph.startsWith('+888');
const adminId=()=>(Object.values(db.users).find(u=>u.admin)||{}).id;
const clients=new Map(),fails=new Map();
const push=(u,ev,d)=>(clients.get(u)||[]).forEach(r=>r.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`));
const send=(res,code,o)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
const err=(res,code,e)=>send(res,code,{error:e});
const notify=m=>{const c=db.chats[m.to];if(m.to==='all'||m.to===CH)clients.forEach((_,u)=>push(u,'msg',{to:m.to}));else if(c)(c.members||[]).forEach(u=>push(u,'msg',{to:m.to}));else{push(m.from,'msg',{to:m.to});if(m.to!==m.from)push(m.to,'msg',{to:m.from})}};
function say(m){m.id=db.seq++;m.ts=Date.now();db.msgs.push(m);if(db.msgs.length>3000)db.msgs.splice(0,500);notify(m);save();return m}
const botSay=(bot,to,k,p,btn,bd)=>say({from:bot,fn:db.users[bot].name,to,k,p,btn,bd});
function buyGift(bid,g){
  const b=db.users[bid],s=db.users[g.owner];if(!b||b.stars<g.price)return false;
  const got=Math.floor(g.price*.75);b.stars-=g.price;if(s)s.stars+=got;
  db.sales.push({key:g.key,price:g.price,ts:Date.now()});if(db.sales.length>300)db.sales.splice(0,100);
  if(s&&!s.bot)botSay(FG,s.id,'m_sold',{n:g.n+(g.num?' #'+g.num:''),who:'@'+handle(bid),price:g.price,got});
  g.owner=bid;g.price=null;return true;
}
function buyName(bid,n){
  const b=db.users[bid],s=db.users[n.owner];if(!b||b.stars<n.price)return false;
  b.stars-=n.price;if(s)s.stars+=n.price;const old=n.owner,pr=n.price;n.owner=bid;n.price=null;ensurePrimary(old);
  if(s&&!s.bot)botSay(FG,s.id,'m_sold_name',{n:'@'+n.u,who:'@'+handle(bid),price:pr});
  return true;
}
function newUser(ph,name,pw){
  const id='u'+(db.seq++),salt=crypto.randomBytes(16).toString('hex');
  db.phones[ph]=id;db.users[id]={id,phone:ph,name:String(name||'').trim().slice(0,30)||'User',stars:1000,primary:null,created:Date.now(),salt,hash:pw?hash(pw,salt):''};
  randName(id);ensurePrimary(id);mkGift(id);mkGift(id);botSay(FG,id,'m_welcome');return db.users[id];
}
function deleteUser(id){
  const U=db.users[id];if(!U)return;
  for(const t in db.tokens)if(db.tokens[t].id===id)delete db.tokens[t];
  db.msgs=db.msgs.filter(m=>m.from!==id&&m.to!==id);
  for(const k in db.gifts)if(db.gifts[k].owner===id)delete db.gifts[k];
  for(const k in db.names)if(db.names[k].owner===id)delete db.names[k];
  if(U.phone)delete db.phones[U.phone];
  for(const k in db.anon)if(db.anon[k].owner===id&&!db.anon[k].admin)delete db.anon[k];
  for(const c of Object.values(db.chats)){if(c.id===CH)continue;if(c.owner===id){db.msgs=db.msgs.filter(m=>m.to!==c.id);for(const k in db.names)if(db.names[k].owner===c.id)delete db.names[k];delete db.chats[c.id]}else c.members=(c.members||[]).filter(x=>x!==id)}
  delete db.users[id];(clients.get(id)||[]).forEach(r=>r.end());clients.delete(id);
}
// ---------- admin, system bots, trader bots ----------
function sysBot(id,name,h,badge){if(!db.users[id]){db.users[id]={id,name,bot:1,sys:1,stars:0,primary:L(h),created:Date.now()};addName(id,h)}db.users[id].badge=db.users[id].badge||badge||''}
function initAdmin(){
  const ph=normPhone(E.ADMIN_PHONE);if(!ph)return;
  let id=db.phones[ph];
  if(!id){id='admin';db.phones[ph]=id;db.users[id]={id,phone:ph,name:'Admin',stars:1e9,primary:null,created:Date.now()};if(!db.names.admin)addName(id,'admin');ensurePrimary(id);mkGift(id)}
  const U=db.users[id];U.admin=true;db.anon[ph]={owner:id,admin:true};U.anon=ph;
  if(E.ADMIN_PASSWORD){U.salt=crypto.randomBytes(16).toString('hex');U.hash=hash(E.ADMIN_PASSWORD,U.salt)}
  if(!db.chats[CH]){db.chats[CH]={id:CH,type:'channel',name:'FreeGram',owner:id,badge:'blue'};addName(CH,'freegram_channel');say({from:CH,fn:'FreeGram',to:CH,k:'ch_welcome'})}
  db.chats[CH].owner=id;
}
function makeBot(h,name,lines){const id='ai_'+L(h);db.users[id]={id,name,bot:1,stars:1e12,primary:L(h),lines:lines||[],created:Date.now()};addName(id,h);for(let i=0;i<3;i++)mkGift(id);return db.users[id]}
const traders=()=>Object.values(db.users).filter(u=>u.bot&&!u.sys);
const LINES=['Who sells Precious Peach?','Just bought a new username 🔥','Gifts are getting pricier today','Looking for a rare @name','Selling a gift, check the market'];
function botTick(){
  const bl=traders();if(!bl.length)return;const b=pick(bl),r=Math.random();
  const lg=Object.values(db.gifts).filter(g=>g.price!=null&&g.owner!==b.id),ln=Object.values(db.names).filter(n=>n.price!=null&&n.owner!==b.id);
  if(r<.4&&lg.length)buyGift(b.id,pick(lg));
  else if(r<.6&&ln.length)buyName(b.id,pick(ln));
  else if(r<.8){const mine=Object.values(db.gifts).filter(g=>g.owner===b.id&&g.price==null);if(mine.length)pick(mine).price=50+rint(2000);else mkGift(b.id)}
  else if(r<.9)say({from:b.id,fn:b.name,to:'all',t:pick(b.lines&&b.lines.length?b.lines:LINES)});
  else mkGift(b.id);
  save();
}
// system bot conversations
function sysChat(me,U,to,t){
  const txt=t.trim();
  if(to===UB){
    if(txt==='/start'){U.appeal=!!U.frozen;return botSay(UB,me,U.frozen?'ub_frozen':'ub_free')}
    if(U.frozen&&U.appeal){U.appeal=false;const a=adminId();if(a)botSay(FG,a,'ap_msg',{who:U.name+' @'+handle(me),text:txt.slice(0,500)},[{k:'ignore',l:'btnIgnore'},{k:'unfreeze',l:'btnUnfreeze'}],{uid:me});return botSay(UB,me,'ub_sent')}
    return botSay(UB,me,'ub_start');
  }
  if(to===AN){
    if(txt==='/start')return botSay(AN,me,'an_start');
    if(txt==='/code'){const a=U.anon&&db.anon[U.anon];return a&&!a.admin?botSay(AN,me,'an_code',{num:U.anon,code:a.code}):botSay(AN,me,'an_nonum')}
    const d=txt.replace(/\D/g,'');
    if(!/^888\d{4,5}$/.test(d))return botSay(AN,me,'an_bad');
    const num='+'+d;
    if(db.anon[num])return botSay(AN,me,'an_taken',{num});
    if(U.anon)return botSay(AN,me,'an_have');
    const price=d.length===7?500000:100000;
    return botSay(AN,me,'an_price',{num,price:price.toLocaleString('en-US')},[{k:'anbuy:'+d,l:'btnBuy'},{k:'ignore',l:'btnIgnore'}],{num,price});
  }
  if(to===VB){
    if(txt==='/start')return botSay(VB,me,'v_hello');
    const n=db.names[L(txt).replace(/^@/,'')],e=n&&ent(n.owner);
    if(!e)return botSay(VB,me,'v_nf');
    if(e.badge||e.admin)return botSay(VB,me,'v_has');
    const a=adminId();
    if(a)botSay(FG,a,'v_req',{who:U.name+' @'+handle(me),target:'@'+n.u},[...BADGES.map(x=>({k:'vgive:'+x,l:'bt_'+x})),{k:'ignore',l:'btnIgnore'}],{target:n.owner,req:me});
    return botSay(VB,me,'v_sent');
  }
}
function pressButton(me,U,m,k0){
  const bd=m.bd||{},[k,ty]=String(k0).split(':');
  if(k==='unfreeze'&&U.admin){const T=db.users[bd.uid];if(T){T.frozen=false;T.appeal=false;botSay(UB,T.id,'ub_unfrozen')}}
  else if(k==='vgive'&&U.admin&&BADGES.includes(ty)){const e=ent(bd.target);if(e){e.badge=ty;if(bd.req&&db.users[bd.req])botSay(VB,bd.req,'v_ok')}}
  else if(k==='vagree'&&bd.owner===me){const e=ent(bd.target);if(e)e.badge=bd.type||'blue';botSay(FG,me,'v_ok')}
  else if(k==='vdecl'&&bd.owner===me)botSay(FG,me,'v_no');
  else if(k==='offeryes'&&m.to===me){
    const g=db.gifts[bd.gid],B=db.users[bd.buyer];
    if(!g||g.owner!==me||!B||B.stars<bd.price)botSay(FG,me,'m_offer_fail');
    else{const nm0=g.n+' #'+g.num;g.price=bd.price;if(buyGift(bd.buyer,g))botSay(FG,bd.buyer,'m_offer_ok',{who:'@'+handle(me),n:nm0,price:bd.price});else{g.price=null;botSay(FG,me,'m_offer_fail')}}
  }
  else if(k==='offerno'&&m.to===me){const B=db.users[bd.buyer],g=db.gifts[bd.gid];if(B)botSay(FG,bd.buyer,'m_offer_no',{who:'@'+handle(me),n:g?g.n+' #'+g.num:''})}
  else if(k==='anbuy'&&m.to===me){
    const num='+'+String(ty||'').replace(/\D/g,''),price=bd.price;
    if(!/^\+888\d{4,5}$/.test(num)||db.anon[num])botSay(AN,me,'an_taken',{num});
    else if(U.anon)botSay(AN,me,'an_have');
    else if(U.stars<price)botSay(AN,me,'an_nostars');
    else{U.stars-=price;db.anon[num]={owner:me,code:String(100000+crypto.randomInt(900000))};U.anon=num;botSay(AN,me,'an_bought',{num})}
  }
  else if(k!=='ignore')return false;
  m.done=k;save();notify(m);return true;
}
// ---------- version (for the in-app update window) ----------
let ver={at:0,latest:null};
async function latest(){
  if(!E.REPO)return null;
  if(Date.now()-ver.at<6e5)return ver.latest;
  ver.at=Date.now();
  try{const r=await fetch('https://api.github.com/repos/'+E.REPO+'/releases/latest',{headers:{'User-Agent':'FreeGram'}});const j=await r.json();ver.latest=parseInt(String(j.tag_name||'').replace(/\D/g,''))||null}catch(e){}
  return ver.latest;
}
// ---------- http ----------
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
function serveStatic(p,res){
  const gm=/^\/gifts\/([a-z0-9_-]+)\.(png|webp|jpg|gif)$/.exec(p);
  if(gm&&IMGS[gm[1]]){const d=IMGS[gm[1]],mt=/^data:(image\/[a-z]+);base64,(.*)$/.exec(d);res.writeHead(200,{'Content-Type':mt[1],'Cache-Control':'public,max-age=60'});return res.end(Buffer.from(mt[2],'base64'))}
  if(gm){const ct={png:'image/png',webp:'image/webp',jpg:'image/jpeg',gif:'image/gif'}[gm[2]],f1=path.join(__dirname,'gifts',gm[1]+'.'+gm[2]),f2=path.join(__dirname,'gift_'+gm[1]+'.'+gm[2]);
    fs.readFile(f1,(e,d)=>{if(e)return fs.readFile(f2,(e2,d2)=>{if(e2){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':ct,'Cache-Control':'public,max-age=3600'});res.end(d2)});res.writeHead(200,{'Content-Type':ct,'Cache-Control':'public,max-age=3600'});res.end(d)});return}
  if(false){fs.readFile('x',(e,d)=>{if(e){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':{png:'image/png',webp:'image/webp',jpg:'image/jpeg',gif:'image/gif'}[gm[2]],'Cache-Control':'public,max-age=3600'});res.end(d)});return}
  const ok={'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/icon.png':['icon.png','image/png']}[p];
  if(!ok){res.writeHead(404);return res.end('404')}
  fs.readFile(path.join(__dirname,ok[0]),(e,d)=>{if(e){res.writeHead(404);return res.end('404')}res.writeHead(200,{'Content-Type':ok[1]});res.end(d)});
}
const WRITE=new Set(['/api/send','/api/edit','/api/del','/api/react','/api/sendgift','/api/upgrade','/api/convert','/api/chat/new','/api/chat/join','/api/chat/add','/api/numchange','/api/setpw','/api/list','/api/buy','/api/names','/api/nlist','/api/nbuy','/api/stars','/api/handle']);
function login(res,U,ip,dev){
  const token=crypto.randomBytes(24).toString('hex');
  db.tokens[token]={id:U.id,sid:crypto.randomBytes(6).toString('hex'),dev:String(dev||'Unknown').slice(0,60),ts:Date.now(),last:Date.now()};
  fails.delete(ip);botSay(FG,U.id,'m_login',{dev:db.tokens[token].dev});save();return send(res,200,{token});
}
async function route(req,res,p,url,b){
  const ip=req.socket.remoteAddress;
  if(p==='/api/ping')return send(res,200,{ok:1});
  if(p==='/api/version')return send(res,200,{latest:await latest(),repo:E.REPO||''});
  if(['/api/check','/api/register','/api/login','/api/anon'].includes(p)){
    if((fails.get(ip)||0)>=20)return err(res,429,'E_RATE');
    const ph=normPhone(b.phone);if(!ph)return err(res,400,'E_PHONE');
    const U=db.users[db.phones[ph]];
    if(p==='/api/check'){const A=db.anon[ph],O=A&&db.users[A.owner];return send(res,200,{anon:isAnon(ph),exists:isAnon(ph)?!!(A&&O&&O.anon===ph):!!U,haspw:isAnon(ph)?!!(A&&A.admin&&O&&O.hash):!!(U&&U.hash)})}
    const bad=code=>{fails.set(ip,(fails.get(ip)||0)+1);setTimeout(()=>fails.delete(ip),6e5);return err(res,401,code)};
    if(p==='/api/register'){
      if(isAnon(ph))return err(res,400,'E_ANON_REG');
      if(String(b.password||'').length<6)return err(res,400,'E_PWSHORT');
      if(U)return err(res,409,'E_EXISTS');
      return login(res,newUser(ph,b.name,String(b.password)),ip,b.dev);
    }
    if(p==='/api/login'){
      if(isAnon(ph))return err(res,400,'E_ANON_CODE');
      if(!U||!U.hash||U.hash!==hash(String(b.password||''),U.salt))return bad('E_LOGIN');
      return login(res,U,ip,b.dev);
    }
    if(!isAnon(ph))return err(res,400,'E_PHONE');
    const A=db.anon[ph],O=A&&db.users[A.owner];
    if(!A||!O||O.anon!==ph)return bad('E_ANON_SOON');
    const code=A.admin?E.ADMIN_CODE:A.code;
    if(!code||String(b.code||'').trim()!==String(code))return bad('E_CODE');
    if(A.admin&&O.hash&&O.hash!==hash(String(b.password||''),O.salt))return bad('E_LOGIN');
    return login(res,O,ip,b.dev);
  }
  const tok=(req.headers.authorization||'').replace('Bearer ','')||url.searchParams.get('token');
  const S=db.tokens[tok],me=S&&S.id,U=db.users[me];
  if(!U)return err(res,401,'E_AUTH');
  if(Date.now()-S.last>6e4)S.last=Date.now();
  if(U.frozen&&WRITE.has(p)&&!(p==='/api/send'&&b.to===UB))return err(res,403,'E_FROZEN');
  if(p==='/api/stream'){
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write('retry: 3000\n\n');
    if(!clients.has(me))clients.set(me,new Set());
    clients.get(me).add(res);
    const iv=setInterval(()=>res.write(': ping\n\n'),20000);
    req.on('close',()=>{clearInterval(iv);clients.get(me).delete(res)});
    return;
  }
  if(p==='/api/me')return send(res,200,{...card(me),bio:U.bio||'',phone:U.phone||'',anon:U.anon||'',pv:U.pv||{},arch:U.arch||[],stars:U.stars,admin:!!U.admin,frozen:!!U.frozen,pins:U.pins||[],names:ownedNames(me).map(n=>({u:n.u,r:n.r,coll:n.coll,price:n.price,primary:L(n.u)===U.primary}))});
  if(p==='/api/profile'){
    U.name=String(b.name||'').trim().slice(0,30)||'User';U.bio=String(b.bio||'').slice(0,120);
    U.status=String(b.status||'').slice(0,8);U.color=/^#[0-9a-f]{6}$/i.test(b.color||'')?b.color:'';
    save();return send(res,200,{ok:1});
  }
  if(p==='/api/stars'){const n=Math.floor(+b.amount);if(!(n>=0&&n<=1e15))return err(res,400,'E_NUM');U.stars=n;save();return send(res,200,{stars:n})}
  if(p==='/api/user'){const n=db.names[L(url.searchParams.get('u')).replace(/^@/,'')];return n&&ent(n.owner)?send(res,200,{...card(n.owner),handle:n.u}):err(res,404,'E_NOUSER')}
  if(p==='/api/search'){
    const q=L(url.searchParams.get('q')).replace(/^@/,'');if(q.length<2)return send(res,200,[]);
    return send(res,200,Object.entries(db.names).filter(([k,n])=>k.includes(q)&&ent(n.owner)).slice(0,20).map(([k,n])=>{const c=db.chats[n.owner];return{...card(n.owner),handle:n.u,joined:c?(n.owner===CH||(c.members||[]).includes(me)):undefined}}));
  }
  if(p==='/api/chats'){
    const clr=U.clr||{},hid=U.hid||{},arch=U.arch||[],last={};
    for(const m of db.msgs){
      let k=null;
      if(m.to===CH)k=CH;else if(m.to==='all')k='all';else if(db.chats[m.to])k=m.to;else if(m.from===me&&m.to===me)k=me;else if(m.from===me||m.to===me)k=m.from===me?m.to:m.from;
      if(k!==null&&m.ts>(clr[k]||0))last[k]=m;
    }
    const txt=m=>m?(m.g?'🎁':m.k?{k:m.k,p:m.p}:m.t):'',pins=U.pins||[],L2=k=>last[k];
    const mine=Object.values(db.chats).filter(c=>c.id!==CH&&(c.members||[]).includes(me)).map(c=>c.id);
    const keys=new Set([...Object.keys(last).filter(k=>![CH,'all',me,FG].includes(k)),...mine]);
    const all=[...keys].filter(k=>(db.users[k]||db.chats[k])&&(!last[k]||last[k].ts>(hid[k]||0)||db.chats[k])).map(o=>{const m=last[o];return{...card(o),last:txt(m),ts:m?m.ts:db.chats[o]?db.chats[o].created:0,mid:m?m.id:0,pin:pins.includes(o),arch:arch.includes(o),canPost:db.chats[o]?(db.chats[o].type==='channel'?db.chats[o].owner===me:true):undefined,joined:db.chats[o]?true:undefined}}).sort((a,b)=>(b.pin-a.pin)||(b.ts-a.ts));
    if(url.searchParams.get('arch'))return send(res,200,all.filter(c=>c.arch));
    const f=(c,k,x)=>({...c,last:txt(L2(k)),ts:L2(k)&&L2(k).ts,fixed:1,pin:true,...x}),n=all.filter(c=>c.arch).length;
    return send(res,200,[...(n?[{id:'__arch',kind:'arch',count:n,fixed:1}]:[]),f(card(CH),CH,{canPost:me===db.chats[CH].owner}),f(card(FG),FG),f({id:me,kind:'self'},me),f({id:'all',kind:'all'},'all'),...all.filter(c=>!c.arch)]);
  }
  if(p==='/api/archive'){const id=String(b.id||'');U.arch=U.arch||[];const i=U.arch.indexOf(id);if(i>=0)U.arch.splice(i,1);else U.arch.push(id);save();return send(res,200,{ok:1})}
  if(p==='/api/pin'){const id=String(b.id||'');U.pins=U.pins||[];const i=U.pins.indexOf(id);if(i>=0)U.pins.splice(i,1);else if(U.pins.length<10)U.pins.push(id);save();return send(res,200,{ok:1})}
  if(p==='/api/messages'){
    const w=url.searchParams.get('with'),c0=(U.clr||{})[w]||0;
    if(db.chats[w]&&w!==CH&&!(db.chats[w].members||[]).includes(me))return send(res,200,[]);
    const r=db.msgs.filter(m=>m.ts>c0&&(db.chats[w]||w==='all'?m.to===w:w===me?(m.from===me&&m.to===me):((m.from===me&&m.to===w)||(m.from===w&&m.to===me)))).slice(-100);
    return send(res,200,r.map(m=>{const s=card(m.from);return{...m,u:{name:s.name,badge:s.badge,color:s.color,status:s.status}}}));
  }
  if(p==='/api/send'){
    const to=String(b.to||''),t=String(b.t||'').trim().slice(0,2000);
    if(to!=='all'&&!db.users[to]&&!db.chats[to])return err(res,404,'E_NOUSER');
    const ch=db.chats[to];
    if(to===FG||(ch&&(ch.type==='channel'?ch.owner!==me:to!==CH&&!(ch.members||[]).includes(me))))return err(res,403,'E_NOPOST');
    const rc=db.users[to];
    if(rc&&!rc.sys&&!rc.bot&&to!==me&&!U.admin&&!b.gift&&!db.msgs.some(x=>x.from===to&&x.to===me)){
      if(rc.pv&&rc.pv.nm)return err(res,403,'E_NOMSG');
      const mp=(rc.pv&&rc.pv.mp)||0;
      if(mp>0){if(U.stars<mp)return err(res,400,'E_NOTENOUGH');U.stars-=mp;rc.stars+=mp}
    }
    const m={from:me,fn:U.name,to,t};
    if(b.reply){const r=db.msgs.find(x=>x.id===+b.reply);if(r)m.r={id:r.id,fn:r.fn,t:r.g?'🎁':r.k?'':String(r.t).slice(0,60)}}
    if(b.gift){
      const g=db.gifts[b.gift];
      if(!g||g.owner!==me||g.kind==='reg')return err(res,403,'E_NOTYOURS');
      if(to==='all'||db.chats[to])return err(res,400,'E_GIFT_DM');
      g.owner=to;g.price=null;g.from=me;g.note=t.slice(0,200);m.g=pubG(g);m.t=g.note;
    }else if(!t)return err(res,400,'E_EMPTY');
    say(m);
    const bot=db.users[to];
    if(bot&&bot.sys)sysChat(me,U,to,t);
    else if(bot&&bot.bot)setTimeout(()=>{if(db.users[bot.id])say({from:to,fn:bot.name,to:me,t:pick(bot.lines&&bot.lines.length?bot.lines:['Hi! I trade gifts and usernames, check the market.','List a gift on the market, I will take a look 👀','I want a rare @name, who has one?'])})},1200);
    return send(res,200,{ok:1});
  }
  if(p==='/api/edit'){const m=db.msgs.find(x=>x.id===+b.id&&x.from===me&&!x.g&&!x.k),t=String(b.t||'').trim().slice(0,2000);if(!m)return err(res,403,'E_NOTYOURS');if(!t)return err(res,400,'E_EMPTY');m.t=t;m.ed=1;notify(m);save();return send(res,200,{ok:1})}
  if(p==='/api/del'){const i=db.msgs.findIndex(x=>x.id===+b.id&&(x.from===me||U.admin||x.to===me));if(i<0)return err(res,403,'E_NOTYOURS');const m=db.msgs.splice(i,1)[0];notify(m);save();return send(res,200,{ok:1})}
  if(p==='/api/react'){
    const m=db.msgs.find(x=>x.id===+b.id&&(x.to==='all'||db.chats[x.to]||x.from===me||x.to===me));
    if(!m||!REACTS.includes(b.e))return err(res,400,'E_EMPTY');
    m.re=m.re||{};const a=m.re[b.e]=m.re[b.e]||[],i=a.indexOf(me);if(i>=0)a.splice(i,1);else a.push(me);
    notify(m);save();return send(res,200,{ok:1});
  }
  if(p==='/api/btn'){const m=db.msgs.find(x=>x.id===+b.id&&x.to===me&&x.btn&&!x.done&&x.btn.some(y=>y.k===b.k));return m&&pressButton(me,U,m,b.k)?send(res,200,{ok:1}):err(res,403,'E_NOTYOURS')}
  if(p==='/api/sessions')return send(res,200,Object.entries(db.tokens).filter(([t,s])=>s.id===me).map(([t,s])=>({sid:s.sid,dev:s.dev,ts:s.ts,last:s.last,cur:t===tok})));
  if(p==='/api/kick'){for(const t in db.tokens)if(db.tokens[t].id===me&&db.tokens[t].sid===b.sid)delete db.tokens[t];save();return send(res,200,{ok:1})}
  if(p==='/api/kickall'){for(const t in db.tokens)if(db.tokens[t].id===me&&t!==tok)delete db.tokens[t];save();return send(res,200,{ok:1})}
  if(p==='/api/inv')return send(res,200,Object.values(db.gifts).filter(g=>g.owner===me).map(pubG));
  if(p==='/api/shopitems')return send(res,200,REG.map(x=>({key:x[0],e:x[1],n:x[2],cost:x[3],c:x[4]})));
  if(p==='/api/sendgift'){
    const x=REG.find(r=>r[0]===b.key),to=String(b.to||'');
    if(!x||!db.users[to])return err(res,404,'E_NOUSER');
    if(U.stars<x[3])return err(res,400,'E_NOTENOUGH');
    U.stars-=x[3];const g=mkReg(to,x);g.from=me;g.note=String(b.note||'').slice(0,200);say({from:me,fn:U.name,to,t:String(b.note||'').slice(0,200),g:pubG(g)});return send(res,200,{ok:1});
  }
  if(p==='/api/upgrade'){const g=db.gifts[b.id];if(!g||g.owner!==me||g.kind!=='reg')return err(res,403,'E_NOTYOURS');if(U.stars<25)return err(res,400,'E_NOTENOUGH');U.stars-=25;delete g.cost;rollNft(g);save();return send(res,200,pubG(g))}
  if(p==='/api/convert'){const g=db.gifts[b.id];if(!g||g.owner!==me||g.kind!=='reg')return err(res,403,'E_NOTYOURS');U.stars+=Math.floor(g.cost*.85);delete db.gifts[g.id];save();return send(res,200,{ok:1})}
  if(p==='/api/gpin'){const g=db.gifts[b.id];if(!g||g.owner!==me)return err(res,403,'E_NOTYOURS');U.pg=U.pg||[];const i=U.pg.indexOf(g.id);if(i>=0)U.pg.splice(i,1);else if(U.pg.length<6)U.pg.push(g.id);save();return send(res,200,{ok:1})}
  if(p==='/api/clear'||p==='/api/delchat'){const id=String(b.id||'');U.clr=U.clr||{};U.clr[id]=Date.now();if(p==='/api/delchat'){U.hid=U.hid||{};U.hid[id]=Date.now()}save();return send(res,200,{ok:1})}
  if(p==='/api/offer'){
    const g=db.gifts[b.id],pr=Math.floor(+b.price);
    if(!g||g.kind==='reg'||g.owner===me||!db.users[g.owner])return err(res,403,'E_NOTYOURS');
    if(!(pr>=1&&pr<=1e12))return err(res,400,'E_PRICE');
    if(U.stars<pr)return err(res,400,'E_NOTENOUGH');
    if(!db.users[g.owner].bot)botSay(FG,g.owner,'m_offer',{who:U.name+' @'+handle(me),n:g.n+' #'+g.num,price:pr},[{k:'offeryes',l:'btnSell'},{k:'offerno',l:'btnDecline'}],{gid:g.id,buyer:me,price:pr});
    else{g.price=pr;buyGift(me,g)}
    save();return send(res,200,{ok:1});
  }
  if(p==='/api/pinfo'){
    const id=String(url.searchParams.get('id')||''),e=ent(id);if(!e)return err(res,404,'E_NOUSER');
    const u=db.users[id],c=db.chats[id],pg=(u&&u.pg)||[],see=U.admin||id===me||!(u&&u.pv&&u.pv.ph);
    const gl=Object.values(db.gifts).filter(g=>g.owner===id).sort((a,b)=>pg.includes(b.id)-pg.includes(a.id)).slice(0,40).map(pubG);
    return send(res,200,{...card(id),bio:u?u.bio||'':c?c.desc||'':'',phone:u&&see?u.phone||'':'',anon:u&&see?u.anon||'':'',stars:U.admin&&u?u.stars:undefined,frozen:!!(u&&u.frozen),admin:!!(u&&u.admin),gifts:gl,mp:u&&u.pv&&u.pv.mp||0,
      names:u?ownedNames(id).map(n=>({u:n.u,coll:n.coll,primary:L(n.u)===u.primary})):[],
      chat:c?{joined:id===CH||(c.members||[]).includes(me),mine:c.owner===me,owner:card(c.owner),members:id===CH?Object.keys(db.users).length:(c.members||[]).length,created:c.created}:undefined});
  }
  if(p==='/api/ginfo'){
    const g=db.gifts[String(url.searchParams.get('id')||'')];if(!g)return err(res,404,'E_NOUSER');
    const sl=db.sales.filter(x=>x.key===g.key).slice(-5),rs=g.r?(g.r[0]+g.r[1]+g.r[2])/3:3;
    const est=g.kind==='reg'?g.cost:(sl.length?Math.round(sl.reduce((a,x)=>a+x.price,0)/sl.length):Math.round(1000/rs/10)*10);
    return send(res,200,{...pubG(g),note:g.note||'',from:g.from&&ent(g.from)?card(g.from):null,owner:card(g.owner),est});
  }
  if(p==='/api/catalog')return send(res,200,{reg:REG.map(x=>({key:x[0],e:x[1],n:x[2]})),nft:NFT.map(x=>({key:x[0],e:x[1],n:x[2]})),imgs:Object.keys(IMGS)});
  // ----- groups & channels -----
  if(p==='/api/chat/new'){
    const type=b.type==='channel'?'channel':'group',name=String(b.name||'').trim().slice(0,40);
    if(!name)return err(res,400,'E_EMPTY');
    if(Object.values(db.chats).filter(c=>c.owner===me).length>=10)return err(res,400,'E_LIMIT');
    let h=String(b.handle||'').trim().replace(/^@/,'');
    if(h){if(!nameOk(h))return err(res,400,'E_NAMEFMT');if(db.names[L(h)])return err(res,409,'E_TAKEN')}
    const id='c'+(db.seq++);db.chats[id]={id,type,name,owner:me,members:[me],desc:String(b.desc||'').slice(0,200),created:Date.now()};
    if(h)addName(id,h);save();return send(res,200,card(id));
  }
  if(p==='/api/chat/join'){const c=db.chats[b.id];if(!c||c.id===CH)return err(res,404,'E_NOUSER');c.members=c.members||[];if(!c.members.includes(me))c.members.push(me);save();return send(res,200,{ok:1})}
  if(p==='/api/chat/leave'){const c=db.chats[b.id];if(!c||c.owner===me)return err(res,400,'E_NOTYOURS');c.members=(c.members||[]).filter(x=>x!==me);save();return send(res,200,{ok:1})}
  if(p==='/api/chat/add'){const c=db.chats[b.id],n=db.names[L(b.u).replace(/^@/,'')];if(!c||c.owner!==me)return err(res,403,'E_NOTYOURS');if(!n||!db.users[n.owner])return err(res,404,'E_NOUSER');c.members=c.members||[];if(!c.members.includes(n.owner))c.members.push(n.owner);save();return send(res,200,{ok:1})}
  if(p==='/api/chat/del'){const c=db.chats[b.id];if(!c||(c.owner!==me&&!U.admin)||c.id===CH)return err(res,403,'E_NOTYOURS');db.msgs=db.msgs.filter(m=>m.to!==c.id);for(const k in db.names)if(db.names[k].owner===c.id)delete db.names[k];delete db.chats[c.id];save();return send(res,200,{ok:1})}
  // ----- privacy, password, numbers -----
  if(p==='/api/privacy'){U.pv=U.pv||{};if(typeof b.ph==='boolean')U.pv.ph=b.ph;if(typeof b.nm==='boolean')U.pv.nm=b.nm;if(b.mp!=null){const n=Math.floor(+b.mp);if(!(n>=0&&n<=1e6))return err(res,400,'E_NUM');U.pv.mp=n}save();return send(res,200,{ok:1})}
  if(p==='/api/setpw'){if(U.hash&&U.hash!==hash(String(b.old||''),U.salt))return err(res,401,'E_LOGIN');if(String(b.new||'').length<6)return err(res,400,'E_PWSHORT');U.salt=crypto.randomBytes(16).toString('hex');U.hash=hash(String(b.new),U.salt);save();return send(res,200,{ok:1})}
  if(p==='/api/numchange'){
    const ph=normPhone(b.phone);if(!ph)return err(res,400,'E_PHONE');
    if(b.kind==='reg'){
      if(isAnon(ph))return err(res,400,'E_PHONE');
      if(U.hash&&U.hash!==hash(String(b.password||''),U.salt))return err(res,401,'E_LOGIN');
      if(db.phones[ph]&&db.phones[ph]!==me)return err(res,409,'E_EXISTS');
      if(U.phone)delete db.phones[U.phone];db.phones[ph]=me;U.phone=ph;
    }else{
      const A=db.anon[ph];if(!isAnon(ph)||!A||A.admin)return err(res,400,'E_ANON_SOON');
      if(String(b.code||'').trim()!==A.code)return err(res,401,'E_CODE');
      if(U.anon&&U.anon!==ph)return err(res,400,'E_TWOANON');
      const old=db.users[A.owner];if(old&&old.id!==me)old.anon='';
      A.owner=me;U.anon=ph;
    }
    save();return send(res,200,{ok:1});
  }
  if(p==='/api/numremove'){
    if(b.kind==='reg'){if(!U.anon||!U.phone)return err(res,400,'E_NEEDONE');delete db.phones[U.phone];U.phone=''}
    else{if(!U.phone||!U.anon||(db.anon[U.anon]&&db.anon[U.anon].admin))return err(res,400,'E_NEEDONE');U.anon=''}
    save();return send(res,200,{ok:1});
  }
    if(p==='/api/market')return send(res,200,Object.values(db.gifts).filter(g=>g.price!=null).map(pubG));
  if(p==='/api/list'){const g=db.gifts[b.id],pr=Math.floor(+b.price);if(!g||g.owner!==me)return err(res,403,'E_NOTYOURS');if(!(pr>=1&&pr<=1e12))return err(res,400,'E_PRICE');g.price=pr;save();return send(res,200,{ok:1})}
  if(p==='/api/unlist'){const g=db.gifts[b.id];if(!g||g.owner!==me)return err(res,403,'E_NOTYOURS');g.price=null;save();return send(res,200,{ok:1})}
  if(p==='/api/buy'){
    const g=db.gifts[b.id];
    if(!g||g.price==null)return err(res,404,'E_SOLD');
    if(g.owner===me)return err(res,400,'E_OWN');
    if(!buyGift(me,g))return err(res,400,'E_NOTENOUGH');
    save();return send(res,200,{ok:1});
  }
  if(p==='/api/handle'){ // free regular username (changes the main one)
    const u=String(b.u||'').trim().replace(/^@/,''),l=L(u);
    if(!nameOk(u))return err(res,400,'E_NAMEFMT');
    if(db.names[l]&&db.names[l].owner!==me)return err(res,409,'E_TAKEN');
    const old=db.names[U.primary];
    if(old&&old.owner===me&&!old.coll&&old.price==null&&L(old.u)!==l)delete db.names[U.primary];
    if(!db.names[l])addName(me,u,false);
    U.primary=l;save();return send(res,200,{ok:1});
  }
  if(p==='/api/names'){ // collectible username (costs stars, can be sold)
    const u=String(b.u||'').trim().replace(/^@/,''),l=L(u);
    if(!nameOk(u))return err(res,400,'E_NAMEFMT');
    if(db.names[l])return err(res,409,'E_TAKEN');
    if(ownedNames(me).length>=40)return err(res,400,'E_LIMIT');
    if(U.stars<nameCost(u))return err(res,400,'E_NOTENOUGH');
    U.stars-=nameCost(u);addName(me,u,true);save();return send(res,200,{ok:1});
  }
  if(p==='/api/primary'){const n=db.names[L(b.u)];if(!n||n.owner!==me)return err(res,403,'E_NOTYOURS');U.primary=L(n.u);save();return send(res,200,{ok:1})}
  if(p==='/api/nlist'){const n=db.names[L(b.u)],pr=Math.floor(+b.price);if(!n||n.owner!==me||!n.coll)return err(res,403,'E_NOTYOURS');if(!(pr>=1&&pr<=1e12))return err(res,400,'E_PRICE');n.price=pr;save();return send(res,200,{ok:1})}
  if(p==='/api/nunlist'){const n=db.names[L(b.u)];if(!n||n.owner!==me)return err(res,403,'E_NOTYOURS');n.price=null;save();return send(res,200,{ok:1})}
  if(p==='/api/nmarket')return send(res,200,Object.values(db.names).filter(n=>n.price!=null).map(n=>({u:n.u,r:n.r,price:n.price,mine:n.owner===me})));
  if(p==='/api/nbuy'){
    const n=db.names[L(b.u)];
    if(!n||n.price==null)return err(res,404,'E_SOLD');
    if(n.owner===me)return err(res,400,'E_OWN');
    if(!buyName(me,n))return err(res,400,'E_NOTENOUGH');
    save();return send(res,200,{ok:1});
  }
  // ----- admin -----
  if(p.startsWith('/api/admin/')){
    if(!U.admin)return err(res,403,'E_ADMIN');
    if(p==='/api/admin/users'){
      const q=L(url.searchParams.get('q')).replace(/^@/,'');
      const ids=[...Object.keys(db.users),...Object.keys(db.chats)];
      const r=ids.filter(id=>{const c=card(id),u=db.users[id];return !q||L(c.name).includes(q)||L(c.handle).includes(q)||(u&&(u.phone||'').includes(q))}).slice(0,30);
      return send(res,200,r.map(id=>{const u=db.users[id];return{...card(id),phone:u?u.phone||'':'',stars:u?u.stars:0,frozen:!!(u&&u.frozen),admin:!!(u&&u.admin)}}));
    }
    if(p==='/api/admin/set'){
      const T=db.users[b.id];if(!T)return err(res,404,'E_NOUSER');
      if(typeof b.frozen==='boolean'&&!T.admin){T.frozen=b.frozen;if(!b.frozen)T.appeal=false}
      if(b.stars!=null){const n=Math.floor(+b.stars);if(!(n>=0&&n<=1e15))return err(res,400,'E_NUM');T.stars=n}
      save();return send(res,200,{ok:1});
    }
    if(p==='/api/admin/ban'){const T=db.users[b.id];if(!T||T.admin||T.sys)return err(res,400,'E_ADMIN');deleteUser(b.id);save();return send(res,200,{ok:1})}
    if(p==='/api/admin/kick'){for(const t in db.tokens)if(db.tokens[t].id===b.id)delete db.tokens[t];save();return send(res,200,{ok:1})}
    if(p==='/api/admin/verify'){
      const e=ent(b.id);if(!e)return err(res,404,'E_NOUSER');
      const type=BADGES.includes(b.type)?b.type:'';
      const owner=db.users[b.id]?(db.users[b.id].bot?adminId():b.id):e.owner;
      if(type&&b.ask&&owner&&owner!==me)botSay(FG,owner,'v_offer',{target:'@'+(card(b.id).handle||card(b.id).name)},[{k:'vagree',l:'btnAgree'},{k:'vdecl',l:'btnDecl'}],{target:b.id,type,owner});
      else e.badge=type;
      save();return send(res,200,{ok:1});
    }
    if(p==='/api/admin/gimg'){
      const key=String(b.key||''),data=String(b.data||'');
      if(!/^[a-z0-9_-]{2,30}$/.test(key))return err(res,400,'E_NAMEFMT');
      if(!data){delete IMGS[key];saveImg(key,'');return send(res,200,{ok:1})}
      if(!/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+\/=]+$/.test(data)||data.length>300000)return err(res,400,'E_BIG');
      IMGS[key]=data;saveImg(key,data);return send(res,200,{ok:1});
    }
  }
  return err(res,404,'E_NOMETHOD');
}
const server=http.createServer(async(req,res)=>{
  for(const k in CORS)res.setHeader(k,CORS[k]);
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  const url=new URL(req.url,'http://x'),p=url.pathname;
  if(!p.startsWith('/api/'))return serveStatic(p,res);
  let body={};
  if(req.method==='POST'){
    let s='';
    for await(const c of req){s+=c;if(s.length>1e5)return err(res,413,'E_BIG')}
    try{body=JSON.parse(s||'{}')}catch(e){return err(res,400,'E_SERVER')}
  }
  try{await route(req,res,p,url,body)}catch(e){console.error(e);if(!res.headersSent)err(res,500,'E_SERVER')}
});
(async()=>{
  let d=null;
  try{d=await loadDb()}catch(e){console.error('Cannot load database, stopping so nothing gets overwritten:',e.message);process.exit(1)}
  if(d)db=Object.assign(db,d);
  db.anon=db.anon||{};db.sales=db.sales||[];await loadImgs();
  sysBot(FG,'FreeGram','freegram','blue');sysBot(UB,'Ban_Bot','unban_bot');sysBot(VB,'Verification','verification');sysBot(AN,'Anonymous Numbers','anon_number','blue');
  if(!traders().length){makeBot('ai_alice','AI Alice');makeBot('ai_neo','AI Neo');makeBot('ai_max','AI Max')}
  for(const g of Object.values(db.gifts)){if(!g.kind){g.kind='nft';const n=NFT.find(x=>x[2]===g.n);g.key=n?n[0]:String(g.n||'').toLowerCase().replace(/[^a-z0-9]/g,'');if(!g.r)g.r=[fx(),fx(),fx()]}}
  initAdmin();save();
  setInterval(botTick,15000);
  const stop=async()=>{dirty=true;try{await flush()}catch(e){}process.exit(0)};
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
  server.listen(PORT,()=>console.log('FreeGram server on port '+PORT+(TURL?' (Turso database)':' (local file, data may be lost on restart)')));
})();
