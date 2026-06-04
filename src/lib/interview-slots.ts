export const SLOT_MIN = 30

export interface Win { weekday: number; start: string; end: string }

/** Janelas do entrevistador para um dia da semana (0=Dom..6=Sáb), ordenadas. */
export function windowsForWeekday(windows: Win[], weekday: number): Win[] {
  return (windows || []).filter(w => Number(w.weekday) === weekday).sort((a, b) => a.start.localeCompare(b.start))
}

/** Horários de início (HH:MM) de cada slot de 30 min nas janelas do dia. */
export function slotsForDay(windows: Win[], weekday: number): string[] {
  const slots: string[] = []
  for (const w of windowsForWeekday(windows, weekday)) {
    const [sh, sm] = w.start.split(':').map(Number)
    const [eh, em] = w.end.split(':').map(Number)
    let cur = sh * 60 + sm
    const end = eh * 60 + em
    while (cur + SLOT_MIN <= end) {
      slots.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`)
      cur += SLOT_MIN
    }
  }
  return slots
}

/** Rótulo da janela do dia, ex.: "09:00–12:00 e 14:00–17:00". */
export function windowLabel(windows: Win[], weekday: number): string {
  return windowsForWeekday(windows, weekday).map(w => `${w.start}–${w.end}`).join(' e ')
}

/** Dia da semana (0..6) de uma data 'YYYY-MM-DD'. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}
