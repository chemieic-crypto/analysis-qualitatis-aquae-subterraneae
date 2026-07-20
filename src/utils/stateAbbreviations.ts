export const STATE_ABBREVIATIONS: Record<string, string> = {
  "Andaman and Nicobar Islands": "A&N",
  "Andhra Pradesh": "AP",
  "Arunachal Pradesh": "AR",
  "Assam": "AS",
  "Bihar": "BR",
  "Chandigarh": "CH",
  "Chhattisgarh": "CG",
  "Dadra and Nagar Haveli and Daman and Diu": "DNH&DD",
  "Delhi": "DL",
  "Goa": "GA",
  "Gujarat": "GJ",
  "Haryana": "HR",
  "Himachal Pradesh": "HP",
  "Jammu and Kashmir": "JK",
  "Jharkhand": "JH",
  "Karnataka": "KA",
  "Kerala": "KL",
  "Ladakh": "LA",
  "Lakshadweep": "LD",
  "Madhya Pradesh": "MP",
  "Maharashtra": "MH",
  "Manipur": "MN",
  "Meghalaya": "ML",
  "Mizoram": "MZ",
  "Nagaland": "NL",
  "Odisha": "OR",
  "Puducherry": "PY",
  "Punjab": "PB",
  "Rajasthan": "RJ",
  "Sikkim": "SK",
  "Tamil Nadu": "TN",
  "Telangana": "TG",
  "Tripura": "TR",
  "Uttar Pradesh": "UP",
  "Uttarakhand": "UK",
  "West Bengal": "WB"
};

export const getShortName = (name: string, reportingLevel: string, useShortNames: boolean) => {
  if (!useShortNames) return name;
  if (reportingLevel === "State") {
    // try direct match
    if (STATE_ABBREVIATIONS[name]) return STATE_ABBREVIATIONS[name];
    // try case-insensitive
    const lowerName = name.toLowerCase();
    const match = Object.keys(STATE_ABBREVIATIONS).find(k => k.toLowerCase() === lowerName);
    if (match) return STATE_ABBREVIATIONS[match];
    return name;
  }
  
  // For districts, just take the first 3-4 characters or acronyms
  if (name.includes(" ")) {
    return name.split(" ").map(w => w[0]).join("").toUpperCase();
  }
  return name.substring(0, 4).toUpperCase();
};
