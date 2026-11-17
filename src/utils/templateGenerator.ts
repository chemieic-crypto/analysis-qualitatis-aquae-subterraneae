import ExcelJS from "exceljs";
import { downloadExcelJSWorkbook } from "./excelFormatter";

/**
 * Download standard Excel Template pre-populated with all static metadata headers
 * and water quality parameter headers with exact required units.
 */
export async function downloadWaterQualityTemplate() {
  const headers = [
    // Static Location & Well Details
    "CHQ Sl. No.",
    "Year",
    "Season",
    "Well ID",
    "State",
    "District",
    "Block",
    "Gram Panchayat",
    "Village Name",
    "Location",
    "Location_Details",
    "Latitude",
    "Longitude",
    "Source",
    "Principal Aquifer",
    "Well_Sub_Type",
    "Well_Utilisation",
    "Depth_of_Well",
    "Aquifer Tapped",
    "Well Use",
    "Water level (mbgl)",
    "Principal Aquifer",
    "Stage of Exploration",

    // Clean Water Quality Parameter Headers (Units documented in Data Dictionary sheet)
    "pH",
    "EC",
    "CO3",
    "HCO3",
    "Cl",
    "F",
    "SO4",
    "NO3",
    "TH",
    "Ca",
    "Mg",
    "Na",
    "K",
    "SiO2",
    "PO4",
    "Li",
    "B",
    "Al",
    "Cr",
    "Mn",
    "Fe",
    "Co",
    "Ni",
    "Cu",
    "Zn",
    "Se",
    "Sr",
    "Cd",
    "Ba",
    "Hg",
    "Pb",
    "As",
    "U"
  ];

  // Realistic sample data rows for user guidance
  const sampleRows: Array<Array<string | number>> = [
    [
      1,
      2025,
      "Pre-Monsoon",
      "PB-AMR-001",
      "Punjab",
      "Amritsar",
      "Ajnala",
      "Ajnala GP",
      "Chogawan",
      "Chogawan PHC",
      "Near Primary Health Center Borewell",
      31.8321,
      74.7523,
      "Tube Well",
      "Alluvium",
      "Piezometer",
      "Drinking",
      45.0,
      "Shallow Alluvium",
      "Both WL + WQ Monitoring",
      8.50,
      "Alluvium",
      "Semi-Critical",
      7.40,
      850,
      0,
      240,
      45,
      0.80,
      65,
      28,
      280,
      64,
      29,
      52,
      4.20,
      18.0,
      0.12,
      0.010,
      0.35,
      0.020,
      0.010,
      0.040,
      0.150,
      0.005,
      0.010,
      0.020,
      0.100,
      0.002,
      0.250,
      0.001,
      0.080,
      0.0005,
      0.002,
      8.5,
      18.2
    ],
    [
      2,
      2025,
      "Pre-Monsoon",
      "PB-AMR-002",
      "Punjab",
      "Amritsar",
      "Attari",
      "Attari GP",
      "Rangarh",
      "Rangarh Border Post",
      "Handpump near Panchayat Ghar",
      31.6045,
      74.6012,
      "Dug Well",
      "Alluvium",
      "",
      "Irrigation+Drinking",
      30.0,
      "Unconfined Alluvium",
      "WQ Monitoring",
      6.20,
      "Alluvium",
      "Safe",
      7.80,
      1250,
      12,
      310,
      110,
      1.40,
      140,
      52,
      340,
      88,
      29,
      120,
      8.50,
      22.0,
      0.25,
      0.020,
      0.65,
      0.030,
      0.020,
      0.080,
      0.450,
      0.008,
      0.015,
      0.050,
      0.220,
      0.005,
      0.400,
      0.002,
      0.120,
      0.0008,
      0.005,
      14.2,
      34.5
    ],
    [
      3,
      2025,
      "Pre-Monsoon",
      "HR-KRN-001",
      "Haryana",
      "Karnal",
      "Gharaunda",
      "Gharaunda GP",
      "Bastanra",
      "Bastanra Toll Plaza",
      "Exploratory well inside Govt School",
      29.5420,
      76.9734,
      "Borewell",
      "Alluvium",
      "Exploratory",
      "Irrigation",
      60.0,
      "Deep Alluvium",
      "Both WL + WQ Monitoring",
      12.40,
      "Alluvium",
      "Over-Exploited",
      8.10,
      1650,
      0,
      380,
      185,
      1.10,
      210,
      68,
      420,
      105,
      38,
      175,
      12.0,
      26.5,
      0.18,
      0.015,
      0.42,
      0.015,
      0.008,
      0.050,
      0.280,
      0.004,
      0.012,
      0.030,
      0.180,
      0.003,
      0.320,
      0.001,
      0.090,
      0.0004,
      0.003,
      6.8,
      22.4
    ]
  ];

  const wb = new ExcelJS.Workbook();
  const wsData = wb.addWorksheet("Groundwater_Quality_Data");
  const dataHeaderRow = wsData.addRow(headers);
  dataHeaderRow.height = 32;
  dataHeaderRow.eachCell((cell, colNumber) => {
    const isMetadata = colNumber <= 23;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isMetadata ? "FF1E293B" : "FF1E40AF" },
    };
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "medium", color: { argb: "FF0F172A" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FF334155" } },
      right: { style: "thin", color: { argb: "FF334155" } },
    };
  });

  sampleRows.forEach((rowVals, rowIdx) => {
    const row = wsData.addRow(rowVals);
    row.height = 22;
    row.eachCell((cell, colNumber) => {
      const val = rowVals[colNumber - 1];
      cell.font = { name: "Calibri", size: 10, color: { argb: "FF0F172A" } };
      if ((rowIdx + 1) % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
      cell.alignment = {
        vertical: "middle",
        horizontal: typeof val === "number" ? "right" : "left",
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  headers.forEach((header, idx) => {
    let maxLen = header.length;
    sampleRows.forEach((row) => {
      const valStr = String(row[idx] ?? "");
      if (valStr.length > maxLen) maxLen = valStr.length;
    });
    wsData.getColumn(idx + 1).width = Math.min(Math.max(maxLen + 3, 12), 45);
  });

  // Construct Data Dictionary Sheet
  const dictHeaders = [
    "Category",
    "Parameter Header / Column Name",
    "Unit of Measurement",
    "Acceptable Limit (B1)",
    "Permissible Limit (B2)",
    "Field Description & Instructions"
  ];
  const dictRows: string[][] = [
    ["Metadata", "CHQ Sl. No.", "Integer", "-", "-", "Unique serial number assigned to the sample"],
    ["Metadata", "Year", "YYYY", "-", "-", "Year of water sample collection (e.g. 2024, 2025)"],
    ["Metadata", "Season", "Text", "-", "-", "Collection season (e.g., Pre-Monsoon, Post-Monsoon)"],
    ["Metadata", "Well ID", "Alphanumeric", "-", "-", "Unique station / well identification code"],
    ["Metadata", "State", "Text", "-", "-", "Name of the Indian State / UT"],
    ["Metadata", "District", "Text", "-", "-", "Name of the District"],
    ["Metadata", "Block", "Text", "-", "-", "Name of the Block / Tehsil / Mandal"],
    ["Metadata", "Gram Panchayat", "Text", "-", "-", "Name of Gram Panchayat"],
    ["Metadata", "Village Name", "Text", "-", "-", "Name of Village"],
    ["Metadata", "Location", "Text", "-", "-", "Specific monitoring location name"],
    ["Metadata", "Location_Details", "Text", "-", "-", "Detailed description of sampling site"],
    ["Metadata", "Latitude", "Decimal Degrees", "-", "-", "GPS Latitude coordinate (e.g., 31.8321)"],
    ["Metadata", "Longitude", "Decimal Degrees", "-", "-", "GPS Longitude coordinate (e.g., 74.7523)"],
    ["Metadata", "Source", "Text", "-", "-", "Groundwater structure type (Tube Well, Dug Well, Borewell, Spring)"],
    ["Metadata", "Principal Aquifer", "Text", "-", "-", "Geological aquifer formation (e.g., Alluvium, Basalt, Granite)"],
    ["Metadata", "Well_Sub_Type", "Text", "-", "-", "Piezometer / Exploratory (Left blank if Dug Well or Spring)"],
    ["Metadata", "Well_Utilisation", "Text", "-", "-", "Primary usage: Irrigation / Drinking / Irrigation+Drinking"],
    ["Metadata", "Depth_of_Well (in meter)", "Meters", "-", "-", "Total depth of well in meters below ground level"],
    ["Metadata", "Aquifer Tapped", "Text", "-", "-", "Specific tapped aquifer horizon"],
    ["Metadata", "Well Use", "Text", "-", "-", "WQ Monitoring / Both WL + WQ Monitoring"],
    ["Metadata", "Water level (mbgl)", "mbgl", "-", "-", "Water level depth in meters below ground level at sample collection"],
    ["Metadata", "Stage of Exploration", "Text", "-", "-", "Assessment stage (Safe / Semi-Critical / Critical / Over-Exploited)"],
    ["Water Quality", "pH", "pH Units", "6.5", "8.5", "Hydrogen ion concentration exponent"],
    ["Water Quality", "EC", "µS/Cm at 25° C", "750", "2250", "Electrical Conductivity in microSiemens per cm at 25°C"],
    ["Water Quality", "CO3", "mg/L", "0", "0", "Carbonate concentration in mg/L"],
    ["Water Quality", "HCO3", "mg/L", "200", "600", "Bicarbonate concentration in mg/L"],
    ["Water Quality", "Cl", "mg/L", "250", "1000", "Chloride concentration in mg/L"],
    ["Water Quality", "F", "mg/L", "1.0", "1.5", "Fluoride concentration in mg/L"],
    ["Water Quality", "SO4", "mg/L", "200", "400", "Sulfate concentration in mg/L"],
    ["Water Quality", "NO3", "mg/L", "45", "45", "Nitrate concentration in mg/L"],
    ["Water Quality", "TH", "mg/L as CaCO3", "200", "600", "Total Hardness in mg/L as CaCO3 equivalent"],
    ["Water Quality", "Ca", "mg/L", "75", "200", "Calcium concentration in mg/L"],
    ["Water Quality", "Mg", "mg/L", "30", "100", "Magnesium concentration in mg/L"],
    ["Water Quality", "Na", "mg/L", "200", "200", "Sodium concentration in mg/L"],
    ["Water Quality", "K", "mg/L", "12", "12", "Potassium concentration in mg/L"],
    ["Water Quality", "SiO2", "mg/L", "25", "100", "Silica concentration in mg/L"],
    ["Water Quality", "PO4", "mg/L", "0.1", "0.3", "Phosphate concentration in mg/L"],
    ["Water Quality", "Li", "mg/L", "0.05", "0.2", "Lithium concentration in mg/L"],
    ["Water Quality", "B", "mg/L", "0.5", "1.0", "Boron concentration in mg/L"],
    ["Water Quality", "Al", "mg/L", "0.03", "0.2", "Aluminium concentration in mg/L"],
    ["Water Quality", "Cr", "mg/L", "0.05", "0.05", "Chromium concentration in mg/L"],
    ["Water Quality", "Mn", "mg/L", "0.1", "0.3", "Manganese concentration in mg/L"],
    ["Water Quality", "Fe", "mg/L", "1.0", "1.0", "Total Iron concentration in mg/L"],
    ["Water Quality", "Co", "mg/L", "0.01", "0.05", "Cobalt concentration in mg/L"],
    ["Water Quality", "Ni", "mg/L", "0.02", "0.02", "Nickel concentration in mg/L"],
    ["Water Quality", "Cu", "mg/L", "0.05", "1.5", "Copper concentration in mg/L"],
    ["Water Quality", "Zn", "mg/L", "5.0", "15.0", "Zinc concentration in mg/L"],
    ["Water Quality", "Se", "mg/L", "0.01", "0.01", "Selenium concentration in mg/L"],
    ["Water Quality", "Sr", "mg/L", "1.0", "4.0", "Strontium concentration in mg/L"],
    ["Water Quality", "Cd", "mg/L", "0.003", "0.003", "Cadmium concentration in mg/L"],
    ["Water Quality", "Ba", "mg/L", "0.7", "0.7", "Barium concentration in mg/L"],
    ["Water Quality", "Hg", "mg/L", "0.001", "0.001", "Mercury concentration in mg/L"],
    ["Water Quality", "Pb", "mg/L", "0.01", "0.01", "Lead concentration in mg/L"],
    ["Water Quality", "As", "ppb (µg/L)", "10", "50", "Arsenic concentration in parts per billion (ppb)"],
    ["Water Quality", "U", "ppb (µg/L)", "30", "30", "Uranium concentration in parts per billion (ppb)"]
  ];

  const wsDict = wb.addWorksheet("Data_Dictionary_&_Units");
  const dictHeaderRow = wsDict.addRow(dictHeaders);
  dictHeaderRow.height = 28;
  dictHeaderRow.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "medium", color: { argb: "FF020617" } },
      bottom: { style: "medium", color: { argb: "FF020617" } },
      left: { style: "thin", color: { argb: "FF334155" } },
      right: { style: "thin", color: { argb: "FF334155" } },
    };
  });

  dictRows.forEach((rowVals, rowIdx) => {
    const row = wsDict.addRow(rowVals);
    row.height = 20;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: "Calibri", size: 10, color: { argb: "FF1E293B" } };
      if ((rowIdx + 1) % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
      cell.alignment = {
        vertical: "middle",
        horizontal: colNumber === 3 || colNumber === 4 || colNumber === 5 ? "center" : "left",
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  const dictWidths = [18, 32, 22, 24, 24, 65];
  dictWidths.forEach((w, idx) => {
    wsDict.getColumn(idx + 1).width = w;
  });

  await downloadExcelJSWorkbook(wb, "Water_Quality_Upload_Template.xlsx");
}
