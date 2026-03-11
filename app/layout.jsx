import { Questrial } from 'next/font/google';
import './globals.css';

const questrial = Questrial({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'FF Analyzer — Funders First',
  description: 'Bank Statement & MCA Agreement Analysis',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={questrial.className}>{children}</body>
    </html>
  );
}
