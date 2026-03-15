import Sidebar from "@/components/sidebar"
import PRQueuePage from "@/components/pr-queue-page"

export default function PRsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        <PRQueuePage />
      </main>
    </div>
  )
}
