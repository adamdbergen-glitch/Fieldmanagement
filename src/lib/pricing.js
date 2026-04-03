// src/lib/pricing.js
// Central Pricing Engine for The Paving Stone Pros

const LABOUR_BUMP = 1.0;      
const PAVER_MARKUP = 1.40;    
const CHATBOT_CUSHION = 1.05; 
const MIN_JOB = 2500;         

// Cost for gravel, sand, edge restraints, and disposal per sq ft.
// Fixed to $5.00 to account for A-base, bedding sand, and disposal costs in Winnipeg.
const BASE_PREP_COST = 0.00; 

const MATERIALS = {
  // Barkman – budget
  barkman_holland:              { basePerSqft: 6.18, tier: "budget" },
  barkman_broadway_65:          { basePerSqft: 7.27, tier: "budget" },
  barkman_brookside_slab:       { basePerSqft: 6.95, tier: "budget" },
  barkman_terrace_slab:         { basePerSqft: 4.36, tier: "budget" },
  barkman_diamond_face_24x24:   { basePerSqft: 3.96, tier: "budget" },

  // Barkman – midrange
  barkman_verano:               { basePerSqft: 7.51, tier: "midrange" },
  barkman_roman:                { basePerSqft: 8.20, tier: "midrange" },
  barkman_navarro:              { basePerSqft: 8.76, tier: "midrange" },
  barkman_lexington_slab:       { basePerSqft: 8.04, tier: "midrange" },

  // Barkman – premium
  barkman_fjord:                { basePerSqft: 12.88, tier: "premium" },
  barkman_broadway_100:         { basePerSqft: 11.52, tier: "premium" },
  barkman_arborwood:            { basePerSqft: 11.82, tier: "premium" },

  // Belgard / Techo
  belgard_holland:              { basePerSqft: 4.78, tier: "budget" },
  belgard_dimensions:           { basePerSqft: 5.73, tier: "midrange" },
  techo_blu_60_slate:           { basePerSqft: 7.94, tier: "midrange" },
  techo_blu_60_polished:        { basePerSqft: 11.73, tier: "premium" },
};

export function getMaterialTierDescription(code) {
  const mat = MATERIALS[code];
  if (!mat || !mat.tier) return "a solid mid-range stone option";
  switch (mat.tier) {
    case "budget": return "a cost-effective stone that keeps the price competitive";
    case "midrange": return "a great balance of modern style and value";
    case "premium": return "a premium stone that elevates the entire look of the property";
    default: return "a solid mid-range stone option";
  }
}

export function getMaterialPricePerSqft(code) {
  const mat = MATERIALS[code];
  // Default to Holland price if code not found
  const base = mat ? mat.basePerSqft : 6.18; 
  return base * PAVER_MARKUP;
}

export function getLabourRatePerSqft(project_type, totalSqft) {
  // Adjusted Winnipeg Labour Tiers (Installation Wages + Overhead)
  let base;
  if (totalSqft < 150) base = 32;      
  else if (totalSqft < 300) base = 22;
  else if (totalSqft < 500) base = 19;
  else if (totalSqft < 750) base = 17;
  else if (totalSqft < 1000) base = 15;
  else base = 13;

  if (project_type === "walkway") base *= 1.10; // +10%
  if (project_type === "driveway") base *= 1.30; // +30%

  return base * LABOUR_BUMP;
}

export function calculatePavingEstimate({
  project_type,
  areas,
  access_level,
  material_code,
  city_town,
  is_out_of_town,
}) {
  const totalSqft = (areas || []).reduce((sum, a) => sum + (a.square_feet || 0), 0);
  const anyBackyard = (areas || []).some((a) => a.is_backyard);

  // 1. Calculate Base Labour Rate
  let labourRate = getLabourRatePerSqft(project_type, totalSqft);

  // 2. Add Modifiers
  let accessMultiplier = 1.0;
  if (access_level === "medium") accessMultiplier += 0.05;     
  if (access_level === "difficult") accessMultiplier += 0.15;  
  if (anyBackyard) accessMultiplier += 0.10;                   
  if (is_out_of_town) accessMultiplier += 0.10;                
  
  // 3. Material Costs
  const paverPrice = getMaterialPricePerSqft(material_code);
  
  // 4. THE FORMULA
  let costPerSqFt = (labourRate + BASE_PREP_COST) * accessMultiplier + paverPrice;
  let subtotal = costPerSqFt * totalSqft;

  // 5. Minimum Job Enforcer
  const isMinJob = subtotal < MIN_JOB;
  if (isMinJob) {
    subtotal = MIN_JOB;
  }

  // 6. Chatbot Cushion & Ranges
  const cushioned = subtotal * CHATBOT_CUSHION;
  const low = Math.round(cushioned * 0.95);
  const high = Math.round(cushioned * 1.05);

  return {
    currency: "CAD",
    exact_price: Math.round(subtotal),
    cushioned_price: Math.round(cushioned),
    low,
    high,
    details: `${Math.round(totalSqft)} sqft ${project_type} using ${material_code}. Est: $${(cushioned/totalSqft).toFixed(2)}/sqft avg. ${isMinJob ? "(MINIMUM JOB APPLIED)" : ""}`,
  };
}

// --- NEW RE-LEVELING LOGIC (Square Feet) ---

const RELEVEL_TIERS = {
  small:    { max: 150, rate: 16.50 },     
  standard: { max: 450, rate: 12.50 },     
  large:    { max: 900, rate: 10.50 },     
  volume:   { max: Infinity, rate: 9.00 } 
};

function getRelevelBaseRate(totalSqft) {
  if (totalSqft < RELEVEL_TIERS.small.max) return RELEVEL_TIERS.small.rate;
  if (totalSqft < RELEVEL_TIERS.standard.max) return RELEVEL_TIERS.standard.rate;
  if (totalSqft < RELEVEL_TIERS.large.max) return RELEVEL_TIERS.large.rate;
  return RELEVEL_TIERS.volume.rate;
}

export function calculateRelevelEstimate({
  areas,
  needsEdging,
  isPoorCondition,
  isOutOfTown
}) {
  const totalSqft = (areas || []).reduce((sum, a) => sum + (a.square_feet || 0), 0);
  let rate = getRelevelBaseRate(totalSqft);

  if (needsEdging) rate += 1.50;     
  if (isPoorCondition) rate += 3.00; 
  if (isOutOfTown) rate += 1.00;     

  let subtotal = rate * totalSqft;

  if (subtotal < MIN_JOB) {
    subtotal = MIN_JOB;
  }

  const cushioned = subtotal * CHATBOT_CUSHION;

  return {
    currency: "CAD",
    exact_price: Math.round(subtotal),
    cushioned_price: Math.round(cushioned),
    low: Math.round(cushioned * 0.95),
    high: Math.round(cushioned * 1.05),
    details: `Re-leveling ${Math.round(totalSqft)} sqft. Est: $${(cushioned / totalSqft).toFixed(2)}/sqft avg.`,
  };
}

export function inferMaterialCodeFromText(text) {
  const t = (text || "").toLowerCase();
  
  if (t.includes("navarro")) return "barkman_navarro";
  if (t.includes("fjord")) return "barkman_fjord";
  if (t.includes("arborwood")) return "barkman_arborwood";
  if (t.includes("dimensions")) return "belgard_dimensions";
  if (t.includes("brookside")) return "barkman_brookside_slab";
  if (t.includes("terrace")) return "barkman_terrace_slab";
  if (t.includes("roman")) return "barkman_roman";
  if (t.includes("verano")) return "barkman_verano";
  if (t.includes("broadway") && t.includes("100")) return "barkman_broadway_100";
  if (t.includes("broadway")) return "barkman_broadway_65";
  if (t.includes("blu") && t.includes("polish")) return "techo_blu_60_polished";
  if (t.includes("blu")) return "techo_blu_60_slate";
  if (t.includes("grand") || t.includes("slab")) return "barkman_lexington_slab";

  if (t.includes("premium") || t.includes("high end")) return "barkman_broadway_65";
  
  return "barkman_holland"; 
}