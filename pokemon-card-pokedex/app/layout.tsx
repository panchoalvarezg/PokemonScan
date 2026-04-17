import "./globals.css";

export const metadata = {
  title: "PokemonScan",
  description: "Escáner de cartas Pokémon con cámara y variantes",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
