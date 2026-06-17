const normalizeSubcategories = (subcategories) => {
  if (!Array.isArray(subcategories)) return [];

  return subcategories
    .map((item) => {
      if (typeof item === "string") {
        const name = item.trim();
        return name ? { name, subSubcategories: [] } : null;
      }
      if (!item || typeof item !== "object") return null;

      const name = String(item.name || "").trim();
      if (!name) return null;

      const subSubcategories = Array.isArray(item.subSubcategories)
        ? item.subSubcategories
            .map((s) => (typeof s === "string" ? s.trim() : ""))
            .filter(Boolean)
        : [];

      return { name, subSubcategories };
    })
    .filter(Boolean);
};

module.exports = { normalizeSubcategories };
