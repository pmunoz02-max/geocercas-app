import React,{useMemo,useRef,useEffect} from 'react';
import {Marker} from 'react-leaflet';
import L from 'leaflet';
import {TRACKER_STATUS_COLORS} from '../lib/trackerMapPresentation';
import './AnimatedTrackerDot.css';
const TRACKER_ANIMATION_MS=2600,LARGE_JUMP_METERS=250;
const easeOutCubic=t=>1-Math.pow(1-t,3);
const distanceMeters=(a,b)=>L.latLng(a).distanceTo(L.latLng(b));
export function createTrackerIcon(name,status,showName){const root=document.createElement('div');const color=TRACKER_STATUS_COLORS[status]||TRACKER_STATUS_COLORS.offline;root.className='gps-tracker-pin';root.dataset.status=status;root.style.setProperty('--gps-color',color);root.innerHTML='<svg width="36" height="44" viewBox="0 0 36 44" aria-hidden="true"><path d="M18 42C14 35 2 24 2 18a16 16 0 1 1 32 0c0 6-12 17-16 24Z" fill="'+color+'" stroke="white" stroke-width="3"/><path d="m18 8 8 19-8-4-8 4Z" fill="white"/></svg>';if(showName){const label=document.createElement('span');label.className='gps-tracker-name';label.textContent=name;root.appendChild(label);}return L.divIcon({html:root,className:'gps-tracker-icon',iconSize:[36,44],iconAnchor:[18,43],tooltipAnchor:[0,-40]});}
export default function AnimatedTrackerDot({
  center,
  name = "(sin nombre)",
  status = "offline",
  showName = false,
  duration = TRACKER_ANIMATION_MS,
  children,
}) {
  const markerRef = useRef(null);
  const icon = useMemo(() => createTrackerIcon(name, status, showName), [name, status, showName]);
  useEffect(() => {
    const element=markerRef.current?.getElement();
    if(element){element.title=name;element.setAttribute('aria-label',name);}
  }, [name, icon]);
  const frameRef = useRef(null);
  const lastCenterRef = useRef(center);
  const initialCenterRef = useRef(center);

  useEffect(() => {
    const layer = markerRef.current?.instance || markerRef.current;
    if (!layer || typeof layer.setLatLng !== "function") return;
    if (!Array.isArray(center) || center.length !== 2) return;

    const next = [Number(center[0]), Number(center[1])];
    if (!Number.isFinite(next[0]) || !Number.isFinite(next[1])) return;

    const previous =
      Array.isArray(lastCenterRef.current) && lastCenterRef.current.length === 2
        ? [Number(lastCenterRef.current[0]), Number(lastCenterRef.current[1])]
        : next;

    if (!Number.isFinite(previous[0]) || !Number.isFinite(previous[1])) {
      layer.setLatLng(next);
      lastCenterRef.current = next;
      return;
    }

    const jumpMeters = distanceMeters(previous, next);
    const samePoint = previous[0] === next[0] && previous[1] === next[1];

    if (samePoint || !Number.isFinite(jumpMeters) || jumpMeters > LARGE_JUMP_METERS) {
      layer.setLatLng(next);
      lastCenterRef.current = next;
      return;
    }

    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const startTime = performance.now();

    const animate = (now) => {
      const rawT = Math.min(1, duration > 0 ? (now - startTime) / duration : 1);
      const t = easeOutCubic(rawT);

      const lat = previous[0] + (next[0] - previous[0]) * t;
      const lng = previous[1] + (next[1] - previous[1]) * t;

      layer.setLatLng([lat, lng]);
      lastCenterRef.current = [lat, lng];

      if (rawT < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        frameRef.current = null;
        lastCenterRef.current = next;
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [center, duration]);

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return (
    <Marker ref={markerRef} position={initialCenterRef.current} icon={icon} title={name} alt={name} riseOnHover keyboard eventHandlers={{click: () => markerRef.current?.openTooltip()}}>
      {children}
    </Marker>
  );
}
