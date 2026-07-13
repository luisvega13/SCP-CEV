import type { User } from "@/types/user";

const mockUsers: Array<User & { password: string }> = [
  {
    id: "1",
    username: "admin",
    email: "admin@escuela.local",
    password: "admin123",
    role: "admin",
    name: "Administrador",
  },
  {
    id: "2",
    username: "alumno",
    email: "alumno@escuela.local",
    password: "alumno123",
    role: "student",
    name: "Alumno",
  },
];

export function validateMockCredentials(
  username: string,
  password: string,
): User | null {
  const match = mockUsers.find(
    (user) => user.username === username.trim().toLowerCase() && user.password === password,
  );

  if (!match) return null;

  const { password: _password, ...user } = match;
  return user;
}
