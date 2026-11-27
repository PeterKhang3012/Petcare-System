const rooms = [
  ['DOG-S-01', 'DOG', 'S', 5, false, [60, 50, 70]],
  ['DOG-M-01', 'DOG', 'M', 15, false, [80, 60, 70]],
  ['DOG-L-01', 'DOG', 'L', 20, false, [100, 70, 90]],
  ['DOG-XL-01', 'DOG', 'XL', 40, true, [150, 120, 150]],
  ['CAT-S-01', 'CAT', 'S', 5, false, [60, 50, 70]],
  ['CAT-S-02', 'CAT', 'S', 5, false, [60, 50, 70]],
  ['CAT-M-01', 'CAT', 'M', 10, true, [80, 60, 90]],
  ['CAT-M-02', 'CAT', 'M', 10, true, [80, 60, 90]],
];

const stayResources = rooms.map(([code, species, room_tier, max_weight_kg, max_weight_inclusive, dimensions_cm]) => ({
  code, group: 'BOARDING', species: [species], room_tier, max_weight_kg, max_weight_inclusive, dimensions_cm,
}));

module.exports = { stayResources };
