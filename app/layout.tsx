// Root layout for the Next.js app
// This wraps all pages and includes global styles and metadata
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
}

export const metadata: Metadata = {
  title: 'NOTIFICA IA - Sistema de Gestión',
  description: 'Plataforma para la gestión de Oficinas Receptoras',
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0ea5e9" />
      </head>
      <body className={inter.className}>
        <Navbar />
        <ServiceWorkerRegister />
        <main>{children}</main>
      </body>
    </html>
  )
}

