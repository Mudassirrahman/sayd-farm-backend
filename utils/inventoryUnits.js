const CONTENT_UNITS = ["kg", "g", "ml", "liter", "unit"];

const normalizeContentUnit = (unit) =>
  CONTENT_UNITS.includes(unit) ? unit : "kg";

const computeTotalQuantity = (containerCount, contentPerContainer, contentUnit) => {
  const count = Number(containerCount) || 0;
  const per = Number(contentPerContainer) || 0;
  let total = 0;
  if (count > 0 && per > 0) total = count * per;
  else if (count > 0) total = count;
  else if (per > 0) total = per;

  return { total, contentUnit: normalizeContentUnit(contentUnit) };
};

/** Human-readable packaging line for tables */
const formatPackagingLine = (txn) => {
  const count = txn.containerCount || 0;
  const per = txn.contentPerContainer || 0;
  const unit = normalizeContentUnit(txn.contentUnit);
  const type = txn.containerType || "other";

  if (count > 0 && per > 0) {
    return `${count} ${type} × ${per} ${unit} = ${txn.totalQuantity} ${unit}`;
  }
  return `${txn.totalQuantity} ${unit}`;
};

module.exports = {
  CONTENT_UNITS,
  normalizeContentUnit,
  computeTotalQuantity,
  formatPackagingLine,
};
