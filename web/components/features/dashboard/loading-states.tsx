interface ErrorStateProps {
  message: string
  title?: string
  onRetry?: () => void
}

interface EmptyStateProps {
  message: string
  title?: string
  actionLabel?: string
  onAction?: () => void
}

export function ProjectCardSkeleton() {
  return (
    <output className="rounded-lg border border-border p-4 animate-pulse block">
      <div className="flex flex-col gap-3">
        <div className="h-5 w-3/4 rounded bg-muted" />
        <div className="h-4 w-full rounded bg-muted/60" />
        <div className="h-4 w-5/6 rounded bg-muted/60" />
        <div className="flex gap-2">
          <div className="h-5 w-16 rounded bg-muted/40" />
          <div className="h-5 w-16 rounded bg-muted/40" />
        </div>
        <div className="h-2 w-full rounded bg-muted/40" />
      </div>
    </output>
  )
}

export function ProjectDetailHeaderSkeleton() {
  return (
    <output className="animate-pulse flex flex-col gap-4">
      <div className="h-8 w-1/2 rounded bg-muted" />
      <div className="flex gap-2">
        <div className="h-6 w-20 rounded bg-muted" />
        <div className="h-6 w-24 rounded bg-muted" />
      </div>
      <div className="flex gap-4">
        <div className="h-4 w-32 rounded bg-muted/60" />
        <div className="h-4 w-32 rounded bg-muted/60" />
      </div>
    </output>
  )
}

export function PRRowSkeleton() {
  return (
    <tr className="animate-pulse">
      <td className="p-2">
        <div className="h-4 w-32 rounded bg-muted" />
      </td>
      <td className="p-2">
        <div className="h-4 w-24 rounded bg-muted/60" />
      </td>
      <td className="p-2">
        <div className="h-4 w-16 rounded bg-muted" />
      </td>
      <td className="p-2">
        <div className="h-4 w-20 rounded bg-muted/60" />
      </td>
      <td className="p-2">
        <div className="h-4 w-12 rounded bg-muted" />
      </td>
      <td className="p-2">
        <div className="h-4 w-28 rounded bg-muted/60" />
      </td>
    </tr>
  )
}

export function TimelineEntrySkeleton() {
  return (
    <output className="animate-pulse flex items-start gap-3">
      <div className="w-5 h-5 rounded-full bg-muted flex-shrink-0" />
      <div className="flex flex-col gap-2 flex-1">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted/60" />
      </div>
    </output>
  )
}

export function ErrorState({ message, title, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <h2 className="text-lg font-semibold">{title ?? "Something went wrong"}</h2>
      <p className="text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 px-4 py-2 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80"
        >
          Retry
        </button>
      )}
    </div>
  )
}

export function EmptyState({ message, title, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      <p className="text-muted-foreground">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 px-4 py-2 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
