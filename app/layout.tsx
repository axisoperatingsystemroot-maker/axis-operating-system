import "./globals.css"

export const metadata = {
  title: "Axis Operating System",
  description: "Internal Manufacturing Execution Platform",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white min-h-screen">
        <div className="flex flex-col min-h-screen">
         <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex justify-between items-center">
  <h1 className="text-xl font-semibold">
    Axis Operating System
  </h1>

  <nav className="flex gap-6 text-sm">
    <a href="/dashboard" className="hover:text-blue-400">Dashboard</a>
    <a href="/customers" className="hover:text-blue-400">Customers</a>
    <a href="/tools" className="hover:text-blue-400">Tools</a>
    <a href="/jobs" className="hover:text-blue-400">Jobs</a>
  </nav>
</header>

          <main className="flex-1 p-6">
            {children}
          </main>

          <footer className="bg-gray-900 border-t border-gray-800 px-6 py-3 text-sm text-gray-500">
            Axis Hard Metals LLC
          </footer>
        </div>
      </body>
    </html>
  )
}