import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import TrackerGpsPage from './TrackerGpsPage.jsx';
vi.mock('react-i18next',()=>{const t=(key)=>key;return {useTranslation:()=>({t})};});
beforeEach(()=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('tracker_runtime_token','mock-runtime');localStorage.setItem('tracker_org_id','mock-org');localStorage.setItem('tracker_user_id','mock-user');delete window.Android;delete window.AndroidBridge;});
afterEach(()=>{cleanup();delete window.Android;delete window.AndroidBridge;});
it('shows browser handoff instead of initializing without a native bridge',async()=>{render(<TrackerGpsPage/>);await waitFor(()=>expect(screen.getByText('tracker.gps.browserBadge')).toBeTruthy());expect(screen.queryByText('tracker.gps.badgeInitializing')).toBeNull();expect(screen.getByText('trackerGps.perms.panelTitle').parentElement.hidden).toBe(true);});
it('does not report tracking active for a bridge without a start method',async()=>{window.Android={saveTrackerSession:vi.fn()};render(<TrackerGpsPage/>);await waitFor(()=>expect(screen.getByText('tracker.gps.browserBadge')).toBeTruthy());expect(screen.queryByText('tracker.gps.badgeActive')).toBeNull();});
