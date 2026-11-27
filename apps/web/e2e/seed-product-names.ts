/**
 * Product display names for structure groups at BRAIAN_SEED_COUNT=250 (CI default).
 * Hero demo product PROD-CHEDDAR plus synthetic slots from crates/server/src/seed.rs.
 */
export const SEED_CHEESE_PRODUCT_NAMES = [
  'Mature cheddar',
  'Mozzarella 19',
  'Feta 36',
  'Organic Cheddar 53',
] as const

export const SEED_MILK_PRODUCT_NAMES = [
  'Semi-skimmed milk 18',
  'Skimmed milk 35',
  'Buttermilk 52',
] as const

/**
 * Product index 20 at seed count 250 (6 suppliers, then products).
 * leaf_for(20) is juice, outside Dairy & eggs.
 */
export const SEED_JUICE_PRODUCT_NAME = 'Organic Apple juice 21'