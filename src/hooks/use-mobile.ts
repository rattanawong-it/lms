import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/**
 * อ่านสถานะจอเล็กจาก matchMedia ผ่าน useSyncExternalStore
 * (ไม่ใช้ setState ใน effect เพื่อเลี่ยง cascading render ตาม react-hooks lint rule)
 * ฝั่ง server คืนค่า false เสมอ แล้วให้ client ปรับให้ตรงตอน hydrate
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
