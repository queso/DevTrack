import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

const siteUrl = process.env.SITE_URL || "http://localhost:3000"
const description = "Mission control for multi-repo development. Track SDLC state, content pipelines, and PR queues across all your projects from one dashboard."

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "DevTrack",
    template: "%s | DevTrack",
  },
  description,
  openGraph: {
    title: "DevTrack",
    description,
    type: "website",
    url: siteUrl,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
