import { pageMetadata } from '@/lib/metadata';
import './globals.css';
import './research.css';
import './bands.css';
import './pages.css';
import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { Header } from '@/components/Header';
import { SiteFooter } from '@/components/SiteFooter';
import { PixelHills } from '@/components/PixelHills';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://valuearena.github.io'),
  ...pageMetadata('ValueArena — LAISR Lab, Cornell University', 'ValueArena, from LAISR Lab at Cornell University. EigenBench scores language models on how well their answers fit a written set of values, which we call a constitution. Browse the rankings, compare models across constitutions, and read the actual responses and judgments behind every score.'),
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/laisr-icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/apple-touch-icon.png',
  },

};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Hydrate theme before paint to avoid flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('va-theme');if(t!=='dark'){t='light';}document.documentElement.dataset.theme=t;}catch(e){}})();",
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        {/* Faint pixel landscape behind the top of every inner page; the home hero draws its own */}
        <PixelHills variant="hero" className="page-hills" />
        <Header />
        <main id="main-content" className="va-main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
