// Shared money display: Brazilian reais in pt-BR form, e.g. "R$ 10.000,00".
const cents = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const whole = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const amount = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
export const brl = (n) => cents.format(amount(n));
// Round figures such as starting savings read better without centavos.
export const brlWhole = (n) => whole.format(amount(n));
