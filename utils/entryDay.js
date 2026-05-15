/** Local calendar day bounds for an ISO date or Date. */
exports.dayBounds = (dateInput) => {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { start, end };
};
