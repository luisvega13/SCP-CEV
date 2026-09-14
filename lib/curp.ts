const CURP_PATTERN =
  /^[A-ZÑ][AEIOUX][A-ZÑ]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HM](?:AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-ZÑ]{3}[A-Z0-9]\d$/;

const CURP_DICTIONARY = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

export function normalizeCurp(value: string) {
  return value.trim().replace(/\s+/g, "").toLocaleUpperCase("es-MX");
}

function hasValidBirthDate(curp: string) {
  const month = Number(curp.slice(6, 8));
  const day = Number(curp.slice(8, 10));
  const year = Number(curp.slice(4, 6));
  const fullYear = Number(curp[16]) >= 0 && Number(curp[16]) <= 9
    ? 1900 + year
    : 2000 + year;
  const date = new Date(Date.UTC(fullYear, month - 1, day));

  return (
    date.getUTCFullYear() === fullYear &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function hasValidCheckDigit(curp: string) {
  const sum = [...curp.slice(0, 17)].reduce((total, character, index) => {
    const value = CURP_DICTIONARY.indexOf(character);
    return value < 0 ? Number.NaN : total + value * (18 - index);
  }, 0);
  const expectedDigit = (10 - (sum % 10)) % 10;
  return Number(curp[17]) === expectedDigit;
}

export function isValidCurp(value: string) {
  const curp = normalizeCurp(value);
  return (
    CURP_PATTERN.test(curp) &&
    hasValidBirthDate(curp) &&
    hasValidCheckDigit(curp)
  );
}

export const CURP_HELP_TEXT =
  "Captura los 18 caracteres de la CURP, sin espacios ni guiones.";
