import express, { Request, Response } from 'express';
import cors from 'cors';
import { join } from 'path';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { ElectionTracker, ElectionData, DataUpdateEvent, ErrorEvent } from './electiontracker';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());

// Function to generate dynamic meta tags based on election data
function generateDynamicMetaTags(data: ElectionData | null, req: Request): string {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  const url = `${protocol}://${host}`;
  
  if (!data) {
    return `
    <meta property="og:url" content="${url}">
    <meta property="og:description" content="Na żywo: wyniki wyborów prezydenckich 2025. Śledź aktualne rezultaty z całego kraju w czasie rzeczywistym.">
    <meta name="twitter:url" content="${url}">
    <meta name="twitter:description" content="Na żywo: wyniki wyborów prezydenckich 2025. Śledź aktualne rezultaty z całego kraju w czasie rzeczywistym.">`;
  }

  const trzaskowskiPercent = data.totalVotes > 0 ? ((data.totalTrzaskowski / data.totalVotes) * 100).toFixed(2) : '0.00';
  const nawrockiPercent = data.totalVotes > 0 ? ((data.totalNawrocki / data.totalVotes) * 100).toFixed(2) : '0.00';
  
  const leader = parseFloat(trzaskowskiPercent) > parseFloat(nawrockiPercent) ? 'Trzaskowski' : 'Nawrocki';
  const leaderPercent = parseFloat(trzaskowskiPercent) > parseFloat(nawrockiPercent) ? trzaskowskiPercent : nawrockiPercent;
  
  const description = `WYBORY 2025 LIVE: ${leader} prowadzi z ${leaderPercent}%. Trzaskowski ${trzaskowskiPercent}%, Nawrocki ${nawrockiPercent}%. Wyniki na żywo z PKW.`;
  
  return `
    <meta property="og:url" content="${url}">
    <meta property="og:description" content="${description}">
    <meta name="twitter:url" content="${url}">
    <meta name="twitter:description" content="${description}">`;
}

// Function to generate ETag based on election data
function generateETag(data: ElectionData | null): string {
  const content = data ? JSON.stringify({
    lastUpdate: data.lastUpdate,
    totalTrzaskowski: data.totalTrzaskowski,
    totalNawrocki: data.totalNawrocki,
    totalInvalidVotes: data.totalInvalidVotes
  }) : 'no-data';
  
  return createHash('md5').update(content).digest('hex');
}

// Root route with dynamic meta tag injection
app.get('/', ((req, res) => {
  try {
    const indexPath = join(__dirname, '../public/index.html');
    let htmlContent = readFileSync(indexPath, 'utf-8');
    
    const currentData = tracker.getCurrentData();
    const dynamicMeta = generateDynamicMetaTags(currentData, req);
    const etag = generateETag(currentData);
    
    // Check if client has current version
    const clientETag = req.get('If-None-Match');
    if (clientETag === etag) {
      return res.status(304).end();
    }
    
    // Inject dynamic meta tags after the static ones
    htmlContent = htmlContent.replace(
      '<meta name="author" content="Wybory Live">',
      `<meta name="author" content="Wybory Live">${dynamicMeta}`
    );
    
    // Set cache headers
    res.set({
      'ETag': etag,
      'Cache-Control': 'public, max-age=30', // Cache for 30 seconds
      'Content-Type': 'text/html; charset=utf-8'
    });
    
    res.send(htmlContent);
  } catch (error) {
    console.error('Error serving index page:', error);
    res.status(500).send('Internal Server Error');
  }
}) as express.RequestHandler);

// Serve other static files normally (but not index.html since we handle it above)
app.use(express.static(join(__dirname, '../public'), { 
  index: false // Don't serve index.html automatically
}));

// Store connected SSE clients
const sseClients = new Set<express.Response>();

// Initialize election tracker
const tracker = new ElectionTracker({ debug: true });

// Function to send data to all connected clients
function broadcastToClients(data: ElectionData) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  
  sseClients.forEach((client) => {
    try {
      client.write(message);
    } catch (error) {
      console.error('Error sending data to client:', error);
      sseClients.delete(client);
    }
  });
}

// SSE endpoint for real-time election data
app.get('/api/elections/stream', (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Add client to set
  sseClients.add(res);

  // Send current data immediately if available
  const currentData = tracker.getCurrentData();
  if (currentData) {
    res.write(`data: ${JSON.stringify(currentData)}\n\n`);
  }

  // Handle client disconnect
  req.on('close', () => {
    sseClients.delete(res);
    console.log('Client disconnected from SSE stream');
  });

  console.log('New client connected to SSE stream');
});

// REST API endpoint for current election data
app.get('/api/elections/current', (req, res) => {
  const currentData = tracker.getCurrentData();
  if (currentData) {
    res.json(currentData);
  } else {
    res.status(404).json({ error: 'No election data available' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    hasData: !!tracker.getCurrentData()
  });
});

// Listen for data updates from election tracker
tracker.addEventListener('dataUpdate', (event) => {
  const dataEvent = event as DataUpdateEvent;
  const data = dataEvent.detail;
  console.log('🆕 NOWE DANE WYBORCZE! Broadcasting to', sseClients.size, 'clients');
  broadcastToClients(data);
});

// Listen for errors
tracker.addEventListener('error', (event) => {
  const errorEvent = event as ErrorEvent;
  const { error, timestamp } = errorEvent.detail;
  console.error(`❌ BŁĄD [${timestamp.toLocaleString('pl-PL')}]:`, error.message);
});

// Start the server
async function startServer() {
  // Start election tracking
  tracker.start();

  app.listen(PORT, () => {
    console.log(`🚀 Serwer wyborów uruchomiony na porcie ${PORT}`);
    console.log(`📊 Strumień danych: http://localhost:${PORT}/api/elections/stream`);
    console.log(`🌐 Interfejs web: http://localhost:${PORT}`);
    
    // Log current data if available
    const currentData = tracker.getCurrentData();
    if (currentData) {
      console.log('📄 Znaleziono zapisane dane z poprzedniej sesji');
    } else {
      console.log('📭 Brak zapisanych danych, oczekiwanie na pierwsze pobranie...');
    }
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Zatrzymywanie serwera...');
  tracker.stop();
  
  // Close all SSE connections
  sseClients.forEach((client) => {
    try {
      client.end();
    } catch (error) {
      // Ignore errors when closing connections
    }
  });
  
  console.log('✅ Serwer zatrzymany. Dane zostały zapisane.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  tracker.stop();
  process.exit(0);
});

// Start the server
startServer().catch((error) => {
  console.error('Błąd podczas uruchamiania serwera:', error);
  process.exit(1);
});
