'use client'

import { createContext, useContext, useState, useCallback } from 'react'

interface DashboardContextType {
  totalDocuments: number
  totalEntities: number
  setTotalDocuments: (count: number | ((prev: number) => number)) => void
  setTotalEntities: (count: number | ((prev: number) => number)) => void
  decrementDocuments: () => void
  decrementEntities: (count: number) => void
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined)

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [totalDocuments, setTotalDocuments] = useState(0)
  const [totalEntities, setTotalEntities] = useState(0)

  const decrementDocuments = useCallback(() => {
    setTotalDocuments(prev => Math.max(0, prev - 1))
  }, [])

  const decrementEntities = useCallback((count: number) => {
    setTotalEntities(prev => Math.max(0, prev - count))
  }, [])

  return (
    <DashboardContext.Provider
      value={{
        totalDocuments,
        totalEntities,
        setTotalDocuments,
        setTotalEntities,
        decrementDocuments,
        decrementEntities,
      }}
    >
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() {
  const context = useContext(DashboardContext)
  if (context === undefined) {
    throw new Error('useDashboard must be used within DashboardProvider')
  }
  return context
}
