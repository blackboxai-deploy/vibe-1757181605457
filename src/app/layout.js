'use client'

import { Toaster } from 'react-hot-toast'
import './globals.css'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  )
}