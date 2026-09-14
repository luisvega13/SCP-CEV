export const STUDENT_ACCESS_DOMAIN = "alumno.cev.mx";

export const SHORT_STUDENT_EMAIL_PATTERN =
  /^ce\d{6}@alumno\.cev\.mx$/i;

export function getStudentAccessKey(email: string) {
  return email.split("@", 1)[0]?.toUpperCase() ?? email.toUpperCase();
}

export function normalizeLoginIdentifier(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  return normalized.includes("@")
    ? normalized
    : `${normalized}@${STUDENT_ACCESS_DOMAIN}`;
}

export function getStudentPasswordInitials(name: string) {
  const letters = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 2)
    .toUpperCase();
  return letters.padEnd(2, "X");
}

export function getDefaultStudentPassword(
  nameOrInitials: string,
  email: string,
) {
  const initials = getStudentPasswordInitials(nameOrInitials);
  const accessKey = getStudentAccessKey(email);
  const finalDigits = accessKey.replace(/\D/g, "").slice(-3).padStart(3, "0");
  return `${initials}#${finalDigits}`;
}
