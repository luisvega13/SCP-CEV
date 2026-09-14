import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata = {
  title: "Portal Escolar | Sociedad de Educación Integral San Nicolás",
  description: "Sistema escolar para la gestión académica y de pagos",
  icons: {
    icon: "/favicon-cejv.ico",
    shortcut: "/favicon-cejv.ico",
  },
};
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) { return <html lang="es"><body>{children}</body></html>; }
