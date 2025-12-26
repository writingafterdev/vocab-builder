import type { Metadata } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const juana = localFont({
  src: [
    { path: '../../fonts/Juana Thin.woff2', weight: '100', style: 'normal' },
    { path: '../../fonts/Juana Thin Light.woff2', weight: '100', style: 'italic' }, // Using Thin Light as Italic equivalent if explicit Thin Italic absent
    { path: '../../fonts/Juana ExtraLight.woff2', weight: '200', style: 'normal' },
    { path: '../../fonts/Juana ExtraLight Italic.woff2', weight: '200', style: 'italic' },
    { path: '../../fonts/Juana Light.woff2', weight: '300', style: 'normal' },
    { path: '../../fonts/Juana Light Italic.woff2', weight: '300', style: 'italic' },
    { path: '../../fonts/Juana Regular.woff2', weight: '400', style: 'normal' },
    { path: '../../fonts/Juana Regular Italic.woff2', weight: '400', style: 'italic' },
    { path: '../../fonts/Juana Medium.woff2', weight: '500', style: 'normal' },
    { path: '../../fonts/Juana Medium Italic.woff2', weight: '500', style: 'italic' },
    { path: '../../fonts/Juana SemiBold.woff2', weight: '600', style: 'normal' },
    { path: '../../fonts/Juana SemiBold Italic.woff2', weight: '600', style: 'italic' },
    { path: '../../fonts/Juana Bold.woff2', weight: '700', style: 'normal' },
    { path: '../../fonts/Juana Bold Italic.woff2', weight: '700', style: 'italic' },
    { path: '../../fonts/Juana Black.woff2', weight: '900', style: 'normal' },
    { path: '../../fonts/Juana Black Italic.woff2', weight: '900', style: 'italic' },
  ],
  variable: '--font-juana',
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// EB Garamond for posts and articles
const ebGaramond = localFont({
  src: [
    { path: '../../fonts/font1/EBGaramond-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../../fonts/font1/EBGaramond-Italic.ttf', weight: '400', style: 'italic' },
    { path: '../../fonts/font1/EBGaramond-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../../fonts/font1/EBGaramond-MediumItalic.ttf', weight: '500', style: 'italic' },
    { path: '../../fonts/font1/EBGaramond-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../../fonts/font1/EBGaramond-SemiBoldItalic.ttf', weight: '600', style: 'italic' },
    { path: '../../fonts/font1/EBGaramond-Bold.ttf', weight: '700', style: 'normal' },
    { path: '../../fonts/font1/EBGaramond-BoldItalic.ttf', weight: '700', style: 'italic' },
    { path: '../../fonts/font1/EBGaramond-ExtraBold.ttf', weight: '800', style: 'normal' },
    { path: '../../fonts/font1/EBGaramond-ExtraBoldItalic.ttf', weight: '800', style: 'italic' },
  ],
  variable: '--font-garamond',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VocabBuilder - Learn like a reader',
  description: 'A platform for vocabulary learners to save phrases naturally while reading.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${juana.variable} ${geistMono.variable} ${ebGaramond.variable}`}>
      <body className="antialiased bg-background text-foreground" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }} suppressHydrationWarning>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
