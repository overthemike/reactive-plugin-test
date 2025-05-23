# Valtio Plugin Enhancement Recommendations

## Context

When implementing the `computed` method in valtio-reactive plugin, I discovered that plugins don't have access to the proxy factory instance that installed them. This makes it impossible for plugins to create new proxy instances, which is essential for features like `computed`.

## Current Limitation

The `ValtioPlugin` interface doesn't provide any way for plugin methods to access the `ProxyFactory` instance. This means plugins cannot:
- Create new proxy instances using the same plugin configuration
- Access other plugins in the same instance
- Know which factory instance they belong to

## Proposed Solution

Add an `onAttach` lifecycle hook that provides the proxy factory to the plugin when it's attached:

```typescript
// In ValtioPlugin interface (src/index.ts)
export type ValtioPlugin = {
  id: string
  name?: string
  
  // Existing lifecycle hooks...
  
  // NEW: Called when plugin is attached to a factory instance
  onAttach?: (proxyFactory: ProxyFactory) => void
  
  // Rest of the interface...
}
```

## Implementation

In the `use` method of `proxyInstance` (around line 460 in src/index.ts):

```typescript
use: {
  value: (pluginOrPlugins: ValtioPlugin | ValtioPlugin[]) => {
    if (registry.isDisposed) {
      throw new Error('This instance has been disposed')
    }
    
    const pluginsToAdd = Array.isArray(pluginOrPlugins) 
      ? pluginOrPlugins 
      : [pluginOrPlugins]

    for (const plugin of pluginsToAdd) {
      const existingIndex = registry.plugins.findIndex(p => p.id === plugin.id)
      if (existingIndex >= 0) {
        registry.plugins[existingIndex] = plugin
      } else {
        registry.plugins.push(plugin)
      }
      
      // NEW: Call onAttach if it exists
      if (plugin.onAttach) {
        try {
          plugin.onAttach(proxyFn as ProxyFactory)
        } catch (e) {
          console.error(`Error in plugin ${plugin.id} onAttach:`, e)
        }
      }
    }
    
    return proxyFn as ProxyFactory // For chaining
  },
  enumerable: true,
  configurable: true,
}
```

## Benefits

1. **Plugin Self-Sufficiency**: Plugins can create proxy instances without requiring external dependencies
2. **Better Encapsulation**: Plugins can manage their own proxy instances with the same configuration
3. **Cleaner API**: Users don't need to pass factory instances to plugin methods
4. **Consistency**: All proxy instances created by a plugin automatically have the same plugins applied

## Example Usage

With this enhancement, plugins could implement computed properties like this:

```typescript
export const createReactivePlugin = (): ValtioPlugin => {
  let proxyFactory: ProxyFactory | null = null

  const plugin: ValtioPlugin = {
    id: 'reactive',
    name: 'Reactive Plugin',
    
    onAttach: (factory) => {
      proxyFactory = factory
    },
    
    computed: <T extends object>(computedGetters: {
      [K in keyof T]: () => T[K]
    }): T => {
      if (!proxyFactory) {
        throw new Error('Plugin not attached to a factory')
      }
      
      const computedState = proxyFactory({}) as T
      
      for (const key in computedGetters) {
        plugin.watch(() => {
          computedState[key] = computedGetters[key]()
        })
      }
      
      return computedState
    },
    
    // Other plugin methods...
  }
  
  return plugin
}
```

## Alternative Solutions

If adding `onAttach` is not desirable, consider:

1. **Factory Parameter in Methods**: Continue requiring factory as parameter, but this creates a less clean API
2. **Plugin Context Object**: Pass a context object with factory and other metadata to all plugin methods
3. **Factory Method on Plugin**: Add a `getFactory()` method that plugins can implement to retrieve their factory

The `onAttach` approach is recommended as it's the cleanest and most backward-compatible solution.