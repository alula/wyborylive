import { ElectionTracker, ElectionData, DataUpdateEvent, ErrorEvent } from "./electiontracker";

function formatNumber(num: number): string {
  return num.toLocaleString('pl-PL');
}

function printElectionResults(data: ElectionData): void {
  console.log('\n=== WYNIKI WYBORÓW PREZYDENCKICH 2025 - II TURA ===');
  console.log(`Ostatnia aktualizacja: ${data.lastUpdate.toLocaleString('pl-PL')}`);
  console.log(`Timestamp: ${data.timestamp}`);
  console.log('');
  
  // Total results
  console.log('📊 WYNIKI OGÓLNOKRAJOWE:');
  console.log(`   Łączna liczba głosów: ${formatNumber(data.totalVotes)}`);
  console.log(`   🔵 TRZASKOWSKI Rafał: ${formatNumber(data.totalTrzaskowski)} (${((data.totalTrzaskowski / data.totalVotes) * 100).toFixed(2)}%)`);
  console.log(`   🔴 NAWROCKI Karol: ${formatNumber(data.totalNawrocki)} (${((data.totalNawrocki / data.totalVotes) * 100).toFixed(2)}%)`);
  console.log('');
  
  // Voivodeship results
  console.log('🗺️  WYNIKI WEDŁUG WOJEWÓDZTW:');
  data.voivodeships.forEach((voiv, index) => {
    const trzaskowskiPercent = voiv.total > 0 ? ((voiv.trzaskowski / voiv.total) * 100).toFixed(1) : '0.0';
    const nawrockiPercent = voiv.total > 0 ? ((voiv.nawrocki / voiv.total) * 100).toFixed(1) : '0.0';
    
    console.log(`   ${(index + 1).toString().padStart(2)}. ${voiv.name.padEnd(20)} | Razem: ${formatNumber(voiv.total).padStart(8)} | T: ${trzaskowskiPercent}% | N: ${nawrockiPercent}%`);
  });
  
  console.log('\n' + '='.repeat(60));
}

async function main() {
  console.log('🚀 Uruchamianie monitoringu wyników wyborów...');
  
  const tracker = new ElectionTracker({ debug: true });
  
  // Print current data if available
  const currentData = tracker.getCurrentData();
  if (currentData) {
    console.log('📄 Znaleziono zapisane dane z poprzedniej sesji:');
    printElectionResults(currentData);
  } else {
    console.log('📭 Brak zapisanych danych, oczekiwanie na pierwsze pobranie...');
  }
  
  // Listen for data updates
  tracker.addEventListener('dataUpdate', (event) => {
    const dataEvent = event as DataUpdateEvent;
    const data = dataEvent.detail;
    console.log('\n🆕 NOWE DANE WYBORCZE!');
    printElectionResults(data);
  });
  
  // Listen for errors
  tracker.addEventListener('error', (event) => {
    const errorEvent = event as ErrorEvent;
    const { error, timestamp } = errorEvent.detail;
    console.error(`\n❌ BŁĄD [${timestamp.toLocaleString('pl-PL')}]:`, error.message);
  });
  
  // Start tracking
  tracker.start();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Zatrzymywanie monitoringu...');
    tracker.stop();
    console.log('✅ Monitor zatrzymany. Dane zostały zapisane.');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    tracker.stop();
    process.exit(0);
  });
  
  console.log('✅ Monitor uruchomiony. Naciśnij Ctrl+C aby zatrzymać.');
  console.log('🔄 Sprawdzanie aktualizacji co minutę...');
}

main().catch((error) => {
  console.error("An error occurred in main:", error);
  process.exit(1);
});
