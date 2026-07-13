import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata = { title: "Gestión Escolar", description: "Sistema escolar para la gestión de pagos" };
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) { return <html lang="es"><body>{children}</body></html>; }
