import React, { useState, useEffect, useMemo, useRef } from "react";
import shp from "shpjs";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { downloadExcelJSWorkbook, ensureExcelJSWorksheetNumbers } from "../utils/excelFormatter";
import { DataHeaders } from "../types";
import { downloadMhtmlWordDoc } from "../utils/export";
import { 
  DEFAULT_CGWB_PNG_BASE64, 
  CGWB_ISSUING_OFFICES, 
  CGWB_OFFICE_DETAILS 
} from "../utils/cgwbLogo";
import {
  FileText,
  TableProperties,
  Globe,
  Settings2,
  Image as ImageIcon,
  Download,
  Upload,
  Printer,
  FileDown,
  LayoutDashboard,
  TrendingUp,
  Compass,
  Layers,
  Cpu,
  Table,
  Table2,
  Database,
  BarChart3,
  LayoutTemplate,
  Sparkles,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Check,
  Sliders,
  Filter,
  Calendar,
  Building2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  X,
  Type,
  AlignLeft,
  AlignJustify,
  Bold,
  FileCheck
} from "lucide-react";

interface FortnightlyAlertsViewProps {
  rawData: any[];
  headers: DataHeaders;
  headerMap: Record<string, string>;
  selectedState: string;
}

const COLUMNS = [
  "S No", "State", "District", "Block", "Village/Town", "Latitude", "Longitude", 
  "Sample Collection Structure", "Depth of the Structure from Ground Level in Meters", 
  "Sample Collection Date", "Sample Analysis Date", "pH", "EC (µS/cm at 25 C)", "Cl-1 (mg/L)", 
  "SO4-2 (mg/L)", "NO3-1 (mg/L)", "F", "Ca+2 (mg/L)", "Mg+2 (mg/L)", 
  "TH *as CaCO3 (mg/L)", "Cr (mg/L)", "Mn (mg/L)", "Fe (mg/L)", "Ni (mg/L)", 
  "Cu (mg/L)", "Zn (mg/L)", "As (µg/L)", "Se (µg/L)", "Cd (µg/L)", "Pb (µg/L)", 
  "U (µg/L)", "Al (mg/L)", "Ba (mg/L)", "B (mg/L)", "Mo (mg/L)", "Hg (mg/L)"
];

const DEFAULT_LIMITS: Record<string, { acc: number; perm: number; isStrictRange?: boolean }> = {
  "pH": { acc: 6.5, perm: 8.5, isStrictRange: true },
  "EC (µS/cm at 25 C)": { acc: 750, perm: 3000 },
  "Cl-1 (mg/L)": { acc: 250, perm: 1000 },
  "SO4-2 (mg/L)": { acc: 200, perm: 400 },
  "NO3-1 (mg/L)": { acc: 45, perm: 45 },
  "F": { acc: 1.0, perm: 1.5 },
  "Ca+2 (mg/L)": { acc: 75, perm: 200 },
  "Mg+2 (mg/L)": { acc: 30, perm: 100 },
  "TH *as CaCO3 (mg/L)": { acc: 200, perm: 600 },
  "Cr (mg/L)": { acc: 0.05, perm: 0.05 },
  "Mn (mg/L)": { acc: 0.1, perm: 0.3 },
  "Fe (mg/L)": { acc: 1.0, perm: 1.0 },
  "Ni (mg/L)": { acc: 0.02, perm: 0.02 },
  "Cu (mg/L)": { acc: 0.05, perm: 1.5 },
  "Zn (mg/L)": { acc: 5.0, perm: 15.0 },
  "As (µg/L)": { acc: 10, perm: 10 },
  "Se (µg/L)": { acc: 10, perm: 10 },
  "Cd (µg/L)": { acc: 3, perm: 3 },
  "Pb (µg/L)": { acc: 10, perm: 10 },
  "U (µg/L)": { acc: 30, perm: 30 },
  "Al (mg/L)": { acc: 0.03, perm: 0.2 },
  "Ba (mg/L)": { acc: 0.7, perm: 0.7 },
  "B (mg/L)": { acc: 0.5, perm: 2.4 },
  "Mo (mg/L)": { acc: 0.05, perm: 0.07 },
  "Hg (mg/L)": { acc: 0.001, perm: 0.001 }
};

const HEAVY_METALS = ["Cr", "Mn", "Fe", "Ni", "Cu", "Zn", "As", "Se", "Cd", "Pb", "U", "Al", "Ba", "B", "Mo", "Hg"];

export interface AlertParamDefinition {
  key: string;
  shortName: string;
  displayHeader: string;
  rangeText: string;
  unit: string;
  group: "major" | "metal";
}

export const ALERT_PARAM_DEFINITIONS: AlertParamDefinition[] = [
  { key: "pH", shortName: "pH", displayHeader: "pH", rangeText: "6.5-8.5", unit: "", group: "major" },
  { key: "EC (µS/cm at 25 C)", shortName: "EC", displayHeader: "EC (µS/cm at 25 °C)", rangeText: "750-3000", unit: "µS/cm", group: "major" },
  { key: "Cl-1 (mg/L)", shortName: "Cl-1", displayHeader: "Cl⁻¹ (mg/L)", rangeText: "250-1000", unit: "mg/L", group: "major" },
  { key: "SO4-2 (mg/L)", shortName: "SO4-2", displayHeader: "SO₄⁻² (mg/L)", rangeText: "200-400", unit: "mg/L", group: "major" },
  { key: "NO3-1 (mg/L)", shortName: "NO3-1", displayHeader: "NO₃⁻¹ (mg/L)", rangeText: "45", unit: "mg/L", group: "major" },
  { key: "F", shortName: "F", displayHeader: "F⁻¹ (mg/L)", rangeText: "1-1.5", unit: "mg/L", group: "major" },
  { key: "Ca+2 (mg/L)", shortName: "Ca+2", displayHeader: "Ca⁺² (mg/L)", rangeText: "75-200", unit: "mg/L", group: "major" },
  { key: "Mg+2 (mg/L)", shortName: "Mg+2", displayHeader: "Mg⁺² (mg/L)", rangeText: "30-100", unit: "mg/L", group: "major" },
  { key: "TH *as CaCO3 (mg/L)", shortName: "TH", displayHeader: "TH *as CaCO₃ (mg/L)", rangeText: "200-600", unit: "mg/L", group: "major" },
  { key: "Cr (mg/L)", shortName: "Cr", displayHeader: "Cr (mg/L)", rangeText: "0.05", unit: "mg/L", group: "metal" },
  { key: "Mn (mg/L)", shortName: "Mn", displayHeader: "Mn (mg/L)", rangeText: "0.1-0.3", unit: "mg/L", group: "metal" },
  { key: "Fe (mg/L)", shortName: "Fe", displayHeader: "Fe (mg/L)", rangeText: "1.00", unit: "mg/L", group: "metal" },
  { key: "Ni (mg/L)", shortName: "Ni", displayHeader: "Ni (mg/L)", rangeText: "0.02", unit: "mg/L", group: "metal" },
  { key: "Cu (mg/L)", shortName: "Cu", displayHeader: "Cu (mg/L)", rangeText: "0.05-1.5", unit: "mg/L", group: "metal" },
  { key: "Zn (mg/L)", shortName: "Zn", displayHeader: "Zn (mg/L)", rangeText: "5.0-15.0", unit: "mg/L", group: "metal" },
  { key: "As (µg/L)", shortName: "As", displayHeader: "As (µg/L)", rangeText: "2.0-10.0", unit: "µg/L", group: "metal" },
  { key: "Se (µg/L)", shortName: "Se", displayHeader: "Se (µg/L)", rangeText: "10", unit: "µg/L", group: "metal" },
  { key: "Cd (µg/L)", shortName: "Cd", displayHeader: "Cd (µg/L)", rangeText: "3", unit: "µg/L", group: "metal" },
  { key: "Pb (µg/L)", shortName: "Pb", displayHeader: "Pb (µg/L)", rangeText: "10", unit: "µg/L", group: "metal" },
  { key: "U (µg/L)", shortName: "U", displayHeader: "U (µg/L)", rangeText: "30", unit: "µg/L", group: "metal" },
  { key: "Al (mg/L)", shortName: "Al", displayHeader: "Al (mg/L)", rangeText: "0.03-0.2", unit: "mg/L", group: "metal" },
  { key: "Ba (mg/L)", shortName: "Ba", displayHeader: "Ba (mg/L)", rangeText: "0.7", unit: "mg/L", group: "metal" },
  { key: "B (mg/L)", shortName: "B", displayHeader: "B (mg/L)", rangeText: "0.5-2.4", unit: "mg/L", group: "metal" },
  { key: "Mo (mg/L)", shortName: "Mo", displayHeader: "Mo (mg/L)", rangeText: "0.05-0.07", unit: "mg/L", group: "metal" },
  { key: "Hg (mg/L)", shortName: "Hg", displayHeader: "Hg (mg/L)", rangeText: "0.001", unit: "mg/L", group: "metal" }
];

const PARAM_COLORS = [
  { bg: "from-blue-400 to-blue-600", border: "border-blue-700", shadow: "shadow-[0_2px_0_rgb(29,78,216)]" },
  { bg: "from-purple-400 to-purple-600", border: "border-purple-700", shadow: "shadow-[0_2px_0_rgb(126,34,206)]" },
  { bg: "from-rose-400 to-rose-600", border: "border-rose-700", shadow: "shadow-[0_2px_0_rgb(190,18,60)]" },
  { bg: "from-amber-400 to-amber-600", border: "border-amber-700", shadow: "shadow-[0_2px_0_rgb(180,83,9)]" },
  { bg: "from-teal-400 to-teal-600", border: "border-teal-700", shadow: "shadow-[0_2px_0_rgb(15,118,110)]" },
  { bg: "from-fuchsia-400 to-fuchsia-600", border: "border-fuchsia-700", shadow: "shadow-[0_2px_0_rgb(162,28,175)]" },
  { bg: "from-cyan-400 to-cyan-600", border: "border-cyan-700", shadow: "shadow-[0_2px_0_rgb(14,116,144)]" },
  { bg: "from-orange-400 to-orange-600", border: "border-orange-700", shadow: "shadow-[0_2px_0_rgb(194,65,12)]" },
  { bg: "from-indigo-400 to-indigo-600", border: "border-indigo-700", shadow: "shadow-[0_2px_0_rgb(67,56,202)]" },
  { bg: "from-pink-400 to-pink-600", border: "border-pink-700", shadow: "shadow-[0_2px_0_rgb(190,24,93)]" },
  { bg: "from-emerald-400 to-emerald-600", border: "border-emerald-700", shadow: "shadow-[0_2px_0_rgb(4,120,87)]" },
  { bg: "from-sky-400 to-sky-600", border: "border-sky-700", shadow: "shadow-[0_2px_0_rgb(3,105,161)]" },
  { bg: "from-violet-400 to-violet-600", border: "border-violet-700", shadow: "shadow-[0_2px_0_rgb(109,40,217)]" },
  { bg: "from-red-400 to-red-600", border: "border-red-700", shadow: "shadow-[0_2px_0_rgb(185,28,28)]" },
  { bg: "from-lime-500 to-lime-600", border: "border-lime-700", shadow: "shadow-[0_2px_0_rgb(77,124,15)]" }
];

const REMEDIAL_MEASURES = [
  {
    id: "pH", title: "Risk Perception & Remedial Measures for pH",
    sections: [{ desc: "Treatment of acidic water: Passing through Neutralizing Filter containing Calcite or Magnesia, or adding Soda Ash. Treatment of basic water: Installation of an acid injector (e.g., white vinegar or citric acid)." }]
  },
  {
    id: "TDS", title: "Risk Perception & Remedial Measures for TDS",
    sections: [{ desc: "Reverse Osmosis (RO), Electrodialysis, and Distillation are the most effective methods for reducing Total Dissolved Solids." }]
  },
  {
    id: "Turbidity", title: "Risk Perception & Remedial Measures for Turbidity",
    sections: [{ desc: "Coagulation, flocculation, sedimentation, and filtration (sand or multimedia filters) are used to remove suspended particles causing turbidity." }]
  },
  {
    id: "Alkalinity", title: "Risk Perception & Remedial Measures for Alkalinity",
    sections: [{ desc: "Can be reduced by Reverse Osmosis (RO) or by carefully adding a weak acid to lower the pH and neutralize the excess alkalinity." }]
  },
  {
    id: "EC", title: "Risk Perception & Remedial Measures for EC",
    sections: [{ desc: "Since Electrical Conductivity is directly related to dissolved ions (TDS), methods like Reverse Osmosis (RO) and Deionization (Ion Exchange) effectively lower it." }]
  },
  {
    id: "Cl-1", title: "Risk Perception & Remedial Measures for Chloride",
    riskPerception: "High concentration of chloride concentration in draining water.",
    sections: [{ desc: "Reverse Osmosis (RO), Distillation, and specific Ion Exchange (anion exchange) resins are effective for chloride removal. Standard boiling does not remove chlorides." }]
  },
  {
    id: "F", title: "Risk Perception & Remedial Measures for Fluoride",
    riskPerception: "Dental and Skeletal Fluorosis: Studies suggest high levels of fluoride may lead to discoloration and damage to teeth and affect bone health.",
    sections: [{ desc: "Defluoridation techniques can be adopted: Adsorption technique, Ion-exchange technique, Precipitation technique and other techniques, which include electro chemical defluoridation and Reverse Osmosis." }]
  },
  {
    id: "NO3-1", title: "Risk Perception & Remedial Measures for Nitrate",
    riskPerception: "High nitrate causes cyanosis (methaemoglobinaemia) or Blue baby disease. It effects digestive system. Development of cancer, especially digestive cancers, such as colorectal stomach and esophagus cancer, complications during pregnancy.",
    sections: [{ desc: "Reverse osmosis systems for drinking water to be used. Biological denitrification and ion-exchange can also be applied." }]
  },
  {
    id: "SO4-2", title: "Risk Perception & Remedial Measures for Sulphate",
    riskPerception: "High concentration of sulphate concentration in draining water may be more sensitive to the cathartic effects. Children, transients and the elderly are high risk of dehydration from diarrhoea may be caused by high concentration of sulfate in drinking-water.",
    sections: [{ desc: "The techniques may be adopted: Ion-exchange technique, Nano-filtration technique, Reverse Osmosis and electro-dialysis may be used." }]
  },
  {
    id: "Ca+2", title: "Risk Perception & Remedial Measures for Calcium",
    sections: [{ desc: "Water softening using cation exchange resins, Reverse Osmosis (RO), or chemical lime softening." }]
  },
  {
    id: "Mg+2", title: "Risk Perception & Remedial Measures for Magnesium",
    sections: [{ desc: "Water softening using cation exchange resins, Reverse Osmosis (RO), or chemical lime softening." }]
  },
  {
    id: "TH", title: "Risk Perception & Remedial Measures for Total Hardness",
    riskPerception: "Reduced lathering of soaps, buildup of scale on heating elements and boilers, reduced water flow in distribution pipes due to scale buildup. High levels of sodium in drinking water may harm your health like Cathartic and diuretic effect.",
    sections: [{ desc: "Hardness minerals can be removed with a water softener and dilution technique and Reverse Osmosis., which replaces the calcium and magnesium (and iron, manganese, radium and other positive ions) with sodium." }]
  },
  {
    id: "Cr", title: "Risk Perception & Remedial Measures for Chromium",
    sections: [{ desc: "Hexavalent chromium can be removed by Reverse Osmosis (RO), Anion Exchange, or reduction to trivalent chromium followed by coagulation and filtration." }]
  },
  {
    id: "Cu", title: "Risk Perception & Remedial Measures for Copper",
    sections: [{ desc: "Reverse Osmosis (RO), Cation Exchange (water softeners), and raising the pH of the water (to prevent pipe corrosion which is a common source of copper)." }]
  },
  {
    id: "Zn", title: "Risk Perception & Remedial Measures for Zinc",
    sections: [{ desc: "Ion Exchange (water softeners), Reverse Osmosis (RO), and Distillation are highly effective at removing zinc from drinking water." }]
  },
  {
    id: "As", title: "Risk Perception & Remedial Measures for Arsenic",
    riskPerception: "Long-term exposure of Arsenic is associated with skin, bladder, lung, risk of heart disease and hypertension and other cancers.",
    sections: [{ desc: "The techniques may be adopted: Adsorption technique, Ion-exchange technique, Reverse Osmosis and using alternative sources such as rainwater harvesting or deep aquifer water." }]
  },
  {
    id: "Cd", title: "Risk Perception & Remedial Measures for Cadmium",
    riskPerception: "Cadmium in drinking water is highly toxic and causing significant health risks, primarily it is accumulation in the kidneys. It can lead to kidney damage (tubular dysfunction), bone demineralization (osteoporosis and osteomalacia), and itai-itai disease, while being classified as a carcinogen. Acute symptoms include diarrhea, vomiting, and muscle cramps.",
    sections: [{ desc: "Effective mitigation of cadmium (Cd) from drinking water primarily reverse osmosis (RO), ion exchange, and coagulation/filtration." }]
  },
  {
    id: "Fe", title: "Risk Perception & Remedial Measures for Iron",
    riskPerception: "An excessive amount of exposure to iron can increase the risk of Parkinson's, cardiovascular disease, diabetes mellitus, pigmentation changes, Alzheimer's, as well as renal, liver, respiratory, and neurological issues.",
    sections: [{ desc: "Oxygenation of groundwater followed by precipitation and Reverse osmosis systems." }]
  },
  {
    id: "Pb", title: "Risk Perception & Remedial Measures for Lead",
    riskPerception: "Lead Can lead to hypertension, kidney damage, and reproductive issues in adults and Neurological damage; especially harmful to children, lead exposure can cause developmental delays, lower IQ, and behavioural issues.",
    sections: [{ desc: "Implement water treatment methods that reduce corrosion in pipes, such as adjusting pH, alkalinity, and adding inhibitors like orthophosphate. RO is also highly effective." }]
  },
  {
    id: "Mn", title: "Risk Perception & Remedial Measures for Manganese",
    riskPerception: "Continue use can damage liver, lungs and kidneys, effects the metabolism of iron for formation of hemoglobin and leads to neurological conditions- impaired memory, impaired motor coordination and delayed reaction time- results in disease called Manganism.",
    sections: [{ desc: "Treating the water at its source, filtration system and water treatment method." }]
  },
  {
    id: "Ni", title: "Risk Perception & Remedial Measures for Nickel",
    riskPerception: "Nickel is used in the nickel/chrome plating and so can occasionally leach into water. High concentration of nickel contaminated water is used for domestic/ drinking purposes, it can cause skin irritation (dermatitis), gastrointestinal issues (nausea, vomiting), and long-term risks like kidney/liver damage, reduced body weight and potential carcinogenicity.",
    sections: [{ desc: "There are several effective methods for removing nickel from water namely: Chemical Precipitation, Ion Exchange, Membrane Filtration, Adsorption on activated carbon, Electrodialysis, UV radiation and Biological treatment." }]
  },
  {
    id: "Se", title: "Risk Perception & Remedial Measures for Selenium",
    riskPerception: "Excessive intake of selenium from drinking water, typically more than permissible limit may causes selenosis, characterized by brittle hair, hair loss, and deformed, discolored nails. Other side effects include gastrointestinal distress (nausea, diarrhea), neurological issues (fatigue, irritability, tremor), and extreme cases can lead to organ failure.",
    sections: [{ desc: "Effective selenium mitigation from drinking water, involves advanced techniques like reverse osmosis (RO), ion exchange, and adsorption (e.g., activated alumina or iron-based media). Iron electrocoagulation, which generates reactive rust to bind selenium, can remove 98%." }]
  },
  {
    id: "U", title: "Risk Perception & Remedial Measures for Uranium",
    riskPerception: "The kidney and lungs are found to be the major target organs of Uranium toxicity and it may cause cancer from radioactive uranium. In animal bones, Uranium influences inhibition of osteoblastic activity, thereby reducing bone volume.",
    sections: [{ desc: "The technologies for uranium removal: Coagulation/filtration, Lime softening, Anion exchange, Reverse osmosis and Activated alumina may remove 80-90% uranium from water." }]
  },
  {
    id: "Al", title: "Risk Perception & Remedial Measures for Aluminium",
    riskPerception: "High aluminium exposure has neurological implications and contributes to turbidity and discoloration of water.",
    sections: [{ desc: "Coagulation with alternative non-aluminium coagulants, pH adjustment, and membrane filtration (Reverse Osmosis / Nanofiltration)." }]
  },
  {
    id: "Ba", title: "Risk Perception & Remedial Measures for Barium",
    riskPerception: "Excessive barium in drinking water can cause gastrointestinal disturbances, muscular weakness, hypertension, and cardiac irregularities.",
    sections: [{ desc: "Ion exchange softening, chemical lime softening, and Reverse Osmosis (RO) are highly effective methods for barium removal." }]
  },
  {
    id: "B", title: "Risk Perception & Remedial Measures for Boron",
    riskPerception: "Ingestion of excess boron may cause gastrointestinal irritation and reproductive health risks over prolonged exposure.",
    sections: [{ desc: "Specialized boron-selective ion exchange resins (chelating resins) and multi-pass Reverse Osmosis at elevated pH." }]
  },
  {
    id: "Mo", title: "Risk Perception & Remedial Measures for Molybdenum",
    riskPerception: "Elevated molybdenum intake can lead to gout-like symptoms, joint deformities, and secondary copper deficiency in humans.",
    sections: [{ desc: "Strong base anion exchange, coagulation with iron salts at lower pH (<6.5), and Reverse Osmosis." }]
  },
  {
    id: "Hg", title: "Risk Perception & Remedial Measures for Mercury",
    riskPerception: "Mercury is highly toxic even at trace levels, leading to severe neurological damage, kidney impairment, and cognitive deficits.",
    sections: [{ desc: "Granular Activated Carbon (GAC) adsorption, sulfur-impregnated carbon, chemical precipitation, and Reverse Osmosis." }]
  }
];

const STANDARD_TREATMENTS = [
  {
    title: "Reverse Osmosis (RO)",
    desc: "Forces water through a semi-permeable membrane. This is one of the most effective methods for removing heavy metals, dissolved solids (TDS), fluoride, nitrate, and various chemicals.",
    chemistry: "Osmotic pressure (> osmotic pressure of feed) drives H₂O through a semipermeable membrane (pore size ~0.0001 µm). Rejects hydrated ions (Na⁺, Pb²⁺, SO₄²⁻) via size exclusion and dielectric repulsion.",
    color: "from-blue-500 to-blue-700"
  },
  {
    title: "Activated Carbon Filtration (ACF)",
    desc: "Uses highly porous carbon with massive surface area to trap impurities. Highly effective at removing chlorine, VOCs, pesticides, and odors. Often used as a pre/post-filter.",
    chemistry: "1. Physical Adsorption: Non-polar organics trapped in micropores via Van der Waals forces.\n2. Chemisorption (Chlorine): Catalytic reduction at the carbon surface (C* + HOCl → C*O + H⁺ + Cl⁻).",
    color: "from-slate-600 to-slate-800"
  },
  {
    title: "Ultraviolet (UV) Disinfection",
    desc: "A chemical-free process that inactivates biological pathogens (bacteria, viruses, protozoa). Requires clear water (low turbidity) so particles don't 'shadow' the microbes.",
    chemistry: "Photochemical Damage: UV-C photons (254 nm) penetrate cells and are absorbed by nucleic acids. Causes adjacent thymine bases in DNA to bond (pyrimidine dimers), preventing replication.",
    color: "from-purple-500 to-purple-700"
  },
  {
    title: "Chlorination",
    desc: "The standard municipal method of adding chlorine to kill pathogenic microorganisms. It provides residual protection, ensuring water remains safe as it travels through extensive distribution pipes.",
    chemistry: "Oxidation. Cl₂ or NaOCl reacts with water to form Hypochlorous acid (HOCl): Cl₂ + H₂O ⇌ HOCl + H⁺ + Cl⁻. HOCl rapidly oxidizes microbial cell structures.",
    color: "from-teal-500 to-teal-700"
  },
  {
    title: "Ion Exchange (Deionization & Softening)",
    desc: "Removes specific dissolved ions by exchanging them for less harmful ones. Cation resins remove hardness (Ca, Mg) and heavy metals. Anion resins remove nitrates, sulfates, and fluoride.",
    chemistry: "1. Cation Exchange: R⁻-Na⁺ + M²⁺ ⇌ R⁻-M²⁺ + 2Na⁺ (Removes cations: Ca²⁺, Mg²⁺, Pb²⁺).\n2. Anion Exchange: R⁺-Cl⁻ + A⁻ ⇌ R⁺-A⁻ + Cl⁻ (Removes anions: NO₃⁻, SO₄²⁻, F⁻).\n*R = insoluble polymeric resin.",
    color: "from-amber-500 to-amber-700"
  },
  {
    title: "Boiling",
    desc: "A highly reliable household method for biological purification. Bringing water to a rolling boil for 1-3 minutes effectively kills pathogens, though it concentrates heavy metals if present.",
    chemistry: "Thermal denaturation of pathogenic proteins. Also precipitates temporary hardness: Ca(HCO₃)₂ + Heat → CaCO₃↓ + H₂O + CO₂↑.",
    color: "from-rose-500 to-rose-700"
  },
  {
    title: "Coagulation & Flocculation",
    desc: "Chemicals with a positive charge are added to the water. They bind with negatively charged particles/dirt to form larger particles (floc) which then settle to the bottom for easy removal.",
    chemistry: "Charge neutralization. Coagulants like Alum (Al₂(SO₄)₃) release Al³⁺ ions that neutralize negatively charged colloids, forming a gelatinous Al(OH)₃ sweep floc.",
    color: "from-indigo-500 to-indigo-700"
  },
  {
    title: "Sediment Filtration",
    desc: "A physical barrier that catches large particles like sand, rust, and silt. It protects subsequent, finer filters and sensitive treatment appliances from premature clogging and damage.",
    chemistry: "Primarily mechanical straining (particle size > pore size) coupled with weak electrostatic adsorption to the filter media surface.",
    color: "from-orange-500 to-orange-700"
  }
];

const FULL_PARAM_NAMES: Record<string, string> = {
  "pH": "pH", "TDS": "Total Dissolved Solids", "Turbidity": "Turbidity", "Alkalinity": "Total Alkalinity",
  "EC": "Electrical conductivity", "Cl-1": "Chloride", "SO4-2": "Sulphate",
  "NO3-1": "Nitrate", "F": "Fluoride", "Ca+2": "Calcium", "Mg+2": "Magnesium",
  "TH": "Total Hardness", "Cr": "Chromium", "Mn": "Manganese", "Fe": "Iron",
  "Ni": "Nickel", "Cu": "Copper", "Zn": "Zinc", "As": "Arsenic", "Se": "Selenium",
  "Cd": "Cadmium", "Pb": "Lead", "U": "Uranium", "Al": "Aluminium", "Ba": "Barium",
  "B": "Boron", "Mo": "Molybdenum", "Hg": "Mercury"
};

const CGWB_LABS: Record<string, string> = {
  "Uttar Pradesh": "Northern Region, Lucknow",
  "Uttarakhand": "Uttarakhand Region, Dehradun",
  "Madhya Pradesh": "North Central Region, Bhopal",
  "Chhattisgarh": "North Central Chhattisgarh Region, Raipur",
  "Rajasthan": "Western Region, Jaipur",
  "Gujarat": "West Central Region, Ahmedabad",
  "Maharashtra": "Central Region, Nagpur",
  "Andhra Pradesh": "Southern Region, Hyderabad",
  "Telangana": "Southern Region, Hyderabad",
  "Karnataka": "South Western Region, Bangalore",
  "Tamil Nadu": "South Eastern Coastal Region, Chennai",
  "Kerala": "Kerala Region, Trivandrum",
  "West Bengal": "Eastern Region, Kolkata",
  "Odisha": "South Eastern Region, Bhubaneswar",
  "Bihar": "Mid Eastern Region, Patna",
  "Jharkhand": "Mid Eastern Region, Patna",
  "Assam": "North Eastern Region, Guwahati",
  "Arunachal Pradesh": "North Eastern Region, Guwahati",
  "Meghalaya": "North Eastern Region, Guwahati",
  "Nagaland": "North Eastern Region, Guwahati",
  "Manipur": "North Eastern Region, Guwahati",
  "Mizoram": "North Eastern Region, Guwahati",
  "Tripura": "North Eastern Region, Guwahati",
  "Sikkim": "Eastern Region, Kolkata",
  "Haryana": "North Western Region, Chandigarh",
  "Punjab": "North Western Region, Chandigarh",
  "Himachal Pradesh": "Northern Himalayan Region, Dharamshala",
  "Jammu & Kashmir": "North Western Himalayan Region, Jammu",
  "Ladakh": "North Western Himalayan Region, Jammu",
  "Goa": "South Western Region, Bangalore",
  "Delhi": "State Unit Office, New Delhi",
  "Chandigarh": "North Western Region, Chandigarh",
  "Puducherry": "South Eastern Coastal Region, Chennai",
  "Andaman & Nicobar": "Eastern Region, Kolkata",
  "Andaman and Nicobar": "Eastern Region, Kolkata"
};

const getFullParamNames = (paramsList: string[]) => {
  return paramsList.map(p => FULL_PARAM_NAMES[p] || p).join(', ');
};

const guessMapping = (expected: string, available: string[]) => {
  const clean = (str: string) => String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
  const eClean = clean(expected);
  
  // Exact clean match
  const exact = available.find(a => clean(a) === eClean);
  if (exact) return exact;
  
  // Contains or is contained by
  const partial = available.find(a => {
    const aClean = clean(a);
    return aClean.length > 3 && eClean.length > 3 && (aClean.includes(eClean) || eClean.includes(aClean));
  });
  if (partial) return partial;
  
  return "";
};

// Date extraction helpers to strictly respect the uploaded spreadsheet's dates
export function formatSheetDate(rawVal: any): string {
  if (rawVal == null || rawVal === "") return "";
  
  if (typeof rawVal === "number") {
    // Check if Excel serial date code (e.g. 25000 to 75000)
    if (rawVal > 25000 && rawVal < 75000) {
      const date = new Date(Math.round((rawVal - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const d = String(date.getDate()).padStart(2, "0");
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const y = date.getFullYear();
        return `${d}.${m}.${y}`;
      }
    }
    return String(rawVal);
  }

  if (rawVal instanceof Date) {
    if (!isNaN(rawVal.getTime())) {
      const d = String(rawVal.getDate()).padStart(2, "0");
      const m = String(rawVal.getMonth() + 1).padStart(2, "0");
      const y = rawVal.getFullYear();
      return `${d}.${m}.${y}`;
    }
  }

  const str = String(rawVal).trim();
  if (!str) return "";

  // Check if ISO YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, "0");
    const d = isoMatch[3].padStart(2, "0");
    return `${d}.${m}.${y}`;
  }

  // Check if DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, "0");
    const m = dmyMatch[2].padStart(2, "0");
    let y = dmyMatch[3];
    if (y.length === 2) y = `20${y}`;
    return `${d}.${m}.${y}`;
  }

  // Check for date range format e.g. "01-15/10/2026" or "01.10.2026 - 15.10.2026"
  return str;
}

export function extractDateFromRow(row: any, kind: "collection" | "analysis"): string {
  if (!row || typeof row !== "object") return "";

  const collectionKeys = [
    "Sample Collection Date",
    "Sample Collection Date DD/MM/YYYY",
    "Collection Date",
    "Date of Collection",
    "Date of Sampling",
    "Sampling Date",
    "Sampling_Date",
    "Collection_Date",
    "Date_of_Collection",
    "Sample Date",
    "Sample_Date",
    "CollectionDate",
    "SamplingDate",
    "Date"
  ];

  const analysisKeys = [
    "Sample Analysis Date",
    "Sample Analysis Date DD/MM/YYYY",
    "Analysis Date",
    "Date of Analysis",
    "Sample_Analysis_Date",
    "Date_of_Analysis",
    "Testing Date",
    "Date of Testing",
    "AnalysisDate",
    "Testing_Date",
    "Date of Sample Analysis"
  ];

  const targetKeys = kind === "collection" ? collectionKeys : analysisKeys;

  // 1. Direct key match
  for (const k of targetKeys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
      return formatSheetDate(row[k]);
    }
  }

  // 2. Case-insensitive key match
  const rowKeys = Object.keys(row);
  for (const k of targetKeys) {
    const matchedKey = rowKeys.find(rk => rk.trim().toLowerCase() === k.toLowerCase());
    if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null && String(row[matchedKey]).trim() !== "") {
      return formatSheetDate(row[matchedKey]);
    }
  }

  // 3. Regex fuzzy match across all row keys
  const regex = kind === "collection"
    ? /(collect.*date|date.*collect|sampl.*date|date.*sampl)/i
    : /(analys.*date|date.*analys|test.*date|date.*test)/i;

  const fuzzyKey = rowKeys.find(rk => regex.test(rk));
  if (fuzzyKey && row[fuzzyKey] !== undefined && row[fuzzyKey] !== null && String(row[fuzzyKey]).trim() !== "") {
    return formatSheetDate(row[fuzzyKey]);
  }

  return "";
}

export function parseDateToObj(dateStr: string): Date | null {
  if (!dateStr) return null;
  // If DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const parts = dateStr.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (parts) {
    const d = parseInt(parts[1], 10);
    const m = parseInt(parts[2], 10) - 1;
    const y = parseInt(parts[3], 10);
    const dt = new Date(y, m, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  // Range like 01-15/10/2026: take the second date
  const rangeMatch = dateStr.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (rangeMatch) {
    const d = parseInt(rangeMatch[1], 10);
    const m = parseInt(rangeMatch[2], 10) - 1;
    const y = parseInt(rangeMatch[3], 10);
    const dt = new Date(y, m, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  // If ISO YYYY-MM-DD
  const iso = dateStr.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10) - 1;
    const d = parseInt(iso[3], 10);
    const dt = new Date(y, m, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

const FormatParam: React.FC<{ param: string }> = ({ param }) => {
  const map: Record<string, React.ReactNode> = {
    "Cl-1": <><span className="text-sm font-bold">Cl</span><sup className="text-[10px] font-bold">-</sup></>,
    "SO4-2": <><span className="text-sm font-bold">SO</span><sub className="text-[10px] font-bold">4</sub><sup className="text-[10px] font-bold">2-</sup></>,
    "NO3-1": <><span className="text-sm font-bold">NO</span><sub className="text-[10px] font-bold">3</sub><sup className="text-[10px] font-bold">-</sup></>,
    "Ca+2": <><span className="text-sm font-bold">Ca</span><sup className="text-[10px] font-bold">2+</sup></>,
    "Mg+2": <><span className="text-sm font-bold">Mg</span><sup className="text-[10px] font-bold">2+</sup></>,
    "F": <><span className="text-sm font-bold">F</span><sup className="text-[10px] font-bold">-</sup></>
  };
  return map[param] || <span className="text-sm font-bold">{param}</span>;
};

interface SimpleReportTableProps {
  data: any[];
  isDistrict: boolean;
  manualTotals: Record<string, number | "">;
  onManualTotalChange: (key: string, value: string) => void;
  fontFamily?: string;
  textColor?: string;
  fontSize?: number;
  headerBg?: string;
  headerTextColor?: string;
  borderColor?: string;
  zebraStriping?: boolean;
}

const SimpleReportTable: React.FC<SimpleReportTableProps> = ({ 
  data, 
  isDistrict, 
  manualTotals, 
  onManualTotalChange,
  fontFamily,
  textColor,
  fontSize,
  headerBg = '#f1f5f9',
  headerTextColor = '#0f172a',
  borderColor = '#334155',
  zebraStriping = false
}) => {
  const sumTotalAnalysed = data.reduce((sum, row) => sum + (manualTotals[row.key] !== undefined && manualTotals[row.key] !== '' ? parseInt(manualTotals[row.key] as string) || 0 : row.total), 0);
  const sumMarginal = data.reduce((sum, row) => sum + row.marginal, 0);
  const sumUnsafe = data.reduce((sum, row) => sum + row.unsafe, 0);
  const sumContaminated = sumMarginal + sumUnsafe;

  return (
    <div className="overflow-x-auto w-full mb-8">
      <table 
        className="w-full border-collapse text-center mb-6 bg-white shadow-xs"
        style={{
          fontFamily: fontFamily || 'inherit',
          color: textColor || '#1e293b',
          fontSize: fontSize ? `${fontSize}pt` : '9.5pt',
          border: `1px solid ${borderColor}`
        }}
      >
        <thead>
          <tr style={{ backgroundColor: headerBg, color: headerTextColor }}>
            <th rowSpan={2} className="p-2 font-bold text-center" style={{ border: `1px solid ${borderColor}` }}>Sl. No.</th>
            <th rowSpan={2} className="p-2 font-bold text-left" style={{ border: `1px solid ${borderColor}` }}>Name of {isDistrict ? 'District' : 'State/Union Territory'}</th>
            <th rowSpan={2} className="p-2 font-bold w-24 text-center" style={{ border: `1px solid ${borderColor}` }}>Total no.<br/>of samples<br/>analysed</th>
            <th colSpan={3} className="p-2 font-bold text-center" style={{ border: `1px solid ${borderColor}` }}>No. of samples contaminated</th>
            <th rowSpan={2} className="p-2 font-bold w-1/3 text-left" style={{ border: `1px solid ${borderColor}` }}>Parameters of contamination</th>
          </tr>
          <tr style={{ backgroundColor: headerBg, color: headerTextColor }}>
            <th className="p-2 font-bold w-24 text-center" style={{ border: `1px solid ${borderColor}` }}>Above<br/>Acceptable<br/>Limit</th>
            <th className="p-2 font-bold w-24 text-center" style={{ border: `1px solid ${borderColor}` }}>Above<br/>Permissible<br/>Limit</th>
            <th className="p-2 font-bold w-24 text-center" style={{ border: `1px solid ${borderColor}` }}>Total samples<br/>Contaminated</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={7} className="p-4 text-center" style={{ border: `1px solid ${borderColor}` }}>No data available</td>
            </tr>
          ) : (
            data.map((row, idx) => {
              const totalContaminated = row.marginal + row.unsafe;
              const allParams = Array.from(new Set([...row.unsafeList, ...row.marginalList])) as string[];
              const paramString = getFullParamNames(allParams);
              const rowBg = zebraStriping && idx % 2 === 1 ? '#f8fafc' : '#ffffff';
              
              return (
                <tr key={row.key || idx} style={{ backgroundColor: rowBg }}>
                  <td className="p-2 text-center" style={{ border: `1px solid ${borderColor}` }}>{idx + 1}</td>
                  <td className="p-2 text-left font-bold" style={{ border: `1px solid ${borderColor}` }}>{isDistrict ? row.district : row.state}</td>
                  <td className="p-2 font-bold text-center" style={{ border: `1px solid ${borderColor}` }}>
                    <input 
                      type="number" 
                      min="0"
                      value={manualTotals[row.key] !== undefined ? manualTotals[row.key] : row.total}
                      onChange={(e) => onManualTotalChange(row.key, e.target.value)}
                      className="w-full max-w-[60px] text-center bg-transparent border-b border-dashed border-gray-400 outline-none no-print"
                      title="Manually edit the Total Analyzed"
                    />
                    <span className="print-only hidden">{manualTotals[row.key] !== undefined ? manualTotals[row.key] : row.total}</span>
                  </td>
                  <td className="p-2 font-bold text-center" style={{ border: `1px solid ${borderColor}` }}>{row.marginal || 'Nil'}</td>
                  <td className="p-2 font-bold text-center" style={{ border: `1px solid ${borderColor}` }}>{row.unsafe || 'Nil'}</td>
                  <td className="p-2 font-bold text-center" style={{ border: `1px solid ${borderColor}` }}>{totalContaminated || 'Nil'}</td>
                  <td className="p-2 text-left" style={{ border: `1px solid ${borderColor}` }}>{paramString || 'Nil'}</td>
                </tr>
              );
            })
          )}
          {data.length > 0 && (
            <tr style={{ backgroundColor: '#f8fafc', fontWeight: 'bold' }}>
              <td colSpan={2} className="p-2 font-bold text-right" style={{ border: `1px solid ${borderColor}` }}>Total</td>
              <td className="p-2 font-bold text-center" style={{ border: `1px solid ${borderColor}` }}>{sumTotalAnalysed}</td>
              <td className="p-2 font-bold text-center" style={{ border: `1px solid ${borderColor}` }}>{sumMarginal || 'Nil'}</td>
              <td className="p-2 font-bold text-center" style={{ border: `1px solid ${borderColor}` }}>{sumUnsafe || 'Nil'}</td>
              <td className="p-2 font-bold text-center" style={{ border: `1px solid ${borderColor}` }}>{sumContaminated || 'Nil'}</td>
              <td className="p-2" style={{ border: `1px solid ${borderColor}` }}></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

interface SummaryTableProps {
  data: any[];
  isDistrict: boolean;
  manualTotals: Record<string, number | "">;
  onManualTotalChange: (key: string, value: string) => void;
  contaminationFont?: 'times' | 'calibri' | 'sans' | 'mono' | 'georgia' | 'arial' | 'garamond';
}

const SummaryTable: React.FC<SummaryTableProps> = ({ data, isDistrict, manualTotals, onManualTotalChange, contaminationFont = 'times' }) => {
  const sumTotalAnalysed = data.reduce((sum, row) => sum + (manualTotals[row.key] !== undefined && manualTotals[row.key] !== '' ? parseInt(manualTotals[row.key] as string) || 0 : row.total), 0);
  const sumMarginal = data.reduce((sum, row) => sum + row.marginal, 0);
  const sumUnsafe = data.reduce((sum, row) => sum + row.unsafe, 0);
  const sumContaminated = sumMarginal + sumUnsafe;

  return (
    <div className="w-full max-w-full overflow-x-auto p-2 custom-scrollbar bg-slate-50">
      <table className="w-full text-center border-separate border-spacing-0 shadow-sm rounded-lg overflow-hidden bg-white ring-1 ring-gray-200 text-xs min-w-[580px]">
        <thead>
          <tr className="bg-gradient-to-b from-indigo-800 to-blue-900 text-white shadow-[inset_0_1px_2px_rgba(255,255,255,0.3)]">
            <th rowSpan={2} className="p-1.5 border-b border-r border-blue-950 font-extrabold text-center w-10">Sl. No.</th>
            <th rowSpan={2} className="p-1.5 border-b border-r border-blue-950 text-left font-extrabold whitespace-nowrap">Name of {isDistrict ? 'District' : 'State/UT'}</th>
            <th rowSpan={2} className="p-1.5 border-b border-r border-blue-950 font-extrabold w-20 leading-tight">Total samples analysed</th>
            <th colSpan={3} className="p-1.5 border-b border-r border-blue-950 font-extrabold bg-gradient-to-b from-indigo-700 to-blue-800 tracking-wide text-xs">No. of samples contaminated</th>
            <th rowSpan={2} className="p-1.5 border-b border-blue-950 text-left font-extrabold min-w-[180px]">Parameters of contamination</th>
          </tr>
          <tr className="text-white">
            <th className="p-1 border-b border-r border-blue-950 text-[10px] w-20 bg-gradient-to-b from-orange-500 to-orange-600 font-bold leading-tight">Above Acceptable</th>
            <th className="p-1 border-b border-r border-blue-950 text-[10px] w-20 bg-gradient-to-b from-red-600 to-red-700 font-bold leading-tight">Above Permissible</th>
            <th className="p-1 border-b border-r border-blue-950 text-[10px] w-20 bg-gradient-to-b from-purple-600 to-purple-700 font-bold leading-tight">Total Contaminated</th>
          </tr>
        </thead>
        <tbody className="bg-slate-50">
          {data.length === 0 ? (
            <tr>
              <td colSpan={7} className="p-8 text-center text-gray-500 font-bold bg-white border-b border-gray-300 text-xs">
                No compliance dataset is loaded or mapped yet.
              </td>
            </tr>
          ) : (
            data.map((row, idx) => {
              const totalContaminated = row.marginal + row.unsafe;
              return (
                <tr key={row.key || idx} className="hover:bg-blue-50/30 transition-colors relative text-xs">
                  <td className="p-1.5 border-b border-r border-gray-200 font-semibold text-gray-600 bg-gray-50/50">{idx + 1}</td>
                  <td className="p-1.5 border-b border-r border-gray-200 text-left font-bold text-gray-800 bg-white">
                    <div className="flex flex-col gap-0.5 items-start">
                      <span className="text-xs">{isDistrict ? row.district : row.state}</span>
                      {row.hasHeavyMetals && (
                        <span className="px-1 py-0.2 bg-red-600 text-white text-[8px] font-bold rounded uppercase tracking-wider">
                          Heavy Metals
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-1.5 border-b border-r border-gray-200 font-bold text-blue-900 bg-blue-50/40 text-xs">
                    <input 
                      type="number" 
                      min="0"
                      value={manualTotals[row.key] !== undefined ? manualTotals[row.key] : row.total}
                      onChange={(e) => onManualTotalChange(row.key, e.target.value)}
                      className="w-full max-w-[50px] text-center bg-white border border-blue-200 focus:border-blue-500 rounded px-1 py-0.5 outline-none font-bold text-xs no-print"
                      title="Manually edit the Total Analyzed"
                    />
                    <span className="print-only hidden text-xs">{manualTotals[row.key] !== undefined ? manualTotals[row.key] : row.total}</span>
                  </td>
                  <td className="p-1.5 border-b border-r border-gray-200 font-bold text-orange-700 bg-orange-50/30 text-xs">{row.marginal}</td>
                  <td className="p-1.5 border-b border-r border-gray-200 font-bold text-red-700 bg-red-50/30 text-xs">{row.unsafe}</td>
                  <td className="p-1.5 border-b border-r border-gray-200 font-bold text-purple-800 bg-purple-50/30 text-xs">{totalContaminated}</td>
                  <td 
                    className="p-1.5 border-b border-gray-200 text-left bg-white text-xs"
                    style={{
                      fontFamily: 
                        contaminationFont === 'times' ? "'Times New Roman', Times, serif" :
                        contaminationFont === 'calibri' ? "Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif" :
                        contaminationFont === 'mono' ? "'JetBrains Mono', monospace" : "Inter, system-ui, sans-serif",
                    }}
                  >
                    <div className="flex flex-wrap gap-1">
                      {row.unsafeList.map((p: string) => (
                        <span key={p} className="px-1.5 py-0.5 bg-red-50 border border-red-200 text-red-900 rounded text-[10px] flex items-center gap-1 font-semibold">
                          <FormatParam param={p} />
                          <span className="bg-red-600 text-white text-[8px] font-black px-1 rounded uppercase">Permissible</span>
                        </span>
                      ))}
                      {row.marginalList.map((p: string) => (
                        <span key={p} className="px-1.5 py-0.5 bg-orange-50 border border-orange-200 text-orange-900 rounded text-[10px] flex items-center gap-1 font-semibold">
                          <FormatParam param={p} />
                          <span className="bg-orange-500 text-white text-[8px] font-black px-1 rounded uppercase">Acceptable</span>
                        </span>
                      ))}
                      {row.unsafeList.length === 0 && row.marginalList.length === 0 && (
                        <span className="text-emerald-600 font-semibold text-[11px] flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                          Nil
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
          
          {/* TOTAL ROW */}
          {data.length > 0 && (
            <tr className="bg-gradient-to-b from-indigo-800 to-blue-900 text-white z-20 relative font-bold text-xs">
              <td colSpan={2} className="p-1.5 border-t border-r border-blue-950 font-extrabold text-right uppercase tracking-wider text-xs">Total</td>
              <td className="p-1.5 border-t border-r border-blue-950 font-black text-xs">{sumTotalAnalysed}</td>
              <td className="p-1.5 border-t border-r border-blue-950 font-black text-orange-300 text-xs">{sumMarginal}</td>
              <td className="p-1.5 border-t border-r border-blue-950 font-black text-red-300 text-xs">{sumUnsafe}</td>
              <td className="p-1.5 border-t border-r border-blue-950 font-black text-purple-200 text-xs">{sumContaminated}</td>
              <td className="p-1.5 border-t border-blue-950"></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const MapContainer: React.FC<{ data: any[]; limits: any; geoJsonData: any; activeSubTab?: string }> = ({ data, limits, geoJsonData, activeSubTab }) => {
  const mapRef = useRef<any>(null);
  const markersLayer = useRef<any>(null);
  const geoJsonLayerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ResizeObserver + activeSubTab invalidateSize trigger for flaw-free canvas rendering
  useEffect(() => {
    const container = document.getElementById('fortnightly-leaflet-map');
    if (!container) return;

    const triggerInvalidate = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    };

    // Immediate and delayed invalidate calls to handle CSS tab transitions
    const timer = setTimeout(triggerInvalidate, 100);
    const animFrame = requestAnimationFrame(triggerInvalidate);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        triggerInvalidate();
      });
      resizeObserver.observe(container);
    }

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animFrame);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [activeSubTab]);

  useEffect(() => {
    const L = (window as any).L;
    if (!L) return;

    const container = document.getElementById('fortnightly-leaflet-map');
    if (!container) return;

    if (!mapRef.current) {
      if ((container as any)._leaflet_id) {
        try {
          (container as any)._leaflet_map?.remove?.();
        } catch {}
        delete (container as any)._leaflet_id;
      }
      container.innerHTML = "";
      const map = L.map(container, { preferCanvas: true }).setView([20.5937, 78.9629], 5);
      (container as any)._leaflet_map = map;
      mapRef.current = map;
      
      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      });

      const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
      });

      const topoLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
      });

      const terrainLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
      });

      osmLayer.addTo(mapRef.current);

      const baseMaps = {
        "OpenStreetMap": osmLayer,
        "Satellite (Esri)": satelliteLayer,
        "Topographic": topoLayer,
        "Terrain (Esri)": terrainLayer
      };

      L.control.layers(baseMaps, null, { position: 'topright' }).addTo(mapRef.current);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapRef.current);
      
      geoJsonLayerRef.current = L.layerGroup().addTo(mapRef.current);
      markersLayer.current = L.layerGroup().addTo(mapRef.current);
    }

    markersLayer.current.clearLayers();

    if (data.length > 0) {
      const bounds: any[] = [];
      data.forEach(row => {
        const lat = parseFloat(row.Latitude);
        const lng = parseFloat(row.Longitude);
        if (isNaN(lat) || isNaN(lng)) return;

        let overallStatus = 'safe';
        let paramsHtml = '';
        let contaminatedParamsCount = 0;

        Object.keys(limits).forEach(param => {
          if (row[param] !== undefined && row[param] !== null && row[param] !== '') {
            const val = parseFloat(row[param]);
            let paramStatus = 'safe';
            let paramColor = '#10b981';
            
            if (!isNaN(val)) {
              const limit = limits[param];
              if (limit.isStrictRange) {
                if (val < limit.acc || val > limit.perm) { 
                  paramStatus = 'unsafe'; 
                  paramColor = '#ef4444';
                  overallStatus = 'unsafe';
                }
              } else {
                if (val > limit.perm) { 
                  paramStatus = 'unsafe'; 
                  paramColor = '#ef4444';
                  overallStatus = 'unsafe';
                } else if (val > limit.acc) { 
                  paramStatus = 'marginal'; 
                  paramColor = '#f97316';
                  if (overallStatus !== 'unsafe') overallStatus = 'marginal';
                }
              }

              if (paramStatus !== 'safe') {
                contaminatedParamsCount++;
              }
            }

            paramsHtml += `
              <div class="flex justify-between items-center border-b border-gray-100 py-1.5 last:border-0">
                <span class="font-medium text-gray-600 text-xs w-2/3 pr-2 truncate" title="${param}">${param}</span>
                <span class="text-xs text-right w-1/3" style="color: ${paramColor}; font-weight: ${paramStatus !== 'safe' ? '900' : '500'}">
                  ${row[param]}
                </span>
              </div>
            `;
          }
        });

        const markerColor = overallStatus === 'unsafe' ? '#ef4444' : overallStatus === 'marginal' ? '#f97316' : '#10b981';
        const labelBg = overallStatus === 'unsafe' ? 'bg-red-500' : overallStatus === 'marginal' ? 'bg-orange-500' : 'bg-emerald-500';
        
        let contaminationTypeLabel = 'No Contamination';
        let contaminationTypeColor = 'text-emerald-600';
        if (contaminatedParamsCount === 1) {
          contaminationTypeLabel = 'Single-Parameter Contamination';
          contaminationTypeColor = 'text-orange-600';
        } else if (contaminatedParamsCount > 1) {
          contaminationTypeLabel = 'Multi-Parameter Contamination';
          contaminationTypeColor = 'text-red-600';
        }

        const marker = L.circleMarker([lat, lng], {
          radius: 8,
          fillColor: markerColor,
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9
        });

        const popupContent = `
          <div class="p-4 w-full font-sans">
            <h3 class="text-lg font-bold text-gray-800 leading-tight">${row['Village/Town'] || 'Unknown Location'}</h3>
            <p class="text-[11px] text-gray-500 mt-1 uppercase tracking-wide">
              ${[row['Block'], row['District'], row['State']].filter(Boolean).join(', ')}
            </p>
            
            <div class="mt-3 mb-4 flex flex-col gap-1.5">
              <div>
                <span class="px-2 py-1 text-[10px] font-bold rounded text-white ${labelBg}">
                  OVERALL STATUS: ${overallStatus.toUpperCase()}
                </span>
              </div>
              <div class="text-[11px] font-bold ${contaminationTypeColor}">
                ${contaminationTypeLabel}
              </div>
            </div>
            
            <div class="text-[11px] text-gray-600 mb-3 bg-gray-50 p-2 rounded border border-gray-100">
              <div class="mb-1"><b>Structure:</b> ${row['Sample Collection Structure'] || 'N/A'}</div>
              <div class="mb-1"><b>Depth:</b> ${row['Depth of the Structure from Ground Level in Meters'] ? row['Depth of the Structure from Ground Level in Meters'] + ' m' : 'N/A'}</div>
              <div><b>Date Collected:</b> ${row['Sample Collection Date'] || 'N/A'}</div>
            </div>
            
            <h4 class="text-xs font-bold text-gray-800 border-b pb-1 mb-2">Detailed Parameters:</h4>
            <div class="max-h-48 overflow-y-auto custom-scrollbar pr-1 bg-white">
              ${paramsHtml || '<div class="text-gray-400 italic text-xs py-2">No parameter data available</div>'}
            </div>
          </div>
        `;

        marker.bindPopup(popupContent);
        markersLayer.current.addLayer(marker);
        bounds.push([lat, lng]);
      });

      if (bounds.length > 0 && mapRef.current) {
        try {
          mapRef.current.fitBounds(bounds, { padding: [50, 50], animate: false });
        } catch {}
      }
    }

    return () => {
      // Map cleanup handled on overall component unmount
    };
  }, [data, limits]);

  // Overall unmount cleanup for Fortnightly leaflet map
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {}
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (mapRef.current && geoJsonLayerRef.current && L) {
      geoJsonLayerRef.current.clearLayers();
      if (geoJsonData) {
        const layer = L.geoJSON(geoJsonData, {
          style: {
            color: '#3b82f6',
            weight: 2,
            fillOpacity: 0.1,
            opacity: 0.8
          },
          onEachFeature: (feature: any, layer: any) => {
            if (feature.properties) {
              let propsHtml = '<h4 class="font-bold text-sm mb-2 border-b pb-1 text-blue-800">Boundary Properties</h4>';
              propsHtml += '<div class="max-h-32 overflow-y-auto custom-scrollbar text-xs">';
              Object.entries(feature.properties).forEach(([k, v]) => {
                propsHtml += `<div class="mb-1"><b>${k}:</b> ${v}</div>`;
              });
              propsHtml += '</div>';
              layer.bindPopup(`<div class="p-2 w-48 font-sans">${propsHtml}</div>`);
            }
          }
        });
        geoJsonLayerRef.current.addLayer(layer);
        mapRef.current.fitBounds(layer.getBounds());
      }
    }
  }, [geoJsonData]);

  return <div id="fortnightly-leaflet-map" className="h-[600px] w-full rounded-xl z-10 shadow-inner border border-gray-200"></div>;
};

const FortnightlyAlertsView: React.FC<FortnightlyAlertsViewProps> = ({
  rawData: globalRawData,
  headers: globalHeaders,
  headerMap: globalHeaderMap,
  selectedState: globalSelectedState
}) => {
  const [internalRawData, setInternalRawData] = useState<any[]>([]);
  const [limits, setLimits] = useState<Record<string, { acc: number; perm: number; isStrictRange?: boolean }>>(DEFAULT_LIMITS);
  const [activeSubTab, setActiveSubTab] = useState('report');
  
  // Interactive Pamphlet Customization States
  const [themeColor, setThemeColor] = useState<'navy' | 'green' | 'crimson' | 'charcoal'>('navy');
  const [layoutStyle, setLayoutStyle] = useState<'standard' | 'pamphlet'>('pamphlet');
  const [riskLevel, setRiskLevel] = useState<'high' | 'medium' | 'low'>('high');
  const [customRemarks, setCustomRemarks] = useState<string>("");
  const [customTitle, setCustomTitle] = useState<string>("Ground Water Quality Alert");
  const [contaminationFont, setContaminationFont] = useState<'times' | 'calibri' | 'georgia' | 'arial' | 'garamond' | 'mono' | 'sans'>('times');
  const [headingFontSize, setHeadingFontSize] = useState<number>(13);
  const [bodyFontSize, setBodyFontSize] = useState<number>(10);
  const [tableFontSize, setTableFontSize] = useState<number>(8.5);
  const [lineSpacing, setLineSpacing] = useState<'snug' | 'normal' | 'relaxed'>('snug');
  const [textAlignMode, setTextAlignMode] = useState<'justify' | 'left'>('justify');
  const [boldBreaches, setBoldBreaches] = useState<boolean>(true);

  // Document Text Customization & Change Features
  const [memoRefNo, setMemoRefNo] = useState<string>("CGWB/WQ-ALERT/2026/01");
  const [signatoryName, setSignatoryName] = useState<string>("Regional Director / Authorized Signatory");
  const [signatoryDesignation, setSignatoryDesignation] = useState<string>("Central Ground Water Board, Ministry of Jal Shakti");
  const [customKeyFindings, setCustomKeyFindings] = useState<string>("");
  const [exportDocFormat, setExportDocFormat] = useState<'docx' | 'doc'>('docx');
  const [isExportingWord, setIsExportingWord] = useState<boolean>(false);

  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const [uploadError, setUploadError] = useState('');

  // Mapping states
  const [uploadingFile, setUploadingFile] = useState<any>(null);
  const [uploadedColumns, setUploadedColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [showMappingModal, setShowMappingModal] = useState(false);

  // Document Config
  const [fromDate, setFromDate] = useState(new Date(new Date().setDate(new Date().getDate() - 14)).toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualTotals, setManualTotals] = useState<Record<string, number | "">>({});

  // Alert Parameters & Excel Configuration
  const [selectedAlertParams, setSelectedAlertParams] = useState<string[]>(() =>
    ALERT_PARAM_DEFINITIONS.map(p => p.key)
  );
  const [isParamSelectorOpen, setIsParamSelectorOpen] = useState<boolean>(true);
  const [alertIssuingOffice, setAlertIssuingOffice] = useState<string>("CGWB, CHQ, Faridabad");
  const [selectedIssuingOffice, setSelectedIssuingOffice] = useState<string>("CGWB, CHQ, Faridabad");
  const [excelOnlyExceedances, setExcelOnlyExceedances] = useState<boolean>(true);
  const [excelOnlyAlertSamples, setExcelOnlyAlertSamples] = useState<boolean>(true);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [footerPageText, setFooterPageText] = useState<string>("1 of 5");
  const [showSheetFooter, setShowSheetFooter] = useState<boolean>(true);
  const [activeDocPage, setActiveDocPage] = useState<'all' | 1 | 2 | 3 | 4 | 5>('all');

  // Publication Grade Document Formatting States
  const [docTextColor, setDocTextColor] = useState<string>('#1e293b');
  const [docHeadingColor, setDocHeadingColor] = useState<string>('#0f172a');
  const [docLabelColor, setDocLabelColor] = useState<string>('#0f172a');
  const [enableParaIIPageBreak, setEnableParaIIPageBreak] = useState<boolean>(false);
  const [showDocToolbar, setShowDocToolbar] = useState<boolean>(true);
  const [studioActiveTab, setStudioActiveTab] = useState<'margins' | 'logo' | 'headerfooter' | 'dates' | 'typography' | 'tables' | 'pages'>('margins');

  // 1. Page Formatting (Margins)
  const [pageMarginTop, setPageMarginTop] = useState<number>(0.75);
  const [pageMarginBottom, setPageMarginBottom] = useState<number>(0.75);
  const [pageMarginLeft, setPageMarginLeft] = useState<number>(0.75);
  const [pageMarginRight, setPageMarginRight] = useState<number>(0.75);

  // 2. CGWB / Custom Logo Insertion & Mouse Replacement
  const [logoPlacement, setLogoPlacement] = useState<'none' | 'header-left' | 'header-center' | 'header-right' | 'title-top' | 'title-left' | 'footer-left' | 'footer-center' | 'footer-right'>('header-left');
  const [logoImageSrc, setLogoImageSrc] = useState<string>(DEFAULT_CGWB_PNG_BASE64);
  const [logoHeight, setLogoHeight] = useState<number>(40);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setLogoImageSrc(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const resetToDefaultCgwbLogo = () => {
    setLogoImageSrc(DEFAULT_CGWB_PNG_BASE64);
  };

  // 3. Header & Footer text change options
  const [showHeader, setShowHeader] = useState<boolean>(true);
  const [headerText, setHeaderText] = useState<string>("Central Ground Water Board • Water Quality Alert Document");
  const [headerPosition, setHeaderPosition] = useState<'left' | 'center' | 'right'>('left');
  const [showFooter, setShowFooter] = useState<boolean>(true);
  const [footerText, setFooterText] = useState<string>("Ground Water Quality Alert Document • Publication Copy");
  const [footerPosition, setFooterPosition] = useState<'left' | 'center' | 'right'>('left');

  // 4. Dates & Metadata title customization
  const [updatedDate, setUpdatedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showUpdatedDate, setShowUpdatedDate] = useState<boolean>(false);
  const [documentTitleText, setDocumentTitleText] = useState<string>("Ground Water Quality Alert");
  const [documentSubTitleText, setDocumentSubTitleText] = useState<string>("");
  const [locationLabel, setLocationLabel] = useState<string>("Location");
  const [periodLabel, setPeriodLabel] = useState<string>("For the period");
  const [issueDateLabel, setIssueDateLabel] = useState<string>("Issue Date");
  const [issuingOfficeLabel, setIssuingOfficeLabel] = useState<string>("Issuing Office");
  const [updatedDateLabel, setUpdatedDateLabel] = useState<string>("Last Updated");
  const [titleTransform, setTitleTransform] = useState<'uppercase' | 'capitalize' | 'none'>('uppercase');
  const [titleFontWeight, setTitleFontWeight] = useState<'bold' | 'black' | 'normal'>('bold');
  const [titleUnderline, setTitleUnderline] = useState<boolean>(true);

  // 5. Table Header row color fill and text color change options
  const [tableHeaderBg, setTableHeaderBg] = useState<string>('#f1f5f9');
  const [tableHeaderTextColor, setTableHeaderTextColor] = useState<string>('#0f172a');
  const [tableBorderColor, setTableBorderColor] = useState<string>('#334155');
  const [tableZebraStriping, setTableZebraStriping] = useState<boolean>(false);

  // 6. Customisable Page No. facility
  const [pageNumberFormat, setPageNumberFormat] = useState<'page_x_of_y' | 'page_x' | 'x_of_y' | 'dash_x_dash' | 'none'>('page_x_of_y');
  const [pageNumberPosition, setPageNumberPosition] = useState<'footer-right' | 'footer-center' | 'footer-left' | 'header-right'>('footer-right');

  const getDocFontFamilyCss = (font: string) => {
    switch (font) {
      case 'times':
        return "'Times New Roman', Times, 'Cambria', serif";
      case 'calibri':
        return "Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif";
      case 'georgia':
        return "Georgia, 'Palatino Linotype', 'Book Antiqua', Palatino, serif";
      case 'arial':
        return "Arial, 'Helvetica Neue', Helvetica, sans-serif";
      case 'garamond':
        return "Garamond, 'Baskerville', 'Hoefler Text', serif";
      case 'mono':
        return "'JetBrains Mono', 'Courier New', Courier, monospace";
      case 'sans':
      default:
        return "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    }
  };

  // Standardize loaded data
  const processedRawData = useMemo(() => {
    // If user has uploaded specific internal data, use it
    if (internalRawData.length > 0) {
      return internalRawData.map(row => {
        const stdRow = { ...row };
        stdRow["Sample Collection Date"] = stdRow["Sample Collection Date"] 
          ? formatSheetDate(stdRow["Sample Collection Date"]) 
          : extractDateFromRow(row, "collection");
        stdRow["Sample Analysis Date"] = stdRow["Sample Analysis Date"] 
          ? formatSheetDate(stdRow["Sample Analysis Date"]) 
          : extractDateFromRow(row, "analysis");
        return stdRow;
      });
    }

    // Otherwise, convert global raw data to standard format
    if (!globalRawData || globalRawData.length === 0) {
      return [];
    }

    return globalRawData.map(row => {
      const stdRow: any = { ...row };
      
      // Resolve standard location columns
      stdRow["State"] = row[globalHeaders.state] || row["State"] || "";
      stdRow["District"] = row[globalHeaders.district] || row["District"] || "";
      stdRow["Block"] = row[globalHeaders.block] || row["Block"] || "";
      stdRow["Village/Town"] = row[globalHeaders.location] || row["Village/Town"] || row["Village"] || row["Location"] || "";
      stdRow["Latitude"] = parseFloat(row[globalHeaders.latitude] || row["Latitude"]);
      stdRow["Longitude"] = parseFloat(row[globalHeaders.longitude] || row["Longitude"]);
      
      stdRow["Sample Collection Structure"] = row["Sample Collection Structure"] || row["Structure"] || "Tubewell";
      stdRow["Depth of the Structure from Ground Level in Meters"] = row["Depth of the Structure from Ground Level in Meters"] || row["Depth"] || "";
      
      // Strictly extract collection date and analysis date from the uploaded sheet
      stdRow["Sample Collection Date"] = extractDateFromRow(row, "collection");
      stdRow["Sample Analysis Date"] = extractDateFromRow(row, "analysis");

      // Comprehensive mapping for all parameters including all 16 heavy metals with BIS limits
      const paramDefinitionsMap: Record<string, { configKey: string; aliases: string[]; unitFactor?: (val: number, headerName: string) => number }> = {
        "pH": { configKey: "pH", aliases: ["ph", "ph level", "hydrogen ion"] },
        "EC (µS/cm at 25 C)": { configKey: "EC", aliases: ["ec", "electrical conductivity", "cond", "conductivity"] },
        "Cl-1 (mg/L)": { configKey: "Cl", aliases: ["cl", "cl-1", "cl-", "chloride"] },
        "SO4-2 (mg/L)": { configKey: "SO4", aliases: ["so4", "so4-2", "so4--", "sulphate", "sulfate"] },
        "NO3-1 (mg/L)": { configKey: "NO3", aliases: ["no3", "no3-1", "no3-", "nitrate"] },
        "F": { configKey: "F", aliases: ["f", "f-", "f-1", "fluoride"] },
        "Ca+2 (mg/L)": { configKey: "Ca", aliases: ["ca", "ca+2", "ca++", "calcium"] },
        "Mg+2 (mg/L)": { configKey: "Mg", aliases: ["mg", "mg+2", "mg++", "magnesium"] },
        "TH *as CaCO3 (mg/L)": { configKey: "TH", aliases: ["th", "total hardness", "hardness", "th as caco3", "total hardness as caco3"] },
        // Heavy metals with BIS Limits
        "Cr (mg/L)": { configKey: "Cr", aliases: ["cr", "chromium", "total chromium", "total cr", "cr (mg/l)", "cr(mg/l)"] },
        "Mn (mg/L)": { configKey: "Mn", aliases: ["mn", "manganese", "total manganese", "total mn", "mn (mg/l)", "mn(mg/l)"] },
        "Fe (mg/L)": { configKey: "Fe", aliases: ["fe", "iron", "total iron", "total fe", "fe (mg/l)", "fe(mg/l)"] },
        "Ni (mg/L)": { configKey: "Ni", aliases: ["ni", "nickel", "total nickel", "ni (mg/l)", "ni(mg/l)"] },
        "Cu (mg/L)": { configKey: "Cu", aliases: ["cu", "copper", "total copper", "cu (mg/l)", "cu(mg/l)"] },
        "Zn (mg/L)": { configKey: "Zn", aliases: ["zn", "zinc", "total zinc", "zn (mg/l)", "zn(mg/l)"] },
        "As (µg/L)": { 
          configKey: "As", 
          aliases: ["as", "arsenic", "total arsenic", "as (µg/l)", "as (ug/l)", "as (ppb)"],
          unitFactor: (val, h) => (/mg\/l/i.test(h) && val < 0.5 ? val * 1000 : val)
        },
        "Se (µg/L)": { 
          configKey: "Se", 
          aliases: ["se", "selenium", "total selenium", "se (µg/l)", "se (ug/l)", "se (ppb)"],
          unitFactor: (val, h) => (/mg\/l/i.test(h) && val < 0.5 ? val * 1000 : val)
        },
        "Cd (µg/L)": { 
          configKey: "Cd", 
          aliases: ["cd", "cadmium", "total cadmium", "cd (µg/l)", "cd (ug/l)", "cd (ppb)"],
          unitFactor: (val, h) => (/mg\/l/i.test(h) && val < 0.5 ? val * 1000 : val)
        },
        "Pb (µg/L)": { 
          configKey: "Pb", 
          aliases: ["pb", "lead", "total lead", "pb (µg/l)", "pb (ug/l)", "pb (ppb)"],
          unitFactor: (val, h) => (/mg\/l/i.test(h) && val < 0.5 ? val * 1000 : val)
        },
        "U (µg/L)": { 
          configKey: "U", 
          aliases: ["u", "uranium", "total uranium", "u (µg/l)", "u (ug/l)", "u (ppb)"],
          unitFactor: (val, h) => (/mg\/l/i.test(h) && val < 0.5 ? val * 1000 : val)
        },
        "Al (mg/L)": { configKey: "Al", aliases: ["al", "aluminium", "aluminum", "alluminium", "al (mg/l)", "al(mg/l)"] },
        "Ba (mg/L)": { configKey: "Ba", aliases: ["ba", "barium", "total barium", "ba (mg/l)", "ba(mg/l)"] },
        "B (mg/L)": { configKey: "B", aliases: ["b", "boron", "boran", "total boron", "b (mg/l)", "b(mg/l)"] },
        "Mo (mg/L)": { configKey: "Mo", aliases: ["mo", "molybdenum", "molybdnum", "mo (mg/l)", "mo(mg/l)"] },
        "Hg (mg/L)": { 
          configKey: "Hg", 
          aliases: ["hg", "mercury", "total mercury", "hg (mg/l)", "hg(mg/l)"],
          unitFactor: (val, h) => (/µg|ug|ppb/i.test(h) ? val / 1000 : val)
        }
      };

      const rowKeys = Object.keys(row);

      Object.entries(paramDefinitionsMap).forEach(([stdHeader, def]) => {
        let matchedValue: any = undefined;
        let matchedHeaderName = "";

        // 1. Check global header map
        const fileCol = Object.keys(globalHeaderMap).find(k => globalHeaderMap[k] === def.configKey);
        if (fileCol && row[fileCol] !== undefined && row[fileCol] !== "") {
          matchedValue = row[fileCol];
          matchedHeaderName = fileCol;
        } else if (row[def.configKey] !== undefined && row[def.configKey] !== "") {
          matchedValue = row[def.configKey];
          matchedHeaderName = def.configKey;
        } else if (row[stdHeader] !== undefined && row[stdHeader] !== "") {
          matchedValue = row[stdHeader];
          matchedHeaderName = stdHeader;
        } else {
          // 2. Check aliases against row keys
          for (const alias of def.aliases) {
            const aliasClean = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
            const foundKey = rowKeys.find(rk => {
              const rkClean = rk.toLowerCase().replace(/[^a-z0-9]/g, '');
              return rkClean === aliasClean || (rkClean.startsWith(aliasClean) && rkClean.length <= aliasClean.length + 6);
            });
            if (foundKey && row[foundKey] !== undefined && row[foundKey] !== "") {
              matchedValue = row[foundKey];
              matchedHeaderName = foundKey;
              break;
            }
          }
        }

        if (matchedValue !== undefined && matchedValue !== "") {
          const num = typeof matchedValue === "number" ? matchedValue : parseFloat(String(matchedValue).replace(/[^0-9.-]/g, ""));
          if (!isNaN(num)) {
            const finalVal = def.unitFactor ? def.unitFactor(num, matchedHeaderName) : num;
            stdRow[stdHeader] = finalVal;
          } else {
            stdRow[stdHeader] = matchedValue;
          }
        }
      });

      return stdRow;
    });
  }, [globalRawData, internalRawData, globalHeaders, globalHeaderMap]);

  // Synchronize alert dates (Period FROM / TO and Date of Issuance) strictly with the uploaded sheet's dates
  useEffect(() => {
    if (!processedRawData || processedRawData.length === 0) return;

    let minDateObj: Date | null = null;
    let maxDateObj: Date | null = null;

    processedRawData.forEach(row => {
      const collStr = row["Sample Collection Date"];
      const analStr = row["Sample Analysis Date"];

      if (collStr) {
        const dt = parseDateToObj(collStr);
        if (dt) {
          if (!minDateObj || dt.getTime() < minDateObj.getTime()) minDateObj = dt;
          if (!maxDateObj || dt.getTime() > maxDateObj.getTime()) maxDateObj = dt;
        }
      }
      if (analStr) {
        const dt = parseDateToObj(analStr);
        if (dt) {
          if (!minDateObj || dt.getTime() < minDateObj.getTime()) minDateObj = dt;
          if (!maxDateObj || dt.getTime() > maxDateObj.getTime()) maxDateObj = dt;
        }
      }
    });

    if (minDateObj && maxDateObj) {
      const toIsoDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      setFromDate(toIsoDate(minDateObj));
      setToDate(toIsoDate(maxDateObj));
      setIssueDate(toIsoDate(maxDateObj));
    }
  }, [processedRawData]);

  const handleManualTotalChange = (key: string, value: string) => {
    setManualTotals(prev => ({
      ...prev,
      [key]: value === '' ? '' : parseInt(value, 10)
    }));
  };

  const { summaryData, districtSummaryData } = useMemo(() => {
    if (!processedRawData || processedRawData.length === 0) return { summaryData: [], districtSummaryData: [] };
    
    const sSummary: Record<string, any> = {};
    const dSummary: Record<string, any> = {};
    const limitEntries = (Object.entries(limits) as [string, { acc: number; perm: number; isStrictRange?: boolean }][])
      .filter(([param]) => selectedAlertParams.includes(param));

    for (let i = 0; i < processedRawData.length; i++) {
      const row = processedRawData[i];
      const state = row["State"] || "Unknown";
      const district = row["District"];
      
      if (!sSummary[state]) {
        sSummary[state] = { state, total: 0, safe: 0, marginal: 0, unsafe: 0, marginalParams: new Set<string>(), unsafeParams: new Set<string>() };
      }
      sSummary[state].total++;

      let dKey = null;
      if (district) {
        dKey = `${state}-${district}`;
        if (!dSummary[dKey]) {
          dSummary[dKey] = { state, district, total: 0, safe: 0, marginal: 0, unsafe: 0, marginalParams: new Set<string>(), unsafeParams: new Set<string>() };
        }
        dSummary[dKey].total++;
      }

      let rowIsUnsafe = false;
      let rowIsMarginal = false;

      for (let j = 0; j < limitEntries.length; j++) {
        const [param, limit] = limitEntries[j];
        const valStr = row[param];
        
        if (valStr == null || valStr === '') continue;
        
        const val = parseFloat(valStr);
        if (isNaN(val)) continue;

        const shortName = param.split(' ')[0];

        if (limit.isStrictRange) {
          if (val < limit.acc || val > limit.perm) {
            rowIsUnsafe = true;
            sSummary[state].unsafeParams.add(shortName);
            if (dKey) dSummary[dKey].unsafeParams.add(shortName);
          }
        } else {
          if (val > limit.perm) {
            rowIsUnsafe = true;
            sSummary[state].unsafeParams.add(shortName);
            if (dKey) dSummary[dKey].unsafeParams.add(shortName);
          } else if (val > limit.acc) {
            rowIsMarginal = true;
            sSummary[state].marginalParams.add(shortName);
            if (dKey) dSummary[dKey].marginalParams.add(shortName);
          }
        }
      }

      if (rowIsUnsafe) {
        sSummary[state].unsafe++;
        if (dKey) dSummary[dKey].unsafe++;
      } else if (rowIsMarginal) {
        sSummary[state].marginal++;
        if (dKey) dSummary[dKey].marginal++;
      } else {
        sSummary[state].safe++;
        if (dKey) dSummary[dKey].safe++;
      }
    }

    const formatSummary = (summaryObj: Record<string, any>, sortFn: (a: any, b: any) => number) => 
      Object.values(summaryObj).map(s => {
        const combined = new Set([...Array.from(s.unsafeParams as Set<string>), ...Array.from(s.marginalParams as Set<string>)]);
        let hasHeavyMetals = false;
        for (const p of Array.from(combined)) {
          if (HEAVY_METALS.includes(p)) {
            hasHeavyMetals = true;
            break;
          }
        }
        return {
          ...s,
          key: s.district ? `${s.state}-${s.district}` : s.state,
          combinedCount: combined.size,
          hasHeavyMetals,
          unsafeList: Array.from(s.unsafeParams as Set<string>).sort(),
          marginalList: Array.from(s.marginalParams as Set<string>).filter(p => !s.unsafeParams.has(p)).sort()
        };
      }).sort(sortFn);

    return {
      summaryData: formatSummary(sSummary, (a, b) => a.state.localeCompare(b.state)),
      districtSummaryData: formatSummary(dSummary, (a, b) => a.state.localeCompare(b.state) || a.district.localeCompare(b.district))
    };
  }, [processedRawData, limits, selectedAlertParams]);

  // Compute live dataset exceedance statistics for each parameter
  const paramExceedanceStats = useMemo(() => {
    const stats: Record<string, { unsafe: number; marginal: number; totalTested: number }> = {};
    ALERT_PARAM_DEFINITIONS.forEach(p => {
      stats[p.key] = { unsafe: 0, marginal: 0, totalTested: 0 };
    });

    if (!processedRawData || processedRawData.length === 0) return stats;

    for (let i = 0; i < processedRawData.length; i++) {
      const row = processedRawData[i];
      for (let j = 0; j < ALERT_PARAM_DEFINITIONS.length; j++) {
        const p = ALERT_PARAM_DEFINITIONS[j];
        const valStr = row[p.key];
        if (valStr == null || valStr === "") continue;
        const val = parseFloat(valStr);
        if (isNaN(val)) continue;

        stats[p.key].totalTested++;
        const limit = limits[p.key] || DEFAULT_LIMITS[p.key as keyof typeof DEFAULT_LIMITS];
        if (!limit) continue;

        if (limit.isStrictRange) {
          if (val < limit.acc || val > limit.perm) {
            stats[p.key].unsafe++;
          }
        } else {
          if (val > limit.perm) {
            stats[p.key].unsafe++;
          } else if (val > limit.acc) {
            stats[p.key].marginal++;
          }
        }
      }
    }

    return stats;
  }, [processedRawData, limits]);

  // Total count of samples that trigger an alert for the currently selected parameters
  const alertSamplesCount = useMemo(() => {
    if (!processedRawData || processedRawData.length === 0) return 0;
    const activeParams = ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key));
    if (activeParams.length === 0) return 0;

    let count = 0;
    for (let i = 0; i < processedRawData.length; i++) {
      const row = processedRawData[i];
      let hasAlert = false;
      for (let j = 0; j < activeParams.length; j++) {
        const p = activeParams[j];
        const valStr = row[p.key];
        if (valStr == null || valStr === "") continue;
        const val = parseFloat(valStr);
        if (isNaN(val)) continue;
        const limit = limits[p.key] || DEFAULT_LIMITS[p.key as keyof typeof DEFAULT_LIMITS];
        if (!limit) continue;

        if (limit.isStrictRange) {
          if (val < limit.acc || val > limit.perm) {
            hasAlert = true;
            break;
          }
        } else {
          if (val > limit.acc) {
            hasAlert = true;
            break;
          }
        }
      }
      if (hasAlert) count++;
    }
    return count;
  }, [processedRawData, selectedAlertParams, limits]);

  const activeSelectedLimits = useMemo(() => {
    const filtered: Record<string, { acc: number; perm: number; isStrictRange?: boolean }> = {};
    selectedAlertParams.forEach(p => {
      if (limits[p]) filtered[p] = limits[p];
    });
    return filtered;
  }, [limits, selectedAlertParams]);


  const isSingleState = summaryData.length === 1;
  const reportLocation = isSingleState ? summaryData[0].state : 'All India';
  const reportTableData = isSingleState ? districtSummaryData : summaryData;

  const activeContaminatedParams = useMemo(() => {
    const params = new Set<string>();
    reportTableData.forEach(row => {
      row.unsafeList.forEach((p: string) => params.add(p));
      row.marginalList.forEach((p: string) => params.add(p));
    });
    return Array.from(params);
  }, [reportTableData]);

  const activeRemedialMeasures = REMEDIAL_MEASURES.filter(m => activeContaminatedParams.includes(m.id));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
        
        if (data.length === 0) {
          setUploadError("The uploaded file appears to be empty.");
          return;
        }

        const headers = Object.keys(data[0]);
        setUploadedColumns(headers);

        const initialMapping: Record<string, string> = {};
        COLUMNS.forEach(col => {
          initialMapping[col] = guessMapping(col, headers);
        });
        
        setColumnMapping(initialMapping);
        setUploadingFile(data);
        setShowMappingModal(true);
      } catch (err) {
        console.error("Error parsing file", err);
        setUploadError("Could not read file. Ensure it is a valid Excel or CSV.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ""; // reset
  };

  const applyMapping = () => {
    const mappedData = uploadingFile.map((row: any) => {
      const newRow: any = {};
      COLUMNS.forEach(col => {
        const mappedKey = columnMapping[col];
        if (mappedKey && row[mappedKey] !== undefined && row[mappedKey] !== "") {
          newRow[col] = row[mappedKey];
        } else {
          newRow[col] = "";
        }
      });
      // Extract dates strictly from uploaded row if not explicitly mapped or format if mapped
      if (!newRow["Sample Collection Date"]) {
        newRow["Sample Collection Date"] = extractDateFromRow(row, "collection");
      } else {
        newRow["Sample Collection Date"] = formatSheetDate(newRow["Sample Collection Date"]);
      }
      if (!newRow["Sample Analysis Date"]) {
        newRow["Sample Analysis Date"] = extractDateFromRow(row, "analysis");
      } else {
        newRow["Sample Analysis Date"] = formatSheetDate(newRow["Sample Analysis Date"]);
      }
      return newRow;
    });
    
    setInternalRawData(mappedData);
    setShowMappingModal(false);
    setUploadingFile(null);
  };

  const handleShapefileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    try {
      const buffer = await file.arrayBuffer();
      const geojson = await shp(buffer);
      setGeoJsonData(geojson);
      setActiveSubTab('map');
    } catch (error) {
      console.error("Error parsing shapefile:", error);
      setUploadError("Could not parse the ZIP file. Please ensure it contains valid .shp, .shx, and .dbf files.");
      setTimeout(() => setUploadError(''), 5000);
    }
    e.target.value = "";
  };

  const downloadTemplate = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Water Quality Data");
    ws.addRow(COLUMNS);
    await downloadExcelJSWorkbook(wb, "Water_Quality_Template.xlsx");
  };

  const exportSummary = async () => {
    if (activeSubTab === 'state') {
      if (!summaryData || summaryData.length === 0) return;
      const exportData = summaryData.map(row => {
        const rawTot = manualTotals[row.key] !== undefined && manualTotals[row.key] !== '' ? manualTotals[row.key] : row.total;
        const totNum = Number(String(rawTot).replace(/,/g, ''));
        return {
          "State": row.state,
          "Total Analyzed": !isNaN(totNum) ? totNum : rawTot,
          "Safe Locations": typeof row.safe === "number" ? row.safe : (Number(row.safe) || 0),
          "Marginal Locations": typeof row.marginal === "number" ? row.marginal : (Number(row.marginal) || 0),
          "Unsafe Locations": typeof row.unsafe === "number" ? row.unsafe : (Number(row.unsafe) || 0),
          "Unsafe Parameters": row.unsafeList.join(', '),
          "Marginal Parameters": row.marginalList.join(', '),
          "Heavy Metals Detected": row.hasHeavyMetals ? "Yes" : "No"
        };
      });
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("State Summary");
      if (exportData.length > 0) {
        const headers = Object.keys(exportData[0]);
        ws.addRow(headers);
        exportData.forEach(row => ws.addRow(headers.map(h => (row as any)[h])));
      }
      await downloadExcelJSWorkbook(wb, "State_Quality_Summary.xlsx");
    } else if (activeSubTab === 'district') {
      if (!districtSummaryData || districtSummaryData.length === 0) return;
      const exportData = districtSummaryData.map(row => {
        const rawTot = manualTotals[row.key] !== undefined && manualTotals[row.key] !== '' ? manualTotals[row.key] : row.total;
        const totNum = Number(String(rawTot).replace(/,/g, ''));
        return {
          "State": row.state,
          "District": row.district,
          "Total Analyzed": !isNaN(totNum) ? totNum : rawTot,
          "Safe Locations": typeof row.safe === "number" ? row.safe : (Number(row.safe) || 0),
          "Marginal Locations": typeof row.marginal === "number" ? row.marginal : (Number(row.marginal) || 0),
          "Unsafe Locations": typeof row.unsafe === "number" ? row.unsafe : (Number(row.unsafe) || 0),
          "Unsafe Parameters": row.unsafeList.join(', '),
          "Marginal Parameters": row.marginalList.join(', '),
          "Heavy Metals Detected": row.hasHeavyMetals ? "Yes" : "No"
        };
      });
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("District Summary");
      if (exportData.length > 0) {
        const headers = Object.keys(exportData[0]);
        ws.addRow(headers);
        exportData.forEach(row => ws.addRow(headers.map(h => (row as any)[h])));
      }
      await downloadExcelJSWorkbook(wb, "District_Quality_Summary.xlsx");
    }
  };

  const generateAlertExcel = async () => {
    try {
      setIsExportingExcel(true);
      const wb = new ExcelJS.Workbook();
      wb.creator = "CGWB - Central Ground Water Board";
      wb.lastModifiedBy = "CGWB Alert System";
      wb.created = new Date();
      wb.modified = new Date();

      const ws = wb.addWorksheet("Water Quality Alert", {
        views: [{ showGridLines: true }]
      });

      // Mark as custom formatted so excelFormatter utility preserves our exact cell styling
      (ws as any)._customFormatted = true;

      // Active selected parameters in exact order of ALERT_PARAM_DEFINITIONS
      const activeParams = ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key));

      const thinBorder: Partial<ExcelJS.Borders> = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } }
      };

      const boldFont: Partial<ExcelJS.Font> = {
        name: "Calibri",
        size: 10,
        bold: true,
        color: { argb: "FF000000" }
      };

      const headerFont: Partial<ExcelJS.Font> = {
        name: "Calibri",
        size: 9.5,
        bold: true,
        color: { argb: "FF000000" }
      };

      const lightGreenFill: ExcelJS.Fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2EFDA" } // #E2EFDA soft green from CGWB image
      };

      const redFill: ExcelJS.Fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF0000" } // #FF0000 Solid Red
      };

      const yellowFill: ExcelJS.Fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFC000" } // #FFC000 Solid Yellow/Orange
      };

      // ROW 1
      const row1 = ws.getRow(1);
      row1.height = 22;
      const cA1 = row1.getCell(1);
      cA1.value = "Date of Issuance of Alert:";
      cA1.font = boldFont;
      cA1.border = thinBorder;
      cA1.alignment = { vertical: "middle", horizontal: "left" };

      const cD1 = row1.getCell(4);
      cD1.value = issueDate.split("-").reverse().join(".");
      cD1.font = boldFont;
      cD1.fill = lightGreenFill;
      cD1.border = thinBorder;
      cD1.alignment = { vertical: "middle", horizontal: "center" };

      const cK1 = row1.getCell(11);
      cK1.value = "Legend";
      cK1.font = boldFont;
      cK1.border = thinBorder;
      cK1.alignment = { vertical: "middle", horizontal: "center" };

      // ROW 2
      const row2 = ws.getRow(2);
      row2.height = 22;
      const cA2 = row2.getCell(1);
      cA2.value = "Period of Alert:";
      cA2.font = boldFont;
      cA2.border = thinBorder;
      cA2.alignment = { vertical: "middle", horizontal: "left" };

      const cC2 = row2.getCell(3);
      cC2.value = "FROM";
      cC2.font = boldFont;
      cC2.border = thinBorder;
      cC2.alignment = { vertical: "middle", horizontal: "center" };

      const cD2 = row2.getCell(4);
      const [fromY, fromM, fromD] = fromDate.split("-");
      cD2.value = `${parseInt(fromM, 10)}/${parseInt(fromD, 10)}/${fromY}`;
      cD2.font = boldFont;
      cD2.fill = lightGreenFill;
      cD2.border = thinBorder;
      cD2.alignment = { vertical: "middle", horizontal: "center" };

      const cF2 = row2.getCell(6);
      cF2.value = "TO";
      cF2.font = boldFont;
      cF2.border = thinBorder;
      cF2.alignment = { vertical: "middle", horizontal: "center" };

      const cH2 = row2.getCell(8);
      const [toY, toM, toD] = toDate.split("-");
      cH2.value = `${parseInt(toM, 10)}/${parseInt(toD, 10)}/${toY}`;
      cH2.font = boldFont;
      cH2.fill = lightGreenFill;
      cH2.border = thinBorder;
      cH2.alignment = { vertical: "middle", horizontal: "center" };

      const cK2 = row2.getCell(11);
      cK2.value = "Above Permissible Limit";
      cK2.font = headerFont;
      cK2.border = thinBorder;
      cK2.alignment = { vertical: "middle", horizontal: "center" };

      ws.mergeCells("L2:M2");
      row2.getCell(12).fill = redFill;
      row2.getCell(12).border = thinBorder;
      row2.getCell(13).border = thinBorder;

      // ROW 3
      const row3 = ws.getRow(3);
      row3.height = 22;
      const cA3 = row3.getCell(1);
      cA3.value = "Alert Issuing Office:";
      cA3.font = boldFont;
      cA3.border = thinBorder;
      cA3.alignment = { vertical: "middle", horizontal: "left" };

      ws.mergeCells("D3:I3");
      const cD3 = row3.getCell(4);
      cD3.value = alertIssuingOffice || getIssuingOffice();
      cD3.font = boldFont;
      cD3.fill = lightGreenFill;
      cD3.border = thinBorder;
      cD3.alignment = { vertical: "middle", horizontal: "center" };
      for (let c = 4; c <= 9; c++) {
        row3.getCell(c).border = thinBorder;
      }

      const cK3 = row3.getCell(11);
      cK3.value = "Above Acceptable Limit";
      cK3.font = headerFont;
      cK3.border = thinBorder;
      cK3.alignment = { vertical: "middle", horizontal: "center" };

      ws.mergeCells("L3:M3");
      row3.getCell(12).fill = yellowFill;
      row3.getCell(12).border = thinBorder;
      row3.getCell(13).border = thinBorder;

      // ROW 4 & 5 (DUAL HEADERS)
      const row4 = ws.getRow(4);
      const row5 = ws.getRow(5);
      row4.height = 30;
      row5.height = 30;

      // Col A (1): S No.
      ws.mergeCells("A4:A5");
      const cSNo = row4.getCell(1);
      cSNo.value = "S No.";
      cSNo.font = boldFont;
      cSNo.border = thinBorder;
      cSNo.alignment = { vertical: "middle", horizontal: "center" };
      row5.getCell(1).border = thinBorder;

      // Merge B4:E4 for Location
      ws.mergeCells("B4:E4");
      const cLoc = row4.getCell(2);
      cLoc.value = "Location";
      cLoc.font = boldFont;
      cLoc.alignment = { vertical: "middle", horizontal: "center" };
      for (let c = 2; c <= 5; c++) {
        row4.getCell(c).border = thinBorder;
      }

      const subHeaders = [
        { col: 2, label: "State" },
        { col: 3, label: "District" },
        { col: 4, label: "Block" },
        { col: 5, label: "Village/Town" },
        { col: 6, label: "Latitude" },
        { col: 7, label: "Longitude" },
      ];

      subHeaders.forEach(sh => {
        row4.getCell(sh.col).border = thinBorder;
        const c5 = row5.getCell(sh.col);
        c5.value = sh.label;
        c5.font = boldFont;
        c5.border = thinBorder;
        c5.alignment = { vertical: "middle", horizontal: "center" };
      });

      // Col 8: Structure
      const c8_4 = row4.getCell(8);
      c8_4.value = "Sample Collection";
      c8_4.font = headerFont;
      c8_4.border = thinBorder;
      c8_4.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

      const c8_5 = row5.getCell(8);
      c8_5.value = "(DW/HandPump/TW)";
      c8_5.font = headerFont;
      c8_5.border = thinBorder;
      c8_5.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

      // Col 9: Depth
      row4.getCell(9).border = thinBorder;
      const c9_5 = row5.getCell(9);
      c9_5.value = "Depth of the Structure from Ground Level in mbgl";
      c9_5.font = headerFont;
      c9_5.border = thinBorder;
      c9_5.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

      // Col 10: Sample Collection Date
      const c10_4 = row4.getCell(10);
      c10_4.value = "Sample Collection";
      c10_4.font = headerFont;
      c10_4.border = thinBorder;
      c10_4.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

      const c10_5 = row5.getCell(10);
      c10_5.value = "DD/MM/YYYY";
      c10_5.font = headerFont;
      c10_5.border = thinBorder;
      c10_5.alignment = { vertical: "middle", horizontal: "center" };

      // Col 11: Sample Analysis Date
      const c11_4 = row4.getCell(11);
      c11_4.value = "Sample Analysis Date";
      c11_4.font = headerFont;
      c11_4.border = thinBorder;
      c11_4.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

      const c11_5 = row5.getCell(11);
      c11_5.value = "DD/MM/YYYY";
      c11_5.font = headerFont;
      c11_5.border = thinBorder;
      c11_5.alignment = { vertical: "middle", horizontal: "center" };

      // Col 12+ : Active Selected Parameters
      activeParams.forEach((param, pIdx) => {
        const colNum = 12 + pIdx;
        const pLimit = limits[param.key] || DEFAULT_LIMITS[param.key as keyof typeof DEFAULT_LIMITS];

        // Header Row 4: Parameter name + unit
        const c_p4 = row4.getCell(colNum);
        c_p4.value = param.displayHeader;
        c_p4.font = boldFont;
        c_p4.border = thinBorder;
        c_p4.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

        // Header Row 5: Limits range text
        const c_p5 = row5.getCell(colNum);
        let rangeDisplay = param.rangeText;
        if (pLimit) {
          if (pLimit.acc === pLimit.perm) {
            rangeDisplay = `${pLimit.perm}`;
          } else {
            rangeDisplay = `${pLimit.acc}-${pLimit.perm}`;
          }
        }
        c_p5.value = rangeDisplay;
        c_p5.font = boldFont;
        c_p5.border = thinBorder;
        c_p5.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      });

      // Filter data samples based on user selection
      const samplesToExport = processedRawData.filter(row => {
        if (!excelOnlyAlertSamples) return true;
        for (let i = 0; i < activeParams.length; i++) {
          const p = activeParams[i];
          const valStr = row[p.key];
          if (valStr == null || valStr === "") continue;
          const val = parseFloat(valStr);
          if (isNaN(val)) continue;
          const limit = limits[p.key] || DEFAULT_LIMITS[p.key as keyof typeof DEFAULT_LIMITS];
          if (!limit) continue;

          if (limit.isStrictRange) {
            if (val < limit.acc || val > limit.perm) return true;
          } else {
            if (val > limit.acc) return true;
          }
        }
        return false;
      });

      // Populate data rows (Row 6 onwards)
      let currentRowNum = 6;
      samplesToExport.forEach((row, idx) => {
        const dataRow = ws.getRow(currentRowNum);
        dataRow.height = 20;

        const rawLat = row["Latitude"];
        const cleanLat = typeof rawLat === "number" ? rawLat : parseFloat(String(rawLat || "").replace(/,/g, ""));
        const latVal = !isNaN(cleanLat) ? Number(cleanLat.toFixed(5)) : (rawLat || "");

        const rawLng = row["Longitude"];
        const cleanLng = typeof rawLng === "number" ? rawLng : parseFloat(String(rawLng || "").replace(/,/g, ""));
        const lngVal = !isNaN(cleanLng) ? Number(cleanLng.toFixed(5)) : (rawLng || "");

        const cellVals = [
          idx + 1,
          row["State"] || "",
          row["District"] || "",
          row["Block"] || "",
          row["Village/Town"] || "",
          latVal,
          lngVal,
        ];

        for (let colIdx = 0; colIdx < cellVals.length; colIdx++) {
          const cell = dataRow.getCell(colIdx + 1);
          cell.value = cellVals[colIdx];
          if (typeof cell.value === "number") {
            if (colIdx === 0) {
              cell.numFmt = "0";
            } else if (colIdx === 5 || colIdx === 6) {
              cell.numFmt = "0.00000";
            }
          }
          cell.font = { name: "Calibri", size: 10 };
          cell.border = thinBorder;
          cell.alignment = {
            vertical: "middle",
            horizontal: colIdx === 0 || colIdx === 5 || colIdx === 6 ? "center" : "left"
          };
        }

        // Col 8: Structure
        let struct = row["Sample Collection Structure"] || "";
        const structLower = struct.toLowerCase();
        if (structLower.includes("bore")) struct = "BW";
        else if (structLower.includes("tube")) struct = "TW";
        else if (structLower.includes("dug")) struct = "DW";
        else if (structLower.includes("hand")) struct = "HP";
        const c8 = dataRow.getCell(8);
        c8.value = struct || "TW";
        c8.font = { name: "Calibri", size: 10 };
        c8.border = thinBorder;
        c8.alignment = { vertical: "middle", horizontal: "center" };

        // Col 9: Depth
        const c9 = dataRow.getCell(9);
        const rawDepth = row["Depth of the Structure from Ground Level in Meters"];
        const cleanDepth = typeof rawDepth === "number" ? rawDepth : parseFloat(String(rawDepth || "").replace(/,/g, ""));
        if (!isNaN(cleanDepth)) {
          c9.value = cleanDepth;
          c9.numFmt = Number.isInteger(cleanDepth) ? "0" : "0.00";
        } else {
          c9.value = rawDepth || "";
        }
        c9.font = { name: "Calibri", size: 10 };
        c9.border = thinBorder;
        c9.alignment = { vertical: "middle", horizontal: "center" };

        // Col 10: Collection Date strictly from uploaded sheet
        const c10 = dataRow.getCell(10);
        c10.value = row["Sample Collection Date"] || "";
        c10.font = { name: "Calibri", size: 10 };
        c10.border = thinBorder;
        c10.alignment = { vertical: "middle", horizontal: "center" };

        // Col 11: Analysis Date strictly from uploaded sheet
        const c11 = dataRow.getCell(11);
        c11.value = row["Sample Analysis Date"] || "";
        c11.font = { name: "Calibri", size: 10 };
        c11.border = thinBorder;
        c11.alignment = { vertical: "middle", horizontal: "center" };

        // Col 12+ : Active Selected Parameters
        activeParams.forEach((param, pIdx) => {
          const colNum = 12 + pIdx;
          const cP = dataRow.getCell(colNum);
          cP.border = thinBorder;
          cP.alignment = { vertical: "middle", horizontal: "center" };

          const valStr = row[param.key];
          if (valStr == null || valStr === "") {
            cP.value = "";
            return;
          }

          const val = typeof valStr === "number" ? valStr : parseFloat(String(valStr).replace(/,/g, ""));
          if (isNaN(val)) {
            cP.value = excelOnlyExceedances ? "" : valStr;
            return;
          }

          const limit = limits[param.key] || DEFAULT_LIMITS[param.key as keyof typeof DEFAULT_LIMITS];
          let isUnsafe = false;
          let isMarginal = false;

          if (limit) {
            if (limit.isStrictRange) {
              if (val < limit.acc || val > limit.perm) isUnsafe = true;
            } else {
              if (val > limit.perm) isUnsafe = true;
              else if (val > limit.acc) isMarginal = true;
            }
          }

          const numValue = Number.isInteger(val) ? val : Number(val.toFixed(2));
          cP.numFmt = Number.isInteger(val) ? "0" : "0.00";

          if (isUnsafe) {
            cP.value = numValue;
            cP.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF000000" } };
            cP.fill = redFill;
          } else if (isMarginal) {
            cP.value = numValue;
            cP.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF000000" } };
            cP.fill = yellowFill;
          } else {
            if (excelOnlyExceedances) {
              cP.value = "";
            } else {
              cP.value = numValue;
              cP.font = { name: "Calibri", size: 10, color: { argb: "FF000000" } };
            }
          }
        });

        currentRowNum++;
      });

      // Add official CGWB footer matching image_acd97d75.png
      if (showSheetFooter) {
        const totalCols = 11 + activeParams.length;
        const footerRow = ws.getRow(currentRowNum);
        footerRow.height = 32;

        const footerBorder: Partial<ExcelJS.Borders> = {
          top: { style: "thin", color: { argb: "FFB0C4DE" } },
        };

        for (let c = 1; c <= totalCols; c++) {
          footerRow.getCell(c).border = footerBorder;
        }

        // Merge left cells for logo and text "| CGWB"
        const leftMergeEnd = Math.min(5, Math.max(3, Math.floor(totalCols / 2)));
        ws.mergeCells(currentRowNum, 1, currentRowNum, leftMergeEnd);
        const leftCell = footerRow.getCell(1);
        leftCell.value = "          | CGWB";
        leftCell.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FF0033CC" } };
        leftCell.alignment = { vertical: "middle", horizontal: "left" };

        // Merge right cells for page text e.g. "1 of 5"
        if (leftMergeEnd + 1 <= totalCols) {
          ws.mergeCells(currentRowNum, leftMergeEnd + 1, currentRowNum, totalCols);
          const rightCell = footerRow.getCell(leftMergeEnd + 1);
          rightCell.value = footerPageText || "1 of 5";
          rightCell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FF475569" } };
          rightCell.alignment = { vertical: "middle", horizontal: "right" };
        }

        // Try embedding the official transparent CGWB logo into the worksheet
        try {
          const logoResp = await fetch("/assets/aistudio/logo_1-removebg-preview_f8d93171.png");
          if (logoResp.ok) {
            const logoBuffer = await logoResp.arrayBuffer();
            const imageId = wb.addImage({
              buffer: logoBuffer,
              extension: "png",
            });
            ws.addImage(imageId, {
              tl: { col: 0.1, row: currentRowNum - 1 + 0.1 },
              ext: { width: 30, height: 30 }
            });
          }
        } catch (imgErr) {
          console.warn("Could not embed logo image in Excel:", imgErr);
        }

        // Configure native Excel page print footer
        ws.headerFooter = {
          oddFooter: `&L&"Calibri,Bold"&11 | CGWB&R&"Calibri,Bold"&10${footerPageText || "1 of 5"}`,
          evenFooter: `&L&"Calibri,Bold"&11 | CGWB&R&"Calibri,Bold"&10${footerPageText || "1 of 5"}`,
        };
      }

      // Adjust column widths
      ws.getColumn(1).width = 7;
      ws.getColumn(2).width = 13;
      ws.getColumn(3).width = 15;
      ws.getColumn(4).width = 14;
      ws.getColumn(5).width = 18;
      ws.getColumn(6).width = 12;
      ws.getColumn(7).width = 12;
      ws.getColumn(8).width = 15;
      ws.getColumn(9).width = 18;
      ws.getColumn(10).width = 14;
      ws.getColumn(11).width = 16;

      activeParams.forEach((param, pIdx) => {
        const colNum = 12 + pIdx;
        ws.getColumn(colNum).width = Math.max(12, Math.min(18, param.displayHeader.length + 2));
      });

      ensureExcelJSWorksheetNumbers(ws, 4);
      const dateCode = issueDate.replace(/-/g, "");
      await downloadExcelJSWorkbook(wb, `CGWB_Water_Quality_Alert_${dateCode}.xlsx`);
    } catch (err) {
      console.error("Error generating alert excel:", err);
    } finally {
      setIsExportingExcel(false);
    }
  };


  const handleDownloadWord = (formatOverride?: 'docx' | 'doc') => {
    try {
      setIsExportingWord(true);
      const element = document.querySelector('.print-container');
      if (!element) return;
      const clone = element.cloneNode(true) as HTMLElement;

      // Handle .no-print elements
      const noPrintElements = clone.querySelectorAll('.no-print');
      noPrintElements.forEach(el => el.remove());

      // Handle .print-only elements
      const printOnlyElements = clone.querySelectorAll('.print-only');
      printOnlyElements.forEach(el => {
        el.classList.remove('hidden');
        (el as HTMLElement).style.display = 'block';
      });

      // Remove on-screen running header and footer from clone body (they are moved to Word XML running header/footer)
      const screenHeader = clone.querySelector('.doc-screen-header');
      if (screenHeader) screenHeader.remove();
      const screenFooter = clone.querySelector('.doc-screen-footer');
      if (screenFooter) screenFooter.remove();

      // Remove avoid-break from all elements and enforce natural page-break-inside auto
      const avoidBreakElements = clone.querySelectorAll('.avoid-break');
      avoidBreakElements.forEach(el => {
        el.classList.remove('avoid-break');
        (el as HTMLElement).style.pageBreakInside = 'auto';
      });

      // Handle Para II page break according to user preference (enableParaIIPageBreak)
      const pageBreakElements = clone.querySelectorAll('.page-break-before');
      pageBreakElements.forEach(el => {
        if (!enableParaIIPageBreak) {
          el.classList.remove('page-break-before');
          (el as HTMLElement).style.pageBreakBefore = 'auto';
          (el as HTMLElement).style.marginTop = '24pt';
        } else {
          (el as HTMLElement).style.pageBreakBefore = 'always';
        }
      });

      // CRITICAL: Make tables true MS Word tables (fully resizable)
      const allElements = clone.querySelectorAll('*');
      allElements.forEach(el => {
        if (el.className && typeof el.className === 'string') {
          el.className = el.className.replace(/\b(w-\S+|max-w-\S+|min-w-\S+|h-\S+|max-h-\S+|min-h-\S+)\b/g, '').trim();
        }
      });

      const chosenFormat = formatOverride || exportDocFormat || 'docx';

      // Font mapping for MS Word
      const wordFontFamily = 
        contaminationFont === 'times' ? "'Times New Roman', Times, serif" :
        contaminationFont === 'calibri' ? "Calibri, Candara, Segoe, 'Segoe UI', Arial, sans-serif" :
        contaminationFont === 'georgia' ? "Georgia, Cambria, 'Times New Roman', serif" :
        contaminationFont === 'arial' ? "Arial, 'Helvetica Neue', Helvetica, sans-serif" :
        contaminationFont === 'garamond' ? "Garamond, 'Baskerville', serif" :
        contaminationFont === 'mono' ? "'Courier New', Courier, monospace" :
        "Arial, 'Segoe UI', sans-serif";

      const lineHeightVal = lineSpacing === 'relaxed' ? '1.5' : lineSpacing === 'normal' ? '1.3' : '1.18';

      // Inject styles for Word document with Native MS Office XML metadata, margins, and running headers/footers
      const htmlContent = `
        <html xmlns:v="urn:schemas-microsoft-com:vml"
              xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset='utf-8'>
            <title>${documentTitleText || 'Ground Water Quality Alert'}</title>
            <!--[if gte mso 9]>
            <xml>
                <w:WordDocument>
                    <w:View>Print</w:View>
                    <w:Zoom>100</w:Zoom>
                    <w:DoNotOptimizeForBrowser/>
                </w:WordDocument>
            </xml>
            <![endif]-->
            <style>
                @page WordSection1 {
                    size: 8.27in 11.69in; /* Standard A4 */
                    margin: ${pageMarginTop}in ${pageMarginRight}in ${pageMarginBottom}in ${pageMarginLeft}in;
                    mso-header-margin: ${(pageMarginTop * 0.5).toFixed(2)}in;
                    mso-footer-margin: ${(pageMarginBottom * 0.5).toFixed(2)}in;
                    mso-header: h1;
                    mso-footer: f1;
                }
                div.WordSection1 { 
                    page: WordSection1; 
                }
                body { 
                    font-family: ${wordFontFamily}; 
                    font-size: ${bodyFontSize}pt; 
                    color: ${docTextColor}; 
                    line-height: ${lineHeightVal}; 
                    text-align: ${textAlignMode};
                    background: #ffffff;
                }
                table { 
                    border-collapse: collapse; 
                    width: 100%; 
                    margin-bottom: 16px; 
                    font-family: ${wordFontFamily};
                    border: 1px solid ${tableBorderColor};
                }
                th, td { 
                    border: 1px solid ${tableBorderColor}; 
                    padding: 6px 8px; 
                    font-size: ${tableFontSize}pt; 
                    text-align: center; 
                    vertical-align: top; 
                    color: ${docTextColor};
                }
                th {
                    background-color: ${tableHeaderBg} !important;
                    font-weight: bold;
                    color: ${tableHeaderTextColor} !important;
                    text-align: center;
                }
                .text-left { text-align: left !important; }
                .text-right { text-align: right !important; }
                .font-bold { font-weight: bold; }
                .bg-gray-100, .bg-slate-100 { background-color: ${tableHeaderBg} !important; color: ${tableHeaderTextColor} !important; }
                h1 { 
                    text-align: center; 
                    text-decoration: ${titleUnderline ? 'underline' : 'none'}; 
                    font-size: ${headingFontSize + 4}pt; 
                    margin-bottom: 18px; 
                    color: ${docHeadingColor}; 
                    font-family: ${wordFontFamily};
                    font-weight: ${titleFontWeight === 'black' ? '900' : titleFontWeight === 'bold' ? 'bold' : 'normal'};
                    text-transform: ${titleTransform};
                }
                h3 { 
                    text-decoration: underline; 
                    font-size: ${headingFontSize + 1}pt; 
                    margin-top: 14px;
                    margin-bottom: 8px; 
                    color: ${docHeadingColor}; 
                    font-weight: bold; 
                    font-family: ${wordFontFamily};
                }
                h4 { 
                    text-decoration: underline; 
                    font-size: ${headingFontSize}pt; 
                    margin-top: 12px;
                    margin-bottom: 6px; 
                    color: ${docHeadingColor}; 
                    font-weight: bold; 
                    font-family: ${wordFontFamily};
                }
                h5 { 
                    text-decoration: underline; 
                    font-size: ${bodyFontSize + 1}pt; 
                    font-weight: bold; 
                    color: ${docHeadingColor}; 
                    margin-top: 10px;
                    margin-bottom: 4px;
                    font-family: ${wordFontFamily};
                }
                .indent-8 { text-indent: 30px; }
                .text-justify { text-align: justify; }
                ul { margin-top: 4px; margin-bottom: 12px; padding-left: 24px; }
                li { margin-bottom: 4px; line-height: ${lineHeightVal}; }
                p { margin-bottom: 8px; line-height: ${lineHeightVal}; }
                p, div, li { page-break-inside: auto; orphans: 2; widows: 2; }
                .page-break-before { page-break-before: ${enableParaIIPageBreak ? 'always' : 'auto'}; }
                div#h1, div#f1 {
                    margin: 0;
                    padding: 0;
                }
                p.MsoHeader, li.MsoHeader, div.MsoHeader,
                p.MsoFooter, li.MsoFooter, div.MsoFooter {
                    margin: 0in;
                    font-size: 8.5pt;
                    font-family: ${wordFontFamily};
                    color: #64748b;
                }
            </style>
        </head>
        <body>
            <div class="WordSection1">
                <!-- Native Microsoft Word Dynamic Running Header -->
                <div style="mso-element:header" id="h1">
                    <table style="width: 100%; border: none; margin-bottom: 6pt; border-bottom: 1px solid #cbd5e1; padding-bottom: 4pt;">
                        <tr style="border: none;">
                            ${(logoPlacement === 'header-left' && logoImageSrc) ? `
                                <td style="border: none; text-align: left; vertical-align: middle; width: ${logoHeight + 20}px;">
                                    <img src="${logoImageSrc}" width="${logoHeight}" height="${logoHeight}" border="0" style="height: ${logoHeight}px; width: ${logoHeight}px; vertical-align: middle;" alt="Logo" />
                                </td>
                            ` : ''}
                            <td style="border: none; text-align: ${headerPosition}; vertical-align: middle; font-size: 8.5pt; color: #64748b; font-family: ${wordFontFamily}; font-weight: 500;">
                                ${showHeader ? headerText : ''}
                            </td>
                            ${(logoPlacement === 'header-center' && logoImageSrc) ? `
                                <td style="border: none; text-align: center; vertical-align: middle; width: ${logoHeight + 20}px;">
                                    <img src="${logoImageSrc}" width="${logoHeight}" height="${logoHeight}" border="0" style="height: ${logoHeight}px; width: ${logoHeight}px; vertical-align: middle;" alt="Logo" />
                                </td>
                            ` : ''}
                            ${(logoPlacement === 'header-right' && logoImageSrc) ? `
                                <td style="border: none; text-align: right; vertical-align: middle; width: ${logoHeight + 20}px;">
                                    <img src="${logoImageSrc}" width="${logoHeight}" height="${logoHeight}" border="0" style="height: ${logoHeight}px; width: ${logoHeight}px; vertical-align: middle;" alt="Logo" />
                                </td>
                            ` : ''}
                        </tr>
                    </table>
                </div>

                ${(logoPlacement !== 'none' && logoImageSrc) ? `
                    ${(logoPlacement === 'title-top') ? `
                        <div style="text-align: center; margin-bottom: 12pt;">
                            <img src="${logoImageSrc}" width="${Math.round(logoHeight * 1.5)}" height="${Math.round(logoHeight * 1.5)}" border="0" style="height: ${Math.round(logoHeight * 1.5)}px; width: ${Math.round(logoHeight * 1.5)}px; vertical-align: middle;" alt="CGWB Logo" />
                        </div>
                    ` : (logoPlacement.startsWith('header-')) ? `
                        <table style="width: 100%; border: none; margin-bottom: 14pt; border-bottom: 2pt solid #0b3b60; padding-bottom: 6pt;">
                            <tr style="border: none;">
                                <td style="border: none; vertical-align: middle; width: ${logoHeight + 20}px; text-align: ${logoPlacement === 'header-right' ? 'right' : logoPlacement === 'header-center' ? 'center' : 'left'};">
                                    <img src="${logoImageSrc}" width="${logoHeight}" height="${logoHeight}" border="0" style="height: ${logoHeight}px; width: ${logoHeight}px; vertical-align: middle;" alt="CGWB Logo" />
                                </td>
                                <td style="border: none; vertical-align: middle; text-align: ${logoPlacement === 'header-center' ? 'center' : 'left'}; font-family: ${wordFontFamily};">
                                    <div style="font-size: 11pt; font-weight: bold; color: #0b3b60; text-transform: uppercase; letter-spacing: 0.5pt;">Central Ground Water Board</div>
                                    <div style="font-size: 8.5pt; color: #475569; font-weight: 500;">Ministry of Jal Shakti • Department of Water Resources, RD &amp; GR • Government of India</div>
                                    <div style="font-size: 8.5pt; color: #0f172a; font-weight: bold; margin-top: 2pt;">${selectedIssuingOffice || alertIssuingOffice || getIssuingOffice()}</div>
                                </td>
                            </tr>
                        </table>
                    ` : ''}
                ` : ''}

                ${clone.innerHTML}
                
                <!-- Native Microsoft Word Dynamic Running Footer: Page X of Y & Footer Text -->
                <div style="mso-element:footer" id="f1">
                    <table style="width: 100%; border: none; margin-top: 6pt; border-top: 1px solid #cbd5e1; padding-top: 4pt;">
                        <tr style="border: none;">
                            ${(logoPlacement === 'footer-left' && logoImageSrc) ? `
                                <td style="border: none; text-align: left; vertical-align: middle; width: ${logoHeight + 20}px;">
                                    <img src="${logoImageSrc}" width="${logoHeight}" height="${logoHeight}" border="0" style="height: ${logoHeight}px; width: ${logoHeight}px; vertical-align: middle;" alt="Logo" />
                                </td>
                            ` : ''}
                            <td style="border: none; text-align: ${footerPosition}; vertical-align: middle; font-size: 8.5pt; color: #64748b; font-family: ${wordFontFamily};">
                                ${showFooter ? footerText : ''}
                            </td>
                            ${pageNumberFormat !== 'none' ? `
                                <td style="border: none; text-align: ${pageNumberPosition === 'footer-left' ? 'left' : pageNumberPosition === 'footer-center' ? 'center' : 'right'}; vertical-align: middle; font-size: 8.5pt; color: #475569; font-weight: bold; font-family: ${wordFontFamily};">
                                    ${pageNumberFormat === 'page_x_of_y' ? `Page <span style="mso-field-code:' PAGE '"></span> of <span style="mso-field-code:' NUMPAGES '"></span>` :
                                      pageNumberFormat === 'page_x' ? `Page <span style="mso-field-code:' PAGE '"></span>` :
                                      pageNumberFormat === 'x_of_y' ? `<span style="mso-field-code:' PAGE '"></span> of <span style="mso-field-code:' NUMPAGES '"></span>` :
                                      `- <span style="mso-field-code:' PAGE '"></span> -`}
                                </td>
                            ` : ''}
                            ${(logoPlacement === 'footer-right' && logoImageSrc) ? `
                                <td style="border: none; text-align: right; vertical-align: middle; width: ${logoHeight + 20}px;">
                                    <img src="${logoImageSrc}" width="${logoHeight}" height="${logoHeight}" border="0" style="height: ${logoHeight}px; width: ${logoHeight}px; vertical-align: middle;" alt="Logo" />
                                </td>
                            ` : ''}
                        </tr>
                    </table>
                </div>
            </div>
        </body>
        </html>
      `;

      // Word export MIME type & UTF-8 BOM
      const mimeType = chosenFormat === 'docx' 
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
        : 'application/msword';
      const blob = new Blob(['\ufeff', htmlContent], {
        type: `${mimeType};charset=utf-8`
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const formattedIssueDate = issueDate.split('-').reverse().join('-');
      link.download = `GroundWaterQualityAlert_${formattedIssueDate}.${chosenFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Word export error:", e);
    } finally {
      setIsExportingWord(false);
    }
  };

  const handlePrint = () => {
    window.focus();
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const getIssuingOffice = () => {
    if (selectedIssuingOffice) return selectedIssuingOffice;
    if (alertIssuingOffice) return alertIssuingOffice;
    if (!isSingleState) return "CGWB, CHQ, Faridabad";
    const stateName = reportLocation.trim();
    const normalizedMatch = Object.keys(CGWB_LABS).find(k => k.toLowerCase() === stateName.toLowerCase());
    if (normalizedMatch) {
      return `CGWB, ${CGWB_LABS[normalizedMatch].replace(', ', '-')}`;
    }
    return `CGWB, Regional Office-${stateName}`;
  };

  return (
    <div 
      className="bg-white p-4 sm:p-8 rounded-3xl border border-slate-200 shadow-sm min-h-[500px] w-full max-w-full min-w-0 overflow-hidden box-border"
      style={{
        fontFamily: 
          contaminationFont === 'times' ? "'Times New Roman', Times, serif" :
          contaminationFont === 'calibri' ? "Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif" :
          contaminationFont === 'georgia' ? "Georgia, Cambria, 'Times New Roman', serif" :
          contaminationFont === 'arial' ? "Arial, 'Helvetica Neue', Helvetica, sans-serif" :
          contaminationFont === 'garamond' ? "Garamond, 'Baskerville', 'Hoefler Text', serif" :
          contaminationFont === 'mono' ? "'JetBrains Mono', monospace" : "Inter, system-ui, sans-serif",
      }}
    >
      
      {uploadError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-950 p-4 rounded-2xl shadow-xs flex justify-between items-center mb-6">
          <div>
            <p className="font-bold text-sm">Upload Alert</p>
            <p className="text-xs">{uploadError}</p>
          </div>
          <button onClick={() => setUploadError('')} className="text-rose-700 hover:text-rose-950 p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Tabs & Data Controls Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3 rounded-2xl mb-5 no-print border border-slate-200 shadow-xs w-full max-w-full">
        <div className="flex flex-wrap gap-1.5">
          <button 
            onClick={() => setActiveSubTab('report')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${activeSubTab === 'report' ? 'bg-indigo-600 text-white shadow-xs border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
          >
            Alert Report (Doc)
          </button>
          <button 
            onClick={() => setActiveSubTab('excel')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${activeSubTab === 'excel' ? 'bg-emerald-600 text-white shadow-xs border-emerald-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Alert Excel Generator
          </button>
          <button 
            onClick={() => setActiveSubTab('state')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${activeSubTab === 'state' ? 'bg-indigo-600 text-white shadow-xs border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
          >
            State Summary
          </button>
          <button 
            onClick={() => setActiveSubTab('district')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${activeSubTab === 'district' ? 'bg-indigo-600 text-white shadow-xs border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
          >
            District Summary
          </button>
          <button 
            onClick={() => setActiveSubTab('map')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${activeSubTab === 'map' ? 'bg-indigo-600 text-white shadow-xs border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
          >
            Spatial Map
          </button>
          <button 
            onClick={() => setActiveSubTab('standards')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${activeSubTab === 'standards' ? 'bg-indigo-600 text-white shadow-xs border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
          >
            Standards Table
          </button>
          <button 
            onClick={() => setActiveSubTab('treatments')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${activeSubTab === 'treatments' ? 'bg-indigo-600 text-white shadow-xs border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
          >
            Treatment Measures
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button 
            onClick={() => {
              if (activeSubTab === 'excel') {
                generateAlertExcel();
              } else {
                setActiveSubTab('excel');
              }
            }}
            disabled={isExportingExcel}
            className="px-3.5 py-2 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 shadow-xs transition-all text-xs cursor-pointer flex items-center gap-1.5"
            title="Generate formatted Excel workbook as per CGWB alert guidelines"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{isExportingExcel ? 'Generating...' : 'Generate Alert Excel'}</span>
          </button>

          <button onClick={downloadTemplate} className="px-3 py-2 rounded-xl font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-xs transition-all text-xs cursor-pointer">
            Template
          </button>
          <label className="px-3 py-2 rounded-xl font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-xs transition-all cursor-pointer text-xs flex items-center gap-1">
            <Globe className="w-3.5 h-3.5 text-indigo-600" />
            Shapefile (ZIP)
            <input type="file" accept=".zip" className="hidden" onChange={handleShapefileUpload} />
          </label>
          <label className="px-3 py-2 rounded-xl font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-xs transition-all cursor-pointer text-xs flex items-center gap-1">
            <Upload className="w-3.5 h-3.5 text-indigo-600" />
            Override Data
            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} />
          </label>
          {internalRawData.length > 0 && (
            <button onClick={() => setInternalRawData([])} className="px-3 py-2 rounded-xl font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors text-xs shadow-xs cursor-pointer">
              Clear Override
            </button>
          )}
        </div>
      </div>

      {/* PARAMETER SELECTION FOR ALERTS (Facility to choose parameters for alert issuance) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-xs no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shadow-xs">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 font-sans">
                  Choose Parameters for Alert Issuance
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                  {selectedAlertParams.length} of {ALERT_PARAM_DEFINITIONS.length} Selected
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium font-sans">
                Only selected parameters will trigger water quality alerts, appear in summaries, and populate the generated Excel sheet.
              </p>
            </div>
          </div>

          {/* Quick preset filter buttons */}
          <div className="flex flex-wrap items-center gap-1.5 font-sans">
            <button
              onClick={() => setSelectedAlertParams(ALERT_PARAM_DEFINITIONS.map(p => p.key))}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-all cursor-pointer"
            >
              Select All ({ALERT_PARAM_DEFINITIONS.length})
            </button>
            <button
              onClick={() => setSelectedAlertParams(ALERT_PARAM_DEFINITIONS.filter(p => p.group === 'major').map(p => p.key))}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-all cursor-pointer"
            >
              Major Ions ({ALERT_PARAM_DEFINITIONS.filter(p => p.group === 'major').length})
            </button>
            <button
              onClick={() => setSelectedAlertParams(ALERT_PARAM_DEFINITIONS.filter(p => p.group === 'metal').map(p => p.key))}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-all cursor-pointer"
            >
              Heavy Metals with Limits ({ALERT_PARAM_DEFINITIONS.filter(p => p.group === 'metal').length})
            </button>
            <button
              onClick={() => {
                const exceededKeys = ALERT_PARAM_DEFINITIONS.filter(p => {
                  const s = paramExceedanceStats[p.key];
                  return s && (s.unsafe > 0 || s.marginal > 0);
                }).map(p => p.key);
                setSelectedAlertParams(exceededKeys.length > 0 ? exceededKeys : ALERT_PARAM_DEFINITIONS.map(p => p.key));
              }}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition-all cursor-pointer flex items-center gap-1"
              title="Select only parameters that have recorded exceedances in the current data"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              Exceeded Only
            </button>
            <button
              onClick={() => setSelectedAlertParams([])}
              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-500 border border-slate-300 transition-all cursor-pointer"
            >
              Clear
            </button>
            <button
              onClick={() => setIsParamSelectorOpen(!isParamSelectorOpen)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 border border-slate-200 bg-white ml-1 cursor-pointer"
              title={isParamSelectorOpen ? "Collapse Parameter Panel" : "Expand Parameter Panel"}
            >
              {isParamSelectorOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Collapsible Parameter Chips Grid */}
        {isParamSelectorOpen && (
          <div className="pt-3 font-sans">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {ALERT_PARAM_DEFINITIONS.map(param => {
                const isSelected = selectedAlertParams.includes(param.key);
                const stats = paramExceedanceStats[param.key] || { unsafe: 0, marginal: 0, totalTested: 0 };
                const hasExceedance = stats.unsafe > 0 || stats.marginal > 0;

                return (
                  <button
                    key={param.key}
                    type="button"
                    onClick={() => {
                      setSelectedAlertParams(prev =>
                        prev.includes(param.key)
                          ? prev.filter(k => k !== param.key)
                          : [...prev, param.key]
                      );
                    }}
                    className={`p-2 rounded-xl text-left border transition-all duration-150 cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-white border-blue-500 shadow-sm ring-1 ring-blue-500'
                        : 'bg-slate-50/70 border-slate-200 opacity-60 hover:opacity-90 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 w-full mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isSelected ? (
                          <CheckSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="font-black text-xs text-slate-800 truncate" title={param.displayHeader}>
                          {param.shortName}
                        </span>
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 shrink-0">
                        {param.rangeText}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {stats.unsafe > 0 ? (
                        <span className="bg-red-600 text-white text-[8px] font-black px-1.5 py-0.2 rounded uppercase tracking-wider" title={`${stats.unsafe} samples exceed permissible limit`}>
                          {stats.unsafe} Unsafe
                        </span>
                      ) : null}
                      {stats.marginal > 0 ? (
                        <span className="bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.2 rounded uppercase tracking-wider" title={`${stats.marginal} samples exceed acceptable limit`}>
                          {stats.marginal} Accept.
                        </span>
                      ) : null}
                      {!hasExceedance ? (
                        <span className="text-slate-400 text-[8px] font-bold">
                          Safe ({stats.totalTested})
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bottom Quick Indicator */}
            <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
                <span className="font-semibold text-slate-600 text-[11px]">
                  Alert active for: <b className="text-slate-900">{selectedAlertParams.length}</b> parameters • 
                  <b className="text-red-600 ml-1">
                    {ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key)).reduce((acc, p) => acc + (paramExceedanceStats[p.key]?.unsafe || 0), 0)}
                  </b> Permissible Exceedances • 
                  <b className="text-amber-600 ml-1">
                    {ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key)).reduce((acc, p) => acc + (paramExceedanceStats[p.key]?.marginal || 0), 0)}
                  </b> Acceptable Exceedances
                </span>
              </div>
              <button
                onClick={generateAlertExcel}
                disabled={isExportingExcel || selectedAlertParams.length === 0}
                className="px-3 py-1 rounded-lg text-[11px] font-black text-white bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 shadow-sm transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3 h-3" />
                <span>Export Official Alert Sheet (.xlsx)</span>
              </button>
            </div>
          </div>
        )}
      </div>


      {processedRawData.length === 0 ? (
        <div className="p-16 text-center border-2 border-dashed border-slate-300 rounded-3xl bg-slate-50/50">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-bold text-slate-700 mb-1">No Compliance Data Loaded</h3>
          <p className="text-slate-500 text-xs max-w-md mx-auto">
            Please upload a spreadsheet containing water chemistry parameters in the main app, or use "Override Data" above to load data directly.
          </p>
        </div>
      ) : (
        <>
          {activeSubTab === 'report' && (
            <div className="space-y-6 mb-8 w-full max-w-full font-sans">
              {/* Hidden file input for replacing logo image via mouse */}
              <input
                type="file"
                ref={logoFileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />

              {/* Publication Header & Quick Actions */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-5 flex flex-wrap justify-between items-center gap-3 no-print">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-bold">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                      Ground Water Quality Alert Document
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                      Publication-Grade Studio • Margins, Logos, Headers, Footers, Tables & Page Numbering
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowDocToolbar(prev => !prev)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                      showDocToolbar
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                    title="Toggle formatting & customization studio"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Formatting Studio</span>
                  </button>

                  <button 
                    onClick={() => handleDownloadWord('docx')} 
                    disabled={isExportingWord}
                    className="px-4 py-2 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 border border-indigo-700 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer text-xs disabled:opacity-50"
                    title="Download fully formatted publication Microsoft Word document (.docx)"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>{isExportingWord ? "Exporting..." : "Download Word (.docx)"}</span>
                  </button>

                  <button 
                    onClick={() => handleDownloadWord('doc')} 
                    disabled={isExportingWord}
                    className="px-3 py-2 rounded-xl font-bold text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 shadow-xs transition-all flex items-center gap-1 cursor-pointer text-xs disabled:opacity-50"
                    title="Download compatible Microsoft Word .doc"
                  >
                    <span>.doc</span>
                  </button>

                  <button 
                    onClick={handlePrint} 
                    className="px-3.5 py-2 rounded-xl font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer text-xs"
                    title="Print publication document or save as PDF"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                </div>
              </div>

              {/* COMPREHENSIVE PUBLICATION STUDIO TOOLBAR */}
              {showDocToolbar && (
                <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-5 space-y-4 no-print">
                  {/* Studio Tabs Navigation */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                    <div className="flex flex-wrap gap-1">
                      {[
                        { id: 'margins', label: '1. Margins & Layout' },
                        { id: 'logo', label: '2. CGWB / Logo Image' },
                        { id: 'headerfooter', label: '3. Header & Footer' },
                        { id: 'dates', label: '4. Dates & Titles' },
                        { id: 'tables', label: '5. Table Colors' },
                        { id: 'typography', label: '6. Typography' },
                        { id: 'pages', label: '7. Page Numbers' }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setStudioActiveTab(tab.id as any)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            studioActiveTab === tab.id
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1 text-[11px]">
                      <span className="text-slate-400 font-semibold mr-1">Presets:</span>
                      <button
                        onClick={() => {
                          setContaminationFont('times');
                          setDocTextColor('#1e293b');
                          setDocHeadingColor('#0f172a');
                          setTableHeaderBg('#f1f5f9');
                          setTableHeaderTextColor('#0f172a');
                          setPageMarginTop(0.75);
                          setPageMarginBottom(0.75);
                          setPageMarginLeft(0.75);
                          setPageMarginRight(0.75);
                          setLogoPlacement('header-left');
                          setShowHeader(true);
                          setShowFooter(true);
                          setPageNumberFormat('page_x_of_y');
                        }}
                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-300 text-[10px] cursor-pointer"
                      >
                        Official Publication
                      </button>
                      <button
                        onClick={() => {
                          setContaminationFont('calibri');
                          setDocTextColor('#0f172a');
                          setDocHeadingColor('#1e3a8a');
                          setTableHeaderBg('#1e3a8a');
                          setTableHeaderTextColor('#ffffff');
                          setPageMarginTop(0.6);
                          setPageMarginBottom(0.6);
                          setPageMarginLeft(0.6);
                          setPageMarginRight(0.6);
                          setLogoPlacement('header-right');
                          setShowHeader(true);
                          setShowFooter(true);
                          setPageNumberFormat('page_x_of_y');
                        }}
                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-300 text-[10px] cursor-pointer"
                      >
                        Executive Blue
                      </button>
                    </div>
                  </div>

                  {/* TAB 1: MARGINS & LAYOUT */}
                  {studioActiveTab === 'margins' && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800">
                          Page Margins (Applies to Word Document & On-Screen Layout):
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setPageMarginTop(0.75);
                              setPageMarginBottom(0.75);
                              setPageMarginLeft(0.75);
                              setPageMarginRight(0.75);
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer"
                          >
                            Standard (0.75 in)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPageMarginTop(0.5);
                              setPageMarginBottom(0.5);
                              setPageMarginLeft(0.5);
                              setPageMarginRight(0.5);
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer"
                          >
                            Narrow (0.5 in)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPageMarginTop(1.0);
                              setPageMarginBottom(1.0);
                              setPageMarginLeft(1.0);
                              setPageMarginRight(1.0);
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer"
                          >
                            Wide (1.0 in)
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                          <label className="font-bold text-slate-700 block mb-1">Top Margin</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0.3"
                              max="1.5"
                              step="0.05"
                              value={pageMarginTop}
                              onChange={(e) => setPageMarginTop(parseFloat(e.target.value))}
                              className="w-full cursor-pointer accent-indigo-600"
                            />
                            <span className="font-mono font-bold text-slate-800 w-12 text-right">{pageMarginTop.toFixed(2)}"</span>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                          <label className="font-bold text-slate-700 block mb-1">Bottom Margin</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0.3"
                              max="1.5"
                              step="0.05"
                              value={pageMarginBottom}
                              onChange={(e) => setPageMarginBottom(parseFloat(e.target.value))}
                              className="w-full cursor-pointer accent-indigo-600"
                            />
                            <span className="font-mono font-bold text-slate-800 w-12 text-right">{pageMarginBottom.toFixed(2)}"</span>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                          <label className="font-bold text-slate-700 block mb-1">Left Margin</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0.3"
                              max="1.5"
                              step="0.05"
                              value={pageMarginLeft}
                              onChange={(e) => setPageMarginLeft(parseFloat(e.target.value))}
                              className="w-full cursor-pointer accent-indigo-600"
                            />
                            <span className="font-mono font-bold text-slate-800 w-12 text-right">{pageMarginLeft.toFixed(2)}"</span>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                          <label className="font-bold text-slate-700 block mb-1">Right Margin</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0.3"
                              max="1.5"
                              step="0.05"
                              value={pageMarginRight}
                              onChange={(e) => setPageMarginRight(parseFloat(e.target.value))}
                              className="w-full cursor-pointer accent-indigo-600"
                            />
                            <span className="font-mono font-bold text-slate-800 w-12 text-right">{pageMarginRight.toFixed(2)}"</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={enableParaIIPageBreak}
                            onChange={(e) => setEnableParaIIPageBreak(e.target.checked)}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                          />
                          <span className="font-bold text-slate-800">
                            Force Para II to start on a brand new page
                          </span>
                        </label>
                        <span className="text-[11px] text-slate-500 italic">
                          (Leave unchecked for continuous natural page flow)
                        </span>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: CGWB / CUSTOM LOGO INSERTION & MOUSE REPLACEMENT */}
                  {studioActiveTab === 'logo' && (
                    <div className="space-y-4 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-700 block">Logo Placement:</label>
                          <select
                            value={logoPlacement}
                            onChange={(e: any) => setLogoPlacement(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-semibold text-slate-800 outline-none focus:border-indigo-500"
                          >
                            <option value="none">None (No Logo)</option>
                            <option value="header-left">Header — Left Aligned</option>
                            <option value="header-center">Header — Center Aligned</option>
                            <option value="header-right">Header — Right Aligned</option>
                            <option value="title-top">Top Letterhead (Above Document Title)</option>
                            <option value="title-left">Beside Title (Left of Document Title)</option>
                            <option value="footer-left">Footer — Left Aligned</option>
                            <option value="footer-center">Footer — Center Aligned</option>
                            <option value="footer-right">Footer — Right Aligned</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-700 block">Logo Height:</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="24"
                              max="64"
                              value={logoHeight}
                              onChange={(e) => setLogoHeight(parseInt(e.target.value, 10))}
                              className="w-full cursor-pointer accent-indigo-600"
                            />
                            <span className="font-mono font-bold text-slate-800 w-12 text-right">{logoHeight}px</span>
                          </div>
                        </div>

                        {/* Mouse replacement facility */}
                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-700 block">Logo Image Controls:</label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => logoFileInputRef.current?.click()}
                              className="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                              title="Click to replace logo with your own image via mouse"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>Replace Image</span>
                            </button>
                            <button
                              type="button"
                              onClick={resetToDefaultCgwbLogo}
                              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer flex items-center gap-1"
                              title="Reset back to official CGWB Emblem"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>CGWB</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Live Logo Preview Box */}
                      {logoPlacement !== 'none' && (
                        <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div 
                              onClick={() => logoFileInputRef.current?.click()}
                              className="cursor-pointer group relative p-1.5 bg-white border border-slate-300 rounded-lg hover:border-indigo-500 shadow-2xs"
                              title="Click with mouse to replace logo image"
                            >
                              {logoImageSrc ? (
                                <img
                                  src={logoImageSrc}
                                  alt="Selected Logo"
                                  style={{ height: `${logoHeight}px` }}
                                  className="w-auto object-contain"
                                />
                              ) : (
                                <div className="h-10 w-16 bg-slate-100 rounded flex items-center justify-center text-slate-400 font-bold">
                                  No Logo
                                </div>
                              )}
                              <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 rounded-lg transition-opacity flex items-center justify-center text-[9px] font-bold text-indigo-900 bg-white/80">
                                Replace
                              </div>
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-xs">
                                Position: <span className="text-indigo-600 capitalize">{logoPlacement.replace('-', ' ')}</span>
                              </p>
                              <p className="text-[11px] text-slate-500">
                                Tip: You can also click directly on the logo in the document preview below with your mouse to replace it!
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setLogoPlacement('none')}
                            className="px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded-lg font-bold border border-rose-200 cursor-pointer"
                          >
                            Remove Logo
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: HEADER & FOOTER TEXT */}
                  {studioActiveTab === 'headerfooter' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {/* Header Text Settings */}
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">Page Header:</span>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showHeader}
                              onChange={(e) => setShowHeader(e.target.checked)}
                              className="w-3.5 h-3.5 text-indigo-600 rounded"
                            />
                            <span className="font-bold text-[11px] text-slate-700">Enable Header</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          value={headerText}
                          onChange={(e) => setHeaderText(e.target.value)}
                          placeholder="Header text e.g. Central Ground Water Board"
                          disabled={!showHeader}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-indigo-500 disabled:opacity-50"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-semibold text-[11px]">Header Alignment:</span>
                          <div className="flex rounded-lg border border-slate-300 overflow-hidden bg-white">
                            {(['left', 'center', 'right'] as const).map(pos => (
                              <button
                                key={pos}
                                type="button"
                                onClick={() => setHeaderPosition(pos)}
                                className={`px-2.5 py-1 text-[11px] font-bold capitalize cursor-pointer transition ${headerPosition === pos ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                              >
                                {pos}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Footer Text Settings */}
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">Page Footer:</span>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showFooter}
                              onChange={(e) => setShowFooter(e.target.checked)}
                              className="w-3.5 h-3.5 text-indigo-600 rounded"
                            />
                            <span className="font-bold text-[11px] text-slate-700">Enable Footer</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          value={footerText}
                          onChange={(e) => setFooterText(e.target.value)}
                          placeholder="Footer text e.g. Ground Water Quality Alert Document"
                          disabled={!showFooter}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-indigo-500 disabled:opacity-50"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-semibold text-[11px]">Footer Alignment:</span>
                          <div className="flex rounded-lg border border-slate-300 overflow-hidden bg-white">
                            {(['left', 'center', 'right'] as const).map(pos => (
                              <button
                                key={pos}
                                type="button"
                                onClick={() => setFooterPosition(pos)}
                                className={`px-2.5 py-1 text-[11px] font-bold capitalize cursor-pointer transition ${footerPosition === pos ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                              >
                                {pos}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: DATES & TITLES CUSTOMIZATION */}
                  {studioActiveTab === 'dates' && (
                    <div className="space-y-4 text-xs">
                      {/* Document Title & Subtitle */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 block">Document Main Title:</label>
                          <input
                            type="text"
                            value={documentTitleText}
                            onChange={(e) => setDocumentTitleText(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 block">Subtitle (Optional):</label>
                          <input
                            type="text"
                            value={documentSubTitleText}
                            onChange={(e) => setDocumentSubTitleText(e.target.value)}
                            placeholder="Leave empty for no subtitle"
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 block">Title Case / Type:</label>
                          <select
                            value={titleTransform}
                            onChange={(e: any) => setTitleTransform(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                          >
                            <option value="uppercase">UPPERCASE</option>
                            <option value="capitalize">Title Case</option>
                            <option value="none">As Typed</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 block">Title Style:</label>
                          <div className="flex items-center gap-3 pt-1">
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={titleUnderline}
                                onChange={(e) => setTitleUnderline(e.target.checked)}
                                className="w-3.5 h-3.5 text-indigo-600 rounded"
                              />
                              <span className="font-semibold text-slate-700 text-xs underline">Underline</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={titleFontWeight === 'black'}
                                onChange={(e) => setTitleFontWeight(e.target.checked ? 'black' : 'bold')}
                                className="w-3.5 h-3.5 text-indigo-600 rounded"
                              />
                              <span className="font-black text-slate-800 text-xs">Extra Bold</span>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Dates and Field Labels */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1">
                          <label className="font-bold text-slate-700 block">From Date Label & Value:</label>
                          <input
                            type="text"
                            value={periodLabel}
                            onChange={(e) => setPeriodLabel(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs mb-1 font-semibold"
                            placeholder="Period Label"
                          />
                          <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold"
                          />
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1">
                          <label className="font-bold text-slate-700 block">To Date Value:</label>
                          <div className="h-6 flex items-center text-slate-500 text-[11px] font-semibold">End Period Date</div>
                          <input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold"
                          />
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1">
                          <label className="font-bold text-slate-700 block">Issue Date Label & Value:</label>
                          <input
                            type="text"
                            value={issueDateLabel}
                            onChange={(e) => setIssueDateLabel(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs mb-1 font-semibold"
                            placeholder="Issue Date Label"
                          />
                          <input
                            type="date"
                            value={issueDate}
                            onChange={(e) => setIssueDate(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold"
                          />
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="font-bold text-slate-700 block">Last Updated Date:</label>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={showUpdatedDate}
                                onChange={(e) => setShowUpdatedDate(e.target.checked)}
                                className="w-3.5 h-3.5 text-indigo-600 rounded"
                              />
                              <span className="text-[10px] font-bold text-indigo-700">Show</span>
                            </label>
                          </div>
                          <input
                            type="text"
                            value={updatedDateLabel}
                            onChange={(e) => setUpdatedDateLabel(e.target.value)}
                            disabled={!showUpdatedDate}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs mb-1 font-semibold disabled:opacity-50"
                            placeholder="Updated Date Label"
                          />
                          <input
                            type="date"
                            value={updatedDate}
                            onChange={(e) => setUpdatedDate(e.target.value)}
                            disabled={!showUpdatedDate}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold disabled:opacity-50"
                          />
                        </div>
                      </div>

                      {/* Location & Office Label Customization */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center gap-2">
                          <span className="font-bold text-slate-700 shrink-0">Location Label:</span>
                          <input
                            type="text"
                            value={locationLabel}
                            onChange={(e) => setLocationLabel(e.target.value)}
                            className="flex-1 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold"
                          />
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center gap-2">
                          <span className="font-bold text-slate-700 shrink-0">Office Label:</span>
                          <input
                            type="text"
                            value={issuingOfficeLabel}
                            onChange={(e) => setIssuingOfficeLabel(e.target.value)}
                            className="flex-1 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold"
                          />
                        </div>
                      </div>

                      {/* Comprehensive CGWB Alert Issuing Office Selector */}
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <label className="font-bold text-slate-800 flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-indigo-600" />
                            <span>CGWB Alert Issuing Office:</span>
                          </label>
                          <span className="text-[10px] text-slate-500 font-medium">
                            Choose from all 19 official regional & CHQ offices
                          </span>
                        </div>
                        <select
                          value={selectedIssuingOffice}
                          onChange={(e) => {
                            setSelectedIssuingOffice(e.target.value);
                            setAlertIssuingOffice(e.target.value);
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 cursor-pointer shadow-2xs"
                        >
                          {CGWB_ISSUING_OFFICES.map(office => (
                            <option key={office} value={office}>{office}</option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scrollbar p-1.5 bg-white rounded-lg border border-slate-200">
                          {CGWB_ISSUING_OFFICES.map(office => (
                            <button
                              key={office}
                              type="button"
                              onClick={() => {
                                setSelectedIssuingOffice(office);
                                setAlertIssuingOffice(office);
                              }}
                              className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition ${
                                (selectedIssuingOffice === office || alertIssuingOffice === office)
                                  ? 'bg-indigo-600 text-white shadow-2xs'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }`}
                            >
                              {office}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 5: TABLE STYLING (HEADER FILL & TEXT COLOR) */}
                  {studioActiveTab === 'tables' && (
                    <div className="space-y-4 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* Header Row Fill Color */}
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                          <label className="font-bold text-slate-700 flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded border border-slate-300" style={{ backgroundColor: tableHeaderBg }}></span>
                            <span>Table Header Row Fill Color</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={tableHeaderBg}
                              onChange={(e) => setTableHeaderBg(e.target.value)}
                              className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0.5 bg-white shrink-0"
                            />
                            <div className="flex flex-wrap gap-1 flex-1">
                              {[
                                { name: 'Slate Light', hex: '#f1f5f9' },
                                { name: 'Ice Blue', hex: '#e0f2fe' },
                                { name: 'Royal Navy', hex: '#1e3a8a' },
                                { name: 'Deep Indigo', hex: '#312e81' },
                                { name: 'Emerald', hex: '#064e3b' },
                                { name: 'Charcoal', hex: '#1e293b' },
                                { name: 'Pure White', hex: '#ffffff' }
                              ].map(c => (
                                <button
                                  key={c.hex}
                                  type="button"
                                  onClick={() => setTableHeaderBg(c.hex)}
                                  className={`w-5 h-5 rounded border cursor-pointer transition ${tableHeaderBg.toLowerCase() === c.hex.toLowerCase() ? 'ring-2 ring-indigo-600 scale-110' : 'border-slate-300'}`}
                                  style={{ backgroundColor: c.hex }}
                                  title={c.name}
                                />
                              ))}
                            </div>
                          </div>
                          <span className="font-mono text-[10px] text-slate-500">{tableHeaderBg}</span>
                        </div>

                        {/* Header Row Text Color */}
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                          <label className="font-bold text-slate-700 flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded border border-slate-300" style={{ backgroundColor: tableHeaderTextColor }}></span>
                            <span>Table Header Text Color</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={tableHeaderTextColor}
                              onChange={(e) => setTableHeaderTextColor(e.target.value)}
                              className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0.5 bg-white shrink-0"
                            />
                            <div className="flex flex-wrap gap-1 flex-1">
                              {[
                                { name: 'Dark Slate', hex: '#0f172a' },
                                { name: 'Pure White', hex: '#ffffff' },
                                { name: 'Deep Navy', hex: '#1e3a8a' },
                                { name: 'Gold Amber', hex: '#fef08a' },
                                { name: 'Emerald', hex: '#047857' }
                              ].map(c => (
                                <button
                                  key={c.hex}
                                  type="button"
                                  onClick={() => setTableHeaderTextColor(c.hex)}
                                  className={`w-5 h-5 rounded border cursor-pointer transition ${tableHeaderTextColor.toLowerCase() === c.hex.toLowerCase() ? 'ring-2 ring-indigo-600 scale-110' : 'border-slate-300'}`}
                                  style={{ backgroundColor: c.hex }}
                                  title={c.name}
                                />
                              ))}
                            </div>
                          </div>
                          <span className="font-mono text-[10px] text-slate-500">{tableHeaderTextColor}</span>
                        </div>

                        {/* Table Border Color & Striping */}
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                          <label className="font-bold text-slate-700 block">Table Borders & Alternate Rows:</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={tableBorderColor}
                              onChange={(e) => setTableBorderColor(e.target.value)}
                              className="w-7 h-7 rounded border border-slate-300 cursor-pointer p-0.5 bg-white shrink-0"
                              title="Pick border color"
                            />
                            <select
                              value={tableBorderColor}
                              onChange={(e) => setTableBorderColor(e.target.value)}
                              className="flex-1 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold"
                            >
                              <option value="#334155">Dark Slate (#334155)</option>
                              <option value="#000000">Pure Black (#000000)</option>
                              <option value="#94a3b8">Medium Gray (#94a3b8)</option>
                              <option value="#cbd5e1">Subtle Light (#cbd5e1)</option>
                              <option value="#1e3a8a">Navy Accent (#1e3a8a)</option>
                            </select>
                          </div>
                          <label className="flex items-center gap-1.5 pt-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={tableZebraStriping}
                              onChange={(e) => setTableZebraStriping(e.target.checked)}
                              className="w-3.5 h-3.5 text-indigo-600 rounded"
                            />
                            <span className="font-bold text-slate-700 text-[11px]">Zebra Alternate Row Shading</span>
                          </label>
                        </div>
                      </div>

                      {/* Table Live Mini-Preview */}
                      <div className="p-3 bg-white border rounded-xl shadow-2xs">
                        <span className="font-bold text-[11px] text-slate-500 block mb-1">Live Table Style Preview:</span>
                        <table className="w-full text-center text-xs border-collapse" style={{ border: `1px solid ${tableBorderColor}` }}>
                          <thead>
                            <tr style={{ backgroundColor: tableHeaderBg, color: tableHeaderTextColor }}>
                              <th className="p-1.5" style={{ border: `1px solid ${tableBorderColor}` }}>Sl. No.</th>
                              <th className="p-1.5 text-left" style={{ border: `1px solid ${tableBorderColor}` }}>District / Area</th>
                              <th className="p-1.5" style={{ border: `1px solid ${tableBorderColor}` }}>Analyzed</th>
                              <th className="p-1.5" style={{ border: `1px solid ${tableBorderColor}` }}>Contaminated</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr style={{ backgroundColor: '#ffffff' }}>
                              <td className="p-1" style={{ border: `1px solid ${tableBorderColor}` }}>1</td>
                              <td className="p-1 text-left font-bold" style={{ border: `1px solid ${tableBorderColor}` }}>Sample District A</td>
                              <td className="p-1 font-bold" style={{ border: `1px solid ${tableBorderColor}` }}>45</td>
                              <td className="p-1 font-bold text-red-600" style={{ border: `1px solid ${tableBorderColor}` }}>12</td>
                            </tr>
                            <tr style={{ backgroundColor: tableZebraStriping ? '#f8fafc' : '#ffffff' }}>
                              <td className="p-1" style={{ border: `1px solid ${tableBorderColor}` }}>2</td>
                              <td className="p-1 text-left font-bold" style={{ border: `1px solid ${tableBorderColor}` }}>Sample District B</td>
                              <td className="p-1 font-bold" style={{ border: `1px solid ${tableBorderColor}` }}>38</td>
                              <td className="p-1 font-bold text-red-600" style={{ border: `1px solid ${tableBorderColor}` }}>8</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* TAB 6: TYPOGRAPHY & COLORS */}
                  {studioActiveTab === 'typography' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                      {/* Font Family Selection */}
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 flex items-center gap-1.5">
                          <Type className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Font Family</span>
                        </label>
                        <select
                          value={contaminationFont}
                          onChange={(e: any) => setContaminationFont(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
                        >
                          <option value="times">Times New Roman (Academic / Official)</option>
                          <option value="calibri">Calibri (Standard Executive)</option>
                          <option value="georgia">Georgia (Classic Publication)</option>
                          <option value="arial">Arial (Modern Clean)</option>
                          <option value="garamond">Garamond (Editorial Heritage)</option>
                          <option value="sans">Inter (Contemporary Clean)</option>
                        </select>
                      </div>

                      {/* Text Body Color */}
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 flex items-center gap-1.5">
                          <span className="w-3.5 h-3.5 rounded-full border border-slate-300" style={{ backgroundColor: docTextColor }}></span>
                          <span>Body Text Color</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={docTextColor}
                            onChange={(e) => setDocTextColor(e.target.value)}
                            className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white shrink-0"
                          />
                          <div className="flex items-center gap-1 flex-1">
                            {['#1e293b', '#000000', '#1e3a8a', '#334155'].map(hex => (
                              <button
                                key={hex}
                                type="button"
                                onClick={() => setDocTextColor(hex)}
                                className={`w-6 h-6 rounded-md border cursor-pointer ${docTextColor.toLowerCase() === hex.toLowerCase() ? 'ring-2 ring-indigo-500' : 'border-slate-300'}`}
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Heading Color */}
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 flex items-center gap-1.5">
                          <span className="w-3.5 h-3.5 rounded-full border border-slate-300" style={{ backgroundColor: docHeadingColor }}></span>
                          <span>Heading Color</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={docHeadingColor}
                            onChange={(e) => setDocHeadingColor(e.target.value)}
                            className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white shrink-0"
                          />
                          <div className="flex items-center gap-1 flex-1">
                            {['#0f172a', '#1e3a8a', '#000000', '#14532d', '#881337'].map(hex => (
                              <button
                                key={hex}
                                type="button"
                                onClick={() => setDocHeadingColor(hex)}
                                className={`w-6 h-6 rounded-md border cursor-pointer ${docHeadingColor.toLowerCase() === hex.toLowerCase() ? 'ring-2 ring-indigo-500' : 'border-slate-300'}`}
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Font Sizes */}
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 block">Sizes (pt):</label>
                        <div className="grid grid-cols-3 gap-1">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Body</span>
                            <select
                              value={bodyFontSize}
                              onChange={(e) => setBodyFontSize(parseFloat(e.target.value))}
                              className="w-full bg-slate-50 border border-slate-300 rounded p-1 text-xs font-bold"
                            >
                              <option value="9">9pt</option>
                              <option value="9.5">9.5pt</option>
                              <option value="10">10pt</option>
                              <option value="10.5">10.5pt</option>
                              <option value="11">11pt</option>
                            </select>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Head</span>
                            <select
                              value={headingFontSize}
                              onChange={(e) => setHeadingFontSize(parseFloat(e.target.value))}
                              className="w-full bg-slate-50 border border-slate-300 rounded p-1 text-xs font-bold"
                            >
                              <option value="12">12pt</option>
                              <option value="13">13pt</option>
                              <option value="14">14pt</option>
                              <option value="15">15pt</option>
                            </select>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Table</span>
                            <select
                              value={tableFontSize}
                              onChange={(e) => setTableFontSize(parseFloat(e.target.value))}
                              className="w-full bg-slate-50 border border-slate-300 rounded p-1 text-xs font-bold"
                            >
                              <option value="8">8pt</option>
                              <option value="8.5">8.5pt</option>
                              <option value="9">9pt</option>
                              <option value="9.5">9.5pt</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 7: CUSTOMISABLE PAGE NUMBERS */}
                  {studioActiveTab === 'pages' && (
                    <div className="space-y-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-700 block">Page Number Format:</label>
                          <select
                            value={pageNumberFormat}
                            onChange={(e: any) => setPageNumberFormat(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                          >
                            <option value="page_x_of_y">Page X of Y (e.g. Page 1 of 5)</option>
                            <option value="page_x">Page X (e.g. Page 1)</option>
                            <option value="x_of_y">X of Y (e.g. 1 of 5)</option>
                            <option value="dash_x_dash">- X - (e.g. - 1 -)</option>
                            <option value="none">None (Hide page numbers)</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-700 block">Page Number Position:</label>
                          <div className="flex rounded-lg border border-slate-300 overflow-hidden bg-white">
                            {[
                              { id: 'footer-left', label: 'Footer Left' },
                              { id: 'footer-center', label: 'Footer Center' },
                              { id: 'footer-right', label: 'Footer Right' },
                              { id: 'header-right', label: 'Header Right' }
                            ].map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => setPageNumberPosition(p.id as any)}
                                className={`px-2 py-1 text-[11px] font-bold cursor-pointer transition flex-1 ${pageNumberPosition === p.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="p-2 bg-white rounded border text-[11px] text-slate-600 flex items-center justify-between">
                        <span>Word Dynamic Field: In Microsoft Word, dynamic XML codes <b>{`{PAGE}`}</b> and <b>{`{NUMPAGES}`}</b> automatically update across every page.</span>
                        <span className="font-mono font-bold text-indigo-700">
                          {pageNumberFormat === 'page_x_of_y' ? 'Page 1 of 5' : pageNumberFormat === 'page_x' ? 'Page 1' : pageNumberFormat === 'x_of_y' ? '1 of 5' : pageNumberFormat === 'dash_x_dash' ? '- 1 -' : 'Hidden'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* GLOSSY WHITE PUBLICATION GRADE DOCUMENT CONTAINER */}
              <div className="bg-slate-100/70 p-3 sm:p-8 rounded-3xl border border-slate-200/90 shadow-inner">
                <div 
                  className="bg-white rounded-2xl shadow-[0_12px_45px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] border border-slate-200/90 max-w-4xl mx-auto print-container transition-all"
                  style={{
                    fontFamily: getDocFontFamilyCss(contaminationFont),
                    color: docTextColor,
                    fontSize: `${bodyFontSize}pt`,
                    lineHeight: lineSpacing === 'relaxed' ? 1.55 : lineSpacing === 'normal' ? 1.35 : 1.2,
                    textAlign: textAlignMode,
                    paddingTop: `${pageMarginTop * 54}px`,
                    paddingBottom: `${pageMarginBottom * 54}px`,
                    paddingLeft: `${pageMarginLeft * 54}px`,
                    paddingRight: `${pageMarginRight * 54}px`,
                    ['--page-print-margin-top' as any]: `${pageMarginTop}in`,
                    ['--page-print-margin-bottom' as any]: `${pageMarginBottom}in`,
                    ['--page-print-margin-left' as any]: `${pageMarginLeft}in`,
                    ['--page-print-margin-right' as any]: `${pageMarginRight}in`
                  }}
                >
                  {/* ON-SCREEN RUNNING HEADER (With logo if header placement, replaced with mouse click) */}
                  {showHeader && (
                    <div className="doc-screen-header border-b border-slate-300 pb-2 mb-6 flex items-center justify-between text-[11px] text-slate-600">
                      <div className="flex items-center gap-3">
                        {logoPlacement === 'header-left' && logoImageSrc && (
                          <div 
                            onClick={() => logoFileInputRef.current?.click()}
                            className="cursor-pointer group relative shrink-0"
                            title="Click with mouse to replace logo image"
                          >
                            <img
                              src={logoImageSrc}
                              alt="Logo"
                              style={{ height: `${logoHeight}px` }}
                              className="w-auto object-contain transition-transform group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 rounded transition-opacity flex items-center justify-center text-[8px] font-bold text-indigo-900 bg-white/70">
                              Replace
                            </div>
                          </div>
                        )}
                        <span className={`font-semibold tracking-wide ${headerPosition === 'center' ? 'mx-auto' : headerPosition === 'right' ? 'ml-auto' : ''}`}>
                          {headerText}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {logoPlacement === 'header-center' && logoImageSrc && (
                          <div 
                            onClick={() => logoFileInputRef.current?.click()}
                            className="cursor-pointer group relative shrink-0"
                            title="Click with mouse to replace logo image"
                          >
                            <img
                              src={logoImageSrc}
                              alt="Logo"
                              style={{ height: `${logoHeight}px` }}
                              className="w-auto object-contain transition-transform group-hover:scale-105"
                            />
                          </div>
                        )}
                        {pageNumberPosition === 'header-right' && pageNumberFormat !== 'none' && (
                          <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                            {pageNumberFormat === 'page_x_of_y' ? 'Page 1 of 1' : pageNumberFormat === 'page_x' ? 'Page 1' : pageNumberFormat === 'x_of_y' ? '1 of 1' : '- 1 -'}
                          </span>
                        )}
                        {logoPlacement === 'header-right' && logoImageSrc && (
                          <div 
                            onClick={() => logoFileInputRef.current?.click()}
                            className="cursor-pointer group relative shrink-0"
                            title="Click with mouse to replace logo image"
                          >
                            <img
                              src={logoImageSrc}
                              alt="Logo"
                              style={{ height: `${logoHeight}px` }}
                              className="w-auto object-contain transition-transform group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 rounded transition-opacity flex items-center justify-center text-[8px] font-bold text-indigo-900 bg-white/70">
                              Replace
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Document Title (Configurable case, weight, underline, colors) */}
                  <div className="text-center mb-8 pb-3 border-b-2 border-slate-800">
                    {/* Top Letterhead Logo if selected */}
                    {logoPlacement === 'title-top' && logoImageSrc && (
                      <div className="flex justify-center mb-3">
                        <div 
                          onClick={() => logoFileInputRef.current?.click()}
                          className="cursor-pointer group relative inline-block p-1 bg-white rounded-lg hover:ring-2 hover:ring-indigo-400 transition"
                          title="Click with mouse to replace logo image"
                        >
                          <img
                            src={logoImageSrc}
                            alt="Logo"
                            style={{ height: `${Math.round(logoHeight * 1.4)}px` }}
                            className="w-auto object-contain transition-transform group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 rounded transition-opacity flex items-center justify-center text-[8px] font-bold text-indigo-900 bg-white/70">
                            Replace
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-center gap-4">
                      {logoPlacement === 'title-left' && logoImageSrc && (
                        <div 
                          onClick={() => logoFileInputRef.current?.click()}
                          className="cursor-pointer group relative shrink-0 p-1 bg-white rounded-lg hover:ring-2 hover:ring-indigo-400 transition"
                          title="Click with mouse to replace logo image"
                        >
                          <img
                            src={logoImageSrc}
                            alt="Logo"
                            style={{ height: `${Math.round(logoHeight * 1.3)}px` }}
                            className="w-auto object-contain transition-transform group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 rounded transition-opacity flex items-center justify-center text-[8px] font-bold text-indigo-900 bg-white/70">
                            Replace
                          </div>
                        </div>
                      )}

                      <h1 
                        style={{
                          color: docHeadingColor,
                          fontSize: `${headingFontSize + 4}pt`,
                          fontFamily: getDocFontFamilyCss(contaminationFont),
                          fontWeight: titleFontWeight === 'black' ? 900 : titleFontWeight === 'bold' ? 'bold' : 'normal',
                          textDecoration: titleUnderline ? 'underline' : 'none',
                          textTransform: titleTransform
                        }}
                      >
                        {documentTitleText || "Ground Water Quality Alert"}
                      </h1>
                    </div>

                    {documentSubTitleText && (
                      <p className="text-xs font-semibold text-slate-600 mt-1 uppercase tracking-wider">
                        {documentSubTitleText}
                      </p>
                    )}
                  </div>
                  
                  {/* Location & Period Table (Uses custom headers, custom fill color, custom text color) */}
                  <table 
                    className="w-full border-collapse mb-8 bg-white shadow-2xs"
                    style={{ 
                      fontSize: `${tableFontSize}pt`, 
                      color: docTextColor,
                      border: `1px solid ${tableBorderColor}`
                    }}
                  >
                    <tbody>
                      <tr>
                        <td 
                          className="p-2 font-bold w-1/4"
                          style={{ 
                            backgroundColor: tableHeaderBg, 
                            color: tableHeaderTextColor, 
                            border: `1px solid ${tableBorderColor}` 
                          }}
                        >
                          {locationLabel}
                        </td>
                        <td className="p-2 w-1/4 font-semibold" style={{ border: `1px solid ${tableBorderColor}` }}>
                          {reportLocation}
                        </td>
                        <td 
                          className="p-2 font-bold w-1/4"
                          style={{ 
                            backgroundColor: tableHeaderBg, 
                            color: tableHeaderTextColor, 
                            border: `1px solid ${tableBorderColor}` 
                          }}
                        >
                          {periodLabel}
                        </td>
                        <td className="p-2 w-1/4 align-top" style={{ border: `1px solid ${tableBorderColor}` }}>
                          <div className="no-print flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="w-8 text-[11px] font-semibold text-slate-600">From</span>
                              <div className="relative flex-1 max-w-[110px]">
                                <div className="px-1.5 py-0.5 border border-slate-300 rounded text-xs bg-white text-center font-bold cursor-pointer hover:bg-slate-50 transition">
                                  {fromDate.split('-').reverse().join('/')}
                                </div>
                                <input 
                                  type="date" 
                                  value={fromDate} 
                                  onChange={e => setFromDate(e.target.value)} 
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                                  title="Select From Date" 
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-8 text-[11px] font-semibold text-slate-600">To</span>
                              <div className="relative flex-1 max-w-[110px]">
                                <div className="px-1.5 py-0.5 border border-slate-300 rounded text-xs bg-white text-center font-bold cursor-pointer hover:bg-slate-50 transition">
                                  {toDate.split('-').reverse().join('/')}
                                </div>
                                <input 
                                  type="date" 
                                  value={toDate} 
                                  onChange={e => setToDate(e.target.value)} 
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                                  title="Select To Date" 
                                />
                              </div>
                            </div>
                          </div>
                          <div className="print-only hidden font-semibold">
                            <div>From: {fromDate.split('-').reverse().join('/')}</div>
                            <div>To: {toDate.split('-').reverse().join('/')}</div>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td 
                          className="p-2 font-bold"
                          style={{ 
                            backgroundColor: tableHeaderBg, 
                            color: tableHeaderTextColor, 
                            border: `1px solid ${tableBorderColor}` 
                          }}
                        >
                          {issueDateLabel}
                        </td>
                        <td className="p-2 align-top" style={{ border: `1px solid ${tableBorderColor}` }}>
                          <div className="no-print relative max-w-[110px]">
                            <div className="px-1.5 py-0.5 border border-slate-300 rounded text-xs bg-white text-center font-bold cursor-pointer hover:bg-slate-50 transition">
                              {issueDate.split('-').reverse().join('/')}
                            </div>
                            <input 
                              type="date" 
                              value={issueDate} 
                              onChange={e => setIssueDate(e.target.value)} 
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                              title="Select Issue Date" 
                            />
                          </div>
                          <div className="print-only hidden font-semibold">
                            {issueDate.split('-').reverse().join('/')}
                          </div>
                        </td>
                        <td 
                          className="p-2 font-bold"
                          style={{ 
                            backgroundColor: tableHeaderBg, 
                            color: tableHeaderTextColor, 
                            border: `1px solid ${tableBorderColor}` 
                          }}
                        >
                          {issuingOfficeLabel}
                        </td>
                        <td className="p-2 font-semibold" style={{ border: `1px solid ${tableBorderColor}` }}>
                          <div className="no-print">
                            <select
                              value={selectedIssuingOffice || alertIssuingOffice || getIssuingOffice()}
                              onChange={(e) => {
                                setSelectedIssuingOffice(e.target.value);
                                setAlertIssuingOffice(e.target.value);
                              }}
                              className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 cursor-pointer shadow-2xs"
                              title="Choose issuing office from all 19 official CGWB offices"
                            >
                              {CGWB_ISSUING_OFFICES.map(office => (
                                <option key={office} value={office}>{office}</option>
                              ))}
                            </select>
                          </div>
                          <div className="print-only hidden font-semibold">
                            {selectedIssuingOffice || alertIssuingOffice || getIssuingOffice()}
                          </div>
                        </td>
                      </tr>
                      {showUpdatedDate && (
                        <tr>
                          <td 
                            className="p-2 font-bold"
                            style={{ 
                              backgroundColor: tableHeaderBg, 
                              color: tableHeaderTextColor, 
                              border: `1px solid ${tableBorderColor}` 
                            }}
                          >
                            {updatedDateLabel}
                          </td>
                          <td colSpan={3} className="p-2" style={{ border: `1px solid ${tableBorderColor}` }}>
                            <div className="no-print relative max-w-[110px]">
                              <div className="px-1.5 py-0.5 border border-slate-300 rounded text-xs bg-white text-center font-bold cursor-pointer hover:bg-slate-50 transition">
                                {updatedDate.split('-').reverse().join('/')}
                              </div>
                              <input 
                                type="date" 
                                value={updatedDate} 
                                onChange={e => setUpdatedDate(e.target.value)} 
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                                title="Select Last Updated Date" 
                              />
                            </div>
                            <div className="print-only hidden font-semibold">
                              {updatedDate.split('-').reverse().join('/')}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Dynamic Calculations for the Introduction */}
                  {(() => {
                    const overallTotal = reportTableData.reduce((sum, row) => {
                      const man = manualTotals[row.key];
                      const val = (man !== undefined && man !== '') ? (parseInt(man as unknown as string, 10) || 0) : row.total;
                      return sum + (isNaN(val) ? 0 : val);
                    }, 0);

                    const overallMarginal = reportTableData.reduce((acc, curr) => acc + curr.marginal, 0);
                    const overallUnsafe = reportTableData.reduce((acc, curr) => acc + curr.unsafe, 0);
                    const overallContaminated = overallMarginal + overallUnsafe;
                    
                    const statesWithHM = Array.from(new Set(reportTableData.filter(s => s.hasHeavyMetals).map(s => s.state))) as string[];
                    
                    const formatList = (list: string[]) => {
                      if (list.length === 0) return '';
                      if (list.length === 1) return list[0];
                      if (list.length === 2) return list.join(' and ');
                      return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
                    };
                    
                    const hmStateText = statesWithHM.length > 0 ? ` Additionally, specific testing for Heavy Metals was performed on samples from ${formatList(statesWithHM)}.` : '';

                    const getLabText = () => {
                      if (!isSingleState) return "across various states in CGWB Regional Chemical Laboratories";
                      const stateName = reportLocation.trim();
                      const normalizedMatch = Object.keys(CGWB_LABS).find(k => k.toLowerCase() === stateName.toLowerCase());
                      if (normalizedMatch) {
                        return `in CGWB Regional Chemical Laboratory, ${CGWB_LABS[normalizedMatch]}`;
                      }
                      return `in the CGWB Regional Chemical Laboratory for ${stateName}`;
                    };

                    return (
                      <div className="mb-8">
                        <h3 
                          className="font-bold underline mb-3"
                          style={{
                            color: docHeadingColor,
                            fontSize: `${headingFontSize + 1}pt`
                          }}
                        >
                          Groundwater Quality Analysis Report Summary
                        </h3>
                        <p className="mb-3">
                          A comprehensive analysis of <b>{overallTotal}</b> groundwater samples was conducted {getLabText()} to assess water quality as per the BIS Drinking Water Standard (IS 10500:2012).
                        </p>
                        <p className="mb-6">
                          Analysed parameters included pH, Electrical Conductivity, Total Hardness, Calcium, Magnesium, Sodium, Potassium, Carbonate, Bicarbonate, Sulphate, Chloride, Nitrate, Fluoride and Trace/Heavy Metals such as Arsenic, Uranium and Iron.{hmStateText}
                        </p>

                        <h4 
                          className="font-bold underline mb-2"
                          style={{
                            color: docHeadingColor,
                            fontSize: `${headingFontSize}pt`
                          }}
                        >
                          Key Findings
                        </h4>
                        <p className="mb-2">
                          Out of the <b>{overallTotal}</b> total samples analyzed, <b>{overallContaminated}</b> were found to be contaminated. These results are categorized as follows:
                        </p>
                        <ul className="list-disc pl-8 mb-6 space-y-1">
                          <li>Exceeding Acceptable Limit (but up to permissible limit): <b>{overallMarginal}</b> samples</li>
                          <li>Exceeding Permissible Limit: <b>{overallUnsafe}</b> samples</li>
                        </ul>

                        <p className="mb-4">
                          The following table provides a breakdown of contaminant detection by {isSingleState ? 'District' : 'State/Union Territory'}. Please refer to the attached Excel sheet for the comprehensive, parameter-wise analytical data.
                        </p>
                      </div>
                    );
                  })()}
                  
                  {/* Para I (With Custom Table Header Colors, Borders & Zebra Striping) */}
                  <div className="mb-6">
                    <h3 
                      className="font-bold underline mb-4"
                      style={{
                        color: docHeadingColor,
                        fontSize: `${headingFontSize + 1}pt`
                      }}
                    >
                      Para I
                    </h3>
                    
                    <SimpleReportTable 
                      data={reportTableData} 
                      isDistrict={isSingleState} 
                      manualTotals={manualTotals} 
                      onManualTotalChange={handleManualTotalChange}
                      fontFamily={getDocFontFamilyCss(contaminationFont)}
                      textColor={docTextColor}
                      fontSize={tableFontSize}
                      headerBg={tableHeaderBg}
                      headerTextColor={tableHeaderTextColor}
                      borderColor={tableBorderColor}
                      zebraStriping={tableZebraStriping}
                    />
                  </div>

                  {/* Para II */}
                  <div className={enableParaIIPageBreak ? "page-break-before pt-6" : "mt-8 pt-6 border-t border-slate-300"}>
                    <h3 
                      className="font-bold underline mb-4"
                      style={{
                        color: docHeadingColor,
                        fontSize: `${headingFontSize + 1}pt`
                      }}
                    >
                      Para II
                    </h3>
                    
                    {activeRemedialMeasures.length > 0 ? (
                      <>
                        <p className="mb-6 font-medium">The anomalies may be termed major in some cases.</p>

                        <h4 
                          className="font-bold underline mb-4"
                          style={{
                            color: docHeadingColor,
                            fontSize: `${headingFontSize}pt`
                          }}
                        >
                          Risk Perception and Remedial Measures
                        </h4>
                        
                        <div className="space-y-5">
                          {activeRemedialMeasures.map((measure) => (
                            <div key={measure.id} className="mb-4 pb-3 border-b border-slate-100 last:border-b-0">
                              <h5 
                                className="font-bold underline mb-2"
                                style={{
                                  color: docHeadingColor,
                                  fontSize: `${bodyFontSize + 1}pt`
                                }}
                              >
                                {measure.title}
                              </h5>
                              
                              {measure.riskPerception && (
                                <div className="mb-2">
                                  <span className="font-bold mr-1">Risk Perception:</span>
                                  <span>{measure.riskPerception}</span>
                                </div>
                              )}
                              
                              <div className="mb-2">
                                <span className="font-bold block mb-1">Remedial Measures:</span>
                                {(measure as any).desc && <p className="mb-1">{(measure as any).desc}</p>}
                                {measure.sections.map((sec: any, sIdx: number) => (
                                  <div key={sIdx} className="mb-1">
                                    {sec.subtitle && <p className="font-bold inline mr-1">{sec.subtitle}</p>}
                                    {sec.desc && <p className="inline">{sec.desc}</p>}
                                    {sec.points && (
                                      <ul className="list-disc pl-8 mt-1 space-y-1">
                                        {sec.points.map((pt: string, pIdx: number) => (
                                          <li key={pIdx}>{pt}</li>
                                        ))}
                                      </ul>
                                    )}
                                    {sec.postDesc && <p className="mt-1">{sec.postDesc}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="italic text-slate-500 mb-6">
                        All tested parameters in the provided dataset are within safe limits. No specific remedial measures are currently required.
                      </p>
                    )}
                  </div>

                  {/* ON-SCREEN RUNNING FOOTER (With logo if footer placement, replaced with mouse click) */}
                  {showFooter && (
                    <div className="doc-screen-footer mt-10 pt-4 border-t border-slate-300 flex flex-wrap items-center justify-between text-[11px] text-slate-600 font-mono">
                      <div className="flex items-center gap-3">
                        {logoPlacement === 'footer-left' && logoImageSrc && (
                          <div 
                            onClick={() => logoFileInputRef.current?.click()}
                            className="cursor-pointer group relative shrink-0"
                            title="Click with mouse to replace logo image"
                          >
                            <img
                              src={logoImageSrc}
                              alt="Logo"
                              style={{ height: `${logoHeight}px` }}
                              className="w-auto object-contain transition-transform group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 rounded transition-opacity flex items-center justify-center text-[8px] font-bold text-indigo-900 bg-white/70">
                              Replace
                            </div>
                          </div>
                        )}
                        <span className={`font-semibold ${footerPosition === 'center' ? 'mx-auto' : footerPosition === 'right' ? 'ml-auto' : ''}`}>
                          {footerText}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {logoPlacement === 'footer-center' && logoImageSrc && (
                          <div 
                            onClick={() => logoFileInputRef.current?.click()}
                            className="cursor-pointer group relative shrink-0"
                            title="Click with mouse to replace logo image"
                          >
                            <img
                              src={logoImageSrc}
                              alt="Logo"
                              style={{ height: `${logoHeight}px` }}
                              className="w-auto object-contain transition-transform group-hover:scale-105"
                            />
                          </div>
                        )}

                        {pageNumberFormat !== 'none' && (
                          <span className="bg-slate-100 px-2.5 py-1 rounded border border-slate-200 font-bold text-slate-700">
                            {pageNumberFormat === 'page_x_of_y' ? 'Page 1 of 1' : pageNumberFormat === 'page_x' ? 'Page 1' : pageNumberFormat === 'x_of_y' ? '1 of 1' : '- 1 -'}
                          </span>
                        )}

                        {logoPlacement === 'footer-right' && logoImageSrc && (
                          <div 
                            onClick={() => logoFileInputRef.current?.click()}
                            className="cursor-pointer group relative shrink-0"
                            title="Click with mouse to replace logo image"
                          >
                            <img
                              src={logoImageSrc}
                              alt="Logo"
                              style={{ height: `${logoHeight}px` }}
                              className="w-auto object-contain transition-transform group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 rounded transition-opacity flex items-center justify-center text-[8px] font-bold text-indigo-900 bg-white/70">
                              Replace
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'excel' && (
            <div className="space-y-6 mb-8 w-full max-w-full font-sans">
              {/* Header Card */}
              <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-emerald-700/40 relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Official CGWB Alert Spreadsheet
                      </span>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-400/30">
                        IS 10500:2012 Compliance
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mb-2">
                      Ground Water Quality Alert Excel Generator
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                      Generates a stylized Excel spreadsheet formatted exactly as per official CGWB standards, featuring the top metadata issuance block, dual-tier header with standard limit ranges in red, and cell-by-cell conditional highlight fills.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                    <button
                      onClick={generateAlertExcel}
                      disabled={isExportingExcel || selectedAlertParams.length === 0}
                      className="px-6 py-3.5 rounded-2xl font-black text-sm text-white bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 shadow-[0_4px_12px_rgba(5,150,105,0.4)] border border-emerald-400/50 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      {isExportingExcel ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Generating Excel...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>Download Alert Excel (.xlsx)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Stat Badges */}
                <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Alert Parameters</span>
                    <span className="text-lg font-black text-white">{selectedAlertParams.length} / {ALERT_PARAM_DEFINITIONS.length}</span>
                  </div>
                  <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Locations in Alert</span>
                    <span className="text-lg font-black text-amber-300">{alertSamplesCount}</span>
                  </div>
                  <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Date of Issuance</span>
                    <span className="text-sm font-bold text-white mt-1 block">{issueDate.split('-').reverse().join('.')}</span>
                  </div>
                  <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Alert Period</span>
                    <span className="text-xs font-bold text-emerald-300 mt-1 block">{fromDate.split('-').reverse().join('/')} to {toDate.split('-').reverse().join('/')}</span>
                  </div>
                </div>
              </div>

              {/* Settings Configuration Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  Alert Metadata & Formatting Preferences
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {/* Issuing Office */}
                  <div className="space-y-2 lg:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 block">
                        Alert Issuing Office (Cell D3:I3 in Excel):
                      </label>
                      <span className="text-[10px] text-slate-500 font-medium">All 19 CGWB Alert Offices</span>
                    </div>

                    <select
                      value={alertIssuingOffice}
                      onChange={(e) => {
                        setAlertIssuingOffice(e.target.value);
                        setSelectedIssuingOffice(e.target.value);
                      }}
                      className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white font-bold focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
                    >
                      {CGWB_ISSUING_OFFICES.map(office => (
                        <option key={office} value={office}>{office}</option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={alertIssuingOffice}
                      onChange={(e) => {
                        setAlertIssuingOffice(e.target.value);
                        setSelectedIssuingOffice(e.target.value);
                      }}
                      placeholder="e.g. CGWB, CHQ, Faridabad"
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-slate-50 font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />

                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar p-1 bg-slate-50 rounded-lg border border-slate-200">
                      {CGWB_ISSUING_OFFICES.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setAlertIssuingOffice(preset);
                            setSelectedIssuingOffice(preset);
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded-md border font-semibold transition-colors cursor-pointer ${
                            alertIssuingOffice === preset
                              ? 'bg-emerald-600 border-emerald-700 text-white shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dates Configuration */}
                  <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Date of Issuance of Alert (Cell D1)
                      </label>
                      <input
                        type="date"
                        value={issueDate}
                        onChange={(e) => setIssueDate(e.target.value)}
                        className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white font-bold"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-1">Period FROM</label>
                        <input
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          className="w-full text-[11px] p-1.5 border border-slate-300 rounded-lg bg-white font-bold text-center"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-1">Period TO</label>
                        <input
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          className="w-full text-[11px] p-1.5 border border-slate-300 rounded-lg bg-white font-bold text-center"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Excel Data Display Style */}
                  <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="text-xs font-bold text-slate-800 block">
                      Data Cell Value Format
                    </label>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          name="excelExceedances"
                          checked={excelOnlyExceedances}
                          onChange={() => setExcelOnlyExceedances(true)}
                          className="text-emerald-600"
                        />
                        <div className="text-[11px]">
                          <span className="font-bold text-slate-900 block">Only Exceeded Values (Official CGWB Alert)</span>
                          <span className="text-slate-500 text-[10px]">Compliant cells left blank, exactly as in attached sheet</span>
                        </div>
                      </label>
                      <label className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          name="excelExceedances"
                          checked={!excelOnlyExceedances}
                          onChange={() => setExcelOnlyExceedances(false)}
                          className="text-emerald-600"
                        />
                        <div className="text-[11px]">
                          <span className="font-bold text-slate-900 block">All Numerical Values</span>
                          <span className="text-slate-500 text-[10px]">Shows all measurements, with exceedances highlighted</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Sample Scope */}
                  <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="text-xs font-bold text-slate-800 block">
                      Sample Locations to Include
                    </label>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          name="excelScope"
                          checked={excelOnlyAlertSamples}
                          onChange={() => setExcelOnlyAlertSamples(true)}
                          className="text-emerald-600"
                        />
                        <div className="text-[11px]">
                          <span className="font-bold text-slate-900 block">Alert Locations Only ({alertSamplesCount})</span>
                          <span className="text-slate-500 text-[10px]">Only export samples where selected parameters exceed limits</span>
                        </div>
                      </label>
                      <label className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          name="excelScope"
                          checked={!excelOnlyAlertSamples}
                          onChange={() => setExcelOnlyAlertSamples(false)}
                          className="text-emerald-600"
                        />
                        <div className="text-[11px]">
                          <span className="font-bold text-slate-900 block">All Sample Locations ({processedRawData.length})</span>
                          <span className="text-slate-500 text-[10px]">Export all tested locations in the dataset</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Quick Parameter Summary */}
                  <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="text-xs font-bold text-slate-800 block">
                      Selected Chemical Columns ({selectedAlertParams.length})
                    </label>
                    <div className="max-h-24 overflow-y-auto custom-scrollbar flex flex-wrap gap-1 pr-1">
                      {ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key)).map(p => (
                        <span key={p.key} className="px-2 py-0.5 rounded text-[10px] font-bold bg-white border border-slate-300 text-slate-800">
                          {p.shortName}
                        </span>
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-500 block italic">
                      Use the "Choose Parameters" panel above to add/remove parameters.
                    </span>
                  </div>

                  {/* Official CGWB Footer & Page Number Settings */}
                  <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 block">
                        Official Sheet Footer & Page No.
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-slate-600">
                        <input
                          type="checkbox"
                          checked={showSheetFooter}
                          onChange={(e) => setShowSheetFooter(e.target.checked)}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Show Footer</span>
                      </label>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={footerPageText}
                          onChange={(e) => setFooterPageText(e.target.value)}
                          placeholder="e.g. 1 of 5"
                          className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white font-mono font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {["1 of 5", "1 of 1", "1 of 2", "Page 1 of 5"].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setFooterPageText(preset)}
                            className={`text-[9.5px] px-2 py-0.5 rounded border font-semibold transition-colors cursor-pointer ${
                              footerPageText === preset
                                ? 'bg-blue-50 border-blue-400 text-blue-800 font-bold'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Visual mini footer preview */}
                    <div className="mt-2 pt-2 border-t border-[#b0c4de] flex items-center justify-between text-[10px] bg-white p-2 rounded border border-slate-200 shadow-xs">
                      <div className="flex items-center gap-1.5">
                        <img
                          src="/assets/aistudio/logo_1-removebg-preview_f8d93171.png"
                          alt="CGWB Logo"
                          className="h-5 w-auto object-contain"
                        />
                        <span className="text-[#0033cc] font-black tracking-wider text-[11px]">| CGWB</span>
                      </div>
                      <span className="text-slate-600 font-mono font-bold text-[10px]">{footerPageText || "1 of 5"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* LIVE EXCEL SPREADSHEET REPLICA (Exact match to image /public/assets/aistudio/image_1049d430.png) */}
              <div className="bg-white rounded-2xl border border-slate-300 overflow-hidden shadow-md">
                <div className="bg-slate-100 px-5 py-3 border-b border-slate-300 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Live Excel Sheet Preview (Exact Layout as Generated)
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-medium">
                      Showing first 12 sample rows
                    </span>
                    <button
                      onClick={generateAlertExcel}
                      disabled={isExportingExcel || selectedAlertParams.length === 0}
                      className="px-3 py-1.5 rounded-lg text-xs font-black text-white bg-emerald-700 hover:bg-emerald-600 shadow-sm flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .xlsx</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto p-4 custom-scrollbar bg-slate-50">
                  <table className="border-collapse border border-black text-center text-[10px] font-sans bg-white shadow-sm min-w-[1100px] mx-auto select-none">
                    <tbody>
                      {/* ROW 1: Issuance Date & Legend */}
                      <tr className="h-7">
                        <td className="border border-black font-bold text-left px-2 w-32 bg-white">
                          Date of Issuance of Alert:
                        </td>
                        <td className="border border-black w-24"></td>
                        <td className="border border-black w-20"></td>
                        <td className="border border-black font-bold px-2 w-28 text-center" style={{ backgroundColor: "#E2EFDA" }}>
                          {issueDate.split('-').reverse().join('.')}
                        </td>
                        <td className="border border-black w-20"></td>
                        <td className="border border-black w-16"></td>
                        <td className="border border-black w-16"></td>
                        <td className="border border-black w-20"></td>
                        <td className="border border-black w-20"></td>
                        <td className="border border-black w-24"></td>
                        <td className="border border-black font-bold text-center w-36 bg-white">
                          Legend
                        </td>
                        <td colSpan={Math.max(1, ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key)).length)} className="border border-black bg-white"></td>
                      </tr>

                      {/* ROW 2: Alert Period & Permissible Limit Legend */}
                      <tr className="h-7">
                        <td className="border border-black font-bold text-left px-2 bg-white">
                          Period of Alert:
                        </td>
                        <td className="border border-black"></td>
                        <td className="border border-black font-bold text-center bg-white">
                          FROM
                        </td>
                        <td className="border border-black font-bold px-2 text-center" style={{ backgroundColor: "#E2EFDA" }}>
                          {fromDate.split('-').reverse().join('/')}
                        </td>
                        <td className="border border-black"></td>
                        <td className="border border-black font-bold text-center bg-white">
                          TO
                        </td>
                        <td className="border border-black"></td>
                        <td className="border border-black font-bold px-2 text-center" style={{ backgroundColor: "#E2EFDA" }}>
                          {toDate.split('-').reverse().join('/')}
                        </td>
                        <td className="border border-black"></td>
                        <td className="border border-black"></td>
                        <td className="border border-black font-bold text-center px-1 bg-white text-[9.5px]">
                          Above Permissible Limit
                        </td>
                        <td colSpan={2} className="border border-black" style={{ backgroundColor: "#FF0000" }}></td>
                        {ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key)).length > 2 && (
                          <td colSpan={ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key)).length - 2} className="border border-black bg-white"></td>
                        )}
                      </tr>

                      {/* ROW 3: Issuing Office & Acceptable Limit Legend */}
                      <tr className="h-7">
                        <td className="border border-black font-bold text-left px-2 bg-white">
                          Alert Issuing Office:
                        </td>
                        <td className="border border-black"></td>
                        <td className="border border-black"></td>
                        <td colSpan={6} className="border border-black font-bold px-3 text-center" style={{ backgroundColor: "#E2EFDA" }}>
                          {alertIssuingOffice || getIssuingOffice()}
                        </td>
                        <td className="border border-black"></td>
                        <td className="border border-black font-bold text-center px-1 bg-white text-[9.5px]">
                          Above Acceptable Limit
                        </td>
                        <td colSpan={2} className="border border-black" style={{ backgroundColor: "#FFC000" }}></td>
                        {ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key)).length > 2 && (
                          <td colSpan={ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key)).length - 2} className="border border-black bg-white"></td>
                        )}
                      </tr>

                      {/* ROW 4: DUAL HEADER TOP */}
                      <tr className="h-10 text-[10px] font-bold">
                        <td rowSpan={2} className="border border-black bg-white font-bold text-center w-10">
                          S No.
                        </td>
                        <td colSpan={4} className="border border-black bg-white font-bold text-center">
                          Location
                        </td>
                        <td className="border border-black bg-white"></td>
                        <td className="border border-black bg-white"></td>
                        <td className="border border-black bg-white font-bold text-center px-1">
                          Sample Collection
                        </td>
                        <td className="border border-black bg-white"></td>
                        <td className="border border-black bg-white font-bold text-center px-1">
                          Sample Collection
                        </td>
                        <td className="border border-black bg-white font-bold text-center px-1">
                          Sample Analysis Date
                        </td>
                        {/* Parameter Header (Row 4: Name + Unit) */}
                        {ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key)).map(param => (
                          <td
                            key={`h4-${param.key}`}
                            className="border border-black bg-white font-bold text-center px-1.5 py-1 min-w-[70px] text-black"
                          >
                            <span className="block leading-tight font-black">{param.displayHeader}</span>
                          </td>
                        ))}
                      </tr>

                      {/* ROW 5: DUAL HEADER BOTTOM */}
                      <tr className="h-10 text-[9.5px] font-bold">
                        <td className="border border-black bg-white px-1">State</td>
                        <td className="border border-black bg-white px-1">District</td>
                        <td className="border border-black bg-white px-1">Block</td>
                        <td className="border border-black bg-white px-1">Village/Town</td>
                        <td className="border border-black bg-white px-1">Latitude</td>
                        <td className="border border-black bg-white px-1">Longitude</td>
                        <td className="border border-black bg-white px-1 text-[8.5px] leading-tight">(DW/HandPump/TW)</td>
                        <td className="border border-black bg-white px-1 text-[8.5px] leading-tight min-w-[90px]">Depth of the Structure from Ground Level in mbgl</td>
                        <td className="border border-black bg-white px-1 text-[9px]">DD/MM/YYYY</td>
                        <td className="border border-black bg-white px-1 text-[9px]">DD/MM/YYYY</td>
                        {/* Parameter Range Standards (Row 5: Limit values) */}
                        {ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key)).map(param => {
                          const pLimit = limits[param.key] || DEFAULT_LIMITS[param.key as keyof typeof DEFAULT_LIMITS];
                          let rangeText = param.rangeText;
                          if (pLimit) {
                            rangeText = pLimit.acc === pLimit.perm ? `${pLimit.perm}` : `${pLimit.acc}-${pLimit.perm}`;
                          }
                          return (
                            <td
                              key={`h5-${param.key}`}
                              className="border border-black bg-white font-bold text-center px-1 py-1 text-black"
                            >
                              <span className="font-black text-[10px]">{rangeText}</span>
                            </td>
                          );
                        })}
                      </tr>

                      {/* DATA ROWS */}
                      {(() => {
                        const activeParams = ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key));
                        const filteredRows = processedRawData.filter(row => {
                          if (!excelOnlyAlertSamples) return true;
                          for (let i = 0; i < activeParams.length; i++) {
                            const p = activeParams[i];
                            const valStr = row[p.key];
                            if (valStr == null || valStr === "") continue;
                            const val = parseFloat(valStr);
                            if (isNaN(val)) continue;
                            const limit = limits[p.key] || DEFAULT_LIMITS[p.key as keyof typeof DEFAULT_LIMITS];
                            if (!limit) continue;

                            if (limit.isStrictRange) {
                              if (val < limit.acc || val > limit.perm) return true;
                            } else {
                              if (val > limit.acc) return true;
                            }
                          }
                          return false;
                        });

                        const previewData = filteredRows.slice(0, 12);

                        if (previewData.length === 0) {
                          return (
                            <tr>
                              <td
                                colSpan={11 + activeParams.length}
                                className="border border-black py-8 text-center text-slate-400 italic bg-white"
                              >
                                No sample locations match the current alert filter criteria.
                              </td>
                            </tr>
                          );
                        }

                        return previewData.map((row, idx) => {
                          let struct = row["Sample Collection Structure"] || "";
                          const structLower = struct.toLowerCase();
                          if (structLower.includes("bore")) struct = "BW";
                          else if (structLower.includes("tube")) struct = "TW";
                          else if (structLower.includes("dug")) struct = "DW";
                          else if (structLower.includes("hand")) struct = "HP";

                          const lat = typeof row["Latitude"] === "number" && !isNaN(row["Latitude"]) ? row["Latitude"].toFixed(5) : (row["Latitude"] || "");
                          const lng = typeof row["Longitude"] === "number" && !isNaN(row["Longitude"]) ? row["Longitude"].toFixed(5) : (row["Longitude"] || "");

                          return (
                            <tr key={idx} className="h-6 hover:bg-slate-50">
                              <td className="border border-black text-center font-medium bg-white">{idx + 1}</td>
                              <td className="border border-black text-left px-1.5 whitespace-nowrap bg-white">{row["State"]}</td>
                              <td className="border border-black text-left px-1.5 whitespace-nowrap bg-white">{row["District"]}</td>
                              <td className="border border-black text-left px-1.5 whitespace-nowrap bg-white">{row["Block"]}</td>
                              <td className="border border-black text-left px-1.5 whitespace-nowrap font-medium bg-white">{row["Village/Town"]}</td>
                              <td className="border border-black text-center px-1 font-mono text-[9px] bg-white">{lat}</td>
                              <td className="border border-black text-center px-1 font-mono text-[9px] bg-white">{lng}</td>
                              <td className="border border-black text-center font-bold bg-white">{struct || "TW"}</td>
                              <td className="border border-black text-center bg-white">{row["Depth of the Structure from Ground Level in Meters"] || ""}</td>
                              <td className="border border-black text-center bg-white text-[9px]">{row["Sample Collection Date"] || ""}</td>
                              <td className="border border-black text-center bg-white text-[9px]">{row["Sample Analysis Date"] || ""}</td>

                              {/* Parameter cells with conditional Red (#FF0000) & Yellow (#FFC000) fill */}
                              {activeParams.map(param => {
                                const valStr = row[param.key];
                                if (valStr == null || valStr === "") {
                                  return <td key={param.key} className="border border-black bg-white"></td>;
                                }

                                const val = parseFloat(valStr);
                                if (isNaN(val)) {
                                  return <td key={param.key} className="border border-black bg-white">{excelOnlyExceedances ? "" : valStr}</td>;
                                }

                                const limit = limits[param.key] || DEFAULT_LIMITS[param.key as keyof typeof DEFAULT_LIMITS];
                                let isUnsafe = false;
                                let isMarginal = false;

                                if (limit) {
                                  if (limit.isStrictRange) {
                                    if (val < limit.acc || val > limit.perm) isUnsafe = true;
                                  } else {
                                    if (val > limit.perm) isUnsafe = true;
                                    else if (val > limit.acc) isMarginal = true;
                                  }
                                }

                                if (isUnsafe) {
                                  return (
                                    <td
                                      key={param.key}
                                      className="border border-black font-black text-center px-1 text-black"
                                      style={{ backgroundColor: "#FF0000" }}
                                    >
                                      {Number.isInteger(val) ? val : val.toFixed(2)}
                                    </td>
                                  );
                                }

                                if (isMarginal) {
                                  return (
                                    <td
                                      key={param.key}
                                      className="border border-black font-black text-center px-1 text-black"
                                      style={{ backgroundColor: "#FFC000" }}
                                    >
                                      {Number.isInteger(val) ? val : val.toFixed(2)}
                                    </td>
                                  );
                                }

                                return (
                                  <td key={param.key} className="border border-black text-center px-1 text-slate-700 bg-white">
                                    {excelOnlyExceedances ? "" : (Number.isInteger(val) ? val : val.toFixed(2))}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        });
                      })()}

                      {/* Official Sheet Footer row matching image_acd97d75.png */}
                      {showSheetFooter && (
                        <tr className="h-12 bg-white">
                          <td
                            colSpan={Math.max(5, Math.floor((11 + ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key)).length) / 2))}
                            className="border-t-2 border-[#b0c4de] border-b-0 border-l-0 border-r-0 px-3 text-left bg-white align-middle"
                          >
                            <div className="flex items-center gap-2 py-1">
                              <img
                                src="/assets/aistudio/logo_1-removebg-preview_f8d93171.png"
                                alt="CGWB Logo"
                                className="h-7 w-auto object-contain inline-block shrink-0"
                              />
                              <span className="text-[#0033cc] font-black text-sm tracking-wide leading-none">
                                | CGWB
                              </span>
                            </div>
                          </td>
                          <td
                            colSpan={Math.ceil((11 + ALERT_PARAM_DEFINITIONS.filter(p => selectedAlertParams.includes(p.key)).length) / 2)}
                            className="border-t-2 border-[#b0c4de] border-b-0 border-l-0 border-r-0 px-4 text-right bg-white align-middle"
                          >
                            <span className="text-slate-600 font-bold text-xs tracking-wider font-mono">
                              {footerPageText || "1 of 5"}
                            </span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Dedicated visual footer replica matching image_acd97d75.png */}
                  {showSheetFooter && (
                    <div className="mt-3 mx-auto min-w-[1100px] border-t-2 border-[#b0c4de] pt-2.5 pb-1 px-3 flex items-center justify-between bg-white rounded-b-xl shadow-xs">
                      <div className="flex items-center gap-2">
                        <img
                          src="/assets/aistudio/logo_1-removebg-preview_f8d93171.png"
                          alt="CGWB Logo"
                          className="h-8 w-auto object-contain shrink-0"
                        />
                        <span className="text-[#0033cc] font-black text-sm sm:text-base tracking-wide">
                          | CGWB
                        </span>
                      </div>
                      <span className="text-slate-700 font-bold text-xs font-mono bg-slate-100 px-3 py-1 rounded border border-slate-200">
                        {footerPageText || "1 of 5"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Footer preview note */}
                <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex flex-wrap justify-between items-center text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">Total Alert Rows for Selected Parameters:</span>
                    <span className="px-2 py-0.5 rounded-full font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                      {excelOnlyAlertSamples ? alertSamplesCount : processedRawData.length} records
                    </span>
                  </div>
                  <button
                    onClick={generateAlertExcel}
                    disabled={isExportingExcel || selectedAlertParams.length === 0}
                    className="font-black text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download complete spreadsheet (.xlsx) with all data rows
                  </button>
                </div>
              </div>
            </div>
          )}


          {activeSubTab === 'state' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-8">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-150 flex justify-between items-center flex-wrap gap-4">
                <h3 className="text-base font-bold text-slate-800">State/UT-wise Compliance Overview</h3>
                {summaryData.length > 0 && (
                  <button 
                    onClick={exportSummary}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-b from-amber-500 to-amber-700 border border-amber-800 shadow-[0_2px_0_rgb(146,64,14)] hover:from-amber-400 hover:to-amber-600 active:translate-y-0.5 transition-all flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Table
                  </button>
                )}
              </div>
              <SummaryTable data={summaryData} isDistrict={false} manualTotals={manualTotals} onManualTotalChange={handleManualTotalChange} contaminationFont={contaminationFont} />
            </div>
          )}

          {activeSubTab === 'district' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-8">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-150 flex justify-between items-center flex-wrap gap-4">
                <h3 className="text-base font-bold text-slate-800">District-wise Compliance Overview</h3>
                {districtSummaryData.length > 0 && (
                  <button 
                    onClick={exportSummary}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-b from-amber-500 to-amber-700 border border-amber-800 shadow-[0_2px_0_rgb(146,64,14)] hover:from-amber-400 hover:to-amber-600 active:translate-y-0.5 transition-all flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Table
                  </button>
                )}
              </div>
              <SummaryTable data={districtSummaryData} isDistrict={true} manualTotals={manualTotals} onManualTotalChange={handleManualTotalChange} contaminationFont={contaminationFont} />
            </div>
          )}

          {activeSubTab === 'map' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-8">
              <MapContainer data={processedRawData} limits={activeSelectedLimits} geoJsonData={geoJsonData} activeSubTab={activeSubTab} />
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-3">
                  <div className="w-4.5 h-4.5 rounded-full bg-emerald-500"></div>
                  <span className="text-xs font-bold text-emerald-800">Safe: All parameters within acceptable limits</span>
                </div>
                <div className="bg-orange-50 p-3 rounded-xl border border-orange-200 flex items-center gap-3">
                  <div className="w-4.5 h-4.5 rounded-full bg-orange-500"></div>
                  <span className="text-xs font-bold text-orange-800">Marginal: Above Acceptable, below Permissible</span>
                </div>
                <div className="bg-red-50 p-3 rounded-xl border border-red-100 flex items-center gap-3">
                  <div className="w-4.5 h-4.5 rounded-full bg-red-500"></div>
                  <span className="text-xs font-bold text-red-800">Unsafe: Above Permissible (or pH out of range)</span>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'standards' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-8 shadow-xs">
              <div className="bg-white px-6 py-4 border-b border-slate-200 text-slate-900 flex justify-between items-center">
                <div>
                  <h3 className="text-base font-black text-slate-900">BIS 10500:2012 Drinking Water Quality Parameters</h3>
                  <p className="text-xs text-slate-500 mt-1 font-medium">Standards, risk perceptions and general treatment strategies.</p>
                </div>
              </div>
              <div className="overflow-x-auto p-4 bg-white">
                <table className="w-full text-left border-separate min-w-[700px]" style={{ borderSpacing: '0 8px' }}>
                  <thead>
                    <tr className="text-slate-500 text-[10px] uppercase tracking-widest font-black">
                      <th className="px-3 pb-1 font-black w-32">Parameter</th>
                      <th className="px-2 pb-1 font-black w-24 text-center">Acceptable</th>
                      <th className="px-2 pb-1 font-black w-24 text-center">Permissible</th>
                      <th className="px-3 pb-1 font-black">Implications & Action Plans</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(limits).map((param, index) => {
                      const limit = limits[param];
                      const shortName = param.split(' ')[0];
                      const measure = REMEDIAL_MEASURES.find(m => m.id === shortName);
                      const color = PARAM_COLORS[index % PARAM_COLORS.length];
                      
                      return (
                        <tr key={param} className="bg-white hover:bg-slate-50 transition-colors group rounded-xl shadow-[0_2px_5px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_10px_rgba(0,0,0,0.06)] border border-slate-200">
                          <td className="p-3 rounded-l-xl border border-r-0 border-slate-100 align-middle">
                            <div className={`inline-flex flex-col min-w-[80px] bg-gradient-to-b ${color.bg} text-white px-2.5 py-2 rounded-lg ${color.shadow} border ${color.border} transform group-hover:-translate-y-0.5 transition-transform`}>
                              <span className="font-black text-sm drop-shadow-md tracking-wide"><FormatParam param={shortName} /></span>
                              {param.includes('(') && <span className="text-[8px] font-bold text-white/80 mt-0.5 uppercase tracking-tighter leading-tight">{param.substring(param.indexOf('('))}</span>}
                            </div>
                          </td>
                          <td className="p-3 border-t border-b border-slate-100 text-center align-middle">
                            <div className="mx-auto min-w-[50px] w-max bg-gradient-to-b from-emerald-400 to-emerald-600 text-white px-2 py-1 rounded-lg shadow-[0_2px_0_rgb(4,120,87)] border border-emerald-700 font-black text-xs transform group-hover:-translate-y-0.5 transition-transform flex items-center justify-center">
                              {limit.acc}
                            </div>
                          </td>
                          <td className="p-3 border-t border-b border-slate-100 text-center align-middle">
                            <div className="mx-auto min-w-[50px] w-max bg-gradient-to-b from-rose-500 to-rose-700 text-white px-2 py-1 rounded-lg shadow-[0_2px_0_rgb(159,18,57)] border border-rose-800 font-black text-xs transform group-hover:-translate-y-0.5 transition-transform flex items-center justify-center">
                              {limit.perm}
                            </div>
                          </td>
                          <td className="p-3 rounded-r-xl border border-l-0 border-slate-100 align-middle">
                            <div className="bg-slate-50/80 border-l-2 border-slate-300 p-2.5 rounded-lg text-[11px] text-slate-700 font-medium leading-relaxed flex flex-col gap-1.5">
                              {measure ? (
                                <>
                                  {measure.riskPerception && (
                                    <div>
                                      <span className="font-bold text-red-800 uppercase text-[9px] tracking-wider">Risk: </span>
                                      {measure.riskPerception}
                                    </div>
                                  )}
                                  <div>
                                    <span className="font-bold text-emerald-800 uppercase text-[9px] tracking-wider">Action: </span>
                                    {measure.sections.map((s, i) => <span key={i}>{s.desc} </span>)}
                                  </div>
                                </>
                              ) : (
                                <span className="text-gray-400 italic">Standard water treatment measures apply.</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSubTab === 'treatments' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-8 shadow-xs">
              <div className="bg-white px-6 py-4 border-b border-slate-200 text-slate-900 flex justify-between items-center">
                <div>
                  <h3 className="text-base font-black text-slate-900">Standard Water Treatment Measures</h3>
                  <p className="text-xs text-slate-500 mt-1 font-medium">Applied water purification and chemical engineering strategies.</p>
                </div>
              </div>
              <div className="p-6 bg-white grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {STANDARD_TREATMENTS.map((treatment, idx) => (
                  <div key={treatment.title} className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] border border-slate-200 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group flex flex-col">
                    <div className={`h-2 w-full bg-gradient-to-r ${treatment.color}`}></div>
                    <div className="p-5 flex-1 flex flex-col">
                      <h4 className={`text-sm font-black mb-2 bg-clip-text text-transparent bg-gradient-to-r ${treatment.color}`}>
                        {treatment.title}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed font-medium mb-4">
                        {treatment.desc}
                      </p>
                      <div className="mt-auto bg-slate-50 border border-slate-100 p-2.5 rounded-xl shadow-inner">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Mechanism</span>
                        <p className="text-[10px] text-slate-700 font-mono leading-relaxed whitespace-pre-line">
                          {treatment.chemistry}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Column Mapping Modal */}
      {showMappingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden font-sans">
            <div className="p-5 bg-white border-b border-slate-200 text-slate-900 flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-slate-900">Map Alert Dataset Columns</h3>
                <p className="text-slate-500 text-xs mt-0.5">Please match your uploaded file's columns to the standard required format.</p>
              </div>
              <button onClick={() => setShowMappingModal(false)} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {COLUMNS.map(col => {
                  const isParam = DEFAULT_LIMITS[col as keyof typeof DEFAULT_LIMITS] !== undefined;
                  return (
                    <div key={col} className={`p-3 rounded-xl border ${columnMapping[col] ? 'bg-white border-emerald-200 shadow-sm' : 'bg-orange-50 border-orange-200 border-dashed'}`}>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          {col}
                          {isParam && <span className="bg-blue-100 text-blue-800 text-[8px] px-1.5 py-0.5 rounded uppercase font-black tracking-wider">Param</span>}
                          {!columnMapping[col] && <span className="text-orange-600 text-[9px] font-bold italic ml-auto">Unmapped</span>}
                        </label>
                        <select
                          className="w-full text-xs p-2 border border-slate-300 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={columnMapping[col] || ""}
                          onChange={(e) => setColumnMapping(prev => ({ ...prev, [col]: e.target.value }))}
                        >
                          <option value="">-- Ignore / Not present --</option>
                          {uploadedColumns.map(uploadedCol => (
                            <option key={uploadedCol} value={uploadedCol}>{uploadedCol}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3">
              <button 
                onClick={() => setShowMappingModal(false)}
                className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 border border-slate-300 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={applyMapping}
                className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-b from-blue-500 to-blue-700 border border-blue-800 shadow-[0_3px_0_rgb(30,58,138)] hover:from-blue-400 hover:to-blue-600 active:shadow-none active:translate-y-[3px] transition-all flex items-center gap-1.5"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Import Data
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default FortnightlyAlertsView;
