/**
 * NEXSTAY - Serveur Backend Complet
 * Node.js pur - aucune dépendance externe
 * Base de données JSON persistante
 * API REST complète
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'nexstay_db.json');

// ─── BASE DE DONNÉES JSON ─────────────────────────────────────────────────────
let DB = {
  users: [],
  contracts: [],
  invoices: [],
  revenues: [],
  maintenances: [],
  infos: [],
  sessions: []
};

function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    try { DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
    catch(e) { console.log('DB init fresh'); }
  }
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));
}

function genId() {
  return crypto.randomBytes(8).toString('hex');
}

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd + 'nexstay_salt_2024').digest('hex');
}

function genToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  DB.sessions = DB.sessions.filter(s => s.userId !== userId);
  DB.sessions.push({ token, userId, created: Date.now() });
  saveDB();
  return token;
}

function authUser(token) {
  if (!token) return null;
  const t = token.replace('Bearer ', '');
  const session = DB.sessions.find(s => s.token === t && (Date.now() - s.created) < 7 * 24 * 3600 * 1000);
  if (!session) return null;
  return DB.users.find(u => u.id === session.userId);
}

function isAdmin(token) {
  const user = authUser(token);
  return user && user.role === 'admin';
}

// Seed demo data
function seedDemoData() {
  if (DB.users.length > 0) return;

  // Admin
  DB.users.push({
    id: 'admin-001', nom: 'Admin', prenom: 'Nexstay', email: 'admin@nexstay.tn',
    password: hashPassword('admin123'), role: 'admin', tel: '+216 70 000 000',
    createdAt: new Date().toISOString()
  });

  // Demo owner
  const ownerId = 'owner-001';
  DB.users.push({
    id: ownerId, nom: 'Ben Ali', prenom: 'Mohamed', email: 'demo@nexstay.tn',
    password: hashPassword('demo123'), role: 'owner', tel: '+216 55 123 456',
    adresse: 'Apt 4B, Rés. Les Jasmins, La Marsa', ville: 'Tunis',
    typeLogement: 'Appartement', createdAt: new Date().toISOString()
  });

  // Contract
  DB.contracts.push({
    id: genId(), ownerId, numero: 'NX-2024-TN-0487',
    dateDebut: '2024-01-01', dateFin: '2025-12-31',
    commission: 20, statut: 'actif', createdAt: new Date().toISOString()
  });

  // Invoices
  const months = [
    { month: 'Janvier 2025', amount: 1850, date: '2025-02-01', status: 'payée' },
    { month: 'Février 2025', amount: 2100, date: '2025-03-01', status: 'payée' },
    { month: 'Mars 2025', amount: 1950, date: '2025-04-01', status: 'payée' },
    { month: 'Avril 2025', amount: 2340, date: '2025-05-01', status: 'en_attente' },
  ];
  months.forEach((m, i) => {
    DB.invoices.push({ id: genId(), ownerId, numero: `F-2025-00${i+1}`, ...m, createdAt: new Date().toISOString() });
  });

  // Revenues
  const revData = [
    { mois: 'Janvier', annee: 2025, revenuBrut: 3840, revenuNet: 3200, tauxOccupation: 72, nbLocataires: 8, nbNuits: 22 },
    { mois: 'Février', annee: 2025, revenuBrut: 4560, revenuNet: 3800, tauxOccupation: 85, nbLocataires: 10, nbNuits: 24 },
    { mois: 'Mars', annee: 2025, revenuBrut: 4320, revenuNet: 3600, tauxOccupation: 78, nbLocataires: 9, nbNuits: 24 },
    { mois: 'Avril', annee: 2025, revenuBrut: 5040, revenuNet: 4200, tauxOccupation: 91, nbLocataires: 12, nbNuits: 27 },
    { mois: 'Mai', annee: 2025, revenuBrut: 5880, revenuNet: 4900, tauxOccupation: 95, nbLocataires: 14, nbNuits: 29 },
  ];
  revData.forEach(r => {
    DB.revenues.push({ id: genId(), ownerId, ...r, createdAt: new Date().toISOString() });
  });

  // Maintenances
  const mains = [
    { date: '2025-04-10', type: 'Ménage', statut: 'effectué', technicien: 'Amira B.', note: 'Appartement remis en état après séjour long.' },
    { date: '2025-04-18', type: 'Plomberie', statut: 'effectué', technicien: 'Karim D.', note: 'Remplacement joint robinet salle de bain.' },
    { date: '2025-04-28', type: 'Électricité', statut: 'planifié', technicien: 'Sami T.', note: 'Vérification tableau électrique.' },
    { date: '2025-05-05', type: 'Ménage', statut: 'planifié', technicien: 'Amira B.', note: 'Nettoyage entre deux réservations.' },
  ];
  mains.forEach(m => {
    DB.maintenances.push({ id: genId(), ownerId, ...m, createdAt: new Date().toISOString() });
  });

  // Infos
  DB.infos.push({
    id: genId(), ownerId,
    adresse: 'Apt 4B, Rés. Les Jasmins, La Marsa, Tunis',
    etage: '4ème', superficie: '95 m²', nbCles: 3,
    internet: { fournisseur: 'Topnet', numero: 'TPN-88341-C', dateFin: '2025-09-15' },
    tv: { abonnement: 'Canal+ Tunisie', reference: 'CPT-2024-9921', dateFin: '2025-11-30' },
    autresInfos: 'Code digicode entrée: 4892#',
    createdAt: new Date().toISOString()
  });

  saveDB();
  console.log('✅ Données demo initialisées');
}

// ─── ROUTING ──────────────────────────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
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

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const ct = types[ext] || 'text/plain';
  if (fs.existsSync(filePath)) {
    res.writeHead(200, { 'Content-Type': ct });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}

// ─── API ROUTES ────────────────────────────────────────────────────────────────
async function handleAPI(req, res, method, pathname, token) {
  const parts = pathname.split('/').filter(Boolean); // ['api', 'auth', 'login']

  // ── AUTH ──
  if (parts[1] === 'auth') {
    if (parts[2] === 'register' && method === 'POST') {
      const body = await parseBody(req);
      if (DB.users.find(u => u.email === body.email)) return send(res, 400, { error: 'Email déjà utilisé' });
      const user = {
        id: genId(), role: 'owner',
        nom: body.nom, prenom: body.prenom, email: body.email,
        password: hashPassword(body.password), tel: body.tel,
        adresse: body.adresse, ville: body.ville, typeLogement: body.typeLogement,
        createdAt: new Date().toISOString()
      };
      DB.users.push(user);
      saveDB();
      const { password: _, ...safeUser } = user;
      return send(res, 201, { user: safeUser, token: genToken(user.id) });
    }

    if (parts[2] === 'login' && method === 'POST') {
      const body = await parseBody(req);
      const user = DB.users.find(u => u.email === body.email && u.password === hashPassword(body.password));
      if (!user) return send(res, 401, { error: 'Email ou mot de passe incorrect' });
      const { password: _, ...safeUser } = user;
      return send(res, 200, { user: safeUser, token: genToken(user.id) });
    }

    if (parts[2] === 'me' && method === 'GET') {
      const user = authUser(token);
      if (!user) return send(res, 401, { error: 'Non autorisé' });
      const { password: _, ...safeUser } = user;
      return send(res, 200, safeUser);
    }
  }

  // ── Must be authenticated from here ──
  const user = authUser(token);
  if (!user) return send(res, 401, { error: 'Non autorisé' });

  // ── CONTRACT ──
  if (parts[1] === 'contract') {
    if (method === 'GET') {
      const contract = DB.contracts.find(c => c.ownerId === user.id);
      return send(res, 200, contract || null);
    }
    if (method === 'POST' && isAdmin(token)) {
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
      return send(res, 200, inv.sort((a,b) => new Date(b.date) - new Date(a.date)));
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
      const rev = DB.revenues.filter(r => r.ownerId === user.id);
      return send(res, 200, rev);
    }
    if (method === 'POST' && user.role === 'admin') {
      const body = await parseBody(req);
      const revenue = { id: genId(), ...body, createdAt: new Date().toISOString() };
      DB.revenues.push(revenue);
      saveDB();
      return send(res, 201, revenue);
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
      const items = DB.maintenances.filter(m => m.ownerId === user.id);
      return send(res, 200, items.sort((a,b) => new Date(b.date) - new Date(a.date)));
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
      const info = DB.infos.find(i => i.ownerId === user.id);
      return send(res, 200, info || null);
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

  // ── ADMIN: list owners ──
  if (parts[1] === 'owners' && user.role === 'admin') {
    if (method === 'GET') {
      const owners = DB.users.filter(u => u.role === 'owner').map(({ password, ...u }) => u);
      return send(res, 200, owners);
    }
  }

  // ── STATS (admin dashboard) ──
  if (parts[1] === 'stats' && user.role === 'admin') {
    return send(res, 200, {
      totalOwners: DB.users.filter(u => u.role === 'owner').length,
      totalInvoices: DB.invoices.length,
      pendingInvoices: DB.invoices.filter(i => i.status === 'en_attente').length,
      totalRevenue: DB.revenues.reduce((s, r) => s + (r.revenuNet || 0), 0),
      maintenancePending: DB.maintenances.filter(m => m.statut === 'planifié').length,
    });
  }

  send(res, 404, { error: 'Route introuvable' });
}

// ─── SERVER ────────────────────────────────────────────────────────────────────
loadDB();
seedDemoData();

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;
  const token = req.headers['authorization'] || '';

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  // API routes
  if (pathname.startsWith('/api/')) {
    return handleAPI(req, res, method, pathname, token);
  }

  // Static files
  if (pathname === '/' || pathname === '/index.html') {
    return sendFile(res, path.join(__dirname, 'index.html'));
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        NEXSTAY - Conciergerie Tunisie        ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  🌐 Application: http://localhost:${PORT}       ║`);
  console.log('║                                              ║');
  console.log('║  👤 Propriétaire démo:                       ║');
  console.log('║     Email:    demo@nexstay.tn                ║');
  console.log('║     Password: demo123                        ║');
  console.log('║                                              ║');
  console.log('║  🔑 Admin:                                   ║');
  console.log('║     Email:    admin@nexstay.tn               ║');
  console.log('║     Password: admin123                       ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
