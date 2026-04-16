import './globals.css';
import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Pokedex TCG',
  description: 'Inventario personal de cartas Pokémon con valorización usando PriceCharting.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Navbar />
        {children}
        <footer className="container footer">Pokedex TCG · MVP base para GitHub + Supabase + PriceCharting</footer>
      </body>
    </html>
  );
}
