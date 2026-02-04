import { useEffect, useRef } from 'react'

const MAX_EYE_SHIFT = 4

export function MascotEyes() {
  const eyeRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    const pointer = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }

    function setPointer(event: PointerEvent) {
      pointer.x = event.clientX
      pointer.y = event.clientY
    }

    function resetPointer() {
      pointer.x = window.innerWidth / 2
      pointer.y = window.innerHeight / 2
    }

    let frame = 0
    const render = () => {
      frame = window.requestAnimationFrame(render)

      eyeRefs.current.forEach((eye) => {
        if (!eye) return

        const rect = eye.getBoundingClientRect()
        const eyeCenterX = rect.left + rect.width / 2
        const eyeCenterY = rect.top + rect.height / 2

        const deltaX = pointer.x - eyeCenterX
        const deltaY = pointer.y - eyeCenterY
        const distance = Math.hypot(deltaX, deltaY) || 1
        const clampedDistance = Math.min(distance, MAX_EYE_SHIFT)
        const offsetX = (deltaX / distance) * clampedDistance
        const offsetY = (deltaY / distance) * clampedDistance

        eye.style.transform = `translate(${offsetX}px, ${offsetY}px)`
      })
    }

    window.addEventListener('pointermove', setPointer)
    window.addEventListener('pointerleave', resetPointer)
    frame = window.requestAnimationFrame(render)

    return () => {
      window.removeEventListener('pointermove', setPointer)
      window.removeEventListener('pointerleave', resetPointer)
      window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div className="magpie-wordmark" aria-hidden="true">
      <div className="magpie-wordmark__eyes">
        {[0, 1].map((eyeIndex) => (
          <div
            key={eyeIndex}
            className={`magpie-wordmark__eye ${eyeIndex === 1 ? 'magpie-wordmark__eye--delay' : ''}`}
            ref={(node) => {
              eyeRefs.current[eyeIndex] = node
            }}
          >
            <span className="magpie-wordmark__dot" />
          </div>
        ))}
      </div>
      <span className="magpie-wordmark__text">magpie.</span>
    </div>
  )
}
