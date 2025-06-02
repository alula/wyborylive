import JSZip from "jszip";
import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Konfiguracja } from "./generated/src/pkw";

interface ElectionRecord {
  commission: string;
  gmina: string;
  terytGminy: string;
  powiat: string;
  terytPowiatu: string;
  voivodeship: string;
  siedziba: string;
  nawrocki: number;
  trzaskowski: number;
}

interface VoivodeshipResults {
  name: string;
  nawrocki: number;
  trzaskowski: number;
  invalidVotes: number;
  total: number;
}

interface ElectionData {
  timestamp: number;
  totalNawrocki: number;
  totalTrzaskowski: number;
  totalInvalidVotes: number;
  totalVotes: number;
  voivodeships: VoivodeshipResults[];
  lastUpdate: Date;
}

export class DataUpdateEvent extends CustomEvent<ElectionData> {
  constructor(data: ElectionData) {
    super("dataUpdate", { detail: data });
  }
}

export class ErrorEvent extends CustomEvent<{ error: Error; timestamp: Date }> {
  constructor(error: Error) {
    super("error", { detail: { error, timestamp: new Date() } });
  }
}

export class ElectionTracker extends EventTarget {
  private intervalId: NodeJS.Timeout | null = null;
  private currentData: ElectionData | null = null;
  private readonly UPDATE_INTERVAL = 30000; // 30 seconds
  private readonly CACHE_FILE = join(process.cwd(), "cached-elections.json");
  private readonly debug: boolean;

  constructor(options?: { debug?: boolean }) {
    super();
    this.debug = options?.debug ?? false;
    this.loadPersistedData();
  }

  start(): void {
    if (this.intervalId) {
      console.warn("ElectionTracker is already running");
      return;
    }

    console.log("Starting election tracker...");
    this.fetchData(); // Initial fetch
    this.intervalId = setInterval(() => {
      this.fetchData();
    }, this.UPDATE_INTERVAL);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Election tracker stopped");
    }
    this.persistData();
  }

  getCurrentData(): ElectionData | null {
    return this.currentData;
  }

  private debugLog(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(message, ...args);
    }
  }

  private async fetchData(): Promise<void> {
    try {
      this.debugLog("Fetching election data...");

      // Get configuration
      const configUrl = "https://wybory.gov.pl/prezydent2025/data/config.blob";
      const configBlob = await fetch(configUrl);

      if (!configBlob.ok) {
        throw new Error(
          `Failed to fetch config: ${configBlob.status} ${configBlob.statusText}`
        );
      }

      const configArrayBuffer = await configBlob.arrayBuffer();
      const decoded = Konfiguracja.decode(new Uint8Array(configArrayBuffer));

      // Find the protocols file
      const protocolsInfo = decoded.index?.categorizedFiles
        .find((c) => c.categoryName === "csv")
        ?.files?.items.find(
          (f) => f.name === "protokoly_po_obwodach_w_drugiej_turze_csv.zip"
        );

      if (!protocolsInfo) {
        throw new Error("Protocols file not found in configuration");
      }

      // Check if we already have this timestamp
      if (
        this.currentData &&
        this.currentData.timestamp === protocolsInfo.timestamp
      ) {
        this.debugLog("Data is up to date, skipping fetch");
        return;
      }

      const timestamp = protocolsInfo.timestamp;
      const zipUrl = `https://wybory.gov.pl/prezydent2025/data/csv/protokoly_po_obwodach_w_drugiej_turze_csv.${timestamp}.zip`;

      this.debugLog(`Downloading ZIP from: ${zipUrl}`);

      // Download ZIP file
      const zipResponse = await fetch(zipUrl);
      if (!zipResponse.ok) {
        throw new Error(
          `Failed to download ZIP: ${zipResponse.status} ${zipResponse.statusText}`
        );
      }

      const zipArrayBuffer = Buffer.from(await zipResponse.arrayBuffer());
      this.debugLog(`Downloaded ZIP file size: ${zipArrayBuffer.length} bytes`);

      // Extract CSV from ZIP
      const zip = await JSZip.loadAsync(zipArrayBuffer);
      const csvFileName = "protokoly_po_obwodach_w_drugiej_turze_utf8.csv";
      const csvFile = zip.file(csvFileName);

      if (!csvFile) {
        throw new Error(`CSV file ${csvFileName} not found in ZIP`);
      }

      const csvContent = await csvFile.async("string");
      this.debugLog(
        `Extracted CSV content length: ${csvContent.length} characters`
      );

      // Parse CSV and process data
      const newData = this.processCsvData(csvContent, timestamp);

      // Check if data has changed
      if (this.hasDataChanged(newData)) {
        this.currentData = newData;
        this.persistData();

        // Fire update event
        this.dispatchEvent(new DataUpdateEvent(this.currentData));

        console.log("Election data updated:", {
          totalVotes: newData.totalVotes,
          nawrocki: newData.totalNawrocki,
          trzaskowski: newData.totalTrzaskowski,
          voivodeships: newData.voivodeships.length,
        });
      }
    } catch (error) {
      console.error("Error fetching election data:", error);

      // Fire error event
      this.dispatchEvent(new ErrorEvent(error as Error));
    }
  }

  private processCsvData(csvContent: string, timestamp: number): ElectionData {
    // Remove UTF-8 BOM if present
    const cleanContent = csvContent.replace(/^\uFEFF/, "");

    // Parse CSV with semicolon delimiter and handle quoted fields
    const records = parse(cleanContent, {
      delimiter: ";",
      quote: '"',
      skip_empty_lines: true,
      from_line: 2, // Skip header
    });

    const voivodeshipMap = new Map<string, VoivodeshipResults>();
    let totalNawrocki = 0;
    let totalTrzaskowski = 0;
    let totalInvalidVotes = 0;

    for (const record of records) {
      if (record.length < 31) {
        console.warn("Skipping incomplete record:", record);
        continue;
      }

      let voivodeship = record[5]; // Województwo
      const invalidVotes = parseInt(record[25]) || 0; // Column Z - Invalid votes
      const nawrocki = parseInt(record[29]) || 0; // Column AD - NAWROCKI Karol Tadeusz
      const trzaskowski = parseInt(record[30]) || 0; // Column AE - TRZASKOWSKI Rafał Kazimierz

      if (voivodeship === "") {
        // this is a foreign commission, let's give it a name
        voivodeship = "zagranica";
      }

      // Update totals
      totalNawrocki += nawrocki;
      totalTrzaskowski += trzaskowski;
      totalInvalidVotes += invalidVotes;

      // Update voivodeship totals
      if (!voivodeshipMap.has(voivodeship)) {
        voivodeshipMap.set(voivodeship, {
          name: voivodeship,
          nawrocki: 0,
          trzaskowski: 0,
          invalidVotes: 0,
          total: 0,
        });
      }

      const voivData = voivodeshipMap.get(voivodeship)!;
      voivData.nawrocki += nawrocki;
      voivData.trzaskowski += trzaskowski;
      voivData.invalidVotes += invalidVotes;
      voivData.total += nawrocki + trzaskowski;
    }

    const voivodeships = Array.from(voivodeshipMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return {
      timestamp,
      totalNawrocki,
      totalTrzaskowski,
      totalInvalidVotes,
      totalVotes: totalNawrocki + totalTrzaskowski,
      voivodeships,
      lastUpdate: new Date(),
    };
  }

  private hasDataChanged(newData: ElectionData): boolean {
    if (!this.currentData) return true;

    return this.currentData.timestamp !== newData.timestamp;
  }

  private loadPersistedData(): void {
    try {
      const data = readFileSync(this.CACHE_FILE, "utf-8");
      this.currentData = JSON.parse(data);
      // Convert lastUpdate back to Date object
      if (this.currentData) {
        this.currentData.lastUpdate = new Date(this.currentData.lastUpdate);
      }
      console.log("Loaded persisted election data from file");
    } catch (error) {
      console.log("No cached election data found or failed to load");
    }
  }

  private persistData(): void {
    try {
      if (this.currentData) {
        writeFileSync(
          this.CACHE_FILE,
          JSON.stringify(this.currentData, null, 2),
          "utf-8"
        );
        console.log("Election data persisted to file");
      }
    } catch (error) {
      console.warn("Failed to persist data to file:", error);
    }
  }
}

// Export types for consumers
export type { ElectionData, VoivodeshipResults };
