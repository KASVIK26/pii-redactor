import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import '@/lib/pdfDebugCollector';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PII Redactor - Secure Document Privacy Tool",
  description: "Web-based tool for detecting and redacting personally identifiable information from PDFs and images",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
          <link rel="icon" href="/logo1.png" type="image/png" sizes="64x64" />
          <script
            src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
            crossOrigin="anonymous"
          />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('load', () => {
                console.log('[PDF Bootstrap] Page loaded, configuring PDF.js');
                if (typeof window.pdfjsLib !== 'undefined' && window.pdfjsLib.getDocument) {
                  console.log('[PDF Bootstrap] pdfjsLib available, setting worker');
                  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                  console.log('[PDF Bootstrap] Worker configured, dispatching event');
                  window.dispatchEvent(new Event('pdfReady'));
                } else {
                  console.error('[PDF Bootstrap] pdfjsLib NOT available on load event');
                }
              });
            `
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
