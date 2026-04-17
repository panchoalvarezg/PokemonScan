import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata = {
  title: "Pokedex TCG",
  description: "Escanea, inventaría y valoriza tus cartas Pokémon.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
