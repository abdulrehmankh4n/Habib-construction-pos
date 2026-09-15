import type { Database } from 'better-sqlite3';
import { nowLocal } from '../../lib/time';

export const CATALOG: { name: string; description?: string; subcategories: string[] }[] = [
  {
    name: 'Cement',
    description: 'OPC, SRC, white and specialty cements',
    subcategories: ['OPC Cement', 'SRC Cement', 'White Cement', 'Block Cement', 'Rapid Hardening Cement'],
  },
  {
    name: 'Steel / Saria',
    description: 'Deformed bars, TMT, wire, nails and mesh',
    subcategories: [
      'Deformed Steel Bar Grade 40',
      'Deformed Steel Bar Grade 60',
      'TMT Bar',
      'Binding Wire',
      'Steel Nails',
      'GI Wire',
      'Steel Mesh',
    ],
  },
  {
    name: 'Bricks & Blocks',
    subcategories: [
      'Awwal Bricks',
      'A-Class Bricks',
      'B-Class Bricks',
      'Fly Ash Bricks',
      'Concrete Blocks',
      'Hollow Blocks',
      'Solid Blocks',
      'Pavers',
      'Kerb Stones',
    ],
  },
  {
    name: 'Sand',
    description: 'Sold by CFT, trolley or truck',
    subcategories: ['Ravi Sand', 'Chenab Sand', 'Lawrencepur Sand', 'River Sand', 'Fine Sand', 'Coarse Sand'],
  },
  {
    name: 'Crush / Aggregate',
    subcategories: [
      'Sargodha Crush',
      'Margalla Crush',
      'Bajri',
      '1/2" Crush',
      '3/4" Crush',
      '1" Crush',
      'Stone Dust',
      'Gravel',
    ],
  },
  {
    name: 'Plumbing',
    subcategories: [
      'PVC Pipes',
      'UPVC Pipes',
      'PPRC Pipes',
      'HDPE Pipes',
      'CPVC Pipes',
      'Sewerage Pipes',
      'Water Supply Pipes',
      'Pipe Fittings',
      'Elbows',
      'Tees',
      'Sockets',
      'Unions',
      'Couplings',
      'Valves',
      'Ball Valves',
      'Check Valves',
      'Pipe Clamps',
      'Solvent / Cement',
    ],
  },
  {
    name: 'Sanitary',
    subcategories: [
      'Wash Basin',
      'Vanity Basin',
      'Western Toilet',
      'Eastern Toilet',
      'Commode',
      'Urinal',
      'Bathroom Sink',
      'Kitchen Sink',
      'Shower',
      'Mixer',
      'Bath Tub',
      'Floor Drain',
      'Health Faucet',
      'Toilet Accessories',
      'Bathroom Accessories',
    ],
  },
  {
    name: 'Tiles & Flooring',
    subcategories: [
      'Floor Tiles',
      'Wall Tiles',
      'Porcelain Tiles',
      'Ceramic Tiles',
      'Glazed Tiles',
      'Full Body Tiles',
      'Marble',
      'Granite',
      'Mosaic',
      'Outdoor Tiles',
      'Stair Tiles',
      'Tile Adhesive',
      'Grout',
    ],
  },
  {
    name: 'Electrical',
    subcategories: [
      'Electrical Cable',
      'House Wiring',
      'Flexible Wire',
      'Conduit Pipe',
      'PVC Conduit',
      'Switches',
      'Sockets',
      'Distribution Board',
      'MCB',
      'RCCB',
      'Isolator',
      'Circuit Breaker',
      'LED Bulbs',
      'LED Panels',
      'Downlights',
      'Flood Lights',
      'Ceiling Fans',
      'Exhaust Fans',
      'Junction Boxes',
    ],
  },
  {
    name: 'Paint & Finishing',
    subcategories: [
      'Wall Putty',
      'Primer',
      'Interior Emulsion',
      'Exterior Paint',
      'Weather Shield',
      'Enamel Paint',
      'Distemper',
      'Metal Paint',
      'Wood Paint',
      'Thinner',
      'Texture',
      'Waterproofing Paint',
    ],
  },
  {
    name: 'Waterproofing & Chemicals',
    subcategories: [
      'Waterproofing Chemical',
      'Damp Proofing',
      'Bitumen',
      'Bitumen Membrane',
      'Crack Filler',
      'Concrete Admixture',
      'Bonding Agent',
      'Epoxy',
      'Silicone',
      'Construction Adhesive',
      'Tile Adhesive',
    ],
  },
  {
    name: 'Doors & Windows',
    subcategories: [
      'Wooden Doors',
      'PVC Doors',
      'UPVC Doors',
      'Aluminum Doors',
      'Aluminum Windows',
      'UPVC Windows',
      'Glass',
      'Door Handles',
      'Door Locks',
      'Hinges',
      'Door Closers',
      'Tower Bolts',
    ],
  },
  {
    name: 'Hardware',
    subcategories: [
      'Nails',
      'Screws',
      'Nuts & Bolts',
      'Washers',
      'Anchors',
      'Wall Plugs',
      'Drill Bits',
      'Cutting Discs',
      'Grinding Discs',
      'Blades',
      'Hooks',
      'Brackets',
      'Clamps',
    ],
  },
  {
    name: 'Wood / Carpentry',
    subcategories: [
      'MDF Sheet',
      'Chipboard',
      'Plywood',
      'Lamination Sheet',
      'Veneer',
      'PVC Sheet',
      'Wooden Battens',
      'Door Frames',
      'Cabinet Hardware',
      'Drawer Channels',
      'Cabinet Hinges',
      'Handles',
    ],
  },
  {
    name: 'Roofing',
    subcategories: [
      'GI Sheets',
      'Color Coated Sheets',
      'Sandwich Panels',
      'Polycarbonate Sheets',
      'Roofing Tiles',
      'Roof Insulation',
      'Thermal Insulation',
      'Waterproofing Membrane',
    ],
  },
  {
    name: 'Tools',
    subcategories: [
      'Hammer',
      'Screwdriver',
      'Drill Machine',
      'Grinder',
      'Cutting Machine',
      'Measuring Tape',
      'Spirit Level',
      'Plier',
      'Wrench',
      'Spanner Set',
      'Shovel',
      'Pickaxe',
      'Trowel',
      'Masonry Tools',
      'Safety Equipment',
    ],
  },
  {
    name: 'Safety',
    subcategories: [
      'Safety Helmet',
      'Safety Shoes',
      'Gloves',
      'Safety Goggles',
      'Reflective Vest',
      'Dust Mask',
      'Ear Protection',
      'Safety Harness',
    ],
  },
];

export const BRANDS = [
  'Lucky',
  'Bestway',
  'DG Khan',
  'Maple Leaf',
  'Cherat',
  'Mughal',
  'Amreli',
  'FF Steel',
  'Ittefaq',
  'Model',
  'Dadex',
  'Master',
  'Popular',
  'Alpha',
  'Nippon',
  'Berger',
  'ICI',
  'Diamond',
];

export const UNITS: { name: string; symbol: string; allowDecimal: boolean }[] = [
  { name: 'Piece', symbol: 'pc', allowDecimal: false },
  { name: 'Bag', symbol: 'bag', allowDecimal: false },
  { name: 'Kilogram', symbol: 'kg', allowDecimal: true },
  { name: 'Ton', symbol: 'ton', allowDecimal: true },
  { name: 'Cubic Feet', symbol: 'cft', allowDecimal: true },
  { name: 'Trolley', symbol: 'trolley', allowDecimal: true },
  { name: 'Truck', symbol: 'truck', allowDecimal: true },
  { name: 'Thousand', symbol: '1000', allowDecimal: true },
  { name: 'Foot', symbol: 'ft', allowDecimal: true },
  { name: 'Running Foot', symbol: 'rft', allowDecimal: true },
  { name: 'Square Feet', symbol: 'sqft', allowDecimal: true },
  { name: 'Square Meter', symbol: 'sqm', allowDecimal: true },
  { name: 'Meter', symbol: 'm', allowDecimal: true },
  { name: 'Length', symbol: 'len', allowDecimal: false },
  { name: 'Coil', symbol: 'coil', allowDecimal: false },
  { name: 'Roll', symbol: 'roll', allowDecimal: false },
  { name: 'Box', symbol: 'box', allowDecimal: false },
  { name: 'Carton', symbol: 'ctn', allowDecimal: false },
  { name: 'Packet', symbol: 'pkt', allowDecimal: false },
  { name: 'Bundle', symbol: 'bdl', allowDecimal: false },
  { name: 'Sheet', symbol: 'sheet', allowDecimal: false },
  { name: 'Set', symbol: 'set', allowDecimal: false },
  { name: 'Pair', symbol: 'pair', allowDecimal: false },
  { name: 'Dozen', symbol: 'dozen', allowDecimal: false },
  { name: 'Litre', symbol: 'ltr', allowDecimal: true },
  { name: 'Quarter (Paint)', symbol: 'qtr', allowDecimal: false },
  { name: 'Gallon', symbol: 'gal', allowDecimal: false },
  { name: 'Drum', symbol: 'drum', allowDecimal: false },
];

export const TAX_RATES = [
  { name: 'GST 18%', rate: 18, isDefault: true },
  { name: 'Exempt (0%)', rate: 0, isDefault: false },
];

export const EXPENSE_CATEGORIES = [
  'Shop Rent',
  'Electricity Bill',
  'Gas / Water Bill',
  'Staff Salaries',
  'Labour / Mazdoori',
  'Vehicle Fuel',
  'Vehicle Maintenance',
  'Loading / Unloading',
  'Tea & Refreshment',
  'Mobile / Internet',
  'Stationery & Printing',
  'Repairs & Maintenance',
  'Taxes & Fees',
  'Miscellaneous',
];

export const SEQUENCES = [
  { name: 'sale', prefix: 'INV-' },
  { name: 'sale_return', prefix: 'SR-' },
  { name: 'quotation', prefix: 'QT-' },
  { name: 'purchase', prefix: 'PUR-' },
  { name: 'purchase_return', prefix: 'PR-' },
  { name: 'receipt', prefix: 'RCV-' },
  { name: 'voucher', prefix: 'PV-' },
  { name: 'expense', prefix: 'EXP-' },
  { name: 'adjustment', prefix: 'ADJ-' },
];

export function up(db: Database) {
  const now = nowLocal();

  const insertCategory = db.prepare(
    'INSERT INTO categories (name, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  const insertSub = db.prepare(
    'INSERT INTO subcategories (category_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  CATALOG.forEach((cat, ci) => {
    const res = insertCategory.run(cat.name, cat.description ?? null, ci + 1, now, now);
    cat.subcategories.forEach((sub, si) => insertSub.run(res.lastInsertRowid, sub, si + 1, now, now));
  });

  const insertBrand = db.prepare('INSERT INTO brands (name, created_at, updated_at) VALUES (?, ?, ?)');
  for (const b of BRANDS) insertBrand.run(b, now, now);

  const insertUnit = db.prepare(
    'INSERT INTO units (name, symbol, allow_decimal, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  for (const u of UNITS) insertUnit.run(u.name, u.symbol, u.allowDecimal ? 1 : 0, now, now);

  const insertTax = db.prepare(
    'INSERT INTO tax_rates (name, rate, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  for (const t of TAX_RATES) insertTax.run(t.name, t.rate, t.isDefault ? 1 : 0, now, now);

  const insertExpenseCat = db.prepare(
    'INSERT INTO expense_categories (name, created_at, updated_at) VALUES (?, ?, ?)',
  );
  for (const e of EXPENSE_CATEGORIES) insertExpenseCat.run(e, now, now);

  const insertSeq = db.prepare('INSERT INTO sequences (name, prefix, next_value, padding) VALUES (?, ?, 1, 6)');
  for (const s of SEQUENCES) insertSeq.run(s.name, s.prefix);
}
