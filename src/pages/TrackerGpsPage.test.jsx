import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import TrackerGpsPage from './TrackerGpsPage.jsx';
vi.mock('react-i18next',()=>{const t=(key)=>key;return {useTranslation:()=>({t})};});
beforeEach(()=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('tracker_runtime_token','mock-runtime');localStorage.setItem('tracker_org_id','mock-org');localStorage.setItem('tracker_user_id','mock-user');delete window.Android;delete window.AndroidBridge;});
afterEach(()=>{vi.useRealTimers();cleanup();delete window.Android;delete window.AndroidBridge;});
it('shows browser handoff instead of initializing without a native bridge',async()=>{render(<TrackerGpsPage/>);await waitFor(()=>expect(screen.getByText('tracker.gps.browserBadge')).toBeTruthy());expect(screen.queryByText('tracker.gps.badgeInitializing')).toBeNull();expect(screen.getByText('trackerGps.perms.panelTitle').parentElement.hidden).toBe(true);});
it('does not report tracking active for a bridge without a start method',async()=>{window.Android={saveTrackerSession:vi.fn()};render(<TrackerGpsPage/>);await waitFor(()=>expect(screen.getByText('tracker.gps.browserBadge')).toBeTruthy());expect(screen.queryByText('tracker.gps.badgeActive')).toBeNull();});

it('leaves initializing when the saved session is incomplete and recovers a late native session',async()=>{
  vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear();
  window.Android={saveTrackerSession:vi.fn(),startTracking:vi.fn()};
  render(<TrackerGpsPage/>);
  await act(async()=>{vi.advanceTimersByTime(12000);});
  expect(screen.getByText('tracker.gps.sessionMissingTitle')).toBeTruthy();
  expect(screen.queryByText('tracker.gps.badgeInitializing')).toBeNull();
  expect(window.Android.startTracking).not.toHaveBeenCalled();
  await act(async()=>{
    localStorage.setItem('tracker_runtime_token','mock-runtime');
    localStorage.setItem('tracker_org_id','mock-org');
    localStorage.setItem('tracker_user_id','mock-user');
    window.dispatchEvent(new Event('geocercas-native-session-ready'));
  });
  expect(window.Android.startTracking).toHaveBeenCalledWith('mock-runtime','mock-user','mock-org');
  expect(screen.queryByText('tracker.gps.sessionMissingTitle')).toBeNull();
});
it('does not start the native service without recipient identity',async()=>{
  vi.useFakeTimers(); localStorage.removeItem('tracker_user_id');
  window.Android={startTracking:vi.fn()};render(<TrackerGpsPage/>);
  await act(async()=>{vi.advanceTimersByTime(12000);});
  expect(window.Android.startTracking).not.toHaveBeenCalled();
  expect(screen.getByText('tracker.gps.sessionMissingTitle')).toBeTruthy();
});
