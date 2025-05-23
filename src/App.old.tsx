import { proxy } from 'valtio'
import { useEffect } from 'react'
import { computed, effect } from 'valtio-reactive'

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

// Set up effects
const cleanupEffect = effect(
  () => {
    console.log('Effect: Count is now', state.count, 'doubled is', computedValues.doubled)
  },
  () => {
    console.log('Effect cleanup')
  }
)

function App() {
  useEffect(() => {
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
      cleanupEffect()
    }
  }, [])

  return (
    <div>
      <h1>Reactive System Demo</h1>
      <p>Check the console to see reactive updates in action!</p>
    </div>
  )
}

export default App
