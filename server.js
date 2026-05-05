/**
 * NEXSTAY - Serveur Backend
 * Node.js pur - zéro dépendance
 * Compatible Railway (données en /tmp + admin garanti)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;

// Sur Railway, /tmp est persistant pendant la session
// On essaie d'abord /tmp, sinon le dossier local
const DB_FILE = process.env.RAILWAY_ENVIRONMENT
  ? '/tmp/nexstay_db.json'
  : path.join(__dirname, 'nexstay_db.json');

console.log('📁 DB path:', DB_FILE);

// ─── BASE DE DONNÉES ──────────────────────────────────────────────────────────
let DB = { users: [], contracts: [], invoices: [], revenues: [], maintenances: [], infos: [], sessions: [] };

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      console.log('✅ DB chargée:', DB.users.length, 'utilisateurs');
    }
  } catch(e) { console.log('⚠️ DB reset:', e.message); }
}

function saveDB() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2)); }
  catch(e) { console.error('❌ Erreur sauvegarde DB:', e.message); }
}

function genId() { return crypto.randomBytes(8).toString('hex'); }
function hash(pwd) { return crypto.createHash('sha256').update(pwd + 'nexstay_salt_2024').digest('hex'); }

function genToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  DB.sessions = DB.sessions.filter(s => s.userId !== userId);
  DB.sessions.push({ token, userId, created: Date.now() });
  saveDB();
  return token;
}

function authUser(token) {
  if (!token) return null;
  const t = token.replace('Bearer ', '').trim();
  const session = DB.sessions.find(s => s.token === t && (Date.now() - s.created) < 7 * 24 * 3600 * 1000);
  if (!session) return null;
  return DB.users.find(u => u.id === session.userId);
}

// ─── GARANTIR L'ADMIN AU DÉMARRAGE ───────────────────────────────────────────
// Cette fonction tourne à CHAQUE démarrage du serveur
// Elle crée ou recrée le compte admin si nécessaire
function ensureAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@nexstay.tn';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = DB.users.find(u => u.email === adminEmail);

  if (!existing) {
    // Admin inexistant → on le crée
    DB.users.push({
      id: 'admin-001',
      nom: 'Nexstay', prenom: 'Admin',
      email: adminEmail,
      password: hash(adminPassword),
      role: 'admin',
      tel: '+216 70 000 000',
      createdAt: new Date().toISOString()
    });
    saveDB();
    console.log('✅ Compte admin créé:', adminEmail);
  } else if (existing.role !== 'admin') {
    // Compte existe mais pas admin → on force le rôle
    existing.role = 'admin';
    existing.password = hash(adminPassword);
    saveDB();
    console.log('✅ Compte admin restauré:', adminEmail);
  } else {
    console.log('✅ Admin OK:', adminEmail);
  }
}

// ─── DONNÉES DÉMO ─────────────────────────────────────────────────────────────
function seedDemo() {
  // Ne seed que si aucun propriétaire n'existe
  const hasOwner = DB.users.some(u => u.role === 'owner');
  if (hasOwner) return;

  const ownerId = 'owner-demo-001';
  DB.users.push({
    id: ownerId, nom: 'Ben Ali', prenom: 'Mohamed',
    email: 'demo@nexstay.tn', password: hash('demo123'),
    role: 'owner', tel: '+216 55 123 456',
    adresse: 'Apt 4B, Rés. Les Jasmins, La Marsa',
    ville: 'Tunis', typeLogement: 'Appartement',
    createdAt: new Date().toISOString()
  });

  DB.contracts.push({
    id: genId(), ownerId, numero: 'NX-2024-TN-0487',
    dateDebut: '2024-01-01', dateFin: '2025-12-31',
    commission: 20, statut: 'actif', createdAt: new Date().toISOString()
  });

  [
    { month: 'Janvier 2025', amount: 1850, date: '2025-02-01', status: 'payée', numero: 'F-2025-001' },
    { month: 'Février 2025', amount: 2100, date: '2025-03-01', status: 'payée', numero: 'F-2025-002' },
    { month: 'Mars 2025',    amount: 1950, date: '2025-04-01', status: 'payée', numero: 'F-2025-003' },
    { month: 'Avril 2025',   amount: 2340, date: '2025-05-01', status: 'en_attente', numero: 'F-2025-004' },
  ].forEach(m => DB.invoices.push({ id: genId(), ownerId, ...m, createdAt: new Date().toISOString() }));

  [
    { mois:'Janvier', annee:2025, revenuBrut:3840, revenuNet:3200, tauxOccupation:72, nbLocataires:8,  nbNuits:22 },
    { mois:'Février', annee:2025, revenuBrut:4560, revenuNet:3800, tauxOccupation:85, nbLocataires:10, nbNuits:24 },
    { mois:'Mars',    annee:2025, revenuBrut:4320, revenuNet:3600, tauxOccupation:78, nbLocataires:9,  nbNuits:24 },
    { mois:'Avril',   annee:2025, revenuBrut:5040, revenuNet:4200, tauxOccupation:91, nbLocataires:12, nbNuits:27 },
    { mois:'Mai',     annee:2025, revenuBrut:5880, revenuNet:4900, tauxOccupation:95, nbLocataires:14, nbNuits:29 },
  ].forEach(r => DB.revenues.push({ id: genId(), ownerId, ...r, createdAt: new Date().toISOString() }));

  [
    { date:'2025-04-10', type:'Ménage',      statut:'effectué', technicien:'Amira B.', note:'Appartement remis en état après séjour long.' },
    { date:'2025-04-18', type:'Plomberie',   statut:'effectué', technicien:'Karim D.', note:'Remplacement joint robinet salle de bain.' },
    { date:'2025-04-28', type:'Électricité', statut:'planifié', technicien:'Sami T.',  note:'Vérification tableau électrique.' },
    { date:'2025-05-05', type:'Ménage',      statut:'planifié', technicien:'Amira B.', note:'Nettoyage entre deux réservations.' },
  ].forEach(m => DB.maintenances.push({ id: genId(), ownerId, ...m, createdAt: new Date().toISOString() }));

  DB.infos.push({
    id: genId(), ownerId,
    adresse: 'Apt 4B, Rés. Les Jasmins, La Marsa, Tunis',
    etage: '4ème', superficie: '95 m²', nbCles: 3,
    internet: { fournisseur: 'Topnet', numero: 'TPN-88341-C', dateFin: '2025-09-15' },
    tv: { abonnement: 'Canal+ Tunisie', reference: 'CPT-2024-9921', dateFin: '2025-11-30' },
    autresInfos: 'Code digicode entrée : 4892#',
    createdAt: new Date().toISOString()
  });

  saveDB();
  console.log('✅ Données démo créées');
}

// ─── HTTP UTILS ───────────────────────────────────────────────────────────────
function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

// ─── ROUTES API ───────────────────────────────────────────────────────────────
async function handleAPI(req, res, method, pathname, token) {
  const parts = pathname.split('/').filter(Boolean);

  // ── AUTH ──
  if (parts[1] === 'auth') {
    if (parts[2] === 'register' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.email || !body.password) return send(res, 400, { error: 'Email et mot de passe requis' });
      if (DB.users.find(u => u.email === body.email)) return send(res, 400, { error: 'Email déjà utilisé' });
      const user = { id: genId(), role: 'owner', nom: body.nom||'', prenom: body.prenom||'', email: body.email, password: hash(body.password), tel: body.tel||'', adresse: body.adresse||'', ville: body.ville||'', typeLogement: body.typeLogement||'', createdAt: new Date().toISOString() };
      DB.users.push(user);
      saveDB();
      const { password: _, ...safe } = user;
      return send(res, 201, { user: safe, token: genToken(user.id) });
    }

    if (parts[2] === 'login' && method === 'POST') {
      const body = await parseBody(req);
      const user = DB.users.find(u => u.email === body.email && u.password === hash(body.password));
      if (!user) return send(res, 401, { error: 'Email ou mot de passe incorrect' });
      const { password: _, ...safe } = user;
      return send(res, 200, { user: safe, token: genToken(user.id) });
    }

    if (parts[2] === 'me' && method === 'GET') {
      const user = authUser(token);
      if (!user) return send(res, 401, { error: 'Non autorisé' });
      const { password: _, ...safe } = user;
      return send(res, 200, safe);
    }
  }

  // ── Auth requise ──
  const user = authUser(token);
  if (!user) return send(res, 401, { error: 'Non autorisé — veuillez vous reconnecter' });

  // ── CONTRACT ──
  if (parts[1] === 'contract') {
    if (method === 'GET') {
      const contract = DB.contracts.find(c => c.ownerId === user.id);
      return send(res, 200, contract || null);
    }
    if (method === 'POST' && user.role === 'admin') {
      const body = await parseBody(req);
      const contract = { id: genId(), ...body, createdAt: new Date().toISOString() };
      DB.contracts.push(contract);
      saveDB();
      return send(res, 201, contract);
    }
  }

  // ── INVOICES ──
  if (parts[1] === 'invoices') {
    if (method === 'GET') {
      const ownerId = user.role === 'admin' ? (parts[2] || null) : user.id;
      const inv = ownerId ? DB.invoices.filter(i => i.ownerId === ownerId) : DB.invoices;
      return send(res, 200, inv.sort((a,b) => new Date(b.date||0) - new Date(a.date||0)));
    }
    if (method === 'POST' && user.role === 'admin') {
      const body = await parseBody(req);
      const invoice = { id: genId(), ...body, createdAt: new Date().toISOString() };
      DB.invoices.push(invoice);
      saveDB();
      return send(res, 201, invoice);
    }
    if (method === 'PUT' && user.role === 'admin' && parts[2]) {
      const body = await parseBody(req);
      const idx = DB.invoices.findIndex(i => i.id === parts[2]);
      if (idx === -1) return send(res, 404, { error: 'Facture introuvable' });
      DB.invoices[idx] = { ...DB.invoices[idx], ...body };
      saveDB();
      return send(res, 200, DB.invoices[idx]);
    }
    if (method === 'DELETE' && user.role === 'admin' && parts[2]) {
      DB.invoices = DB.invoices.filter(i => i.id !== parts[2]);
      saveDB();
      return send(res, 200, { success: true });
    }
  }

  // ── REVENUES ──
  if (parts[1] === 'revenues') {
    if (method === 'GET') {
      return send(res, 200, DB.revenues.filter(r => r.ownerId === user.id));
    }
    if (method === 'POST' && user.role === 'admin') {
      const body = await parseBody(req);
      const rev = { id: genId(), ...body, createdAt: new Date().toISOString() };
      DB.revenues.push(rev);
      saveDB();
      return send(res, 201, rev);
    }
    if (method === 'PUT' && user.role === 'admin' && parts[2]) {
      const body = await parseBody(req);
      const idx = DB.revenues.findIndex(r => r.id === parts[2]);
      if (idx === -1) return send(res, 404, { error: 'Introuvable' });
      DB.revenues[idx] = { ...DB.revenues[idx], ...body };
      saveDB();
      return send(res, 200, DB.revenues[idx]);
    }
    if (method === 'DELETE' && user.role === 'admin' && parts[2]) {
      DB.revenues = DB.revenues.filter(r => r.id !== parts[2]);
      saveDB();
      return send(res, 200, { success: true });
    }
  }

  // ── MAINTENANCES ──
  if (parts[1] === 'maintenances') {
    if (method === 'GET') {
      return send(res, 200, DB.maintenances.filter(m => m.ownerId === user.id).sort((a,b) => new Date(b.date||0) - new Date(a.date||0)));
    }
    if (method === 'POST' && user.role === 'admin') {
      const body = await parseBody(req);
      const item = { id: genId(), ...body, createdAt: new Date().toISOString() };
      DB.maintenances.push(item);
      saveDB();
      return send(res, 201, item);
    }
    if (method === 'PUT' && user.role === 'admin' && parts[2]) {
      const body = await parseBody(req);
      const idx = DB.maintenances.findIndex(m => m.id === parts[2]);
      if (idx === -1) return send(res, 404, { error: 'Introuvable' });
      DB.maintenances[idx] = { ...DB.maintenances[idx], ...body };
      saveDB();
      return send(res, 200, DB.maintenances[idx]);
    }
    if (method === 'DELETE' && user.role === 'admin' && parts[2]) {
      DB.maintenances = DB.maintenances.filter(m => m.id !== parts[2]);
      saveDB();
      return send(res, 200, { success: true });
    }
  }

  // ── INFOS ──
  if (parts[1] === 'infos') {
    if (method === 'GET') {
      return send(res, 200, DB.infos.find(i => i.ownerId === user.id) || null);
    }
    if (method === 'PUT' && user.role === 'admin') {
      const body = await parseBody(req);
      const idx = DB.infos.findIndex(i => i.ownerId === body.ownerId);
      if (idx === -1) {
        const item = { id: genId(), ...body, createdAt: new Date().toISOString() };
        DB.infos.push(item);
        saveDB();
        return send(res, 201, item);
      }
      DB.infos[idx] = { ...DB.infos[idx], ...body };
      saveDB();
      return send(res, 200, DB.infos[idx]);
    }
  }

  // ── OWNERS (admin) ──
  if (parts[1] === 'owners' && user.role === 'admin') {
    if (method === 'GET') {
      return send(res, 200, DB.users.filter(u => u.role === 'owner').map(({ password, ...u }) => u));
    }
    if (method === 'DELETE' && parts[2] && user.role === 'admin') {
      DB.users = DB.users.filter(u => u.id !== parts[2]);
      saveDB();
      return send(res, 200, { success: true });
    }
  }

  // ── STATS (admin) ──
  if (parts[1] === 'stats' && user.role === 'admin') {
    return send(res, 200, {
      totalOwners: DB.users.filter(u => u.role === 'owner').length,
      totalInvoices: DB.invoices.length,
      pendingInvoices: DB.invoices.filter(i => i.status === 'en_attente').length,
      totalRevenue: DB.revenues.reduce((s, r) => s + (r.revenuNet || 0), 0),
      maintenancePending: DB.maintenances.filter(m => m.statut === 'planifié').length,
    });
  }

  // ── OWNER DATA (admin voit données d'un propriétaire) ──
  if (parts[1] === 'owner-data' && user.role === 'admin' && parts[2]) {
    const ownerId = parts[2];
    return send(res, 200, {
      owner: (({ password, ...u }) => u)(DB.users.find(u => u.id === ownerId) || {}),
      contract: DB.contracts.find(c => c.ownerId === ownerId) || null,
      invoices: DB.invoices.filter(i => i.ownerId === ownerId),
      revenues: DB.revenues.filter(r => r.ownerId === ownerId),
      maintenances: DB.maintenances.filter(m => m.ownerId === ownerId),
      infos: DB.infos.find(i => i.ownerId === ownerId) || null,
    });
  }

  send(res, 404, { error: 'Route introuvable' });
}

// ─── SERVEUR ──────────────────────────────────────────────────────────────────
loadDB();
ensureAdmin();  // ← toujours exécuté au démarrage
seedDemo();

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;
  const token = req.headers['authorization'] || '';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  if (pathname.startsWith('/api/')) return handleAPI(req, res, method, pathname, token);

  if (pathname === '/' || pathname === '/index.html') {
    const file = path.join(__dirname, 'index.html');
    if (fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(file));
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        NEXSTAY - Conciergerie Tunisie        ║');
  console.log(`║  🌐  http://localhost:${PORT}                   ║`);
  console.log('║                                              ║');
  console.log('║  🔑 Admin : admin@nexstay.tn / admin123      ║');
  console.log('║  👤 Démo  : demo@nexstay.tn  / demo123       ║');
  console.log('╚══════════════════════════════════════════════╝');
});
