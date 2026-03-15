import Sidebar from "@/components/sidebar"
import TimelinePage from "@/components/timeline-page"

export default function Timeline() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        <TimelinePage />
      </main>
    </div>
  )
}
