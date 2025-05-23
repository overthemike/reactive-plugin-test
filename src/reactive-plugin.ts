import type { ValtioPlugin, ProxyFactory } from 'valtio-plugin'
import { proxy } from 'valtio'

// Simple reactive plugin implementation
export const createReactivePlugin = (): ValtioPlugin => {
  // Track active watchers
  const watchers = new Map<symbol, {
    fn: () => void
    dependencies: Set<string>
    callback: () => void
    isRunning?: boolean
  }>()

  // Batching state
  const batchCallbacks = new Set<() => void>()
  let isBatching = false

  let watcherId = 0
  let proxyFactory: ProxyFactory | null = null
  let currentWatcher: symbol | null = null

  return {
    id: 'reactive',
    name: 'Reactive Plugin',

    // Store reference to the proxy factory when attached
    onAttach: (factory: ProxyFactory) => {
      proxyFactory = factory
    },

    // Track property access for active watchers
    onGet: (path: string[]) => {
      const pathKey = path.join('.')
      
      // Only track for the currently running watcher to prevent infinite loops
      if (currentWatcher) {
        const watcher = watchers.get(currentWatcher)
        if (watcher) {
          watcher.dependencies.add(pathKey)
        }
      }
    },

    // Trigger watchers when dependencies change
    afterChange: (path: string[]) => {
      const pathKey = path.join('.')
      
      for (const [id, watcher] of watchers.entries()) {
        if (watcher.dependencies.has(pathKey) && !watcher.isRunning) {
          if (isBatching) {
            // Queue callback for later execution
            batchCallbacks.add(watcher.callback)
          } else {
            // Execute immediately
            watcher.callback()
          }
        }
      }
    },

    // Plugin API methods
    watch: (fn: () => void, callback?: () => void) => {
      const id = Symbol(`watcher-${watcherId++}`)
      
      const watcher = {
        fn,
        dependencies: new Set<string>(),
        callback: () => {
          if (!watcher.isRunning) {
            watcher.isRunning = true
            // Clear dependencies before re-running to capture new ones
            watcher.dependencies.clear()
            currentWatcher = id
            try {
              (callback || fn)()
            } catch (e) {
              console.error('Error in reactive watcher:', e)
            } finally {
              watcher.isRunning = false
              currentWatcher = null
            }
          }
        },
        isRunning: false
      }

      // Add watcher and run function to capture dependencies
      watchers.set(id, watcher)
      
      // Clear previous dependencies and capture new ones
      watcher.dependencies.clear()
      currentWatcher = id
      try {
        fn() // This will trigger onGet for accessed properties
      } catch (e) {
        console.error('Error in reactive watcher initial run:', e)
      } finally {
        currentWatcher = null
      }

      // Return unwatch function
      return () => {
        watchers.delete(id)
      }
    },

    batch: <T>(fn: () => T): T => {
      if (isBatching) {
        // Already batching, just run the function
        return fn()
      }

      isBatching = true
      try {
        const result = fn()
        
        // Execute all batched callbacks
        for (const callback of batchCallbacks) {
          try {
            callback()
          } catch (e) {
            console.error('Error in batched callback:', e)
          }
        }
        batchCallbacks.clear()
        
        return result
      } finally {
        isBatching = false
      }
    },

    // Utility methods
    getWatcherCount: () => watchers.size,
    
    clearAllWatchers: () => {
      watchers.clear()
    },

    // Cleanup on dispose
    onDispose: () => {
      watchers.clear()
      batchCallbacks.clear()
    },

    // Computed values - creates reactive proxy with computed properties
    computed: <T extends object>(obj: {
      [K in keyof T]: () => T[K];
    }): T => {
      // commenting out and trying with native valtio proxy
      // if (!proxyFactory) {
      //   throw new Error('Proxy factory not available. Make sure plugin is attached.')
      // }
      // const computedState = proxyFactory<T>({})
      
      const computedState = proxy({}) as T
      for (const key in obj) {
        // Set up watcher for each computed property
        const computeFn = obj[key]
        const id = Symbol(`computed-${String(key)}`)
        
        const watcher = {
          fn: computeFn,
          dependencies: new Set<string>(),
          callback: () => {
            if (!watcher.isRunning) {
              watcher.isRunning = true
              // Clear dependencies before recalculating to capture new ones
              watcher.dependencies.clear()
              currentWatcher = id
              try {
                computedState[key] = computeFn()
              } catch (e) {
                console.error(`Error in computed property ${String(key)}:`, e)
              } finally {
                watcher.isRunning = false
                currentWatcher = null
              }
            }
          },
          isRunning: false
        }

        watchers.set(id, watcher)
        
        // Run initially to capture dependencies and set initial value
        currentWatcher = id
        try {
          computedState[key] = computeFn()
        } catch (e) {
          console.error(`Error in computed property ${String(key)}:`, e)
        } finally {
          currentWatcher = null
        }
      }
      return computedState
    },

    // Effect - runs function and re-runs when dependencies change
    effect: (fn: () => void, cleanup?: () => void): () => void => {
      const id = Symbol(`effect-${watcherId++}`)
      
      const watcher = {
        fn,
        dependencies: new Set<string>(),
        callback: () => {
          if (!watcher.isRunning) {
            watcher.isRunning = true
            // Clear dependencies before re-running to capture new ones
            watcher.dependencies.clear()
            currentWatcher = id
            try {
              fn()
            } catch (e) {
              console.error('Error in effect:', e)
            } finally {
              watcher.isRunning = false
              currentWatcher = null
            }
          }
        },
        isRunning: false
      }

      watchers.set(id, watcher)
      
      // Run initially to capture dependencies
      currentWatcher = id
      try {
        fn()
      } catch (e) {
        console.error('Error in effect initial run:', e)
      } finally {
        currentWatcher = null
      }

      // Return cleanup function
      return () => {
        watchers.delete(id)
        cleanup?.()
      }
    }
  }
}


