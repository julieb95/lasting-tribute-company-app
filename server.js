const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-session-secret';
const ADMIN_UPLOAD_KEY = process.env.ADMIN_UPLOAD_KEY || 'change-this-admin-key';
const DELIVERY_EXPIRY_DAYS = Number(process.env.DELIVERY_EXPIRY_DAYS || 180);

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const DELIVERIES_FILE = path.join(DATA_DIR, 'deliveries.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
for (const file of [ORDERS_FILE, DELIVERIES_FILE, USERS_FILE]) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]', 'utf8');
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use(express.static(path.join(__dirname, 'public')));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in.' });
  return next();
}

function hashDeliveryToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateDeliveryToken() {
  return `${crypto.randomBytes(16).toString('hex')}${crypto.randomBytes(8).toString('hex')}`;
}

const orderStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const orderId = req.orderId || uuidv4();
    req.orderId = orderId;
    const dir = path.join(UPLOAD_DIR, orderId, 'photos');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const deliveryId = uuidv4();
    req.deliveryId = deliveryId;
    const dir = path.join(UPLOAD_DIR, 'deliveries', deliveryId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const uploadPhotos = multer({
  storage: orderStorage,
  limits: { files: 40, fileSize: 12 * 1024 * 1024 }
});

const uploadVideo = multer({
  storage: videoStorage,
  limits: { files: 1, fileSize: 2 * 1024 * 1024 * 1024 }
});

// ------------------ Auth ------------------
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { funeralHomeName, contactName, email, phone, password } = req.body;
    if (!funeralHomeName || !contactName || !email || !password) {
      return res.status(400).json({ error: 'Missing required signup fields.' });
    }

    const users = readJson(USERS_FILE);
    const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Email already registered.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      userId: uuidv4(),
      createdAt: new Date().toISOString(),
      funeralHomeName,
      contactName,
      email,
      phone: phone || '',
      passwordHash,
      role: 'funeral_home'
    };
    users.push(user);
    writeJson(USERS_FILE, users);

    req.session.user = {
      userId: user.userId,
      funeralHomeName: user.funeralHomeName,
      contactName: user.contactName,
      email: user.email,
      role: user.role
    };

    return res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Signup failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

    const users = readJson(USERS_FILE);
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

    req.session.user = {
      userId: user.userId,
      funeralHomeName: user.funeralHomeName,
      contactName: user.contactName,
      email: user.email,
      role: user.role
    };

    return res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// ------------------ Orders ------------------
app.post('/api/orders', requireAuth, uploadPhotos.array('photos', 40), (req, res) => {
  try {
    const {
      lovedOneName,
      specialNames,
      highlights,
      partnerDiscount,
      packageType
    } = req.body;

    if (!lovedOneName) {
      return res.status(400).json({ error: 'Loved one name is required.' });
    }

    const orderId = req.orderId || uuidv4();
    const photos = (req.files || []).map((f) => ({
      filename: f.filename,
      relativePath: `${orderId}/photos/${f.filename}`,
      size: f.size
    }));

    const order = {
      orderId,
      createdAt: new Date().toISOString(),
      business: {
        name: 'Lasting Tribute Company',
        email: 'lastingtributecompany@gmail.com',
        paypal: 'rangerbleau11@gmail.com',
        owner: 'Julie Brown',
        phone: '448 448 6491'
      },
      price: 299,
      packageType: packageType || '4-minute personalized tribute song + video',
      funeralHomeUserId: req.session.user.userId,
      funeralHomeName: req.session.user.funeralHomeName,
      contactName: req.session.user.contactName,
      contactEmail: req.session.user.email,
      contactPhone: '',
      lovedOneName,
      specialNames,
      highlights,
      partnerDiscount: partnerDiscount || '',
      photos,
      status: 'submitted'
    };

    const orders = readJson(ORDERS_FILE);
    orders.push(order);
    writeJson(ORDERS_FILE, orders);

    return res.json({
      success: true,
      orderId,
      photoCount: photos.length,
      paypalLink: `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent('rangerbleau11@gmail.com')}&item_name=${encodeURIComponent('Lasting Tribute Company - Tribute Song and Video Package')}&amount=299.00&currency_code=USD`,
      message: 'Order submitted. Use PayPal link to complete payment.'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create order.' });
  }
});

app.get('/api/orders/me', requireAuth, (req, res) => {
  const orders = readJson(ORDERS_FILE);
  const mine = orders.filter((o) => o.funeralHomeUserId === req.session.user.userId);
  res.json(mine);
});

// ------------------ Deliveries ------------------
app.post('/api/deliveries', uploadVideo.single('video'), (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
    if (!adminKey || adminKey !== ADMIN_UPLOAD_KEY) {
      return res.status(401).json({ error: 'Invalid admin upload key.' });
    }

    const { orderId, funeralHomeName, note } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });
    if (!req.file) return res.status(400).json({ error: 'video file is required' });

    const deliveryId = req.deliveryId || uuidv4();
    const tokenPlain = generateDeliveryToken();
    const tokenHash = hashDeliveryToken(tokenPlain);
    const expiresAt = new Date(Date.now() + DELIVERY_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const deliveries = readJson(DELIVERIES_FILE);
    const delivery = {
      deliveryId,
      orderId,
      funeralHomeName: funeralHomeName || '',
      note: note || '',
      createdAt: new Date().toISOString(),
      expiresAt,
      tokenHash,
      relativeVideoPath: `deliveries/${deliveryId}/${req.file.filename}`
    };

    deliveries.push(delivery);
    writeJson(DELIVERIES_FILE, deliveries);

    const watchLink = `${req.protocol}://${req.get('host')}/d/${deliveryId}?token=${encodeURIComponent(tokenPlain)}`;
    res.json({ success: true, deliveryId, watchLink, expiresAt });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create delivery link.' });
  }
});

function authorizeDelivery(req, res, next) {
  const { deliveryId } = req.params;
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Missing delivery token.' });

  const deliveries = readJson(DELIVERIES_FILE);
  const found = deliveries.find((d) => d.deliveryId === deliveryId);
  if (!found) return res.status(404).json({ error: 'Delivery not found' });

  if (new Date(found.expiresAt).getTime() < Date.now()) {
    return res.status(410).json({ error: 'Delivery link expired.' });
  }

  if (hashDeliveryToken(token) !== found.tokenHash) {
    return res.status(401).json({ error: 'Invalid delivery token.' });
  }

  req.delivery = found;
  return next();
}

app.get('/api/deliveries/:deliveryId', authorizeDelivery, (req, res) => {
  const d = req.delivery;
  res.json({
    deliveryId: d.deliveryId,
    orderId: d.orderId,
    funeralHomeName: d.funeralHomeName,
    note: d.note,
    createdAt: d.createdAt,
    expiresAt: d.expiresAt,
    secureVideoUrl: `/api/deliveries/${d.deliveryId}/video?token=${encodeURIComponent(req.query.token)}`
  });
});

app.get('/api/deliveries/:deliveryId/video', authorizeDelivery, (req, res) => {
  const absolutePath = path.join(UPLOAD_DIR, req.delivery.relativeVideoPath);
  if (!fs.existsSync(absolutePath)) return res.status(404).send('Video not found.');
  res.sendFile(absolutePath);
});

app.get('/d/:deliveryId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'delivery.html'));
});

app.listen(PORT, () => {
  console.log(`Lasting Tribute Company app running on http://localhost:${PORT}`);
});
