import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata = {
  title: "CARD4ALL",
  description: "Escanea, inventaría y valoriza tus cartas Pokémon.",
};

/**
 * RootLayout envuelve toda la app dentro de un "dispositivo" tipo Pokédex
 * moderna: bezel rojo exterior, luz circular azul + LEDs en la parte superior,
 * pantalla blanca con bordes negros gruesos donde viven Navbar + contenido, y
 * una barra inferior decorativa (D-pad + botones) para cerrar la metáfora.
 *
 * El chrome se colapsa en móvil (ver globals.css @media max-width: 720px) para
 * no robar espacio útil.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div className="pokedex-device">
          <div className="pokedex-topbar">
            <div className="pokedex-lens" aria-hidden="true" />
            <div className="pokedex-leds" aria-hidden="true">
              <span className="led red" />
              <span className="led yellow" />
              <span className="led green" />
            </div>
            <div className="pokedex-title">CARD4ALL · Nº 001</div>
          </div>

          <div className="pokedex-screen">
            <Navbar />
            {children}
          </div>

          <div className="pokedex-footer" aria-hidden="true">
            <div className="pokedex-dpad">
              <span className="empty" />
              <span />
              <span className="empty" />
              <span />
              <span />
              <span />
              <span className="empty" />
              <span />
              <span className="empty" />
            </div>
            <span>Programación Profesional TICS420-1-2026 version</span>
            <div className="pokedex-buttons">
              <span className="pill" />
              <span className="round red" />
              <span className="round blue" />
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
