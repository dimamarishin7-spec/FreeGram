// FreeGram server: zero dependencies, Node 18+
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,DBF=process.env.DB_FILE||path.join(__dirname,'data.json'),WWW=__dirname;
const GATEWAY=process.env.GATEWAY_TOKEN||'';
let db={users:{},phones:{},tokens:{},msgs:[],gifts:{},names:{},seq:1};
try{db=Object.assign(db,JSON.parse(fs.readFileSync(DBF,'utf8')))}catch(e){}
let tm;const save=()=>{clearTimeout(tm);tm=setTimeout(()=>fs.writeFile(DBF,JSON.stringify(db),()=>{}),400)};
const pick=a=>a[Math.floor(Math.random()*a.length)],rint=n=>Math.floor(Math.random()*n);
const GIFTS=[["🍑","Precious Peach",["#c2569b","#7a2f6b"]],["🐸","Kissed Frog",["#3fae6a","#1f6b45"]],["🔮","Magic Orb",["#5b6cff","#2a2f8f"]],["🧸","Plush Bear",["#e0955a","#9a5226"]],["💎","Astral Gem",["#2bb7d6","#16607a"]],["🔥","Heart Flame",["#ff7a45","#b02a2a"]]];
const MODELS=["Mardi Gras","Neon Pulse","Frost Byte","Golden Hour","Void","Candy"],BGS=["Dark Lilac","Ocean","Mint","Sunset","Graphite"],SYMS=["Apple","Star","Moon","Bolt","Crown"];
const SHOP_PRICE=100,nameCost=u=>u.length<=4?500:u.length<=6?100:10,rarity=u=>u.length<=4?'Легендарный':u.length<=6?'Редкий':'Обычный';
const mkGift=owner=>{const g=pick(GIFTS),id='g'+(db.seq++);return db.gifts[id]={id,owner,e:g[0],n:g[1],c:g[2],num:1+rint(9999),model:pick(MODELS),bg:pick(BGS),sym:pick(SYMS),price:null}};
const pub=g=>({id:g.id,owner:g.owner,e:g.e,n:g.n,c:g.c,num:g.num,model:g.model,bg:g.bg,sym:g.sym,price:g.price});
const L=s=>String(s||'').trim().toLowerCase();
const addName=(owner,u)=>db.names[L(u)]={u,owner,price:null,r:rarity(u)};
const randName=owner=>{let u;do{u='user'+(10000+rint(90000))}while(db.names[u]);return addName(owner,u)};
const ownedNames=id=>Object.values(db.names).filter(n=>n.owner===id);
const handle=id=>{const u=db.users[id];return u&&u.primary&&db.names[u.primary]?db.names[u.primary].u:''};
function ensurePrimary(id){const u=db.users[id];if(!u)return;const o=ownedNames(id);if(!u.primary||!o.some(n=>L(n.u)===u.primary))u.primary=o.length?L(o[0].u):L(randName(id).u)}
const hash=(p,s)=>crypto.scryptSync(p,s,32).toString('hex');
const clients=new Map(),pending=new Map(),lastSend=new Map();
const push=(u,ev,d)=>(clients.get(u)||[]).forEach(r=>r.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`));
const send=(res,code,o)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
const err=(res,code,e)=>send(res,code,{error:e});
function say(m){m.id=db.seq++;m.ts=Date.now();db.msgs.push(m);if(db.msgs.length>5000)db.msgs.splice(0,1000);
  if(m.to==='all')clients.forEach((_,u)=>push(u,'msg',{to:'all'}));else{push(m.from,'msg',{to:m.to});push(m.to,'msg',{to:m.to})}save()}
function buyGift(bid,g){const b=db.users[bid],s=db.users[g.owner];if(!b||b.stars<g.price)return false;b.stars-=g.price;if(s)s.stars+=g.price;g.owner=bid;g.price=null;return true}
function buyName(bid,n){const b=db.users[bid],s=db.users[n.owner];if(!b||b.stars<n.price)return false;b.stars-=n.price;if(s)s.stars+=n.price;const old=n.owner;n.owner=bid;n.price=null;ensurePrimary(old);return true}
// ---- AI traders (rule-based simulation) ----
const BOTS=[['ai_alice','AI Алиса'],['ai_neo','AI Нео'],['ai_max','AI Макс']];
for(const [h,name] of BOTS){if(!db.users[h]){db.users[h]={id:h,name,bot:1,stars:1e12,primary:h};addName(h,h);for(let i=0;i<3;i++)mkGift(h)}}
const LINES=['Кто продаёт Precious Peach?','Купил новый юзернейм, огонь 🔥','Подарки сегодня дорожают','Ищу редкий @ник','Продаю подарок, смотрите маркет'];
function botTick(){
  const b=db.users[pick(BOTS)[0]],r=Math.random();
  const lg=Object.values(db.gifts).filter(g=>g.price!=null&&g.owner!==b.id),ln=Object.values(db.names).filter(n=>n.price!=null&&n.owner!==b.id);
  if(r<.4&&lg.length)buyGift(b.id,pick(lg));
  else if(r<.6&&ln.length)buyName(b.id,pick(ln));
  else if(r<.8){const mine=Object.values(db.gifts).filter(g=>g.owner===b.id&&g.price==null);if(mine.length)pick(mine).price=50+rint(2000);else mkGift(b.id)}
  else if(r<.9)say({from:b.id,fn:b.name,to:'all',t:pick(LINES)});
  else mkGift(b.id);
  save();
}
setInterval(botTick,15000);
// ---- HTTP ----
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
function serveStatic(p,res){
  const ok={'/':'index.html','/index.html':'index.html','/icon.png':'icon.png'};
  if(!ok[p]){res.writeHead(404);return res.end('404')}
  fs.readFile(path.join(WWW,ok[p]),(e,d)=>{if(e){res.writeHead(404);return res.end('404')}res.writeHead(200,{'Content-Type':MIME[path.extname(ok[p])]||'application/octet-stream'});res.end(d)});
}
const normPhone=s=>{const d=String(s||'').replace(/\D/g,'');return d.length>=8&&d.length<=15?'+'+d:''};
async function route(req,res,p,url,b){
  if(p==='/api/code'){
    const ph=normPhone(b.phone);if(!ph)return err(res,400,'Введи номер в международном формате, например +79991234567');
    if(Date.now()-(lastSend.get(ph)||0)<30000)return err(res,429,'Подожди 30 секунд перед новым кодом');
    const code=String(10000+crypto.randomInt(90000));
    pending.set(ph,{code,exp:Date.now()+3e5,tries:0});lastSend.set(ph,Date.now());
    if(GATEWAY){
      let j;try{const r=await fetch('https://gatewayapi.telegram.org/sendVerificationMessage',{method:'POST',headers:{Authorization:'Bearer '+GATEWAY,'Content-Type':'application/json'},body:JSON.stringify({phone_number:ph,code,ttl:300})});j=await r.json()}catch(e){j={ok:false,error:'нет связи'}}
      if(!j.ok){pending.delete(ph);return err(res,502,'Не удалось отправить код в Telegram: '+(j.error||'ошибка'))}
      return send(res,200,{ok:1,via:'telegram'});
    }
    return send(res,200,{ok:1,via:'demo',code});
  }
  if(p==='/api/verify'){
    const ph=normPhone(b.phone),P=pending.get(ph);
    if(!P||P.exp<Date.now())return err(res,400,'Код устарел, запроси новый');
    if(++P.tries>5){pending.delete(ph);return err(res,429,'Слишком много попыток')}
    if(String(b.code||'').trim()!==P.code)return err(res,401,'Неверный код');
    pending.delete(ph);
    let id=db.phones[ph],isNew=false;
    if(!id){isNew=true;id='u'+(db.seq++);db.phones[ph]=id;db.users[id]={id,phone:ph,name:'Пользователь',primary:null,stars:1000};randName(id);ensurePrimary(id);mkGift(id);mkGift(id)}
    const token=crypto.randomBytes(24).toString('hex');db.tokens[token]=id;save();
    return send(res,200,{token,isNew});
  }
  const tok=(req.headers.authorization||'').replace('Bearer ','')||url.searchParams.get('token');
  const me=db.tokens[tok],U=db.users[me];
  if(!U)return err(res,401,'auth');
  if(p==='/api/stream'){
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write('retry: 3000\n\n');
    if(!clients.has(me))clients.set(me,new Set());
    clients.get(me).add(res);
    const iv=setInterval(()=>res.write(': ping\n\n'),20000);
    req.on('close',()=>{clearInterval(iv);clients.get(me).delete(res)});
    return;
  }
  if(p==='/api/me')return send(res,200,{id:me,name:U.name,handle:handle(me),phone:U.phone,stars:U.stars,names:ownedNames(me).map(n=>({u:n.u,r:n.r,price:n.price,primary:L(n.u)===U.primary}))});
  if(p==='/api/profile'){U.name=String(b.name||'').trim().slice(0,30)||'Пользователь';save();return send(res,200,{ok:1})}
  if(p==='/api/stars'){const n=Math.floor(+b.amount);if(!(n>=0&&n<=1e15))return err(res,400,'Число от 0 до 1 000 000 000 000 000');U.stars=n;save();return send(res,200,{stars:n})}
  if(p==='/api/user'){const n=db.names[L(url.searchParams.get('u')).replace(/^@/,'')],o=n&&db.users[n.owner];return o?send(res,200,{id:o.id,name:o.name,handle:n.u}):err(res,404,'Пользователь не найден')}
  if(p==='/api/chats'){
    const partners={};let lastAll=null;
    for(const m of db.msgs){if(m.to==='all')lastAll=m;else if(m.from===me||m.to===me)partners[m.from===me?m.to:m.from]=m}
    const txt=m=>m?(m.g?'🎁 Подарок':m.t):'';
    const list=Object.entries(partners).sort((a,b)=>b[1].id-a[1].id).map(([o,m])=>({id:o,name:(db.users[o]?db.users[o].name:'?')+' @'+handle(o),last:txt(m)}));
    return send(res,200,[{id:'all',name:'Общий чат',last:txt(lastAll)},...list]);
  }
  if(p==='/api/messages'){
    const w=url.searchParams.get('with');
    return send(res,200,db.msgs.filter(m=>w==='all'?m.to==='all':((m.from===me&&m.to===w)||(m.from===w&&m.to===me))).slice(-100));
  }
  if(p==='/api/send'){
    const to=String(b.to||''),t=String(b.t||'').trim().slice(0,2000);
    if(to!=='all'&&!db.users[to])return err(res,404,'Пользователь не найден');
    const m={from:me,fn:U.name,to,t};
    if(b.gift){
      const g=db.gifts[b.gift];
      if(!g||g.owner!==me)return err(res,403,'Это не твой подарок');
      if(to==='all')return err(res,400,'Подарки дарят в личных чатах');
      g.owner=to;g.price=null;m.g=pub(g);
    }else if(!t)return err(res,400,'Пусто');
    say(m);
    const bot=db.users[to];
    if(bot&&bot.bot)setTimeout(()=>say({from:to,fn:bot.name,to:me,t:pick(['Привет! Я торгую подарками и юзернеймами, смотри маркет.','Выставь подарок на маркет, я посмотрю 👀','Хочу редкий @ник, у кого есть?'])}),1200);
    return send(res,200,{ok:1});
  }
  if(p==='/api/inv')return send(res,200,Object.values(db.gifts).filter(g=>g.owner===me).map(pub));
  if(p==='/api/shop'){
    if(U.stars<SHOP_PRICE)return err(res,400,'Не хватает звёзд (нужно '+SHOP_PRICE+')');
    if(Object.values(db.gifts).filter(g=>g.owner===me).length>=300)return err(res,400,'Лимит коллекции 300');
    U.stars-=SHOP_PRICE;const g=mkGift(me);save();return send(res,200,pub(g));
  }
  if(p==='/api/market')return send(res,200,Object.values(db.gifts).filter(g=>g.price!=null).map(pub));
  if(p==='/api/list'){const g=db.gifts[b.id],pr=Math.floor(+b.price);if(!g||g.owner!==me)return err(res,403,'Не твой подарок');if(!(pr>=1&&pr<=1e12))return err(res,400,'Цена от 1 до 1 000 000 000 000');g.price=pr;save();return send(res,200,{ok:1})}
  if(p==='/api/unlist'){const g=db.gifts[b.id];if(!g||g.owner!==me)return err(res,403,'Не твой подарок');g.price=null;save();return send(res,200,{ok:1})}
  if(p==='/api/buy'){
    const g=db.gifts[b.id];
    if(!g||g.price==null)return err(res,404,'Уже продано');
    if(g.owner===me)return err(res,400,'Это твой подарок');
    if(!buyGift(me,g))return err(res,400,'Не хватает звёзд');
    save();return send(res,200,{ok:1});
  }
  if(p==='/api/names'){
    const u=String(b.u||'').trim().replace(/^@/,''),l=L(u);
    if(!/^[A-Za-z0-9_]{3,20}$/.test(u))return err(res,400,'3-20 символов: латиница, цифры, _');
    if(db.names[l])return err(res,409,'Юзернейм занят');
    if(ownedNames(me).length>=30)return err(res,400,'Лимит 30 юзернеймов');
    if(U.stars<nameCost(u))return err(res,400,'Не хватает звёзд (нужно '+nameCost(u)+')');
    U.stars-=nameCost(u);addName(me,u);save();return send(res,200,{ok:1});
  }
  if(p==='/api/primary'){const n=db.names[L(b.u)];if(!n||n.owner!==me)return err(res,403,'Не твой юзернейм');U.primary=L(n.u);save();return send(res,200,{ok:1})}
  if(p==='/api/nlist'){const n=db.names[L(b.u)],pr=Math.floor(+b.price);if(!n||n.owner!==me)return err(res,403,'Не твой юзернейм');if(!(pr>=1&&pr<=1e12))return err(res,400,'Цена от 1 до 1 000 000 000 000');n.price=pr;save();return send(res,200,{ok:1})}
  if(p==='/api/nunlist'){const n=db.names[L(b.u)];if(!n||n.owner!==me)return err(res,403,'Не твой юзернейм');n.price=null;save();return send(res,200,{ok:1})}
  if(p==='/api/nmarket')return send(res,200,Object.values(db.names).filter(n=>n.price!=null).map(n=>({u:n.u,r:n.r,price:n.price,mine:n.owner===me})));
  if(p==='/api/nbuy'){
    const n=db.names[L(b.u)];
    if(!n||n.price==null)return err(res,404,'Уже продано');
    if(n.owner===me)return err(res,400,'Это твой юзернейм');
    if(!buyName(me,n))return err(res,400,'Не хватает звёзд');
    save();return send(res,200,{ok:1});
  }
  return err(res,404,'Нет такого метода');
}
http.createServer(async(req,res)=>{
  for(const k in CORS)res.setHeader(k,CORS[k]);
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  const url=new URL(req.url,'http://x'),p=url.pathname;
  if(!p.startsWith('/api/'))return serveStatic(p,res);
  let body={};
  if(req.method==='POST'){
    let s='';
    for await(const c of req){s+=c;if(s.length>1e5)return err(res,413,'Слишком большой запрос')}
    try{body=JSON.parse(s||'{}')}catch(e){return err(res,400,'json')}
  }
  try{await route(req,res,p,url,body)}catch(e){console.error(e);if(!res.headersSent)err(res,500,'Ошибка сервера')}
}).listen(PORT,()=>console.log('FreeGram server on port '+PORT+(GATEWAY?' (Telegram Gateway ON)':' (DEMO login: code is shown in app)')));
