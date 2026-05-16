/** Inventory category is khaad/fertilizer (admin may spell Khaad, Khad, etc.) */
const isKhaadCategory = (category) => {
  const n = String(category || "").trim().toLowerCase();
  if (!n) return false;
  return (
    n === "khaad" ||
    n === "khad" ||
    n === "fertilizer" ||
    n.includes("khaad") ||
    n.includes("khad")
  );
};

module.exports = { isKhaadCategory };
