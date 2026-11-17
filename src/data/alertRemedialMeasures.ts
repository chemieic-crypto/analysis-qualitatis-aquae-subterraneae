export interface AlertRemedialMeasureSection {
  subtitle?: string;
  desc?: string;
  points?: string[];
  postDesc?: string;
}

export interface AlertRemedialMeasure {
  id: string;
  title: string;
  riskPerception?: string;
  desc?: string;
  sections: AlertRemedialMeasureSection[];
}

export const ALERT_REMEDIAL_MEASURES: AlertRemedialMeasure[] = [
  {
    id: "pH",
    title: "Risk Perception & Remedial Measures for pH",
    sections: [
      {
        desc: "Treatment of acidic water: Passing through Neutralizing Filter containing Calcite or Magnesia, or adding Soda Ash. Treatment of basic water: Installation of an acid injector (e.g., white vinegar or citric acid)."
      }
    ]
  },
  {
    id: "TDS",
    title: "Risk Perception & Remedial Measures for TDS",
    sections: [
      {
        desc: "Reverse Osmosis (RO), Electrodialysis, and Distillation are the most effective methods for reducing Total Dissolved Solids."
      }
    ]
  },
  {
    id: "Turbidity",
    title: "Risk Perception & Remedial Measures for Turbidity",
    sections: [
      {
        desc: "Coagulation, flocculation, sedimentation, and filtration (sand or multimedia filters) are used to remove suspended particles causing turbidity."
      }
    ]
  },
  {
    id: "Alkalinity",
    title: "Risk Perception & Remedial Measures for Alkalinity",
    sections: [
      {
        desc: "Can be reduced by Reverse Osmosis (RO) or by carefully adding a weak acid to lower the pH and neutralize the excess alkalinity."
      }
    ]
  },
  {
    id: "EC",
    title: "Risk Perception & Remedial Measures for EC",
    sections: [
      {
        desc: "Since Electrical Conductivity is directly related to dissolved ions (TDS), methods like Reverse Osmosis (RO) and Deionization (Ion Exchange) effectively lower it."
      }
    ]
  },
  {
    id: "Cl-1",
    title: "Risk Perception & Remedial Measures for Chloride",
    riskPerception: "High concentration of chloride concentration in draining water.",
    sections: [
      {
        desc: "Reverse Osmosis (RO), Distillation, and specific Ion Exchange (anion exchange) resins are effective for chloride removal. Standard boiling does not remove chlorides."
      }
    ]
  },
  {
    id: "F",
    title: "Risk Perception & Remedial Measures for Fluoride",
    riskPerception:
      "Dental and Skeletal Fluorosis: Studies suggest high levels of fluoride may lead to discoloration and damage to teeth and affect bone health.",
    sections: [
      {
        desc: "Defluoridation techniques can be adopted: Adsorption technique, Ion-exchange technique, Precipitation technique and other techniques, which include electro chemical defluoridation and Reverse Osmosis."
      }
    ]
  },
  {
    id: "NO3-1",
    title: "Risk Perception & Remedial Measures for Nitrate",
    riskPerception:
      "High nitrate causes cyanosis (methaemoglobinaemia) or Blue baby disease. It effects digestive system. Development of cancer, especially digestive cancers, such as colorectal stomach and esophagus cancer, complications during pregnancy.",
    sections: [
      {
        desc: "Reverse osmosis systems for drinking water to be used. Biological denitrification and ion-exchange can also be applied."
      }
    ]
  },
  {
    id: "SO4-2",
    title: "Risk Perception & Remedial Measures for Sulphate",
    riskPerception:
      "High concentration of sulphate concentration in draining water may be more sensitive to the cathartic effects. Children, transients and the elderly are high risk of dehydration from diarrhoea may be caused by high concentration of sulfate in drinking-water.",
    sections: [
      {
        desc: "The techniques may be adopted: Ion-exchange technique, Nano-filtration technique, Reverse Osmosis and electro-dialysis may be used."
      }
    ]
  },
  {
    id: "Ca+2",
    title: "Risk Perception & Remedial Measures for Calcium",
    sections: [
      {
        desc: "Water softening using cation exchange resins, Reverse Osmosis (RO), or chemical lime softening."
      }
    ]
  },
  {
    id: "Mg+2",
    title: "Risk Perception & Remedial Measures for Magnesium",
    sections: [
      {
        desc: "Water softening using cation exchange resins, Reverse Osmosis (RO), or chemical lime softening."
      }
    ]
  },
  {
    id: "TH",
    title: "Risk Perception & Remedial Measures for Total Hardness",
    riskPerception:
      "Reduced lathering of soaps, buildup of scale on heating elements and boilers, reduced water flow in distribution pipes due to scale buildup. High levels of sodium in drinking water may harm your health like Cathartic and diuretic effect.",
    sections: [
      {
        desc: "Hardness minerals can be removed with a water softener and dilution technique and Reverse Osmosis., which replaces the calcium and magnesium (and iron, manganese, radium and other positive ions) with sodium."
      }
    ]
  },
  {
    id: "Cr",
    title: "Risk Perception & Remedial Measures for Chromium",
    sections: [
      {
        desc: "Hexavalent chromium can be removed by Reverse Osmosis (RO), Anion Exchange, or reduction to trivalent chromium followed by coagulation and filtration."
      }
    ]
  },
  {
    id: "Cu",
    title: "Risk Perception & Remedial Measures for Copper",
    sections: [
      {
        desc: "Reverse Osmosis (RO), Cation Exchange (water softeners), and raising the pH of the water (to prevent pipe corrosion which is a common source of copper)."
      }
    ]
  },
  {
    id: "Zn",
    title: "Risk Perception & Remedial Measures for Zinc",
    sections: [
      {
        desc: "Ion Exchange (water softeners), Reverse Osmosis (RO), and Distillation are highly effective at removing zinc from drinking water."
      }
    ]
  },
  {
    id: "As",
    title: "Risk Perception & Remedial Measures for Arsenic",
    riskPerception:
      "Long-term exposure of Arsenic is associated with skin, bladder, lung, risk of heart disease and hypertension and other cancers.",
    sections: [
      {
        desc: "The techniques may be adopted: Adsorption technique, Ion-exchange technique, Reverse Osmosis and using alternative sources such as rainwater harvesting or deep aquifer water."
      }
    ]
  },
  {
    id: "Cd",
    title: "Risk Perception & Remedial Measures for Cadmium",
    riskPerception:
      "Cadmium in drinking water is highly toxic and causing significant health risks, primarily it is accumulation in the kidneys. It can lead to kidney damage (tubular dysfunction), bone demineralization (osteoporosis and osteomalacia), and itai-itai disease, while being classified as a carcinogen. Acute symptoms include diarrhea, vomiting, and muscle cramps.",
    sections: [
      {
        desc: "Effective mitigation of cadmium (Cd) from drinking water primarily reverse osmosis (RO), ion exchange, and coagulation/filtration."
      }
    ]
  },
  {
    id: "Fe",
    title: "Risk Perception & Remedial Measures for Iron",
    riskPerception:
      "An excessive amount of exposure to iron can increase the risk of Parkinson's, cardiovascular disease, diabetes mellitus, pigmentation changes, Alzheimer's, as well as renal, liver, respiratory, and neurological issues.",
    sections: [
      {
        desc: "Oxygenation of groundwater followed by precipitation and Reverse osmosis systems."
      }
    ]
  },
  {
    id: "Pb",
    title: "Risk Perception & Remedial Measures for Lead",
    riskPerception:
      "Lead Can lead to hypertension, kidney damage, and reproductive issues in adults and Neurological damage; especially harmful to children, lead exposure can cause developmental delays, lower IQ, and behavioural issues.",
    sections: [
      {
        desc: "Implement water treatment methods that reduce corrosion in pipes, such as adjusting pH, alkalinity, and adding inhibitors like orthophosphate. RO is also highly effective."
      }
    ]
  },
  {
    id: "Mn",
    title: "Risk Perception & Remedial Measures for Manganese",
    riskPerception:
      "Continue use can damage liver, lungs and kidneys, effects the metabolism of iron for formation of hemoglobin and leads to neurological conditions- impaired memory, impaired motor coordination and delayed reaction time- results in disease called Manganism.",
    sections: [
      {
        desc: "Treating the water at its source, filtration system and water treatment method."
      }
    ]
  },
  {
    id: "Ni",
    title: "Risk Perception & Remedial Measures for Nickel",
    riskPerception:
      "Nickel is used in the nickel/chrome plating and so can occasionally leach into water. High concentration of nickel contaminated water is used for domestic/ drinking purposes, it can cause skin irritation (dermatitis), gastrointestinal issues (nausea, vomiting), and long-term risks like kidney/liver damage, reduced body weight and potential carcinogenicity.",
    sections: [
      {
        desc: "There are several effective methods for removing nickel from water namely: Chemical Precipitation, Ion Exchange, Membrane Filtration, Adsorption on activated carbon, Electrodialysis, UV radiation and Biological treatment."
      }
    ]
  },
  {
    id: "Se",
    title: "Risk Perception & Remedial Measures for Selenium",
    riskPerception:
      "Excessive intake of selenium from drinking water, typically more than permissible limit may causes selenosis, characterized by brittle hair, hair loss, and deformed, discolored nails. Other side effects include gastrointestinal distress (nausea, diarrhea), neurological issues (fatigue, irritability, tremor), and extreme cases can lead to organ failure.",
    sections: [
      {
        desc: "Effective selenium mitigation from drinking water, involves advanced techniques like reverse osmosis (RO), ion exchange, and adsorption (e.g., activated alumina or iron-based media). Iron electrocoagulation, which generates reactive rust to bind selenium, can remove 98%."
      }
    ]
  },
  {
    id: "U",
    title: "Risk Perception & Remedial Measures for Uranium",
    riskPerception:
      "The kidney and lungs are found to be the major target organs of Uranium toxicity and it may cause cancer from radioactive uranium. In animal bones, Uranium influences inhibition of osteoblastic activity, thereby reducing bone volume.",
    sections: [
      {
        desc: "The technologies for uranium removal: Coagulation/filtration, Lime softening, Anion exchange, Reverse osmosis and Activated alumina may remove 80-90% uranium from water."
      }
    ]
  },
  {
    id: "Al",
    title: "Risk Perception & Remedial Measures for Aluminium",
    riskPerception:
      "High aluminium exposure has neurological implications and contributes to turbidity and discoloration of water.",
    sections: [
      {
        desc: "Coagulation with alternative non-aluminium coagulants, pH adjustment, and membrane filtration (Reverse Osmosis / Nanofiltration)."
      }
    ]
  },
  {
    id: "Ba",
    title: "Risk Perception & Remedial Measures for Barium",
    riskPerception:
      "Excessive barium in drinking water can cause gastrointestinal disturbances, muscular weakness, hypertension, and cardiac irregularities.",
    sections: [
      {
        desc: "Ion exchange softening, chemical lime softening, and Reverse Osmosis (RO) are highly effective methods for barium removal."
      }
    ]
  },
  {
    id: "B",
    title: "Risk Perception & Remedial Measures for Boron",
    riskPerception:
      "Ingestion of excess boron may cause gastrointestinal irritation and reproductive health risks over prolonged exposure.",
    sections: [
      {
        desc: "Specialized boron-selective ion exchange resins (chelating resins) and multi-pass Reverse Osmosis at elevated pH."
      }
    ]
  },
  {
    id: "Mo",
    title: "Risk Perception & Remedial Measures for Molybdenum",
    riskPerception:
      "Elevated molybdenum intake can lead to gout-like symptoms, joint deformities, and secondary copper deficiency in humans.",
    sections: [
      {
        desc: "Strong base anion exchange, coagulation with iron salts at lower pH (<6.5), and Reverse Osmosis."
      }
    ]
  },
  {
    id: "Hg",
    title: "Risk Perception & Remedial Measures for Mercury",
    riskPerception:
      "Mercury is highly toxic even at trace levels, leading to severe neurological damage, kidney impairment, and cognitive deficits.",
    sections: [
      {
        desc: "Granular Activated Carbon (GAC) adsorption, sulfur-impregnated carbon, chemical precipitation, and Reverse Osmosis."
      }
    ]
  }
];

const PARAM_KEY_TO_ALERT_ID: Record<string, string> = {
  Cl: "Cl-1",
  "Cl-1": "Cl-1",
  NO3: "NO3-1",
  "NO3-1": "NO3-1",
  SO4: "SO4-2",
  "SO4-2": "SO4-2",
  Ca: "Ca+2",
  "Ca+2": "Ca+2",
  Mg: "Mg+2",
  "Mg+2": "Mg+2",
  TH: "TH",
  Alk: "Alkalinity",
  Alkalinity: "Alkalinity",
  Turb: "Turbidity",
  Turbidity: "Turbidity",
  pH: "pH",
  PH: "pH",
  EC: "EC",
  TDS: "TDS",
  F: "F",
  As: "As",
  U: "U",
  Fe: "Fe",
  Cr: "Cr",
  Cu: "Cu",
  Zn: "Zn",
  Cd: "Cd",
  Pb: "Pb",
  Mn: "Mn",
  Ni: "Ni",
  Se: "Se",
  Al: "Al",
  Ba: "Ba",
  B: "B",
  Mo: "Mo",
  Hg: "Hg"
};

export function findAlertRemedialMeasure(paramKey: string): AlertRemedialMeasure | undefined {
  const mappedId = PARAM_KEY_TO_ALERT_ID[paramKey] || paramKey;
  const direct = ALERT_REMEDIAL_MEASURES.find((m) => m.id.toLowerCase() === mappedId.toLowerCase());
  if (direct) return direct;
  const cleanKey = paramKey.replace(/[^a-zA-Z]/g, "").toLowerCase();
  return ALERT_REMEDIAL_MEASURES.find((m) => m.id.replace(/[^a-zA-Z]/g, "").toLowerCase() === cleanKey);
}
