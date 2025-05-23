import { createReactiveStore } from './store'
import { useEffect } from 'react'
import { useSnapshot } from 'valtio'

const { proxy, watch, computed, effect } = createReactiveStore()

// Create base state
const state = proxy({ 
  count: 0,
  multiplier: 2
})

// Create computed values
const computedValues = computed({
  doubled: () => state.count * 2,
  quadrupled: () => state.count * 4,
  multiplied: () => state.count * state.multiplier
})

function App() {
  const snap = useSnapshot(state)
  const computedSnap = useSnapshot(computedValues)

  useEffect(() => {
    // Set up watchers inside useEffect
    const unwatch = watch(() => {
      console.log('Count:', state.count)
    })

    // Set up effects inside useEffect
    const cleanupEffect = effect(
      () => {
        console.log('Effect: Count is now', state.count, 'doubled is', computedValues.doubled)
      },
      () => {
        console.log('Effect cleanup')
      }
    )

    // Demo the reactive system
    const timer = setInterval(() => {
      state.count++
      if (state.count === 5) {
        state.multiplier = 3
      }
      if (state.count >= 10) {
        clearInterval(timer)
      }
    }, 1000)

    return () => {
      clearInterval(timer)
      unwatch()
      cleanupEffect()
    }
  }, [])

  return (
    <div>
      <h1>Reactive System Demo</h1>
      <input type='number' onChange={(e) => state.multiplier = Number(e.target.value)} value={snap.multiplier} />
      <p>Count: {snap.count}</p>
      <p>Count *2: {computedSnap.doubled}</p>
      <p>Count *4: {computedSnap.quadrupled}</p>
      <p>Count * multiplier: {computedSnap.multiplied}</p>
    </div>
  )
}

export default App
