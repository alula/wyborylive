import express from 'express';
import cors from 'cors';
import { join } from 'path';
import { ElectionTracker, ElectionData, DataUpdateEvent, ErrorEvent } from './electiontracker';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static(join(__dirname, '../public')));

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
    console.log(`🔄 Sprawdzanie aktualizacji co minutę...`);
    
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
