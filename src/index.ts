import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import expressLayouts from 'express-ejs-layouts';

// Load env vars
dotenv.config();

import apiRoutes from './routes/api.routes';
import adminRoutes from './routes/admin.routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// EJS Setup
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Inject warmup config vào tất cả EJS views qua res.locals
app.use((_req, res, next) => {
  res.locals.warmupConfig = {
    healthUrl:    process.env.WARMUP_HEALTH_URL    || 'https://llm-api-gateway-xlvu.onrender.com/health',
    intervalMin:  parseInt(process.env.WARMUP_INTERVAL_MIN  || '10',  10),
    expireHours:  parseFloat(process.env.WARMUP_EXPIRE_HOURS || '2'),
  };
  next();
});

// Routes
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Start server
app.listen(PORT, () => {
  console.log(`[Server] Fake Financial Partner Service running on port ${PORT}`);
  console.log(`[Server] Admin UI available at http://localhost:${PORT}/admin`);
});
