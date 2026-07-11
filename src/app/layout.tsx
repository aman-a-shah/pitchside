import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display-face',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PitchSide — Step inside the game',
  description:
    'Reconstruct real sports games in a beautiful, navigable 3D world. Fly the camera anywhere, pause, rewind, and watch in slow motion.',
};

export const viewport: Viewport = {
  themeColor: '#05070c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
