// import {decode, simplify} from "@goodtools/protobuf-decoder";

import JSZip from "jszip";
import { Konfiguracja } from "./generated/src/pkw";

async function main() {
  const configUrl = "https://wybory.gov.pl/prezydent2025/data/config.blob";

  const blob = await fetch(configUrl);
  const arrayBuffer = await blob.arrayBuffer();
  // const decoded = decode(Buffer.from(arrayBuffer));
  // const simplified = simplify(decoded);
  // console.log(JSON.stringify(simplified));

  const decoded = Konfiguracja.decode(new Uint8Array(arrayBuffer));
  console.log(JSON.stringify(decoded, null, 2));

  // download the zip
  // https://wybory.gov.pl/prezydent2025/data/csv/protokoly_po_obwodach_w_drugiej_turze_csv.1748821425.zip

  const protocolsInfo = decoded.index?.categorizedFiles
    .find((c) => c.categoryName === "csv")
    ?.files?.items.find(
      (f) => f.name === "protokoly_po_obwodach_w_drugiej_turze_csv.zip"
    );

  // we need to construct the URL with injected timestamp
  if (protocolsInfo) {
    const timestamp = protocolsInfo.timestamp;
    const zipUrl = `https://wybory.gov.pl/prezydent2025/data/csv/protokoly_po_obwodach_w_drugiej_turze_csv.${timestamp}.zip`;
    console.log("ZIP URL:", zipUrl);

    // download it into a Buffer
    const zipReq = await fetch(zipUrl);
    // check if it was successful
    if (!zipReq.ok) {
      console.error(
        "Failed to download ZIP file:",
        zipReq.status,
        zipReq.statusText
      );
      return;
    }

    const zipArrayBuffer = Buffer.from(await zipReq.arrayBuffer());

    console.log("Downloaded ZIP file size:", zipArrayBuffer.length, "bytes");

    // use JSZip to extract `protokoly_po_obwodach_w_drugiej_turze_utf8.csv` from the ZIP
    const zip = await JSZip.loadAsync(zipArrayBuffer);
    const csvFileName = "protokoly_po_obwodach_w_drugiej_turze_utf8.csv";
    const csvFile = zip.file(csvFileName);
    if (csvFile) {
      const csvContent = await csvFile.async("string");
      console.log("CSV Content:", csvContent);
    }
  } else {
    console.error(
      "No protocols info found for the specified category and file name."
    );
  }
}

main();
