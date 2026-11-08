export function riverCenter(z) {
  return -31 + 5 * Math.sin(z * 0.07) + 1.8 * Math.sin(z * 0.14);
}
export function riverWidth(z) {
  return (
    2.5 + 0.65 * Math.sin(z * 0.11) + 1.3 * Math.exp(-(((z - 13) / 9) ** 2))
  );
}
export function riverBankAt(column, row, margin = 0) {
  const z = (row - 32) * 2,
    x = (column - 32) * 2;
  return Math.abs(x - riverCenter(z)) <= riverWidth(z) + 1.9 + margin;
}
