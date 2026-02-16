import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

const distPath = join(__dirname, 'dist');
console.log('Dist path:', distPath);
console.log('Dist exists:', existsSync(distPath));
console.log('PORT:', PORT);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', port: PORT });
});

// Serve static files from dist directory
app.use(express.static(distPath));

// SPA fallthrough - serve index.html for all routes
app.get('*', (req, res) => {
  const indexPath = join(distPath, 'index.html');
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(500).send('index.html not found at ' + indexPath);
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`TrenchTools running on http://0.0.0.0:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
