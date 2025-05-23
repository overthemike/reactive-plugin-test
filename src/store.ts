import { createReactivePlugin } from "./reactive-plugin"
import { proxyInstance } from "valtio-plugin"

export const createReactiveStore = () => {
  const plugin = createReactivePlugin()
  const factory = proxyInstance().use(plugin)
  
  return {
    // Main factory function
    proxy: factory,
    
    // Direct access to reactive methods
    watch: plugin.watch,
    batch: plugin.batch,
    computed: plugin.computed,
    effect: plugin.effect,
    
    // Utility methods
    getWatcherCount: plugin.getWatcherCount,
    clearAllWatchers: plugin.clearAllWatchers
  }
}