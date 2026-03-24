"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import type { SSEConfig } from "reactive-swr"
import { SSEProvider } from "reactive-swr"
import { SWRConfig } from "swr"
import { fetcher } from "@/lib/fetcher"

interface ProvidersProps {
  children: ReactNode
  sseConfig?: SSEConfig
}

const CorrelationIdContext = createContext<string | null>(null)

export function useCorrelationId(): string {
  const correlationId = useContext(CorrelationIdContext)
  if (correlationId === null) {
    throw new Error("useCorrelationId must be used within Providers")
  }
  return correlationId
}

export function Providers({ children, sseConfig }: ProvidersProps) {
  const correlationIdRef = useRef<string | undefined>(undefined)

  if (!correlationIdRef.current) {
    correlationIdRef.current =
      globalThis.crypto?.randomUUID?.() ??
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  }

  const correlationId = correlationIdRef.current

  const content = (
    <CorrelationIdContext.Provider value={correlationId}>
      <SWRConfig
        value={{
          fetcher: (url: string) => fetcher(url, { "X-Correlation-Id": correlationId }),
          revalidateOnFocus: false,
          dedupingInterval: 2000,
          refreshInterval: 30_000,
        }}
      >
        {children}
      </SWRConfig>
    </CorrelationIdContext.Provider>
  )

  if (sseConfig) {
    return <SSEProvider config={sseConfig}>{content}</SSEProvider>
  }

  return content
}
