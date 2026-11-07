// FreeGram server v2 (zero dependencies, Node 18+)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const E=process.env,PORT=E.PORT||3000,DBF=E.DB_FILE||path.join(__dirname,'data.json');
const TURL=(E.TURSO_DATABASE_URL||'').trim().replace(/^libsql:\/\//,'https://').replace(/\/+$/,''),TTOK=(E.TURSO_AUTH_TOKEN||'').trim();
let db={users:{},phones:{},tokens:{},msgs:[],gifts:{},names:{},chats:{},seq:1};
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
// ---------- helpers ----------
const pick=a=>a[Math.floor(Math.random()*a.length)],rint=n=>Math.floor(Math.random()*n);
const L=s=>String(s||'').trim().toLowerCase();
const GIFTS=[["🍑","Precious Peach",["#c2569b","#7a2f6b"]],["🐸","Kissed Frog",["#3fae6a","#1f6b45"]],["🔮","Magic Orb",["#5b6cff","#2a2f8f"]],["🧸","Plush Bear",["#e0955a","#9a5226"]],["💎","Astral Gem",["#2bb7d6","#16607a"]],["🔥","Heart Flame",["#ff7a45","#b02a2a"]]];
const MODELS=["Mardi Gras","Neon Pulse","Frost Byte","Golden Hour","Void","Candy"],BGS=["Dark Lilac","Ocean","Mint","Sunset","Graphite"],SYMS=["Apple","Star","Moon","Bolt","Crown"];
const BADGES=['blue','white','red','triangle','crown','diamond'];
const SHOP_PRICE=100,nameCost=u=>u.length<=4?500:u.length<=6?100:10,rarity=u=>u.length<=4?'legendary':u.length<=6?'rare':'common';
const FG='sys_freegram',UB='sys_unban',VB='sys_verif',CH='ch_freegram';
const mkGift=owner=>{const g=pick(GIFTS),id='g'+(db.seq++);return db.gifts[id]={id,owner,e:g[0],n:g[1],c:g[2],num:1+rint(9999),model:pick(MODELS),bg:pick(BGS),sym:pick(SYMS),price:null}};
const pubG=g=>({id:g.id,owner:g.owner,e:g.e,n:g.n,c:g.c,num:g.num,model:g.model,bg:g.bg,sym:g.sym,price:g.price});
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
  if(c)return{id,kind:c.type,name:c.name,handle:chatHandle(id),badge:c.badge||'',owner:c.owner};
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
const notify=m=>{if(db.chats[m.to]||m.to==='all')clients.forEach((_,u)=>push(u,'msg',{to:m.to}));else{push(m.from,'msg',{to:m.to});if(m.to!==m.from)push(m.to,'msg',{to:m.from})}};
function say(m){m.id=db.seq++;m.ts=Date.now();db.msgs.push(m);if(db.msgs.length>3000)db.msgs.splice(0,500);notify(m);save();return m}
const botSay=(bot,to,k,p,btn,bd)=>say({from:bot,fn:db.users[bot].name,to,k,p,btn,bd});
function buyGift(bid,g){const b=db.users[bid],s=db.users[g.owner];if(!b||b.stars<g.price)return false;b.stars-=g.price;if(s)s.stars+=g.price;g.owner=bid;g.price=null;return true}
function buyName(bid,n){const b=db.users[bid],s=db.users[n.owner];if(!b||b.stars<n.price)return false;b.stars-=n.price;if(s)s.stars+=n.price;const old=n.owner;n.owner=bid;n.price=null;ensurePrimary(old);return true}
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
  delete db.users[id];(clients.get(id)||[]).forEach(r=>r.end());clients.delete(id);
}
// ---------- admin, system bots, trader bots ----------
function sysBot(id,name,h,badge){if(!db.users[id]){db.users[id]={id,name,bot:1,sys:1,stars:0,primary:L(h),created:Date.now()};addName(id,h)}db.users[id].badge=db.users[id].badge||badge||''}
function initAdmin(){
  const ph=normPhone(E.ADMIN_PHONE);if(!ph)return;
  let id=db.phones[ph];
  if(!id){id='admin';db.phones[ph]=id;db.users[id]={id,phone:ph,name:'Admin',stars:1e9,primary:null,created:Date.now()};if(!db.names.admin)addName(id,'admin');ensurePrimary(id);mkGift(id)}
  const U=db.users[id];U.admin=true;
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
  if(to===VB){
    if(txt==='/start')return botSay(VB,me,'v_hello');
    const n=db.names[L(txt).replace(/^@/,'')],e=n&&ent(n.owner);
    if(!e)return botSay(VB,me,'v_nf');
    if(e.badge||e.admin)return botSay(VB,me,'v_has');
    const a=adminId();
    if(a)botSay(FG,a,'v_req',{who:U.name+' @'+handle(me),target:'@'+n.u},[{k:'vgive',l:'btnGive'},{k:'ignore',l:'btnIgnore'}],{target:n.owner,req:me});
    return botSay(VB,me,'v_sent');
  }
  if(to===FG)return botSay(FG,me,'m_fgreply');
}
function pressButton(me,U,m,k){
  const bd=m.bd||{};
  if(k==='unfreeze'&&U.admin){const T=db.users[bd.uid];if(T){T.frozen=false;T.appeal=false;botSay(UB,T.id,'ub_unfrozen')}}
  else if(k==='vgive'&&U.admin){const e=ent(bd.target);if(e){e.badge=bd.type||'blue';if(bd.req&&db.users[bd.req])botSay(VB,bd.req,'v_ok')}}
  else if(k==='vagree'&&bd.owner===me){const e=ent(bd.target);if(e)e.badge=bd.type||'blue';botSay(FG,me,'v_ok')}
  else if(k==='vdecl'&&bd.owner===me)botSay(FG,me,'v_no');
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
  const ok={'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/icon.png':['icon.png','image/png']}[p];
  if(!ok){res.writeHead(404);return res.end('404')}
  fs.readFile(path.join(__dirname,ok[0]),(e,d)=>{if(e){res.writeHead(404);return res.end('404')}res.writeHead(200,{'Content-Type':ok[1]});res.end(d)});
}
const WRITE=new Set(['/api/send','/api/shop','/api/list','/api/buy','/api/names','/api/nlist','/api/nbuy','/api/stars','/api/handle']);
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
    if(p==='/api/check')return send(res,200,{anon:isAnon(ph),exists:!!U,haspw:!!(U&&U.hash)});
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
    if(!U||!U.admin)return bad('E_ANON_SOON');
    if(!E.ADMIN_CODE||String(b.code||'').trim()!==String(E.ADMIN_CODE))return bad('E_CODE');
    if(U.hash&&U.hash!==hash(String(b.password||''),U.salt))return bad('E_LOGIN');
    return login(res,U,ip,b.dev);
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
  if(p==='/api/me')return send(res,200,{...card(me),bio:U.bio||'',phone:U.phone,stars:U.stars,admin:!!U.admin,frozen:!!U.frozen,pins:U.pins||[],names:ownedNames(me).map(n=>({u:n.u,r:n.r,coll:n.coll,price:n.price,primary:L(n.u)===U.primary}))});
  if(p==='/api/profile'){
    U.name=String(b.name||'').trim().slice(0,30)||'User';U.bio=String(b.bio||'').slice(0,120);
    U.status=String(b.status||'').slice(0,8);U.color=/^#[0-9a-f]{6}$/i.test(b.color||'')?b.color:'';
    save();return send(res,200,{ok:1});
  }
  if(p==='/api/stars'){const n=Math.floor(+b.amount);if(!(n>=0&&n<=1e15))return err(res,400,'E_NUM');U.stars=n;save();return send(res,200,{stars:n})}
  if(p==='/api/user'){const n=db.names[L(url.searchParams.get('u')).replace(/^@/,'')];return n&&ent(n.owner)?send(res,200,{...card(n.owner),handle:n.u}):err(res,404,'E_NOUSER')}
  if(p==='/api/search'){
    const q=L(url.searchParams.get('q')).replace(/^@/,'');if(q.length<2)return send(res,200,[]);
    return send(res,200,Object.entries(db.names).filter(([k,n])=>k.includes(q)&&ent(n.owner)).slice(0,20).map(([k,n])=>({...card(n.owner),handle:n.u})));
  }
  if(p==='/api/chats'){
    const partners={};let lastAll=null,lastSelf=null,lastCh=null;
    for(const m of db.msgs){if(m.to===CH)lastCh=m;else if(m.to==='all')lastAll=m;else if(m.from===me&&m.to===me)lastSelf=m;else if(m.from===me||m.to===me)partners[m.from===me?m.to:m.from]=m}
    const txt=m=>m?(m.g?'🎁':m.k?{k:m.k,p:m.p}:m.t):'',pins=U.pins||[],lastFg=partners[FG];delete partners[FG];
    const list=Object.entries(partners).filter(([o])=>db.users[o]).map(([o,m])=>({...card(o),last:txt(m),mid:m.id,pin:pins.includes(o)})).sort((a,b)=>(b.pin-a.pin)||(b.mid-a.mid));
    return send(res,200,[{...card(CH),last:txt(lastCh),fixed:1,canPost:me===db.chats[CH].owner},{...card(FG),last:txt(lastFg),fixed:1},{id:me,kind:'self',last:txt(lastSelf),fixed:1},{id:'all',kind:'all',last:txt(lastAll),fixed:1},...list]);
  }
  if(p==='/api/pin'){const id=String(b.id||'');U.pins=U.pins||[];const i=U.pins.indexOf(id);if(i>=0)U.pins.splice(i,1);else if(U.pins.length<10)U.pins.push(id);save();return send(res,200,{ok:1})}
  if(p==='/api/messages'){
    const w=url.searchParams.get('with');
    const r=db.msgs.filter(m=>db.chats[w]||w==='all'?m.to===w:w===me?(m.from===me&&m.to===me):((m.from===me&&m.to===w)||(m.from===w&&m.to===me))).slice(-100);
    return send(res,200,r.map(m=>{const s=card(m.from);return{...m,u:{name:s.name,badge:s.badge,color:s.color,status:s.status}}}));
  }
  if(p==='/api/send'){
    const to=String(b.to||''),t=String(b.t||'').trim().slice(0,2000);
    if(to!=='all'&&!db.users[to]&&!db.chats[to])return err(res,404,'E_NOUSER');
    if(db.chats[to]&&db.chats[to].owner!==me)return err(res,403,'E_NOPOST');
    const m={from:me,fn:U.name,to,t};
    if(b.gift){
      const g=db.gifts[b.gift];
      if(!g||g.owner!==me)return err(res,403,'E_NOTYOURS');
      if(to==='all'||db.chats[to])return err(res,400,'E_GIFT_DM');
      g.owner=to;g.price=null;m.g=pubG(g);m.t='';
    }else if(!t)return err(res,400,'E_EMPTY');
    say(m);
    const bot=db.users[to];
    if(bot&&bot.sys)sysChat(me,U,to,t);
    else if(bot&&bot.bot)setTimeout(()=>{if(db.users[bot.id])say({from:to,fn:bot.name,to:me,t:pick(bot.lines&&bot.lines.length?bot.lines:['Hi! I trade gifts and usernames, check the market.','List a gift on the market, I will take a look 👀','I want a rare @name, who has one?'])})},1200);
    return send(res,200,{ok:1});
  }
  if(p==='/api/btn'){const m=db.msgs.find(x=>x.id===+b.id&&x.to===me&&x.btn&&!x.done&&x.btn.some(y=>y.k===b.k));return m&&pressButton(me,U,m,b.k)?send(res,200,{ok:1}):err(res,403,'E_NOTYOURS')}
  if(p==='/api/sessions')return send(res,200,Object.entries(db.tokens).filter(([t,s])=>s.id===me).map(([t,s])=>({sid:s.sid,dev:s.dev,ts:s.ts,last:s.last,cur:t===tok})));
  if(p==='/api/kick'){for(const t in db.tokens)if(db.tokens[t].id===me&&db.tokens[t].sid===b.sid)delete db.tokens[t];save();return send(res,200,{ok:1})}
  if(p==='/api/kickall'){for(const t in db.tokens)if(db.tokens[t].id===me&&t!==tok)delete db.tokens[t];save();return send(res,200,{ok:1})}
  if(p==='/api/inv')return send(res,200,Object.values(db.gifts).filter(g=>g.owner===me).map(pubG));
  if(p==='/api/shop'){
    if(U.stars<SHOP_PRICE)return err(res,400,'E_NOTENOUGH');
    if(Object.values(db.gifts).filter(g=>g.owner===me).length>=300)return err(res,400,'E_LIMIT');
    U.stars-=SHOP_PRICE;const g=mkGift(me);save();return send(res,200,pubG(g));
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
  const nameOk=u=>/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(u);
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
    if(ownedNames(me).length>=30)return err(res,400,'E_LIMIT');
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
    if(p==='/api/admin/bot'){
      const h=String(b.handle||'').trim().replace(/^@/,'');
      if(!nameOk(h))return err(res,400,'E_NAMEFMT');
      if(db.names[L(h)]||db.users['ai_'+L(h)])return err(res,409,'E_TAKEN');
      makeBot(h,String(b.name||h).slice(0,30),String(b.lines||'').split(/\n/).map(s=>s.trim()).filter(Boolean).slice(0,20));save();return send(res,200,{ok:1});
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
  sysBot(FG,'FreeGram','freegram','blue');sysBot(UB,'Ban_Bot','unban_bot');sysBot(VB,'Verification','verification');
  if(!traders().length){makeBot('ai_alice','AI Alice');makeBot('ai_neo','AI Neo');makeBot('ai_max','AI Max')}
  initAdmin();save();
  setInterval(botTick,15000);
  const stop=async()=>{dirty=true;try{await flush()}catch(e){}process.exit(0)};
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
  server.listen(PORT,()=>console.log('FreeGram server on port '+PORT+(TURL?' (Turso database)':' (local file, data may be lost on restart)')));
})();
