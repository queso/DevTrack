import Sidebar from "@/components/sidebar"
import DashboardPage from "@/components/dashboard-page"

export default function Home() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        <DashboardPage />
      </main>
    </div>
  )
}
