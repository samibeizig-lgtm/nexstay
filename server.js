/**
 * NEXSTAY - Serveur Backend
 * Persistance via JSONBin.io (données survivent aux redéploiements)
 * Node.js pur - zéro dépendance
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');
const https = require('https');

const PORT = process.env.PORT || 3000;

// ── CONFIGURATION JSONBIN ─────────────────────────────────────────────────────
// JSONBin.io : créez un compte gratuit sur https://jsonbin.io
// 1. Créez un bin avec {} comme contenu initial
// 2. Copiez le BIN_ID et votre X-MASTER-KEY
// 3. Ajoutez ces variables dans Railway → Variables d'environnement
const JSONBIN_ID  = process.env.JSONBIN_ID  || null;
const JSONBIN_KEY = process.env.JSONBIN_KEY || null;
const USE_JSONBIN = !!(JSONBIN_ID && JSONBIN_KEY);

// Fallback local (dev uniquement)
const DB_FILE = path.join('/tmp', 'nexstay_db.json');

const UPLOADS_DIR = path.join('/tmp', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let DB = { users:[], contracts:[], invoices:[], revenues:[], maintenances:[], infos:[], sessions:[] };
let _saveTimer = null;

// ── JSONBIN HELPERS ───────────────────────────────────────────────────────────
function jsonbinRequest(method, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    // For GET, add /latest to always get most recent version
    const getPath = method==='GET' ? `/v3/b/${JSONBIN_ID}/latest` : `/v3/b/${JSONBIN_ID}`;
    const options = {
      hostname: 'api.jsonbin.io',
      path: getPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_KEY,
      }
    };
    if (body) options.headers['Content-Length'] = Buffer.byteLength(body);
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function loadDB() {
  if (USE_JSONBIN) {
    try {
      const r = await jsonbinRequest('GET');
      if (r && r.record) {
        DB = r.record;
        console.log('✅ DB chargée depuis JSONBin —', DB.users.length, 'utilisateurs');
        return;
      }
    } catch(e) {
      console.log('⚠️ JSONBin erreur:', e.message, '— fallback local');
    }
  }
  // Fallback local
  try {
    if (fs.existsSync(DB_FILE)) {
      DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      console.log('✅ DB chargée localement');
    }
  } catch(e) { console.log('DB vide'); }
}

function saveDB() {
  // Sauvegarde locale immédiate
  try { fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2)); } catch(e) {}

  // Sauvegarde JSONBin avec debounce (évite trop d'appels API)
  if (USE_JSONBIN) {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      try {
        // Ne jamais envoyer une DB vide
        if (!DB.users) DB.users=[];
        if (!DB.sessions) DB.sessions=[];
        if (Object.keys(DB).length === 0) return;
        await jsonbinRequest('PUT', DB);
        console.log('✅ DB sauvegardée sur JSONBin');
      } catch(e) {
        console.log('⚠️ Erreur sauvegarde JSONBin:', e.message);
      }
    }, 2000); // Attend 2s avant d'envoyer (batch les sauvegardes)
  }
}

// ── FONCTIONS DB ──────────────────────────────────────────────────────────────
function genId() { return crypto.randomBytes(8).toString('hex'); }
function hash(p) { return crypto.createHash('sha256').update(p+'nexstay2024').digest('hex'); }

function genToken(uid) {
  const t = crypto.randomBytes(32).toString('hex');
  DB.sessions = (DB.sessions||[]).filter(s=>s.uid!==uid);
  DB.sessions.push({t,uid,at:Date.now()});
  saveDB(); return t;
}

function authUser(token) {
  if (!token) return null;
  const tk = token.replace('Bearer ','').trim();
  const s = (DB.sessions||[]).find(s=>s.t===tk && Date.now()-s.at < 7*864e5);
  if (!s) return null;
  return (DB.users||[]).find(u=>u.id===s.uid);
}

function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL||'admin@nexstay.tn';
  const pwd   = process.env.ADMIN_PASSWORD||'admin123';
  if (!DB.users) DB.users=[];
  const ex = DB.users.find(u=>u.email===email);
  if (!ex) {
    DB.users.push({id:'admin-001',nom:'Nexstay',prenom:'Admin',email,password:hash(pwd),role:'admin',createdAt:new Date().toISOString()});
    saveDB(); console.log('Admin créé');
  } else if (ex.role!=='admin') {
    ex.role='admin'; ex.password=hash(pwd); saveDB();
  }
}

function seedDemo() {
  if (!DB.users) DB.users=[];
  if (DB.users.some(u=>u.role==='owner')) return;
  const oid='owner-demo-001';
  DB.users.push({id:oid,nom:'Ben Ali',prenom:'Mohamed',email:'demo@nexstay.tn',password:hash('demo123'),role:'owner',tel:'+216 55 123 456',adresse:'Apt 4B, Rés. Les Jasmins, La Marsa',ville:'Tunis',typeLogement:'Appartement',createdAt:new Date().toISOString()});
  if(!DB.contracts)DB.contracts=[];
  DB.contracts.push({id:genId(),ownerId:oid,numero:'NX-2024-TN-0487',dateDebut:'2024-01-01',dateFin:'2025-12-31',commission:20,statut:'actif',createdAt:new Date().toISOString()});
  if(!DB.invoices)DB.invoices=[];
  [{month:'Janvier 2025',amount:1850,date:'2025-02-01',status:'payée',numero:'F-2025-001'},
   {month:'Février 2025',amount:2100,date:'2025-03-01',status:'payée',numero:'F-2025-002'},
   {month:'Mars 2025',amount:1950,date:'2025-04-01',status:'payée',numero:'F-2025-003'},
   {month:'Avril 2025',amount:2340,date:'2025-05-01',status:'en_attente',numero:'F-2025-004'}
  ].forEach(m=>DB.invoices.push({id:genId(),ownerId:oid,...m,pdfData:null,pdfName:null,createdAt:new Date().toISOString()}));
  if(!DB.revenues)DB.revenues=[];
  [{mois:'Janvier',annee:2025,revenuBrut:3840,revenuNet:3200,tauxOccupation:72,nbLocataires:8,nbNuits:22},
   {mois:'Février',annee:2025,revenuBrut:4560,revenuNet:3800,tauxOccupation:85,nbLocataires:10,nbNuits:24},
   {mois:'Mars',annee:2025,revenuBrut:4320,revenuNet:3600,tauxOccupation:78,nbLocataires:9,nbNuits:24},
   {mois:'Avril',annee:2025,revenuBrut:5040,revenuNet:4200,tauxOccupation:91,nbLocataires:12,nbNuits:27},
   {mois:'Mai',annee:2025,revenuBrut:5880,revenuNet:4900,tauxOccupation:95,nbLocataires:14,nbNuits:29}
  ].forEach(r=>DB.revenues.push({id:genId(),ownerId:oid,...r,createdAt:new Date().toISOString()}));
  if(!DB.maintenances)DB.maintenances=[];
  [{date:'2025-04-10',type:'Ménage',statut:'effectué',technicien:'Amira B.',note:'Appartement remis en état.'},
   {date:'2025-04-18',type:'Plomberie',statut:'effectué',technicien:'Karim D.',note:'Remplacement joint robinet.'},
   {date:'2025-04-28',type:'Électricité',statut:'planifié',technicien:'Sami T.',note:'Vérification tableau.'},
   {date:'2025-05-05',type:'Ménage',statut:'planifié',technicien:'Amira B.',note:'Nettoyage entre réservations.'}
  ].forEach(m=>DB.maintenances.push({id:genId(),ownerId:oid,...m,createdAt:new Date().toISOString()}));
  if(!DB.infos)DB.infos=[];
  DB.infos.push({id:genId(),ownerId:oid,nomAppartement:'Apt Les Jasmins',adresse:'Apt 4B, Rés. Les Jasmins, La Marsa, Tunis',etage:'4ème',superficie:'95 m²',nbCles:3,internet:{fournisseur:'Topnet',numero:'TPN-88341-C',wifiNom:'Jasmins_WiFi',wifiCode:'jasmin2024',dateFin:'2025-09-15'},tv:{abonnement:'Canal+ Tunisie',reference:'CPT-2024-9921',dateFin:'2025-11-30'},contrat:{numero:'NX-2024-TN-0487',dateDebut:'2024-01-01',dateFin:'2025-12-31',commission:20},autresInfos:'Code digicode : 4892#',createdAt:new Date().toISOString()});
  saveDB(); console.log('Demo créé');
}

// ── MULTIPART PARSER ──────────────────────────────────────────────────────────
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

// ── ROUTES API ────────────────────────────────────────────────────────────────
async function handleAPI(req, res, method, pathname, token) {
  const parts = pathname.split('/').filter(Boolean);

  // AUTH
  if (parts[1]==='auth') {
    if (parts[2]==='register'&&method==='POST') {
      const b=await parseBody(req);
      if (!b.email||!b.password) return send(res,400,{error:'Email et mot de passe requis'});
      if ((DB.users||[]).find(u=>u.email===b.email)) return send(res,400,{error:'Email déjà utilisé'});
      const u={id:genId(),role:'owner',nom:b.nom||'',prenom:b.prenom||'',email:b.email,password:hash(b.password),tel:b.tel||'',adresse:b.adresse||'',ville:b.ville||'',typeLogement:b.typeLogement||'',createdAt:new Date().toISOString()};
      if(!DB.users)DB.users=[];
      DB.users.push(u);saveDB();
      const {password:_,...safe}=u;
      return send(res,201,{user:safe,token:genToken(u.id)});
    }
    if (parts[2]==='login'&&method==='POST') {
      const b=await parseBody(req);
      const u=(DB.users||[]).find(u=>u.email===b.email&&u.password===hash(b.password));
      if (!u) return send(res,401,{error:'Email ou mot de passe incorrect'});
      const {password:_,...safe}=u;
      return send(res,200,{user:safe,token:genToken(u.id)});
    }
    if (parts[2]==='me'&&method==='GET') {
      const u=authUser(token);
      if (!u) return send(res,401,{error:'Non autorisé'});
      const {password:_,...safe}=u;
      return send(res,200,safe);
    }
  }

  // PDF DOWNLOAD — avant la vérif auth globale
  if (parts[1]==='invoice-pdf'&&parts[2]&&method==='GET') {
    let pdfUser=authUser(token);
    if (!pdfUser&&parsed.query&&parsed.query.token) pdfUser=authUser('Bearer '+parsed.query.token.trim());
    if (!pdfUser) return send(res,401,{error:'Session expirée — reconnectez-vous'});
    const inv=(DB.invoices||[]).find(i=>i.id===parts[2]);
    if (!inv) return send(res,404,{error:'Facture introuvable'});
    if (pdfUser.role!=='admin'&&inv.ownerId!==pdfUser.id) return send(res,403,{error:'Accès refusé'});
    if (!inv.pdfData) return send(res,404,{error:'PDF non disponible — l\'admin doit uploader ce fichier'});
    const pdfBuf=Buffer.from(inv.pdfData,'base64');
    const fname=inv.pdfName||(inv.numero||'facture').replace(/[^a-zA-Z0-9-_.]/g,'-')+'.pdf';
    res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+fname+'"','Content-Length':pdfBuf.length,'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Disposition'});
    return res.end(pdfBuf);
  }

  const user=authUser(token);
  if (!user) return send(res,401,{error:'Non autorisé'});

  // CONTRACT
  if (parts[1]==='contract') {
    if (method==='GET') return send(res,200,(DB.contracts||[]).find(c=>c.ownerId===user.id)||null);
    if (method==='POST'&&user.role==='admin') {
      const b=await parseBody(req);
      const c={id:genId(),...b,createdAt:new Date().toISOString()};
      if(!DB.contracts)DB.contracts=[];
      DB.contracts.push(c);saveDB();return send(res,201,c);
    }
  }

  // INVOICES
  if (parts[1]==='invoices') {
    if (method==='GET') {
      const oid=user.role==='admin'?(parts[2]||null):user.id;
      const inv=oid?(DB.invoices||[]).filter(i=>i.ownerId===oid):(DB.invoices||[]);
      return send(res,200,inv.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)));
    }
    if (method==='POST'&&user.role==='admin') {
      const b=await parseBody(req);
      const inv={id:genId(),...b,pdfData:null,pdfName:null,createdAt:new Date().toISOString()};
      if(!DB.invoices)DB.invoices=[];
      DB.invoices.push(inv);saveDB();return send(res,201,inv);
    }
    if (method==='PUT'&&user.role==='admin'&&parts[2]) {
      const b=await parseBody(req);
      const idx=(DB.invoices||[]).findIndex(i=>i.id===parts[2]);
      if (idx===-1) return send(res,404,{error:'Introuvable'});
      DB.invoices[idx]={...DB.invoices[idx],...b};saveDB();return send(res,200,DB.invoices[idx]);
    }
    if (method==='DELETE'&&user.role==='admin'&&parts[2]) {
      DB.invoices=(DB.invoices||[]).filter(i=>i.id!==parts[2]);saveDB();return send(res,200,{success:true});
    }
  }

  // PDF UPLOAD
  if (parts[1]==='invoice-upload'&&parts[2]&&method==='POST'&&user.role==='admin') {
    const ct=req.headers['content-type']||'';
    const bm=ct.match(/boundary=(.+)/);
    if (!bm) return send(res,400,{error:'Pas de boundary'});
    const parsed2=await parseMultipart(req,bm[1]);
    const file=parsed2.file;
    if (!file||!file.data) return send(res,400,{error:'Pas de fichier'});
    if (file.data.length>10*1024*1024) return send(res,400,{error:'Fichier trop grand (max 10MB)'});
    const b64=file.data.toString('base64');
    const origName=(file.filename||'facture.pdf').replace(/[^a-zA-Z0-9._-]/g,'_');
    const idx=(DB.invoices||[]).findIndex(i=>i.id===parts[2]);
    if (idx!==-1){DB.invoices[idx].pdfData=b64;DB.invoices[idx].pdfName=origName;DB.invoices[idx].pdfFile=origName;saveDB();}
    return send(res,200,{pdfFile:origName,success:true});
  }

  // REVENUES
  if (parts[1]==='revenues') {
    if (method==='GET') return send(res,200,(DB.revenues||[]).filter(r=>r.ownerId===user.id));
    if (method==='POST'&&user.role==='admin') {
      const b=await parseBody(req);
      const r={id:genId(),...b,createdAt:new Date().toISOString()};
      if(!DB.revenues)DB.revenues=[];
      DB.revenues.push(r);saveDB();return send(res,201,r);
    }
    if (method==='PUT'&&user.role==='admin'&&parts[2]) {
      const b=await parseBody(req);
      const idx=(DB.revenues||[]).findIndex(r=>r.id===parts[2]);
      if (idx===-1) return send(res,404,{error:'Introuvable'});
      DB.revenues[idx]={...DB.revenues[idx],...b};saveDB();return send(res,200,DB.revenues[idx]);
    }
    if (method==='DELETE'&&user.role==='admin'&&parts[2]) {
      DB.revenues=(DB.revenues||[]).filter(r=>r.id!==parts[2]);saveDB();return send(res,200,{success:true});
    }
  }

  // MAINTENANCES
  if (parts[1]==='maintenances') {
    if (method==='GET') return send(res,200,(DB.maintenances||[]).filter(m=>m.ownerId===user.id).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)));
    if (method==='POST'&&user.role==='admin') {
      const b=await parseBody(req);
      const m={id:genId(),...b,createdAt:new Date().toISOString()};
      if(!DB.maintenances)DB.maintenances=[];
      DB.maintenances.push(m);saveDB();return send(res,201,m);
    }
    if (method==='PUT'&&user.role==='admin'&&parts[2]) {
      const b=await parseBody(req);
      const idx=(DB.maintenances||[]).findIndex(m=>m.id===parts[2]);
      if (idx===-1) return send(res,404,{error:'Introuvable'});
      DB.maintenances[idx]={...DB.maintenances[idx],...b};saveDB();return send(res,200,DB.maintenances[idx]);
    }
    if (method==='DELETE'&&user.role==='admin'&&parts[2]) {
      DB.maintenances=(DB.maintenances||[]).filter(m=>m.id!==parts[2]);saveDB();return send(res,200,{success:true});
    }
  }

  // INFOS
  if (parts[1]==='infos') {
    if (method==='GET') return send(res,200,(DB.infos||[]).find(i=>i.ownerId===user.id)||null);
    if (method==='PUT'&&user.role==='admin') {
      const b=await parseBody(req);
      if(!DB.infos)DB.infos=[];
      const idx=DB.infos.findIndex(i=>i.ownerId===b.ownerId);
      if (idx===-1){const it={id:genId(),...b,createdAt:new Date().toISOString()};DB.infos.push(it);saveDB();return send(res,201,it);}
      DB.infos[idx]={...DB.infos[idx],...b};saveDB();return send(res,200,DB.infos[idx]);
    }
  }

  // CALENDAR
  if (parts[1]==='calendar'&&parts[2]) {
    const oid=parts[2];
    if (method==='GET') {
      if (user.role!=='admin'&&user.id!==oid) return send(res,403,{error:'Accès refusé'});
      const inf=(DB.infos||[]).find(i=>i.ownerId===oid);
      return send(res,200,{calendarUrl:inf&&inf.calendarUrl?inf.calendarUrl:null});
    }
    if (method==='PUT'&&user.role==='admin') {
      const b=await parseBody(req);
      if(!DB.infos)DB.infos=[];
      const idx=DB.infos.findIndex(i=>i.ownerId===oid);
      if (idx===-1){DB.infos.push({id:genId(),ownerId:oid,calendarUrl:b.calendarUrl||null,createdAt:new Date().toISOString()});}
      else{DB.infos[idx].calendarUrl=b.calendarUrl||null;}
      saveDB();return send(res,200,{success:true});
    }
  }

  // CHANGE PASSWORD
  if (parts[1]==='change-password'&&method==='POST') {
    const b=await parseBody(req);
    if (!b.currentPassword||!b.newPassword) return send(res,400,{error:'Champs requis'});
    if (user.password!==hash(b.currentPassword)) return send(res,400,{error:'Mot de passe actuel incorrect'});
    if (b.newPassword.length<6) return send(res,400,{error:'Minimum 6 caractères'});
    const idx=(DB.users||[]).findIndex(u=>u.id===user.id);
    DB.users[idx].password=hash(b.newPassword);saveDB();return send(res,200,{success:true});
  }

  // ADMIN CHANGE PASSWORD
  if (parts[1]==='admin-change-password'&&method==='POST'&&user.role==='admin') {
    const b=await parseBody(req);
    if (!b.ownerId||!b.newPassword) return send(res,400,{error:'Champs requis'});
    if (b.newPassword.length<6) return send(res,400,{error:'Minimum 6 caractères'});
    const idx=(DB.users||[]).findIndex(u=>u.id===b.ownerId);
    if (idx===-1) return send(res,404,{error:'Introuvable'});
    DB.users[idx].password=hash(b.newPassword);saveDB();return send(res,200,{success:true});
  }

  // OWNERS
  if (parts[1]==='owners'&&user.role==='admin'&&method==='GET') {
    return send(res,200,(DB.users||[]).filter(u=>u.role==='owner').map(({password,...u})=>u));
  }

  // ALL INVOICES
  if (parts[1]==='all-invoices'&&user.role==='admin'&&method==='GET') {
    return send(res,200,(DB.invoices||[]).map(inv=>{
      const o=(DB.users||[]).find(u=>u.id===inv.ownerId);
      return {...inv,ownerName:o?(o.prenom+' '+o.nom):'—'};
    }).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)));
  }

  // ALL REVENUES
  if (parts[1]==='all-revenues'&&user.role==='admin'&&method==='GET') {
    return send(res,200,(DB.revenues||[]).map(r=>{
      const o=(DB.users||[]).find(u=>u.id===r.ownerId);
      return {...r,ownerName:o?(o.prenom+' '+o.nom):'—'};
    }).sort((a,b)=>b.annee!==a.annee?b.annee-a.annee:0));
  }

  // ALL MAINTENANCES
  if (parts[1]==='all-maintenances'&&user.role==='admin'&&method==='GET') {
    return send(res,200,(DB.maintenances||[]).map(m=>{
      const o=(DB.users||[]).find(u=>u.id===m.ownerId);
      return {...m,ownerName:o?(o.prenom+' '+o.nom):'—'};
    }).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)));
  }

  // STATS
  if (parts[1]==='stats'&&user.role==='admin') {
    return send(res,200,{
      totalOwners:(DB.users||[]).filter(u=>u.role==='owner').length,
      totalInvoices:(DB.invoices||[]).length,
      pendingInvoices:(DB.invoices||[]).filter(i=>i.status==='en_attente').length,
      totalRevenue:(DB.revenues||[]).reduce((s,r)=>s+(r.revenuNet||0),0),
      maintenancePending:(DB.maintenances||[]).filter(m=>m.statut==='planifié').length,
    });
  }

  // OWNER DATA
  if (parts[1]==='owner-data'&&user.role==='admin'&&parts[2]) {
    const oid=parts[2];
    const owner=(DB.users||[]).find(u=>u.id===oid);
    if (!owner) return send(res,404,{error:'Propriétaire introuvable'});
    const {password,...safeOwner}=owner;
    return send(res,200,{
      owner:safeOwner,
      contract:(DB.contracts||[]).find(c=>c.ownerId===oid)||null,
      invoices:(DB.invoices||[]).filter(i=>i.ownerId===oid).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)),
      revenues:(DB.revenues||[]).filter(r=>r.ownerId===oid),
      maintenances:(DB.maintenances||[]).filter(m=>m.ownerId===oid).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)),
      infos:(DB.infos||[]).find(i=>i.ownerId===oid)||null,
    });
  }

  send(res,404,{error:'Route introuvable'});
}

// ── SERVEUR ───────────────────────────────────────────────────────────────────
async function main() {
  await loadDB();
  ensureAdmin();
  seedDemo();

  const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    const method = req.method;
    const token = req.headers['authorization']||'';

    if (method==='OPTIONS') {
      res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'});
      return res.end();
    }
    if (pathname.startsWith('/api/')) return handleAPI(req,res,method,pathname,token);
    if (pathname==='/'||pathname==='/index.html') {
      const f=path.join(__dirname,'index.html');
      if (fs.existsSync(f)){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});return res.end(fs.readFileSync(f));}
    }
    res.writeHead(404);res.end('Not found');
  });

  server.listen(PORT, ()=>{
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║         NEXSTAY - Conciergerie Tunisie               ║');
    console.log(`║  🌐  http://localhost:${PORT}                           ║`);
    console.log(`║  💾  Persistance: ${USE_JSONBIN?'JSONBin.io ✅':'Local /tmp ⚠️ (configurer JSONBin)'}  ║`);
    console.log('║  🔑  admin@nexstay.tn / admin123                    ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    if (!USE_JSONBIN) {
      console.log('');
      console.log('⚠️  ATTENTION: Les données seront perdues au redémarrage!');
      console.log('   → Configurez JSONBIN_ID et JSONBIN_KEY dans Railway');
      console.log('   → Guide: https://jsonbin.io (gratuit)');
    }
  });
}

main().catch(console.error);
