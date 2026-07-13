export type UserRole = "admin" | "student";

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  name: string;
}
