# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server with hot module replacement
- `npm run build` - Compile TypeScript and build for production
- `npm run lint` - Run ESLint to check code quality
- `npm run preview` - Preview production build locally

Package manager: pnpm (use `pnpm install` for dependencies)

## Architecture Overview

This is a React + TypeScript project demonstrating a custom reactive state management system built on top of valtio.

### Core Components

1. **Reactive Plugin** (`src/reactive-plugin.ts`):
   - Implements ValtioPlugin interface
   - Provides dependency tracking and automatic re-execution of watchers
   - Key features: `watch()`, `batch()`, and watcher management methods
   - Uses WeakMap for dependency tracking to prevent memory leaks

2. **Store Factory** (`src/store.ts`):
   - Creates reactive proxy instances with the plugin pre-configured
   - Exports convenience methods that delegate to the plugin
   - Main API: `proxy()`, `watch()`, `batch()`, `addWatcher()`, `removeWatcher()`, `clearWatchers()`

3. **Main App** (`src/App.tsx`):
   - Example usage showing reactive state management
   - Demonstrates proper cleanup of watchers in React components

### Technical Stack

- **Build Tool**: Vite 6.3.5
- **Framework**: React 19.1.0 with TypeScript 5.8.3
- **State Management**: valtio 2.1.5 with custom plugin
- **Linting**: ESLint with TypeScript and React Hooks plugins
- **Module Resolution**: Bundler mode with ES2020 target

I built reactive-plugin as a copy of valtio-reactive (https://github.com/valtiojs/valtio-reactive). Here is the code for it:

```ts
// core.ts - this is the file that I tried duplicating the functionality of currently in reactive-plugin.ts
import {
  getVersion,
  subscribe,
  unstable_getInternalStates,
  unstable_replaceInternalFunction,
} from 'valtio/vanilla';

const { proxyStateMap } = unstable_getInternalStates();
const isProxy = (x: unknown): x is object => proxyStateMap.has(x as object);

const trappersForGet = new Set<
  (target: object, p: string | symbol, receiver: unknown) => void
>();

unstable_replaceInternalFunction(
  'createHandler',
  (createHandler) =>
    (...args) => {
      const handler = createHandler(...args);
      const origGet =
        handler.get ||
        ((target, p, receiver) => Reflect.get(target, p, receiver));
      handler.get = (target, p, receiver) => {
        for (const trapper of trappersForGet) {
          trapper(target, p, receiver);
        }
        return origGet(target, p, receiver);
      };
      return handler;
    },
);

const callbackStack: Set<() => void>[] = [];

const registerCallback = (callback: () => void) => {
  if (callbackStack.length) {
    callbackStack[callbackStack.length - 1]!.add(callback);
  } else {
    // invoke immediately
    callback();
  }
};

export function batch<T>(fn: () => T): T {
  const callbacks = new Set<() => void>();
  callbackStack.push(callbacks);
  try {
    return fn();
  } finally {
    callbackStack.pop();
    for (const callback of callbacks) {
      callback();
    }
    callbacks.clear();
  }
}

type Unwatch = () => void;

export function watch(fn: () => void): Unwatch {
  type ProxyObject = object;
  type Unsubscribe = () => void;
  const subscriptions = new Map<ProxyObject, Unsubscribe>();
  type PrevValue = [value: unknown, version: number | undefined];
  type PrevValues = Map<string | symbol, PrevValue>;
  const touchedKeys = new Map<ProxyObject, PrevValues>();

  const isChanged = (p: ProxyObject, prev: PrevValues): boolean =>
    Array.from(prev).some(([key, prevValue]) => {
      const value: unknown = (p as never)[key];
      const prevOfValue = touchedKeys.get(value as ProxyObject);
      if (prevOfValue) {
        return isChanged(value as ProxyObject, prevOfValue);
      }
      if (!Object.is(value, prevValue[0])) {
        return true;
      }
      const version = getVersion(value);
      const prevVersion = prevValue[1];
      if (typeof version === 'number' && typeof prevVersion === 'number') {
        return version !== prevVersion;
      }
      return false;
    });

  const callback = () => {
    if (Array.from(touchedKeys).some(([p, prev]) => isChanged(p, prev))) {
      runFn();
    }
  };

  const subscribeProxies = () => {
    const rootTouchedProxies = new Set<ProxyObject>();
    for (const p of touchedKeys.keys()) {
      // FIXME this isn't very efficient.
      if (Object.values(p).every((v) => !touchedKeys.has(v))) {
        rootTouchedProxies.add(p);
      }
    }
    for (const [p, unsub] of subscriptions) {
      if (rootTouchedProxies.has(p)) {
        rootTouchedProxies.delete(p);
      } else {
        unsub();
      }
    }
    for (const p of rootTouchedProxies) {
      const unsub = subscribe(p, () => registerCallback(callback), true);
      subscriptions.set(p, unsub);
    }
  };

  const runFn = () => {
    touchedKeys.clear();
    const trapper = (target: object, p: string | symbol, receiver: unknown) => {
      if (!isProxy(receiver)) {
        return;
      }
      let prev = touchedKeys.get(receiver);
      if (!prev) {
        prev = new Map();
        touchedKeys.set(receiver, prev);
      }
      const v = Reflect.get(target, p, receiver);
      prev.set(p, [v, getVersion(v)]);
    };
    trappersForGet.add(trapper);
    try {
      fn();
    } finally {
      trappersForGet.delete(trapper);
      subscribeProxies();
    }
  };

  runFn();

  const unwatch = () => {
    for (const unsub of subscriptions.values()) {
      unsub();
    }
    subscriptions.clear();
    touchedKeys.clear();
  };

  return unwatch;
}
```

I also want to add the next two methods to reactive-plugin.ts
```ts
// computed.ts
import { proxy } from 'valtio/vanilla';

import { watch } from './core.js';

export function computed<T extends object>(obj: {
  [K in keyof T]: () => T[K];
}): T {
  const computedState = proxy({}) as T;
  for (const key in obj) {
    watch(() => {
      computedState[key] = obj[key]();
    });
  }
  return computedState;
}
```
```ts
// effect.ts
import { watch } from './core.js';

export function effect(fn: () => void, cleanup?: () => void): () => void {
  const unwatch = watch(fn);
  return () => {
    unwatch();
    cleanup?.();
  };
}
```

I'd like to keep it simple. If there is something that I need to add to valtio-plugin to make this a better DX experience for plugin authors based on this, please let me know that is.