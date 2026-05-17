const CROP_VALUES = [
  "sugar_cane",
  "wheat",
  "rice",
  "cotton",
  "mango",
  "sabzi",
  "haddaal",
  "gantar",
];

const CROP_LABELS = {
  sugar_cane: "Sugar Cane",
  wheat: "Wheat",
  rice: "Rice",
  cotton: "Cotton",
  mango: "Mango",
  sabzi: "Sabzi",
  haddaal: "Haddaal",
  gantar: "Gantar",
};

const isValidCrop = (crop) => CROP_VALUES.includes(crop);

module.exports = { CROP_VALUES, CROP_LABELS, isValidCrop };
