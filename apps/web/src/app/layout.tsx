import type { Metadata } from 'next';
import '@idepot/ui/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'iDepot',
  description: 'iDepot — warehouse & POS platform (modernization program)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
