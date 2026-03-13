// app/data/industry-profiles.js
// Industry profiles for MCA bank statement analysis
// Each profile contains COGS rates, revenue descriptors, OpEx patterns,
// seasonal adjustments, default risk data, and macro sensitivity factors.

export const INDUSTRY_PROFILES = {

  vending: {
    label: 'Vending / ATM / Amusement',
    cogs_rate: 0.40,
    cogs_range: [0.35, 0.45],
    opex_range: [0.15, 0.25],
    healthy_margin: [0.30, 0.50],

    default_risk: {
      tier: 'moderate',
      industry_default_rate: 0.22,
      source: 'SBA Office of Advocacy, NAICS 4542',
      narrative: 'Vending operations have moderate default risk. Revenue is transaction-based and relatively stable, but heavily dependent on location traffic and machine maintenance costs.'
    },

    seasonal_patterns: {
      has_seasonality: true,
      peak_months: [5, 6, 7, 8],     // May-Aug
      trough_months: [11, 12, 1, 2],  // Nov-Feb
      peak_vs_trough_delta: 0.25,     // 25% swing
      narrative: 'Vending revenue typically peaks in summer months (foot traffic, outdoor locations) and dips in winter. Holiday office closures in Dec-Jan can reduce corporate location revenue by 20-30%.'
    },

    macro_sensitivity: [
      'Consumer foot traffic patterns (remote work reduces office vending)',
      'Product cost inflation (COGS pressure from candy/snack/beverage suppliers)',
      'Cashless adoption (benefits operators with card readers, hurts cash-only machines)'
    ],

    revenue_descriptors: [
      { pattern: 'THREE SQUARE', type: 'card_processing', note: 'Square card settlements, $15K-$45K weekly' },
      { pattern: 'LE-USA TECHNOL', type: 'card_processing', note: 'USA Technologies cashless vending, $50K-$100K+ weekly' },
      { pattern: 'USA TECHNOL', type: 'card_processing', note: 'USA Technologies cashless vending' },
      { pattern: 'CANTALOUPE', type: 'card_processing', note: 'Cantaloupe cashless vending, largest revenue source, $45K-$80K weekly' },
      { pattern: 'CANTEEN', type: 'card_processing', note: 'Canteen vending operator income' },
      { pattern: 'DEPOSIT', type: 'cash_collection', note: 'Physical route cash collections' },
      { pattern: 'FERRARA CANDY', type: 'vendor_rebate', note: 'Candy vendor rebate' },
      { pattern: 'ADVANTECH', type: 'vendor_rebate', note: 'Vendor rebate' },
    ],

    expense_descriptors: [
      { pattern: 'VISTAR', type: 'inventory', note: 'Vending product distributor' },
      { pattern: 'COCA COLA', type: 'inventory', note: 'Beverage supplier' },
      { pattern: 'PEPSI', type: 'inventory', note: 'Beverage supplier' },
      { pattern: 'MARS', type: 'inventory', note: 'Candy/snack supplier' },
      { pattern: 'FLEETCOR', type: 'fuel', note: 'Fleet fuel cards — OpEx, NOT MCA' },
      { pattern: 'WRIGHT EXPRESS', type: 'fuel', note: 'Fleet fuel cards — OpEx, NOT MCA' },
      { pattern: 'WEX', type: 'fuel', note: 'Fleet fuel cards — OpEx, NOT MCA' },
    ],

    not_mca_patterns: [
      'FLEETCOR FUNDING',
      'WRIGHT EXPRESS',
      'WEX BANK',
      'AMF TEAM',
      'AMFTEAM',
      'AMERICAN FUNDS',
    ],
  },

  trucking: {
    label: 'Trucking / Freight / Logistics',
    cogs_rate: 0.65,
    cogs_range: [0.55, 0.70],
    opex_range: [0.15, 0.20],
    healthy_margin: [0.10, 0.25],

    default_risk: {
      tier: 'high',
      industry_default_rate: 0.31,
      source: 'ATBS, Owner-Operator Independent Drivers Association, SBA NAICS 4841-4842',
      narrative: 'Trucking has one of the highest MCA default rates. Thin margins, fuel price volatility, driver shortages, and intense rate competition create cash flow instability. Funders who advance into trucking at factor rates above 1.40 are taking on substantial risk.'
    },

    seasonal_patterns: {
      has_seasonality: true,
      peak_months: [3, 4, 5, 9, 10, 11],  // Spring produce + fall retail
      trough_months: [1, 2, 7],             // Post-holiday Jan/Feb, summer freight dip
      peak_vs_trough_delta: 0.35,
      narrative: 'Trucking revenue follows freight demand cycles. Q1 is the softest period (post-holiday). Spring agricultural shipping and fall retail pre-positioning drive peak revenue. Spot rates can swing 30-40% between peak and trough.'
    },

    macro_sensitivity: [
      'Diesel fuel prices (direct COGS impact — EIA tracks weekly)',
      'Freight rate environment (DAT, Truckstop.com spot vs contract rates)',
      'FMCSA regulatory changes (ELD mandate compliance costs)',
      'Insurance cost inflation (trucking insurance up 30-40% since 2022)',
      'Interest rates (equipment financing costs)'
    ],

    revenue_descriptors: [
      { pattern: 'CH ROBINSON', type: 'freight_broker', note: 'Major freight broker payments' },
      { pattern: 'COYOTE LOGISTICS', type: 'freight_broker', note: 'UPS freight brokerage' },
      { pattern: 'ECHO GLOBAL', type: 'freight_broker', note: 'Echo Global Logistics' },
      { pattern: 'XPO LOGISTICS', type: 'freight_broker', note: 'XPO Logistics' },
      { pattern: 'TQL', type: 'freight_broker', note: 'Total Quality Logistics' },
      { pattern: 'UBER FREIGHT', type: 'freight_broker', note: 'Uber Freight payments' },
      { pattern: 'CONVOY', type: 'freight_broker', note: 'Convoy freight payments' },
      { pattern: 'DAT', type: 'freight_broker', note: 'DAT load board payments' },
      { pattern: 'AMAZON LOGISTICS', type: 'direct_shipper', note: 'Amazon delivery contracts' },
      { pattern: 'TRIUMPH', type: 'factoring', note: 'Triumph Business Capital factoring' },
      { pattern: 'RTS FINANCIAL', type: 'factoring', note: 'RTS factoring payouts' },
      { pattern: 'OTR SOLUTIONS', type: 'factoring', note: 'OTR Solutions factoring' },
      { pattern: 'APEX CAPITAL', type: 'factoring', note: 'Apex Capital factoring payouts' },
    ],

    expense_descriptors: [
      { pattern: 'PILOT', type: 'fuel', note: 'Pilot Flying J fuel stops' },
      { pattern: 'LOVES', type: 'fuel', note: 'Loves Travel Stops fuel' },
      { pattern: 'TA PETRO', type: 'fuel', note: 'TravelCenters of America fuel' },
      { pattern: 'FLEETCOR', type: 'fuel', note: 'Fleet fuel card — OpEx, NOT MCA' },
      { pattern: 'WEX', type: 'fuel', note: 'WEX fleet fuel card — OpEx, NOT MCA' },
      { pattern: 'COMDATA', type: 'fuel', note: 'Comdata fleet fuel card — OpEx, NOT MCA' },
      { pattern: 'EFS', type: 'fuel', note: 'EFS fuel card — OpEx, NOT MCA' },
      { pattern: 'GEOTAB', type: 'fleet_mgmt', note: 'GPS/fleet tracking' },
      { pattern: 'SAMSARA', type: 'fleet_mgmt', note: 'Fleet management/ELD' },
      { pattern: 'KEEPTRUCKIN', type: 'fleet_mgmt', note: 'ELD/fleet management' },
      { pattern: 'PROGRESSIVE', type: 'insurance', note: 'Commercial auto insurance' },
      { pattern: 'GREAT WEST', type: 'insurance', note: 'Trucking insurance' },
    ],

    not_mca_patterns: [
      'FLEETCOR FUNDING',
      'WEX BANK',
      'COMDATA',
      'EFS',
      'TRIUMPH',        // Factoring, not MCA
      'RTS FINANCIAL',  // Factoring, not MCA
      'OTR SOLUTIONS',  // Factoring, not MCA
      'APEX CAPITAL',   // Factoring, not MCA (but could be confused with MCA funders)
    ],
  },

  restaurant: {
    label: 'Restaurant / Food Service / Bar',
    cogs_rate: 0.32,
    cogs_range: [0.28, 0.38],
    opex_range: [0.45, 0.55],
    healthy_margin: [0.10, 0.20],

    default_risk: {
      tier: 'high',
      industry_default_rate: 0.29,
      source: 'National Restaurant Association, SBA NAICS 7225',
      narrative: 'Restaurants have high failure and MCA default rates driven by thin margins (3-9% net), high labor costs, and food cost volatility. Most restaurants operate with less than 2 weeks of cash reserves. Funders pricing above 1.40 factor in this vertical are assuming extreme risk.'
    },

    seasonal_patterns: {
      has_seasonality: true,
      peak_months: [3, 4, 5, 6, 10, 11, 12], // Spring/summer + holiday
      trough_months: [1, 2],                    // January slump
      peak_vs_trough_delta: 0.30,
      narrative: 'Restaurant revenue peaks during holiday season (Nov-Dec) and summer months. January-February is the annual trough as consumers cut spending post-holidays. Weather significantly impacts foot traffic for non-delivery restaurants.'
    },

    macro_sensitivity: [
      'Food cost inflation (USDA Food Price Outlook — direct COGS impact)',
      'Labor cost increases (minimum wage changes, tip credit rules)',
      'Consumer discretionary spending (first to be cut in recession)',
      'Delivery platform commission rates (DoorDash/UberEats take 15-30%)',
      'Interest rates (affects consumer credit card spending)'
    ],

    revenue_descriptors: [
      { pattern: 'TOAST', type: 'pos_processing', note: 'Toast POS settlements' },
      { pattern: 'SQUARE', type: 'pos_processing', note: 'Square POS settlements' },
      { pattern: 'CLOVER', type: 'pos_processing', note: 'Clover POS settlements' },
      { pattern: 'STRIPE', type: 'pos_processing', note: 'Stripe payment processing' },
      { pattern: 'WORLDPAY', type: 'pos_processing', note: 'Worldpay card processing' },
      { pattern: 'HEARTLAND', type: 'pos_processing', note: 'Heartland payment processing' },
      { pattern: 'DOORDASH', type: 'delivery', note: 'DoorDash delivery payouts' },
      { pattern: 'UBER EATS', type: 'delivery', note: 'Uber Eats delivery payouts' },
      { pattern: 'GRUBHUB', type: 'delivery', note: 'Grubhub delivery payouts' },
      { pattern: 'CAVIAR', type: 'delivery', note: 'Caviar delivery payouts' },
      { pattern: 'POSTMATES', type: 'delivery', note: 'Postmates delivery payouts' },
      { pattern: 'CHOWLY', type: 'delivery', note: 'Chowly order aggregator' },
    ],

    expense_descriptors: [
      { pattern: 'SYSCO', type: 'food_supplier', note: 'Sysco food distributor' },
      { pattern: 'US FOODS', type: 'food_supplier', note: 'US Foods distributor' },
      { pattern: 'PERFORMANCE FOOD', type: 'food_supplier', note: 'PFG food distributor' },
      { pattern: 'RESTAURANT DEPOT', type: 'food_supplier', note: 'Restaurant Depot supplies' },
      { pattern: 'CHEFS WAREHOUSE', type: 'food_supplier', note: 'Specialty food supplier' },
      { pattern: 'BEN E KEITH', type: 'food_supplier', note: 'Food/beverage distributor' },
    ],

    not_mca_patterns: [],
  },

  retail: {
    label: 'Retail / E-Commerce',
    cogs_rate: 0.55,
    cogs_range: [0.45, 0.65],
    opex_range: [0.20, 0.30],
    healthy_margin: [0.10, 0.25],

    default_risk: {
      tier: 'moderate',
      industry_default_rate: 0.23,
      source: 'Census Bureau Retail Trade, SBA NAICS 44-45',
      narrative: 'Retail default risk varies widely by sub-segment. E-commerce has lower overhead but higher marketing costs. Brick-and-mortar faces rent pressure and foot traffic decline. Mixed-channel retailers have the best resilience.'
    },

    seasonal_patterns: {
      has_seasonality: true,
      peak_months: [10, 11, 12],   // Q4 holiday
      trough_months: [1, 2, 3],     // Q1 post-holiday
      peak_vs_trough_delta: 0.45,
      narrative: 'Retail is the most seasonally concentrated industry. Q4 (Oct-Dec) can represent 35-50% of annual revenue for many retailers. January is the deepest trough as returns spike and consumer spending drops. Funders who set payment terms based on Q4 revenue will see massive apparent decline in Q1.'
    },

    macro_sensitivity: [
      'Consumer confidence index (Conference Board)',
      'Interest rates (consumer credit card debt costs)',
      'Supply chain disruptions (inventory cost and timing)',
      'E-commerce penetration rate (channel shift pressure on brick-and-mortar)',
      'Tariff and trade policy changes (imported goods cost impact)'
    ],

    revenue_descriptors: [
      { pattern: 'SHOPIFY', type: 'ecommerce', note: 'Shopify payouts' },
      { pattern: 'AMAZON', type: 'marketplace', note: 'Amazon seller payouts' },
      { pattern: 'SQUARE', type: 'pos_processing', note: 'Square POS settlements' },
      { pattern: 'STRIPE', type: 'payment_processing', note: 'Stripe payment processing' },
      { pattern: 'PAYPAL', type: 'payment_processing', note: 'PayPal settlements' },
      { pattern: 'CLOVER', type: 'pos_processing', note: 'Clover POS settlements' },
      { pattern: 'ETSY', type: 'marketplace', note: 'Etsy seller payouts' },
      { pattern: 'WALMART', type: 'marketplace', note: 'Walmart Marketplace payouts' },
      { pattern: 'FAIRE', type: 'wholesale', note: 'Faire wholesale marketplace' },
    ],

    expense_descriptors: [],
    not_mca_patterns: [],
  },

  construction: {
    label: 'Construction / Contractors / Trades',
    cogs_rate: 0.50,
    cogs_range: [0.40, 0.60],
    opex_range: [0.20, 0.30],
    healthy_margin: [0.10, 0.25],

    default_risk: {
      tier: 'high',
      industry_default_rate: 0.28,
      source: 'SBA Office of Advocacy, NAICS 23',
      narrative: 'Construction has high MCA default risk due to project-based revenue (lumpy cash flow), high upfront material costs, payment delays from general contractors (net-60/90 common), and weather-dependent scheduling. Cash flow gaps between project starts and payment receipt make these merchants particularly vulnerable to over-stacking.'
    },

    seasonal_patterns: {
      has_seasonality: true,
      peak_months: [4, 5, 6, 7, 8, 9, 10],  // Spring through fall
      trough_months: [12, 1, 2, 3],            // Winter
      peak_vs_trough_delta: 0.50,
      narrative: 'Construction is highly seasonal in northern states (50%+ revenue swing). Southern/western states have less seasonality but still slow during extreme heat or rain. Payment timing further distorts monthly revenue — a project completed in October may not pay until December.'
    },

    macro_sensitivity: [
      'Interest rates (housing starts, commercial development)',
      'Material costs — lumber, steel, concrete (PPI tracking)',
      'Labor availability and wage pressure',
      'Building permit activity (Census Bureau)',
      'Infrastructure spending and government contracts'
    ],

    revenue_descriptors: [
      { pattern: 'PROGRESS', type: 'progress_payment', note: 'Progress payment from GC or owner' },
      { pattern: 'RETAINAGE', type: 'retainage', note: 'Retainage release payment' },
      { pattern: 'AIA', type: 'progress_payment', note: 'AIA billing payment' },
    ],

    expense_descriptors: [
      { pattern: 'HOME DEPOT', type: 'materials', note: 'Building materials' },
      { pattern: 'LOWES', type: 'materials', note: 'Building materials' },
      { pattern: 'ABC SUPPLY', type: 'materials', note: 'Roofing/siding supplier' },
      { pattern: 'FASTENAL', type: 'materials', note: 'Fasteners/tools supplier' },
      { pattern: 'GRAINGER', type: 'materials', note: 'Industrial supply' },
      { pattern: '84 LUMBER', type: 'materials', note: 'Lumber supplier' },
      { pattern: 'FERGUSON', type: 'materials', note: 'Plumbing/HVAC supplier' },
      { pattern: 'SUNBELT', type: 'equipment_rental', note: 'Equipment rental' },
      { pattern: 'UNITED RENTALS', type: 'equipment_rental', note: 'Equipment rental' },
    ],

    not_mca_patterns: [],
  },

  auto_repair: {
    label: 'Auto Repair / Body Shop / Dealership',
    cogs_rate: 0.42,
    cogs_range: [0.35, 0.50],
    opex_range: [0.30, 0.40],
    healthy_margin: [0.15, 0.30],

    default_risk: {
      tier: 'moderate',
      industry_default_rate: 0.20,
      source: 'Auto Care Association, SBA NAICS 8111',
      narrative: 'Auto repair has moderate default risk. Revenue is relatively recession-resistant (people repair cars they can\'t afford to replace), but shops with high-end specialty focus are more vulnerable. Insurance claim-dependent shops face payment delays that create cash flow gaps.'
    },

    seasonal_patterns: {
      has_seasonality: true,
      peak_months: [3, 4, 5, 10, 11],   // Pre-summer + pre-winter
      trough_months: [1, 7, 8],           // Post-holiday, mid-summer
      peak_vs_trough_delta: 0.20,
      narrative: 'Auto repair has mild seasonality. Pre-winter (tires, brakes, heaters) and spring (AC service, winter damage repair) are peak. Body shops see spikes after winter weather events. Overall more stable than most MCA industries.'
    },

    macro_sensitivity: [
      'Used car values (affects repair-vs-replace decision)',
      'Parts cost inflation (OEM vs aftermarket pricing)',
      'Insurance reimbursement rates and processing times',
      'Average vehicle age (older fleet = more repairs)',
      'EV adoption rate (long-term shift in service needs)'
    ],

    revenue_descriptors: [
      { pattern: 'GEICO', type: 'insurance_claim', note: 'GEICO insurance claim payment' },
      { pattern: 'STATE FARM', type: 'insurance_claim', note: 'State Farm claim payment' },
      { pattern: 'ALLSTATE', type: 'insurance_claim', note: 'Allstate claim payment' },
      { pattern: 'PROGRESSIVE', type: 'insurance_claim', note: 'Progressive claim payment' },
      { pattern: 'USAA', type: 'insurance_claim', note: 'USAA claim payment' },
      { pattern: 'MITCHELL', type: 'insurance_claim', note: 'Mitchell International claim payment' },
      { pattern: 'CCCIS', type: 'insurance_claim', note: 'CCC claims management payment' },
      { pattern: 'SQUARE', type: 'pos_processing', note: 'Square POS for retail customers' },
    ],

    expense_descriptors: [
      { pattern: 'AUTOZONE', type: 'parts', note: 'Auto parts supplier' },
      { pattern: 'OREILLY', type: 'parts', note: 'Auto parts supplier' },
      { pattern: 'NAPA', type: 'parts', note: 'NAPA auto parts' },
      { pattern: 'LKQ', type: 'parts', note: 'LKQ auto parts (aftermarket/salvage)' },
      { pattern: 'WORLDPAC', type: 'parts', note: 'Worldpac auto parts distributor' },
    ],

    not_mca_patterns: [],
  },

  medical: {
    label: 'Medical / Dental / Healthcare Practice',
    cogs_rate: 0.20,
    cogs_range: [0.12, 0.28],
    opex_range: [0.50, 0.65],
    healthy_margin: [0.12, 0.30],

    default_risk: {
      tier: 'low',
      industry_default_rate: 0.12,
      source: 'ADA Health Policy Institute, SBA NAICS 6211-6213',
      narrative: 'Medical and dental practices have the lowest MCA default rates across all industries. Revenue is highly predictable (insurance reimbursements), patient demand is inelastic, and most practices maintain strong receivables. Funders who price medical deals above 1.35 factor are overcharging for the risk profile.'
    },

    seasonal_patterns: {
      has_seasonality: true,
      peak_months: [1, 2, 3, 9, 10, 11],   // Q1 (new deductibles) + Q4 (use-it-or-lose-it benefits)
      trough_months: [6, 7, 8],              // Summer vacations
      peak_vs_trough_delta: 0.20,
      narrative: 'Medical revenue dips in summer (patient vacations, fewer elective procedures). Q1 sees a bump as patients with new insurance deductibles schedule appointments. Q4 peaks as patients rush to use remaining insurance benefits before year-end reset.'
    },

    macro_sensitivity: [
      'Insurance reimbursement rates (payer mix shift)',
      'Patient volume trends (telehealth, post-pandemic)',
      'Staffing costs (nursing/medical staff shortages)',
      'Regulatory compliance costs (HIPAA, state licensing)',
      'Medical supply inflation'
    ],

    revenue_descriptors: [
      { pattern: 'ATHENA', type: 'insurance_clearing', note: 'Athenahealth practice management payouts' },
      { pattern: 'KAREO', type: 'insurance_clearing', note: 'Kareo/Tebra practice management' },
      { pattern: 'AVAILITY', type: 'insurance_clearing', note: 'Availity clearinghouse' },
      { pattern: 'CHANGE HEALTH', type: 'insurance_clearing', note: 'Change Healthcare claims' },
      { pattern: 'UNITED HEALTH', type: 'insurance', note: 'UnitedHealthcare insurance payment' },
      { pattern: 'AETNA', type: 'insurance', note: 'Aetna insurance payment' },
      { pattern: 'CIGNA', type: 'insurance', note: 'Cigna insurance payment' },
      { pattern: 'BCBS', type: 'insurance', note: 'Blue Cross Blue Shield payment' },
      { pattern: 'BLUE CROSS', type: 'insurance', note: 'Blue Cross payment' },
      { pattern: 'HUMANA', type: 'insurance', note: 'Humana insurance payment' },
      { pattern: 'MEDICARE', type: 'government', note: 'Medicare reimbursement' },
      { pattern: 'MEDICAID', type: 'government', note: 'Medicaid reimbursement' },
      { pattern: 'TRICARE', type: 'government', note: 'TRICARE military insurance' },
      { pattern: 'DELTA DENTAL', type: 'dental_insurance', note: 'Delta Dental payment' },
      { pattern: 'METLIFE DENTAL', type: 'dental_insurance', note: 'MetLife dental payment' },
    ],

    expense_descriptors: [
      { pattern: 'HENRY SCHEIN', type: 'medical_supply', note: 'Medical/dental supply distributor' },
      { pattern: 'MCKESSON', type: 'medical_supply', note: 'Medical supply distributor' },
      { pattern: 'PATTERSON', type: 'dental_supply', note: 'Patterson dental supply' },
      { pattern: 'BENCO', type: 'dental_supply', note: 'Benco dental supply' },
    ],

    not_mca_patterns: [],
  },

  salon: {
    label: 'Salon / Beauty / Spa',
    cogs_rate: 0.15,
    cogs_range: [0.08, 0.22],
    opex_range: [0.50, 0.60],
    healthy_margin: [0.18, 0.35],

    default_risk: {
      tier: 'moderate',
      industry_default_rate: 0.24,
      source: 'IBISWorld, SBA NAICS 8121',
      narrative: 'Salon and beauty businesses have moderate default risk. Revenue is service-based with low COGS but high labor costs (often 50%+ of revenue). Booth-rental models have lower overhead but less revenue control. Location-dependent foot traffic creates variability.'
    },

    seasonal_patterns: {
      has_seasonality: true,
      peak_months: [4, 5, 11, 12],    // Prom/wedding season + holidays
      trough_months: [1, 2, 7],        // Post-holiday, mid-summer
      peak_vs_trough_delta: 0.25,
      narrative: 'Salon revenue peaks around holidays (Thanksgiving-Christmas) and spring event season (proms, weddings). January sees the deepest drop as consumers cut discretionary spending. Summer is mixed — vacations reduce regular clients but weddings drive high-ticket services.'
    },

    macro_sensitivity: [
      'Consumer discretionary spending (salons are early cut in downturns)',
      'Rent costs (high-traffic retail locations)',
      'Labor costs (licensed stylists command premium wages)',
      'Product costs (professional product wholesale pricing)',
      'Tip income reporting changes (affects staff retention)'
    ],

    revenue_descriptors: [
      { pattern: 'SQUARE', type: 'pos_processing', note: 'Square POS settlements' },
      { pattern: 'VAGARO', type: 'booking_platform', note: 'Vagaro salon software payouts' },
      { pattern: 'FRESHA', type: 'booking_platform', note: 'Fresha booking platform' },
      { pattern: 'BOULEVARD', type: 'booking_platform', note: 'Boulevard salon management' },
      { pattern: 'MINDBODY', type: 'booking_platform', note: 'Mindbody booking (spa/wellness)' },
      { pattern: 'STRIPE', type: 'payment_processing', note: 'Stripe payment processing' },
      { pattern: 'CLOVER', type: 'pos_processing', note: 'Clover POS settlements' },
    ],

    expense_descriptors: [
      { pattern: 'SALON CENTRIC', type: 'product', note: 'Professional salon products' },
      { pattern: 'COSMOPROF', type: 'product', note: 'Professional beauty supply' },
      { pattern: 'LOREAL', type: 'product', note: 'L\'Oreal professional products' },
    ],

    not_mca_patterns: [],
  },

  ecommerce: {
    label: 'E-Commerce / Online Retail',
    cogs_rate: 0.42,
    cogs_range: [0.30, 0.55],
    opex_range: [0.25, 0.40],
    healthy_margin: [0.10, 0.25],

    default_risk: {
      tier: 'moderate',
      industry_default_rate: 0.25,
      source: 'Digital Commerce 360, SBA',
      narrative: 'E-commerce default risk is moderate but highly variable by sub-segment. Dropship models have lower COGS risk but depend on advertising spend. Private-label brands have higher margins but inventory risk. Amazon-dependent sellers face platform risk (account suspensions, fee increases).'
    },

    seasonal_patterns: {
      has_seasonality: true,
      peak_months: [10, 11, 12],          // Q4 holiday
      trough_months: [1, 2, 6, 7],        // Post-holiday, summer
      peak_vs_trough_delta: 0.50,
      narrative: 'E-commerce is extremely seasonal. Q4 can represent 40-50% of annual revenue for consumer products. Prime Day (July) creates a secondary spike for Amazon sellers. January-February sees the steepest drops as returns process and ad spend pulls back.'
    },

    macro_sensitivity: [
      'Consumer confidence and discretionary spending',
      'Digital advertising costs (Meta/Google CPM trends)',
      'Shipping cost changes (USPS/UPS/FedEx rate increases)',
      'Platform fee changes (Amazon referral fees, Shopify pricing)',
      'Tariff and import duty changes (overseas sourcing impact)',
      'Supply chain disruption (inventory availability)'
    ],

    revenue_descriptors: [
      { pattern: 'SHOPIFY', type: 'ecommerce', note: 'Shopify payouts' },
      { pattern: 'AMAZON', type: 'marketplace', note: 'Amazon seller payouts' },
      { pattern: 'STRIPE', type: 'payment_processing', note: 'Stripe payment processing' },
      { pattern: 'PAYPAL', type: 'payment_processing', note: 'PayPal settlements' },
      { pattern: 'ETSY', type: 'marketplace', note: 'Etsy seller payouts' },
      { pattern: 'WALMART', type: 'marketplace', note: 'Walmart Marketplace payouts' },
      { pattern: 'EBAY', type: 'marketplace', note: 'eBay seller payouts' },
      { pattern: 'TIKTOK SHOP', type: 'marketplace', note: 'TikTok Shop payouts' },
    ],

    expense_descriptors: [
      { pattern: 'META', type: 'advertising', note: 'Meta/Facebook/Instagram ads' },
      { pattern: 'FACEBOOK', type: 'advertising', note: 'Facebook advertising' },
      { pattern: 'GOOGLE ADS', type: 'advertising', note: 'Google advertising' },
      { pattern: 'SHIPSTATION', type: 'shipping', note: 'ShipStation shipping software' },
      { pattern: 'SHIPPO', type: 'shipping', note: 'Shippo shipping' },
      { pattern: 'UPS', type: 'shipping', note: 'UPS shipping costs' },
      { pattern: 'FEDEX', type: 'shipping', note: 'FedEx shipping costs' },
      { pattern: 'USPS', type: 'shipping', note: 'USPS shipping costs' },
    ],

    not_mca_patterns: [],
  },

  general: {
    label: 'General / Other Business',
    cogs_rate: 0.40,
    cogs_range: [0.25, 0.55],
    opex_range: [0.25, 0.40],
    healthy_margin: [0.10, 0.30],

    default_risk: {
      tier: 'moderate',
      industry_default_rate: 0.22,
      source: 'SBA Office of Advocacy, general small business statistics',
      narrative: 'Default risk for general small businesses averages around 22%. Without industry-specific context, the analyzer will use conservative benchmarks. For more accurate analysis, select a specific industry profile.'
    },

    seasonal_patterns: {
      has_seasonality: false,
      peak_months: [],
      trough_months: [],
      peak_vs_trough_delta: 0,
      narrative: 'No specific seasonal pattern applied. Revenue will be evaluated month-over-month for trends without seasonal normalization.'
    },

    macro_sensitivity: [
      'Interest rate environment',
      'Consumer/business spending trends',
      'Labor market conditions',
      'Regional economic factors'
    ],

    revenue_descriptors: [
      { pattern: 'SQUARE', type: 'pos_processing', note: 'Square POS settlements' },
      { pattern: 'STRIPE', type: 'payment_processing', note: 'Stripe payment processing' },
      { pattern: 'PAYPAL', type: 'payment_processing', note: 'PayPal settlements' },
      { pattern: 'CLOVER', type: 'pos_processing', note: 'Clover POS settlements' },
    ],

    expense_descriptors: [],
    not_mca_patterns: [],
  },
};

// Helper to get a profile with fallback to general
export function getProfile(key) {
  return INDUSTRY_PROFILES[key] || INDUSTRY_PROFILES.general;
}

// Generate the prompt addon block for a given industry
export function buildIndustryPromptBlock(key) {
  const p = getProfile(key);
  if (!p) return '';

  let block = `\n## INDUSTRY CONTEXT: ${p.label.toUpperCase()}\n`;
  block += `\nDefault COGS rate: ${(p.cogs_rate * 100).toFixed(0)}% (range: ${(p.cogs_range[0] * 100).toFixed(0)}-${(p.cogs_range[1] * 100).toFixed(0)}%)`;
  block += `\nExpected OpEx range: ${(p.opex_range[0] * 100).toFixed(0)}-${(p.opex_range[1] * 100).toFixed(0)}% of revenue`;
  block += `\nHealthy net margin: ${(p.healthy_margin[0] * 100).toFixed(0)}-${(p.healthy_margin[1] * 100).toFixed(0)}%`;
  block += `\n\nINDUSTRY DEFAULT RISK: ${p.default_risk.tier.toUpperCase()} — ${(p.default_risk.industry_default_rate * 100).toFixed(0)}% industry-wide default rate`;
  block += `\n${p.default_risk.narrative}`;

  if (p.seasonal_patterns.has_seasonality) {
    block += `\n\nSEASONAL PATTERNS: ${p.seasonal_patterns.narrative}`;
    block += `\nPeak months: ${p.seasonal_patterns.peak_months.join(', ')} | Trough months: ${p.seasonal_patterns.trough_months.join(', ')}`;
    block += `\nTypical peak-to-trough swing: ${(p.seasonal_patterns.peak_vs_trough_delta * 100).toFixed(0)}%`;
    block += `\nIMPORTANT: If analyzing statements from trough months, note that low revenue may be SEASONAL, not a sign of business failure. Calculate normalized annual revenue when determining hardship.`;
  }

  if (p.macro_sensitivity.length > 0) {
    block += `\n\nMACROECONOMIC SENSITIVITY:`;
    p.macro_sensitivity.forEach(m => { block += `\n• ${m}`; });
  }

  if (p.revenue_descriptors.length > 0) {
    block += `\n\nREVENUE DESCRIPTORS FOR THIS INDUSTRY — TRUE REVENUE:`;
    p.revenue_descriptors.forEach(d => { block += `\n• "${d.pattern}" → ${d.note} (${d.type})`; });
  }

  if (p.expense_descriptors.length > 0) {
    block += `\n\nKNOWN EXPENSE DESCRIPTORS — OpEx, NOT REVENUE:`;
    p.expense_descriptors.forEach(d => { block += `\n• "${d.pattern}" → ${d.note} (${d.type})`; });
  }

  if (p.not_mca_patterns.length > 0) {
    block += `\n\nNOT MCA — DO NOT CLASSIFY AS MCA POSITIONS:`;
    p.not_mca_patterns.forEach(pat => { block += `\n• "${pat}"`; });
  }

  block += `\n\nDSR CALCULATION FOR THIS INDUSTRY:`;
  block += `\n• monthly_gross_profit = monthly_true_revenue × ${(1 - p.cogs_rate).toFixed(2)} (assumes ${(p.cogs_rate * 100).toFixed(0)}% COGS for ${p.label})`;
  block += `\n• cogs_rate = ${p.cogs_rate.toFixed(2)}`;
  block += `\n• dsr_percent = (total_mca_monthly / monthly_gross_profit) × 100`;
  block += `\n• If calculated COGS falls outside ${(p.cogs_range[0] * 100).toFixed(0)}-${(p.cogs_range[1] * 100).toFixed(0)}% or OpEx falls outside ${(p.opex_range[0] * 100).toFixed(0)}-${(p.opex_range[1] * 100).toFixed(0)}%, flag for manual review — something may be misclassified.`;

  return block;
}

export default INDUSTRY_PROFILES;
