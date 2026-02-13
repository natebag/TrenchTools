import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { stateManager } from '../state/index.js';

interface ServerInstance {
  app: Application;
  start: () => Promise<void>;
}

export function createServer(port: number = 3001): ServerInstance {
  const app: Application = express();
  
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Get full state
  app.get('/api/state', (_req: Request, res: Response) => {
    res.json(stateManager.getState());
  });

  // Get boost status
  app.get('/api/boost', (_req: Request, res: Response) => {
    res.json(stateManager.getBoostState());
  });

  // Start boost
  app.post('/api/boost/start', (req: Request, res: Response) => {
    const { tokenMint } = req.body;
    
    if (!tokenMint) {
      res.status(400).json({ error: 'tokenMint is required' });
      return;
    }
    
    const result = stateManager.startBoost(tokenMint);
    res.json(result);
  });

  // Stop boost
  app.post('/api/boost/stop', (_req: Request, res: Response) => {
    const result = stateManager.stopBoost();
    res.json(result);
  });

  // Get wallets
  app.get('/api/wallets', (_req: Request, res: Response) => {
    res.json(stateManager.getWallets());
  });

  // Get 24h stats
  app.get('/api/stats', (_req: Request, res: Response) => {
    res.json(stateManager.get24hStats());
  });

  // Get/Set alerts
  app.get('/api/alerts', (_req: Request, res: Response) => {
    res.json({ enabled: stateManager.isAlertsEnabled() });
  });

  app.post('/api/alerts', (req: Request, res: Response) => {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }
    
    stateManager.setAlertsEnabled(enabled);
    res.json({ enabled: stateManager.isAlertsEnabled() });
  });

  const start = () => {
    return new Promise<void>((resolve) => {
      app.listen(port, () => {
        console.log(`🌐 API server running on http://localhost:${port}`);
        resolve();
      });
    });
  };

  return { app, start };
}
