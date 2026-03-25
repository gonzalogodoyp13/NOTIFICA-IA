// Root layout for the Next.js app
// This wraps all pages and includes global styles and metadata
import type { Metadata } from 'next'
import { Manrope, Source_Serif_4 } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
})

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-display',
})

export const metadata: Metadata = {
  title: 'NOTIFICA IA - Sistema de Gestión',
  description: 'Plataforma para la gestión de Oficinas Receptoras',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={`${manrope.variable} ${sourceSerif.variable} font-sans`}>
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  )
}

