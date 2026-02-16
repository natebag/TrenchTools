import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const distPath = join(__dirname, 'dist');
console.log('Dist path:', distPath);
console.log('Dist exists:', existsSync(distPath));

// Serve static files from dist directory
app.use(express.static(distPath));

// SPA fallthrough - serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TrenchTools running on http://0.0.0.0:${PORT}`);
});
