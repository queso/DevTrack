declare module "reactive-swr" {
  import type { ReactNode } from "react"

  export interface ParsedEvent {
    type: string
    payload: unknown
  }

  export interface ReconnectConfig {
    enabled?: boolean
    initialDelay?: number
    maxDelay?: number
    backoffMultiplier?: number
    maxAttempts?: number
  }

  export interface SSEStatus {
    connected: boolean
    connecting: boolean
    error: Error | null
    reconnectAttempt: number
  }

  export type UpdateStrategy<TPayload, TData> =
    | "set"
    | "refetch"
    | ((current: TData | undefined, payload: TPayload) => TData)

  export interface EventMapping<TPayload = unknown, TData = unknown> {
    key: string | string[] | ((payload: TPayload) => string | string[])
    update?: UpdateStrategy<TPayload, TData>
    filter?: (payload: TPayload) => boolean
    transform?: (payload: TPayload) => TPayload
  }

  export interface SSEConfig {
    url: string
    events: Record<string, EventMapping>
    parseEvent?: (event: MessageEvent) => ParsedEvent
    onConnect?: () => void
    onError?: (error: Event) => void
    onDisconnect?: () => void
    reconnect?: ReconnectConfig
    debug?: boolean
    onEventError?: (event: ParsedEvent, error: unknown) => void
  }

  export interface SSEProviderProps {
    config: SSEConfig
    children?: ReactNode
  }

  export function SSEProvider(props: SSEProviderProps): ReactNode

  export function useSSEContext(): {
    config: SSEConfig
    status: SSEStatus
  }

  export function useSSEStatus(): SSEStatus

  export function useSSEEvent(eventType: string, handler: (event: ParsedEvent) => void): void

  export interface UseSSEStreamOptions<TPayload = unknown, TData = unknown> {
    swrKey: string
    eventType: string
    update?: UpdateStrategy<TPayload, TData>
    filter?: (payload: TPayload) => boolean
    transform?: (payload: TPayload) => TPayload
  }

  export interface UseSSEStreamResult<TData = unknown> {
    data: TData | undefined
    error: Error | undefined
    isLoading: boolean
  }

  export function useSSEStream<TPayload = unknown, TData = unknown>(
    options: UseSSEStreamOptions<TPayload, TData>,
  ): UseSSEStreamResult<TData>
}
