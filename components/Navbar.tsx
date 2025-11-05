// Navbar component for NOTIFICA IA
// Simple navigation bar with the app name
'use client'

import Link from 'next/link'

export default function Navbar() {
  return (
    <nav className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo/App Name */}
          <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white">
            NOTIFICA IA
          </Link>
          
          {/* Navigation links - placeholder for future routes */}
          <div className="space-x-4">
            <Link 
              href="/" 
              className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
              Inicio
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

