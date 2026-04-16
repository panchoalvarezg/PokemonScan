import "./globals.css";

export const metadata = {
  title: "PokemonScan",
  description: "Escáner de cartas Pokémon con cámara e inventario",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
