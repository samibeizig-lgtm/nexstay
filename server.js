const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.RAILWAY_ENVIRONMENT ? '/tmp/nexstay_db.json' : path.join(__dirname, 'nexstay_db.json');
const UPLOADS_DIR = process.env.RAILWAY_ENVIRONMENT ? '/tmp/uploads' : path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let DB = { users:[], contracts:[], invoices:[], revenues:[], maintenances:[], infos:[], sessions:[] };

function loadDB() {
  try { if (fs.existsSync(DB_FILE)) DB = JSON.parse(fs.readFileSync(DB_FILE,'utf8')); } catch(e) {}
}
function saveDB() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(DB,null,2)); } catch(e) {}
}
function genId() { return crypto.randomBytes(8).toString('hex'); }
function hash(p) { return crypto.createHash('sha256').update(p+'nexstay2024').digest('hex'); }
function genToken(uid) {
  const t = crypto.randomBytes(32).toString('hex');
  DB.sessions = DB.sessions.filter(s=>s.uid!==uid);
  DB.sessions.push({t,uid,at:Date.now()});
  saveDB(); return t;
}
function authUser(token) {
  if (!token) return null;
  const tk = token.replace('Bearer ','').trim();
  const s = DB.sessions.find(s=>s.t===tk && Date.now()-s.at < 7*864e5);
  if (!s) return null;
  return DB.users.find(u=>u.id===s.uid);
}
function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL||'admin@nexstay.tn';
  const pwd   = process.env.ADMIN_PASSWORD||'admin123';
  const ex = DB.users.find(u=>u.email===email);
  if (!ex) {
    DB.users.push({id:'admin-001',nom:'Nexstay',prenom:'Admin',email,password:hash(pwd),role:'admin',createdAt:new Date().toISOString()});
    saveDB(); console.log('Admin créé');
  } else if (ex.role!=='admin') { ex.role='admin'; ex.password=hash(pwd); saveDB(); }
}
function seedDemo() {
  if (DB.users.some(u=>u.role==='owner')) return;
  const oid='owner-demo-001';
  DB.users.push({id:oid,nom:'Ben Ali',prenom:'Mohamed',email:'demo@nexstay.tn',password:hash('demo123'),role:'owner',tel:'+216 55 123 456',adresse:'Apt 4B, Rés. Les Jasmins, La Marsa',ville:'Tunis',typeLogement:'Appartement',createdAt:new Date().toISOString()});
  DB.contracts.push({id:genId(),ownerId:oid,numero:'NX-2024-TN-0487',dateDebut:'2024-01-01',dateFin:'2025-12-31',commission:20,statut:'actif',createdAt:new Date().toISOString()});
  [{month:'Janvier 2025',amount:1850,date:'2025-02-01',status:'payée',numero:'F-2025-001'},
   {month:'Février 2025',amount:2100,date:'2025-03-01',status:'payée',numero:'F-2025-002'},
   {month:'Mars 2025',amount:1950,date:'2025-04-01',status:'payée',numero:'F-2025-003'},
   {month:'Avril 2025',amount:2340,date:'2025-05-01',status:'en_attente',numero:'F-2025-004'}
  ].forEach(m=>DB.invoices.push({id:genId(),ownerId:oid,...m,pdfFile:null,createdAt:new Date().toISOString()}));
  [{mois:'Janvier',annee:2025,revenuBrut:3840,revenuNet:3200,tauxOccupation:72,nbLocataires:8,nbNuits:22},
   {mois:'Février',annee:2025,revenuBrut:4560,revenuNet:3800,tauxOccupation:85,nbLocataires:10,nbNuits:24},
   {mois:'Mars',annee:2025,revenuBrut:4320,revenuNet:3600,tauxOccupation:78,nbLocataires:9,nbNuits:24},
   {mois:'Avril',annee:2025,revenuBrut:5040,revenuNet:4200,tauxOccupation:91,nbLocataires:12,nbNuits:27},
   {mois:'Mai',annee:2025,revenuBrut:5880,revenuNet:4900,tauxOccupation:95,nbLocataires:14,nbNuits:29}
  ].forEach(r=>DB.revenues.push({id:genId(),ownerId:oid,...r,createdAt:new Date().toISOString()}));
  [{date:'2025-04-10',type:'Ménage',statut:'effectué',technicien:'Amira B.',note:'Appartement remis en état après séjour long.'},
   {date:'2025-04-18',type:'Plomberie',statut:'effectué',technicien:'Karim D.',note:'Remplacement joint robinet salle de bain.'},
   {date:'2025-04-28',type:'Électricité',statut:'planifié',technicien:'Sami T.',note:'Vérification tableau électrique.'},
   {date:'2025-05-05',type:'Ménage',statut:'planifié',technicien:'Amira B.',note:'Nettoyage entre deux réservations.'}
  ].forEach(m=>DB.maintenances.push({id:genId(),ownerId:oid,...m,createdAt:new Date().toISOString()}));
  DB.infos.push({id:genId(),ownerId:oid,adresse:'Apt 4B, Rés. Les Jasmins, La Marsa, Tunis',etage:'4ème',superficie:'95 m²',nbCles:3,internet:{fournisseur:'Topnet',numero:'TPN-88341-C',dateFin:'2025-09-15'},tv:{abonnement:'Canal+ Tunisie',reference:'CPT-2024-9921',dateFin:'2025-11-30'},autresInfos:'Code digicode entrée : 4892#',createdAt:new Date().toISOString()});
  saveDB(); console.log('Demo créé');
}

// Multipart parser pour upload PDF
function parseMultipart(req, boundary) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        const bnd = Buffer.from('--' + boundary);
        const parts = [];
        let start = 0;
        while (start < buf.length) {
          const idx = buf.indexOf(bnd, start);
          if (idx === -1) break;
          const end = buf.indexOf(bnd, idx + bnd.length);
          if (end === -1) break;
          parts.push(buf.slice(idx + bnd.length + 2, end - 2));
          start = end;
        }
        const result = {};
        for (const part of parts) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;
          const header = part.slice(0, headerEnd).toString();
          const body = part.slice(headerEnd + 4);
          const nameMatch = header.match(/name="([^"]+)"/);
          const filenameMatch = header.match(/filename="([^"]+)"/);
          if (!nameMatch) continue;
          if (filenameMatch) {
            result[nameMatch[1]] = { filename: filenameMatch[1], data: body };
          } else {
            result[nameMatch[1]] = body.toString().trim();
          }
        }
        resolve(result);
      } catch(e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function parseMultipart(req,boundary){
  return new Promise((resolve,reject)=>{
    const chunks=[];
    req.on('data',c=>chunks.push(c));
    req.on('end',()=>{
      try{
        const buf=Buffer.concat(chunks);
        const bnd=Buffer.from('--'+boundary);
        const result={};
        let pos=0;
        while(pos<buf.length){
          const s=buf.indexOf(bnd,pos);if(s===-1)break;
          const e=buf.indexOf(bnd,s+bnd.length);if(e===-1)break;
          const part=buf.slice(s+bnd.length+2,e-2);
          const he=part.indexOf('\r\n\r\n');if(he===-1){pos=e;continue;}
          const hdr=part.slice(0,he).toString();
          const body=part.slice(he+4);
          const nm=hdr.match(/name="([^"]+)"/);
          const fn=hdr.match(/filename="([^"]+)"/);
          if(!nm){pos=e;continue;}
          result[nm[1]]=fn?{filename:fn[1],data:body}:body.toString().trim();
          pos=e;
        }
        resolve(result);
      }catch(e){reject(e);}
    });
    req.on('error',reject);
  });
}

function parseBody(req) {
  return new Promise(resolve => {
    let b='';
    req.on('data',c=>b+=c);
    req.on('end',()=>{try{resolve(JSON.parse(b));}catch{resolve({});}});
  });
}
function send(res,status,data) {
  res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'});
  res.end(JSON.stringify(data));
}

async function handleAPI(req, res, method, pathname, token) {
  const parts = pathname.split('/').filter(Boolean);

  // AUTH
  if (parts[1]==='auth') {
    if (parts[2]==='register' && method==='POST') {
      const b=await parseBody(req);
      if (!b.email||!b.password) return send(res,400,{error:'Email et mot de passe requis'});
      if (DB.users.find(u=>u.email===b.email)) return send(res,400,{error:'Email déjà utilisé'});
      const u={id:genId(),role:'owner',nom:b.nom||'',prenom:b.prenom||'',email:b.email,password:hash(b.password),tel:b.tel||'',adresse:b.adresse||'',ville:b.ville||'',typeLogement:b.typeLogement||'',createdAt:new Date().toISOString()};
      DB.users.push(u); saveDB();
      const {password:_,...safe}=u;
      return send(res,201,{user:safe,token:genToken(u.id)});
    }
    if (parts[2]==='login' && method==='POST') {
      const b=await parseBody(req);
      const u=DB.users.find(u=>u.email===b.email&&u.password===hash(b.password));
      if (!u) return send(res,401,{error:'Email ou mot de passe incorrect'});
      const {password:_,...safe}=u;
      return send(res,200,{user:safe,token:genToken(u.id)});
    }
    if (parts[2]==='me' && method==='GET') {
      const u=authUser(token);
      if (!u) return send(res,401,{error:'Non autorisé'});
      const {password:_,...safe}=u;
      return send(res,200,safe);
    }
  }

  // PDF DOWNLOAD — handles token from header OR query string
  if (parts[1]==='invoice-pdf'&&parts[2]&&method==='GET') {
    const qtoken = parsed.query&&parsed.query.token ? parsed.query.token.replace('Bearer ','').trim() : '';
    const pdfToken = token || (qtoken ? 'Bearer '+qtoken : '');
    const pdfUser = authUser(pdfToken) || authUser('Bearer '+qtoken);
    if (!pdfUser) return send(res,401,{error:'Autorisation requise — veuillez vous reconnecter'});
    const inv=DB.invoices.find(i=>i.id===parts[2]);
    if (!inv||!inv.pdfFile) return send(res,404,{error:'PDF non disponible'});
    if (pdfUser.role!=='admin'&&inv.ownerId!==pdfUser.id) return send(res,403,{error:'Accès refusé'});
    const fp=path.join(UPLOADS_DIR,inv.pdfFile);
    if (!fs.existsSync(fp)) return send(res,404,{error:'Fichier introuvable sur le serveur'});
    res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="facture.pdf"','Access-Control-Allow-Origin':'*'});
    return res.end(fs.readFileSync(fp));
  }
  const user=authUser(token);
  if (!user) return send(res,401,{error:'Non autorisé'});

  // CONTRACT
  if (parts[1]==='contract') {
    if (method==='GET') return send(res,200,DB.contracts.find(c=>c.ownerId===user.id)||null);
    if (method==='POST'&&user.role==='admin') {
      const b=await parseBody(req);
      const c={id:genId(),...b,createdAt:new Date().toISOString()};
      DB.contracts.push(c); saveDB(); return send(res,201,c);
    }
    if (method==='PUT'&&user.role==='admin'&&parts[2]) {
      const b=await parseBody(req);
      const idx=DB.contracts.findIndex(c=>c.id===parts[2]);
      if (idx===-1) return send(res,404,{error:'Contrat introuvable'});
      DB.contracts[idx]={...DB.contracts[idx],...b}; saveDB();
      return send(res,200,DB.contracts[idx]);
    }
  }

  // INVOICES
  if (parts[1]==='invoices') {
    if (method==='GET') {
      const oid=user.role==='admin'?(parts[2]||null):user.id;
      const inv=oid?DB.invoices.filter(i=>i.ownerId===oid):DB.invoices;
      return send(res,200,inv.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)));
    }
    if (method==='POST'&&user.role==='admin') {
      const b=await parseBody(req);
      const inv={id:genId(),...b,pdfFile:null,createdAt:new Date().toISOString()};
      DB.invoices.push(inv); saveDB(); return send(res,201,inv);
    }
    if (method==='PUT'&&user.role==='admin'&&parts[2]) {
      const b=await parseBody(req);
      const idx=DB.invoices.findIndex(i=>i.id===parts[2]);
      if (idx===-1) return send(res,404,{error:'Introuvable'});
      DB.invoices[idx]={...DB.invoices[idx],...b}; saveDB();
      return send(res,200,DB.invoices[idx]);
    }
    if (method==='DELETE'&&user.role==='admin'&&parts[2]) {
      const inv=DB.invoices.find(i=>i.id===parts[2]);
      if (inv&&inv.pdfFile) { try { fs.unlinkSync(path.join(UPLOADS_DIR,inv.pdfFile)); } catch(e) {} }
      DB.invoices=DB.invoices.filter(i=>i.id!==parts[2]); saveDB();
      return send(res,200,{success:true});
    }
  }

  // INVOICE PDF UPLOAD
  if (parts[1]==='invoice-upload'&&parts[2]&&method==='POST'&&user.role==='admin') {
    const ct=req.headers['content-type']||'';
    const bm=ct.match(/boundary=(.+)/);
    if (!bm) return send(res,400,{error:'Pas de boundary'});
    const parsed=await parseMultipart(req,bm[1]);
    const file=parsed.file;
    if (!file||!file.data) return send(res,400,{error:'Pas de fichier'});
    const filename=parts[2]+'_'+Date.now()+'.pdf';
    fs.writeFileSync(path.join(UPLOADS_DIR,filename),file.data);
    const idx=DB.invoices.findIndex(i=>i.id===parts[2]);
    if (idx!==-1) { DB.invoices[idx].pdfFile=filename; saveDB(); }
    return send(res,200,{pdfFile:filename});
  }


  // REVENUES
  if (parts[1]==='revenues') {
    if (method==='GET') return send(res,200,DB.revenues.filter(r=>r.ownerId===user.id));
    if (method==='POST'&&user.role==='admin') {
      const b=await parseBody(req);
      const r={id:genId(),...b,createdAt:new Date().toISOString()};
      DB.revenues.push(r); saveDB(); return send(res,201,r);
    }
    if (method==='PUT'&&user.role==='admin'&&parts[2]) {
      const b=await parseBody(req);
      const idx=DB.revenues.findIndex(r=>r.id===parts[2]);
      if (idx===-1) return send(res,404,{error:'Introuvable'});
      DB.revenues[idx]={...DB.revenues[idx],...b}; saveDB();
      return send(res,200,DB.revenues[idx]);
    }
    if (method==='DELETE'&&user.role==='admin'&&parts[2]) {
      DB.revenues=DB.revenues.filter(r=>r.id!==parts[2]); saveDB();
      return send(res,200,{success:true});
    }
  }

  // MAINTENANCES
  if (parts[1]==='maintenances') {
    if (method==='GET') return send(res,200,DB.maintenances.filter(m=>m.ownerId===user.id).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)));
    if (method==='POST'&&user.role==='admin') {
      const b=await parseBody(req);
      const m={id:genId(),...b,createdAt:new Date().toISOString()};
      DB.maintenances.push(m); saveDB(); return send(res,201,m);
    }
    if (method==='PUT'&&user.role==='admin'&&parts[2]) {
      const b=await parseBody(req);
      const idx=DB.maintenances.findIndex(m=>m.id===parts[2]);
      if (idx===-1) return send(res,404,{error:'Introuvable'});
      DB.maintenances[idx]={...DB.maintenances[idx],...b}; saveDB();
      return send(res,200,DB.maintenances[idx]);
    }
    if (method==='DELETE'&&user.role==='admin'&&parts[2]) {
      DB.maintenances=DB.maintenances.filter(m=>m.id!==parts[2]); saveDB();
      return send(res,200,{success:true});
    }
  }

  // INFOS
  if (parts[1]==='infos') {
    if (method==='GET') return send(res,200,DB.infos.find(i=>i.ownerId===user.id)||null);
    if (method==='PUT'&&user.role==='admin') {
      const b=await parseBody(req);
      const idx=DB.infos.findIndex(i=>i.ownerId===b.ownerId);
      if (idx===-1) { const it={id:genId(),...b,createdAt:new Date().toISOString()}; DB.infos.push(it); saveDB(); return send(res,201,it); }
      DB.infos[idx]={...DB.infos[idx],...b}; saveDB();
      return send(res,200,DB.infos[idx]);
    }
  }

  // CHANGE PASSWORD
  if (parts[1]==='change-password'&&method==='POST') {
    const b=await parseBody(req);
    if (!b.currentPassword||!b.newPassword) return send(res,400,{error:'Champs requis'});
    if (user.password!==hash(b.currentPassword)) return send(res,400,{error:'Mot de passe actuel incorrect'});
    if (b.newPassword.length<6) return send(res,400,{error:'Le nouveau mot de passe doit faire au moins 6 caractères'});
    const idx=DB.users.findIndex(u=>u.id===user.id);
    DB.users[idx].password=hash(b.newPassword);
    saveDB();
    return send(res,200,{success:true});
  }

  // ADMIN: change owner password
  if (parts[1]==='admin-change-password'&&method==='POST'&&user.role==='admin') {
    const b=await parseBody(req);
    if (!b.ownerId||!b.newPassword) return send(res,400,{error:'Champs requis'});
    if (b.newPassword.length<6) return send(res,400,{error:'Minimum 6 caractères'});
    const idx=DB.users.findIndex(u=>u.id===b.ownerId);
    if (idx===-1) return send(res,404,{error:'Propriétaire introuvable'});
    DB.users[idx].password=hash(b.newPassword);
    saveDB();
    return send(res,200,{success:true});
  }

  // CALENDAR LINK (admin sets Airbnb iCal URL per owner)
  if (parts[1]==='calendar'&&parts[2]) {
    const oid=parts[2];
    if (method==='GET') {
      // owner can only get their own, admin can get any
      if (user.role!=='admin'&&user.id!==oid) return send(res,403,{error:'Accès refusé'});
      const inf=DB.infos.find(i=>i.ownerId===oid);
      return send(res,200,{calendarUrl:inf&&inf.calendarUrl?inf.calendarUrl:null});
    }
    if (method==='PUT'&&user.role==='admin') {
      const b=await parseBody(req);
      const idx=DB.infos.findIndex(i=>i.ownerId===oid);
      if (idx===-1) {
        DB.infos.push({id:genId(),ownerId:oid,calendarUrl:b.calendarUrl||null,createdAt:new Date().toISOString()});
      } else {
        DB.infos[idx].calendarUrl=b.calendarUrl||null;
      }
      saveDB();
      return send(res,200,{success:true});
    }
  }

  // OWNERS
  if (parts[1]==='owners'&&user.role==='admin') {
    if (method==='GET') return send(res,200,DB.users.filter(u=>u.role==='owner').map(({password,...u})=>u));
  }

  // ALL INVOICES
  if (parts[1]==='all-invoices'&&user.role==='admin'&&method==='GET') {
    return send(res,200,DB.invoices.map(inv=>{
      const o=DB.users.find(u=>u.id===inv.ownerId);
      return {...inv,ownerName:o?(o.prenom+' '+o.nom):'—'};
    }).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)));
  }

  // ALL REVENUES
  if (parts[1]==='all-revenues'&&user.role==='admin'&&method==='GET') {
    return send(res,200,DB.revenues.map(r=>{
      const o=DB.users.find(u=>u.id===r.ownerId);
      return {...r,ownerName:o?(o.prenom+' '+o.nom):'—'};
    }).sort((a,b)=>b.annee!==a.annee?b.annee-a.annee:0));
  }

  // ALL MAINTENANCES
  if (parts[1]==='all-maintenances'&&user.role==='admin'&&method==='GET') {
    return send(res,200,DB.maintenances.map(m=>{
      const o=DB.users.find(u=>u.id===m.ownerId);
      return {...m,ownerName:o?(o.prenom+' '+o.nom):'—'};
    }).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)));
  }

  // STATS
  if (parts[1]==='stats'&&user.role==='admin') {
    return send(res,200,{
      totalOwners:DB.users.filter(u=>u.role==='owner').length,
      totalInvoices:DB.invoices.length,
      pendingInvoices:DB.invoices.filter(i=>i.status==='en_attente').length,
      totalRevenue:DB.revenues.reduce((s,r)=>s+(r.revenuNet||0),0),
      maintenancePending:DB.maintenances.filter(m=>m.statut==='planifié').length,
    });
  }

  // OWNER DATA (admin)
  if (parts[1]==='owner-data'&&user.role==='admin'&&parts[2]) {
    const oid=parts[2];
    const owner=DB.users.find(u=>u.id===oid);
    if (!owner) return send(res,404,{error:'Propriétaire introuvable'});
    const {password,...safeOwner}=owner;
    return send(res,200,{
      owner:safeOwner,
      contract:DB.contracts.find(c=>c.ownerId===oid)||null,
      invoices:DB.invoices.filter(i=>i.ownerId===oid).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)),
      revenues:DB.revenues.filter(r=>r.ownerId===oid),
      maintenances:DB.maintenances.filter(m=>m.ownerId===oid).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)),
      infos:DB.infos.find(i=>i.ownerId===oid)||null,
    });
  }

  send(res,404,{error:'Route introuvable'});
}

loadDB(); ensureAdmin(); seedDemo();

const server=http.createServer(async(req,res)=>{
  const parsed=url.parse(req.url,true);
  const pathname=parsed.pathname;
  const method=req.method;
  const token=req.headers['authorization']||'';
  if (method==='OPTIONS') {
    res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'});
    return res.end();
  }
  if (pathname.startsWith('/api/')) return handleAPI(req,res,method,pathname,token);
  if (pathname==='/'||pathname==='/index.html') {
    const f=path.join(__dirname,'index.html');
    if (fs.existsSync(f)) { res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'}); return res.end(fs.readFileSync(f)); }
  }
  res.writeHead(404); res.end('Not found');
});

server.listen(PORT,()=>{
  console.log('NEXSTAY running on port',PORT);
  console.log('Admin: admin@nexstay.tn / admin123');
});
