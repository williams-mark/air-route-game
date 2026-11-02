import type { Airport } from "@arg/contracts";
import type { Itinerary, Leg } from "../demand/choice";
import { distanceKm } from "../geo";

export function makeLeg(id: string, a: Airport, b: Airport, freq: number, seats: number, speedKmh = 840): Leg {
  const d = distanceKm(a, b);
  return {
    id,
    origin: a.id,
    destination: b.id,
    distanceKm: d,
    blockMin: (d * 1.04) / speedKmh * 60 + 30,
    weeklyFrequency: freq,
    weeklySeats: freq * seats,
  };
}

export function directItinerary(
  carrier: string, a: Airport, b: Airport, freq: number, seats: number, fare: number, quality = 0.5,
): Itinerary {
  return { id: `${carrier}:${a.id}-${b.id}`, carrier, legs: [makeLeg(`${carrier}:${a.id}-${b.id}`, a, b, freq, seats)], fare, quality };
}

export function viaItinerary(
  carrier: string, a: Airport, via: Airport, b: Airport, freq: number, seats: number, fare: number, quality = 0.5,
): Itinerary {
  return {
    id: `${carrier}:${a.id}-${via.id}-${b.id}`,
    carrier,
    legs: [
      makeLeg(`${carrier}:${a.id}-${via.id}`, a, via, freq, seats),
      makeLeg(`${carrier}:${via.id}-${b.id}`, via, b, freq, seats),
    ],
    fare,
    quality,
  };
}
