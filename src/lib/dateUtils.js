import { addDays, isFriday, isWeekend } from 'date-fns'

// 1. Check if a specific date is a work day (Mon-Thu)
export const isWorkDay = (date) => {
  // Returns true if NOT Friday and NOT Weekend (Sat/Sun)
  return !isFriday(date) && !isWeekend(date)
}

// 2. Add "Work Days" to a date
// Used to calculate End Date based on Duration
export const addWorkDays = (startDate, daysToAdd) => {
  let currentDate = new Date(startDate)
  let added = 0
  
  // If we start on a weekend/friday, move to Monday first
  while (!isWorkDay(currentDate)) {
    currentDate = addDays(currentDate, 1)
  }

  // Loop until we have added enough work days
  while (added < daysToAdd) {
    currentDate = addDays(currentDate, 1)
    if (isWorkDay(currentDate)) {
      added++
    }
  }
  return currentDate
}

// 3. Logic to shift a date forward/backward by Work Days
// Used for Rain Delays (+1) or adjusting schedule (-1)
export const shiftDateByWorkDays = (dateStr, daysToShift) => {
  if (!dateStr) return null
  let date = new Date(dateStr)
  let shifted = 0
  const absDays = Math.abs(daysToShift)
  const direction = daysToShift > 0 ? 1 : -1
  
  while (shifted < absDays) {
    // Move one day in the direction (forward or back)
    date = addDays(date, direction)
    
    // If we land on a Fri/Sat/Sun, keep moving in that direction 
    // until we hit a Monday (or Thursday if going back)
    while (!isWorkDay(date)) {
      date = addDays(date, direction)
    }
    
    shifted++
  }
  
  return date.toISOString()
}