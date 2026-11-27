const dogBands = [[0, 2], [2, 5], [5, 10], [10, 15], [15, 20], [20, 40, true]];
const catBands = [[0, 5], [5, 10, true]];
const tables = [
  ['DOG', 'S', dogBands, [70000, 80000]],
  ['DOG', 'M', dogBands, [90000, 100000, 110000, 120000]],
  ['DOG', 'L', dogBands, [120000, 130000, 140000, 150000, 160000]],
  ['DOG', 'XL', dogBands, [210000, 220000, 230000, 240000, 250000, 300000]],
  ['CAT', 'S', catBands, [80000]],
  ['CAT', 'M', catBands, [100000, 120000]],
];

const stayPrices = tables.map(([species, tier, bands, prices]) => {
  const service_id = `stay-${species.toLowerCase()}-${tier.toLowerCase()}`;
  const [max_weight_kg, max_weight_inclusive = false] = bands[prices.length - 1].slice(1);
  return {
    service_id,
    name: `Phòng ${species === 'DOG' ? 'chó' : 'mèo'} ${tier}`,
    type: 'BOARDING',
    room_tier: tier,
    allowed_species: [species],
    min_weight_kg: 0,
    max_weight_kg,
    max_weight_inclusive,
    duration_minutes: null,
    unit_price: Math.min(...prices),
    price_rules: prices.map((unit_price, index) => {
      const [min_weight_kg, max_weight_kg, max_inclusive = false] = bands[index];
      return { price_rule_id: `${service_id}-${min_weight_kg}`, species,
        min_weight_kg, max_weight_kg, max_inclusive, unit_price };
    }),
  };
});

module.exports = { stayPrices };
