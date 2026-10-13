'use client'

import { useEffect, useRef } from 'react'
import type { Map as LeafletMap, Marker } from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type LatLng = { lat: number; lng: number }

/** Colombo; used when no pin has been placed yet. */
const DEFAULT_CENTER: LatLng = { lat: 6.9271, lng: 79.8612 }

const PIN_HTML =
  '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#c9a227;border:2px solid #0a0a0a;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>'

/**
 * OpenStreetMap picker: click the map or drag the pin to choose a point.
 * Leaflet touches `window`, so it is imported lazily on the client.
 */
export function LocationPicker({
  value,
  onChange,
  className,
}: {
  value: LatLng | null
  onChange: (pos: LatLng) => void
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const leafletRef = useRef<typeof import('leaflet') | null>(null)
  const onChangeRef = useRef(onChange)
  const initialValueRef = useRef(value)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    let cancelled = false
    void import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return
      leafletRef.current = L
      const start = initialValueRef.current
      const map = L.map(containerRef.current, { zoomControl: true }).setView(
        start || DEFAULT_CENTER,
        start ? 17 : 12
      )
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)
      map.on('click', (e) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }))
      mapRef.current = map
      if (start) placeMarker(start)
      setTimeout(() => map.invalidateSize(), 50)
    })
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  function placeMarker(pos: LatLng) {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return
    if (!markerRef.current) {
      const icon = L.divIcon({ className: '', html: PIN_HTML, iconSize: [22, 22], iconAnchor: [11, 22] })
      markerRef.current = L.marker(pos, { draggable: true, icon }).addTo(map)
      markerRef.current.on('dragend', () => {
        const p = markerRef.current!.getLatLng()
        onChangeRef.current({ lat: p.lat, lng: p.lng })
      })
    } else {
      markerRef.current.setLatLng(pos)
    }
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!value) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    placeMarker(value)
    if (!map.getBounds().pad(-0.2).contains(value)) {
      map.setView(value, Math.max(map.getZoom(), 16))
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      className={className ?? 'h-64 w-full overflow-hidden rounded-lg border border-[var(--border)]'}
      role="application"
      aria-label="Map: click to place the visit location"
    />
  )
}

export function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`
}
