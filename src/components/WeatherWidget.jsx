import React, { useEffect, useState } from 'react'
import { CloudRain, Sun, Cloud, AlertTriangle, Wind, Thermometer, Umbrella } from 'lucide-react'

export default function WeatherWidget() {
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // WINNIPEG COORDINATES
  const LAT = 49.8951
  const LON = -97.1384

  useEffect(() => {
    fetchForecast()
  }, [])

  async function fetchForecast() {
    try {
      // Fetch hourly data for today
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&timezone=America%2FWinnipeg&forecast_days=1`
      )
      const data = await res.json()

      // --- ANALYZE WORK HOURS (7 AM - 5 PM) ---
      const hourly = data.hourly
      let maxRainChance = 0
      let minTemp = 100
      let maxTemp = -100
      let rainHours = []

      // Loop through hours 7 (7 AM) to 17 (5 PM)
      for (let i = 7; i <= 17; i++) {
        const chance = hourly.precipitation_probability[i]
        const temp = hourly.temperature_2m[i]
        
        if (chance > maxRainChance) maxRainChance = chance
        if (temp < minTemp) minTemp = temp
        if (temp > maxTemp) maxTemp = temp
        
        if (chance >= 40) rainHours.push(i) // Track hours with risk
      }

      setWeather({
        currentTemp: Math.round(data.current.temperature_2m),
        wind: Math.round(data.current.wind_speed_10m),
        maxRainChance,
        rainHours,
        tempRange: `${Math.round(minTemp)}° / ${Math.round(maxTemp)}°`
      })
    } catch (err) {
      console.error(err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="h-40 bg-white rounded-xl shadow-sm border border-slate-200 animate-pulse"></div>
  if (error) return null // Hide if API fails

  // --- UI LOGIC ---
  const isRainRisk = weather.maxRainChance >= 50
  const isFreezing = weather.currentTemp <= 0

  return (
    <div className={`rounded-xl shadow-sm border p-5 relative overflow-hidden transition-all ${
      isRainRisk 
        ? 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 text-white' 
        : 'bg-white border-slate-200 text-slate-800'
    }`}>
      
      {/* HEADER */}
      <div className="flex justify-between items-start z-10 relative">
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2">
            {isRainRisk ? <CloudRain className="text-blue-400" /> : <Sun className="text-amber-500" />}
            Winnipeg Site Conditions
          </h3>
          <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${isRainRisk ? 'text-slate-400' : 'text-slate-400'}`}>
            Today's Work Hours (7am - 5pm)
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black">{weather.currentTemp}°C</p>
          <p className="text-xs opacity-60 font-bold">{weather.tempRange}</p>
        </div>
      </div>

      {/* ALERT SECTION */}
      <div className="mt-4 z-10 relative">
        {isRainRisk ? (
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 flex items-start gap-3">
            <AlertTriangle className="text-red-400 shrink-0" size={20} />
            <div>
              <p className="font-bold text-red-100 text-sm">Rain Risk Alert</p>
              <p className="text-xs text-red-200 mt-1">
                {weather.maxRainChance}% chance of rain detected around {weather.rainHours.map(h => h > 12 ? `${h-12}pm` : `${h}am`).join(', ')}.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-sm mt-2">
            <div className="flex items-center gap-1.5 text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
              <Umbrella size={16} className="text-blue-400" />
              <span className="font-bold text-slate-700">{weather.maxRainChance}% Precip</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
              <Wind size={16} className="text-slate-400" />
              <span className="font-bold text-slate-700">{weather.wind} km/h</span>
            </div>
          </div>
        )}
      </div>

      {/* FREEZING WARNING */}
      {isFreezing && !isRainRisk && (
        <div className="mt-3 text-xs font-bold text-blue-600 flex items-center gap-1 bg-blue-50 p-2 rounded">
          <Thermometer size={14} /> Ground Freeze Risk - Check Base Compaction
        </div>
      )}

      {/* Background Decoration */}
      {isRainRisk && (
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
      )}
    </div>
  )
}