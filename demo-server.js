import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Simple cookie parser helper
function getCookie(req, name) {
  const rc = req.headers.cookie;
  if (!rc) return null;
  const list = {};
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
  });
  return list[name];
}

// Redirect or route based on A/B test cookie
app.get('/', (req, res) => {
  let variant = getCookie(req, 'ab_variant');
  
  if (!variant) {
    // Auto-allocate across valid variations if not specified
    const variantsList = ['control', 'variant'];
    variant = variantsList[Math.floor(Math.random() * variantsList.length)];
    res.setHeader('Set-Cookie', `ab_variant=${variant}; Path=/; Max-Age=900000`);
  }

  if (variant === 'variant') {
    res.sendFile(path.join(__dirname, 'demo-app/public/variant.html'));
  } else {
    res.sendFile(path.join(__dirname, 'demo-app/public/control.html'));
  }
});

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, 'demo-app/public')));

// Serve visual test reports folder
app.use('/reports', express.static(path.join(__dirname, 'reports')));

// Intercept telemetry tracking endpoint
app.post('/api/telemetry', (req, res) => {
  const { type, goal, variant } = req.body;
  console.log(`[Telemetry] Variant: ${variant || 'unknown'} | Type: ${type} | Goal: ${goal || 'N/A'}`);
  res.status(200).json({ success: true, received: { type, goal, variant } });
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`  Demo A/B Test Server running at:`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
