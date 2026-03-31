import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-6 px-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          404 — Page not found
        </h1>
        <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          The page you are looking for does not exist or has been moved.
        </p>
        <Button asChild size="lg">
          <Link href="/">Go back home</Link>
        </Button>
      </main>
    </div>
  )
}
