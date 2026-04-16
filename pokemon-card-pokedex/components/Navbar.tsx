import Link from 'next/link';

export function Navbar() {
  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand">Pokedex TCG</Link>
        <div className="nav-links">
          <Link href="/scanner">Scanner</Link>
          <Link href="/inventory">Inventario</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/login">Login</Link>
        </div>
      </div>
    </nav>
  );
}
