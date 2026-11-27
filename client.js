/**
 * Browser half of dsh-plugin-greeting-bubble.
 *
 * Loaded lazily by the DSH client module table: this file only registers a
 * factory. The factory returns a Cordis plugin whose `apply` owns every live
 * resource through `ctx.effect` / `ctx.slots.inject`, so disabling or removing
 * the bundle removes the widget again without a reload.
 *
 * Rendering surface: the `shell.overlay` list slot declared by
 * `@deepseek-ai/dsh-client-ui-layout`. It is a frame-wide layer above every
 * column, so the widget floats over the whole app without moving any host
 * control.
 *
 * v1.5 visual language:
 * - a small robot avatar beside one speech card, dragged as a single unit;
 * - collapsed: robot + `greeting · amount` pill; expanded: greeting, details,
 *   and actions;
 * - the robot reflects state: accent while connected, warning colour on a low
 *   balance, muted and "eyes closed" while disconnected, and a blinking idle.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-greeting-bubble',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin (registered in `apply`). */
    const NS = 'greetingBubble';

    /** Where the reader last dropped the widget, as offsets from the bottom-right corner. */
    const POSITION_KEY = 'dsh-greeting-bubble:position:v3';

    /** Whether amounts are hidden. */
    const PRIVACY_KEY = 'dsh-greeting-bubble:privacy:v1';

    /** Refresh cadence while visible, and the cap after repeated failures. */
    const BALANCE_REFRESH_MS = 60_000;
    const BALANCE_MAX_BACKOFF_MS = 300_000;

    /** Below this CNY amount the widget warns. */
    const LOW_BALANCE_CNY = 8;

    /** Local-day consumption baseline; reset when the date changes. */
    const CONSUMPTION_KEY = 'dsh-greeting-bubble:consumption:v1';

    /** Platform pages linked from the details panel. */
    const USAGE_URL = 'https://platform.deepseek.com/usage';
    const TOP_UP_URL = 'https://platform.deepseek.com/top_up';

    /** Movement in px beyond which a pointer gesture counts as a drag, not a click. */
    const DRAG_THRESHOLD = 4;

    /** Read the remembered spot; a corrupt or absent value means "default". */
    function readPosition() {
      try {
        const raw = window.localStorage.getItem(POSITION_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw);
        if (typeof value?.right === 'number' && typeof value?.bottom === 'number') {
          return { right: value.right, bottom: value.bottom };
        }
      } catch {
        // Private mode, blocked storage, or malformed JSON: fall through.
      }
      return null;
    }

    /** Persist the dropped spot; failures must never break the widget. */
    function writePosition(position) {
      try {
        window.localStorage.setItem(POSITION_KEY, JSON.stringify(position));
      } catch {
        // Storage unavailable: position simply does not survive the reload.
      }
    }

    /** Read the privacy preference. */
    function readPrivacy() {
      try {
        return window.localStorage.getItem(PRIVACY_KEY) === '1';
      } catch {
        return false;
      }
    }

    /** Persist the privacy preference. */
    function writePrivacy(hidden) {
      try {
        window.localStorage.setItem(PRIVACY_KEY, hidden ? '1' : '0');
      } catch {
        // Storage unavailable: the toggle applies to this view only.
      }
    }

    /** Keep a value inside [min, max], tolerating a viewport smaller than the card. */
    function clamp(value, min, max) {
      return Math.max(min, Math.min(value, Math.max(min, max)));
    }

    /** Platform wallet currency symbol. */
    function currencySymbol(currency) {
      if (currency === 'CNY') return '¥';
      if (currency === 'USD') return '$';
      return currency + ' ';
    }

    /** Whole-yuan grouping for truncated amounts. */
    const WHOLE_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

    /**
     * Display a Platform amount the way the Platform does: truncate to two
     * fraction digits instead of rounding, so 4.618 shows 4.61 (not 4.62).
     */
    function formatAmount(value) {
      const amount = Number(value);
      if (!Number.isFinite(amount)) return value;
      // Round away binary noise at the 1e-9 scale, then truncate to cents.
      const cents = Math.trunc(Math.round(amount * 1e9) / 1e7);
      const sign = cents < 0 ? '-' : '';
      const abs = Math.abs(cents);
      const whole = WHOLE_FORMAT.format(Math.floor(abs / 100));
      const fraction = String(abs % 100).padStart(2, '0');
      return sign + whole + '.' + fraction;
    }

    /** Format a wallet list, e.g. "¥11.77 / $1.00"; null when empty. */
    function formatWallets(wallets) {
      if (!Array.isArray(wallets) || wallets.length === 0) return null;
      return wallets
        .filter((wallet) => wallet && typeof wallet.balance === 'string')
        .map((wallet) => currencySymbol(wallet.currency) + formatAmount(wallet.balance))
        .join(' / ') || null;
    }

    /** Normalize the Remote balance result into displayable wallets. */
    function normalizeBalance(balance) {
      if (!balance || balance.status !== 'ready' || !Array.isArray(balance.value)) return null;
      const normal = balance.value.filter((wallet) => wallet && typeof wallet.balance === 'string');
      if (normal.length === 0) return null;
      const bonus = (balance.bonusWallets ?? []).filter(
        (wallet) => wallet && typeof wallet.balance === 'string' && Number(wallet.balance) !== 0,
      );
      return { normal, bonus };
    }

    /** True when any CNY wallet is below the warning threshold. */
    function isLowBalance(normal) {
      return (normal ?? []).some(
        (wallet) => wallet.currency === 'CNY' && Number(wallet.balance) < LOW_BALANCE_CNY,
      );
    }

    /** Local HH:MM:SS for the last successful refresh. */
    function formatTime(timestamp) {
      if (typeof timestamp !== 'number') return '--';
      return new Date(timestamp).toLocaleTimeString();
    }

    /** Today key in local time, used to reset the consumption baseline. */
    function localDateKey() {
      const now = new Date();
      return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }

    /**
     * Estimated CNY spent today, measured from the closest known day-start
     * balance: yesterday's last reading across midnight when available,
     * otherwise today's first reading. A top-up raises the baseline so it does
     * not count as negative spending.
     */
    function trackConsumption(normal) {
      const cny = (normal ?? []).find((wallet) => wallet.currency === 'CNY' && typeof wallet.balance === 'string');
      if (!cny) return null;
      const amount = Number(cny.balance);
      if (!Number.isFinite(amount)) return null;
      const today = localDateKey();
      const now = Date.now();
      let state = null;
      try {
        state = JSON.parse(window.localStorage.getItem(CONSUMPTION_KEY) || 'null');
      } catch {
        state = null;
      }
      let baseline;
      let startAt;
      if (state && state.date === today && typeof state.baseline === 'number') {
        baseline = state.baseline;
        startAt = typeof state.startAt === 'number' ? state.startAt : now;
        if (typeof state.lastAmount === 'number' && amount > state.lastAmount) {
          baseline += amount - state.lastAmount;
        }
      } else if (state && typeof state.lastAmount === 'number' && typeof state.lastAt === 'number'
        && localDateKey(new Date(state.lastAt)) !== today) {
        baseline = state.lastAmount;
        startAt = state.lastAt;
      } else {
        baseline = amount;
        startAt = now;
      }
      try {
        window.localStorage.setItem(CONSUMPTION_KEY, JSON.stringify({
          date: today,
          baseline,
          startAt,
          lastAmount: amount,
          lastAt: now,
        }));
      } catch {
        // Storage unavailable: the estimate simply does not survive the reload.
      }
      return { spent: Math.max(0, baseline - amount), startAt };
    }

    /** Greeting key by local hour. */
    function greetingKeyForHour(hour) {
      if (hour >= 5 && hour < 11) return 'greetingMorning';
      if (hour >= 11 && hour < 13) return 'greetingNoon';
      if (hour >= 13 && hour < 18) return 'greetingAfternoon';
      return 'greetingEvening';
    }

    /** Subscribe to a host observable (or read it once when unavailable). */
    function useObservable(source) {
      const subscribe = source && typeof source.subscribe === 'function' ? source.subscribe.bind(source) : null;
      const get = source && typeof source.getSnapshot === 'function' ? source.getSnapshot.bind(source) : () => undefined;
      if (typeof React.useSyncExternalStore === 'function' && subscribe !== null) {
        return React.useSyncExternalStore(subscribe, get, get);
      }
      return get();
    }

    /**
     * Component-local stylesheet; unmounting the entry removes it with the
     * node. Every colour comes from a `--dsw-alias-*` token so themes keep
     * working; the robot itself is a plain SVG drawn with `currentColor`.
     */
    const STYLES = `
.dsh-greeting-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.dsh-greeting-widget {
  position: absolute;
  right: calc(20px + env(safe-area-inset-right, 0px));
  bottom: calc(84px + env(safe-area-inset-bottom, 0px));
  z-index: 1;
  display: flex;
  align-items: flex-end;
  gap: 6px;
  max-width: calc(100vw - 40px);
  cursor: grab;
  touch-action: none;
  user-select: none;
  pointer-events: auto;
  animation: dsh-greeting-in 320ms cubic-bezier(0.22, 0.8, 0.24, 1) 350ms both;
}
.dsh-greeting-widget[data-dragging] {
  cursor: grabbing;
}
.dsh-greeting-avatar {
  flex: none;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-state-business-primary, #3b6fe0);
  cursor: pointer;
  pointer-events: auto;
  transition: color 120ms ease;
}
.dsh-greeting-widget[data-low] .dsh-greeting-avatar {
  color: var(--dsw-alias-state-warn-primary, #b26a00);
}
.dsh-greeting-widget[data-disconnected] .dsh-greeting-avatar {
  color: var(--dsw-alias-label-tertiary);
}
.dsh-greeting-avatar svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.dsh-greeting-eye {
  transform-box: fill-box;
  transform-origin: center;
}
.dsh-greeting-widget[data-disconnected] .dsh-greeting-eyes {
  transform: scaleY(0.12);
  transform-box: fill-box;
  transform-origin: center;
}
.dsh-greeting-widget:not([data-disconnected]) .dsh-greeting-eyes {
  animation: dsh-greeting-blink 7s ease-in-out infinite;
}
.dsh-greeting-antenna-dot {
  transform-box: fill-box;
  transform-origin: center;
}
.dsh-greeting-widget[data-refreshing] .dsh-greeting-antenna-dot {
  animation: dsh-greeting-pulse 900ms ease-in-out infinite;
}
.dsh-greeting-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: min(360px, calc(100vw - 70px));
  padding: 8px 8px 8px 10px;
  border: 0;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-lg, 16px);
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-elevation-prominent, 0 4px 16px rgba(0, 0, 0, 0.12));
  font-size: 13px;
  line-height: 20px;
  pointer-events: auto;
}
.dsh-greeting-card-compact {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
}
.dsh-greeting-card-compact:hover {
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-3) 92%, var(--dsw-alias-label-primary));
}
.dsh-greeting-greeting {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.dsh-greeting-amount {
  flex: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
}
.dsh-greeting-widget[data-low] .dsh-greeting-amount {
  color: var(--dsw-alias-state-warn-primary, #b26a00);
}
.dsh-greeting-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-state-warn-primary, #b26a00);
}
.dsh-greeting-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-left: 2px;
}
.dsh-greeting-head-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.dsh-greeting-close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  pointer-events: auto;
}
.dsh-greeting-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.dsh-greeting-details {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 4px;
  padding: 6px 6px 0 2px;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 17px;
}
.dsh-greeting-row {
  display: flex;
  gap: 6px;
  min-width: 0;
}
.dsh-greeting-row-label {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-greeting-row-value {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-secondary);
}
.dsh-greeting-row-value[data-nowrap] {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-greeting-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 3px;
}
.dsh-greeting-action {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-state-business-primary, #3b6fe0);
  font: inherit;
  font-size: 12px;
  line-height: 17px;
  cursor: pointer;
  text-decoration: none;
}
.dsh-greeting-action:hover {
  text-decoration: underline;
}
.dsh-greeting-action:focus-visible,
.dsh-greeting-card-compact:focus-visible,
.dsh-greeting-avatar:focus-visible,
.dsh-greeting-close:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid
    var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
@keyframes dsh-greeting-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@keyframes dsh-greeting-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.1); }
}
@keyframes dsh-greeting-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.15); }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-greeting-widget,
  .dsh-greeting-widget:not([data-disconnected]) .dsh-greeting-eyes,
  .dsh-greeting-widget[data-refreshing] .dsh-greeting-antenna-dot {
    animation: none;
  }
}
`;

    /** The little robot beside the card. */
    function RobotAvatar() {
      return h(
        'svg',
        { viewBox: '0 0 32 32', 'aria-hidden': 'true', focusable: 'false' },
        h('g', { className: 'dsh-greeting-antenna' },
          h('path', { d: 'M16 7V4', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
          h('circle', { className: 'dsh-greeting-antenna-dot', cx: 16, cy: 2.6, r: 2, fill: 'currentColor' }),
        ),
        h('rect', { x: 3, y: 12, width: 2.6, height: 7, rx: 1.3, fill: 'currentColor' }),
        h('rect', { x: 26.4, y: 12, width: 2.6, height: 7, rx: 1.3, fill: 'currentColor' }),
        h('rect', { x: 5.5, y: 7.5, width: 21, height: 17, rx: 6.5, fill: 'currentColor' }),
        h('g', { className: 'dsh-greeting-eyes', fill: 'var(--dsw-alias-label-on-color, #ffffff)' },
          h('circle', { className: 'dsh-greeting-eye', cx: 12, cy: 15, r: 2.1 }),
          h('circle', { className: 'dsh-greeting-eye', cx: 20, cy: 15, r: 2.1 }),
        ),
        h('path', {
          d: 'M12 20c1.6 2.2 6.4 2.2 8 0',
          fill: 'none',
          stroke: 'var(--dsw-alias-label-on-color, #ffffff)',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
      );
    }

    /**
     * The greeting widget: robot + speech card, draggable as one unit.
     *
     * @param props - the framework `t` seat plus injected balance/profile loaders.
     * @returns the widget, or null once the reader dismissed it.
     */
    function GreetingBubble({ t, loadBalance, loadProfile, connection }) {
      const [dismissed, setDismissed] = React.useState(false);
      const [position, setPosition] = React.useState(readPosition);
      const [dragging, setDragging] = React.useState(false);
      const [expanded, setExpanded] = React.useState(false);
      const [balance, setBalance] = React.useState(null);
      const [profile, setProfile] = React.useState(null);
      const [updatedAt, setUpdatedAt] = React.useState(null);
      const [spent, setSpent] = React.useState(null);
      const [privacy, setPrivacy] = React.useState(readPrivacy);
      const [refreshing, setRefreshing] = React.useState(false);
      const widgetRef = React.useRef(null);
      const dragRef = React.useRef(null);
      const suppressClickRef = React.useRef(false);
      const inFlightRef = React.useRef(null);
      const profileRef = React.useRef(null);
      const timerRef = React.useRef(null);
      const backoffRef = React.useRef(BALANCE_REFRESH_MS);
      const cancelledRef = React.useRef(false);

      const label = (key, fallback) => (typeof t === 'function' ? t(key) : fallback);
      const connectionState = useObservable(connection && connection.state);
      const canReconnect = Boolean(connection && typeof connection.reconnect === 'function');

      /** Fetch once, deduplicating concurrent calls. */
      function readBalance() {
        if (typeof loadBalance !== 'function') return Promise.resolve(null);
        if (inFlightRef.current !== null) return inFlightRef.current;
        setRefreshing(true);
        const run = Promise.resolve()
          .then(() => loadBalance())
          .then((result) => {
            if (!result || result.ok !== true) return null;
            const wallets = normalizeBalance(result.value);
            return wallets === null ? null : { wallets, at: Date.now(), spent: trackConsumption(wallets.normal) };
          })
          .catch(() => null)
          .finally(() => {
            inFlightRef.current = null;
            if (!cancelledRef.current) setRefreshing(false);
          });
        inFlightRef.current = run;
        return run;
      }

      /** Profile is read on demand (first expand) and cached for the page view. */
      function readProfile() {
        if (profileRef.current !== null) return Promise.resolve(profileRef.current);
        if (typeof loadProfile !== 'function') return Promise.resolve(null);
        const run = Promise.resolve()
          .then(() => loadProfile())
          .then((result) => {
            if (!result || result.ok !== true) return null;
            const value = result.value;
            if (!value || value.status !== 'ready' || !value.value) return null;
            const next = { name: value.value.name, contact: value.value.contact };
            profileRef.current = next;
            return next;
          })
          .catch(() => null);
        return run;
      }

      /** One polling cycle: refresh, then schedule the next attempt with backoff. */
      function tick() {
        if (cancelledRef.current) return;
        const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
        if (!visible) {
          timerRef.current = window.setTimeout(tick, BALANCE_REFRESH_MS);
          return;
        }
        void readBalance().then((result) => {
          if (cancelledRef.current) return;
          if (result !== null) {
            setBalance(result.wallets);
            setUpdatedAt(result.at);
            setSpent(result.spent);
          }
          backoffRef.current = result === null
            ? Math.min(backoffRef.current * 2, BALANCE_MAX_BACKOFF_MS)
            : BALANCE_REFRESH_MS;
          timerRef.current = window.setTimeout(tick, backoffRef.current);
        });
      }

      // Balance polling: visible-only, deduplicated, backed off on failure.
      React.useEffect(() => {
        cancelledRef.current = false;
        tick();
        function handleVisibility() {
          if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            backoffRef.current = BALANCE_REFRESH_MS;
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            tick();
          }
        }
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
          cancelledRef.current = true;
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
          document.removeEventListener('visibilitychange', handleVisibility);
        };
        // The loaders are stable for the registration's lifetime.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      // Keep the remembered offsets valid when the window shrinks.
      React.useEffect(() => {
        function handleResize() {
          setPosition((current) => {
            const element = widgetRef.current;
            if (current === null || element === null) return current;
            const right = clamp(current.right, 0, Math.max(0, window.innerWidth - element.offsetWidth));
            const bottom = clamp(current.bottom, 0, Math.max(0, window.innerHeight - element.offsetHeight));
            return right === current.right && bottom === current.bottom ? current : { right, bottom };
          });
        }
        window.addEventListener('resize', handleResize);
        return () => { window.removeEventListener('resize', handleResize); };
      }, []);

      // Bottom-anchored: expansion grows upward. Only nudge down when the card
      // is taller than the room above it.
      React.useEffect(() => {
        if (!expanded) return;
        const element = widgetRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const margin = 8;
        if (rect.top < margin) {
          setPosition((current) => current === null ? current : {
            right: current.right,
            bottom: Math.max(0, window.innerHeight - rect.height - margin),
          });
        }
      }, [expanded]);

      if (dismissed) return null;
      const greeting = label(greetingKeyForHour(new Date().getHours()), '你好，腾盛');
      const dismissLabel = label('dismiss', '关闭问候气泡');
      const normalText = balance === null ? null : formatWallets(balance.normal);
      const low = balance !== null && isLowBalance(balance.normal);
      const amountText = privacy
        ? label('hidden', '••••')
        : (normalText ?? label('unavailable', '--'));
      const accountText = profile && (profile.name || profile.contact)
        ? [profile.name, profile.contact].filter(Boolean).join(' · ')
        : label('unavailable', '--');
      const connectionText = connectionState === 'connected'
        ? label('connected', '已连接')
        : connectionState === 'connecting'
          ? label('connecting', '重连中')
          : connectionState === 'disconnected'
            ? label('disconnected', '已断开')
            : label('unavailable', '--');
      const spentText = spent === null ? label('unavailable', '--') : '≈ ' + currencySymbol('CNY') + formatAmount(spent.spent);
      const collapsedLabel = greeting + ' · ' + amountText;

      /** Refresh now and reset the backoff. */
      function handleRefresh() {
        backoffRef.current = BALANCE_REFRESH_MS;
        void readBalance().then((result) => {
          if (cancelledRef.current || result === null) return;
          setBalance(result.wallets);
          setUpdatedAt(result.at);
          setSpent(result.spent);
        });
      }

      /** Expand/collapse; the first expansion loads the account profile. */
      function toggleExpanded() {
        setExpanded((current) => {
          const next = !current;
          if (next && profile === null) {
            void readProfile().then((value) => {
              if (!cancelledRef.current && value !== null) setProfile(value);
            });
          }
          return next;
        });
      }

      /** Toggle the amount mask and remember it. */
      function handlePrivacy() {
        setPrivacy((current) => {
          const next = !current;
          writePrivacy(next);
          return next;
        });
      }

      /** Suppress the click that follows a drag gesture. */
      function beginDrag(event) {
        if (event.button !== undefined && event.button !== 0) return;
        if (event.target && event.target.closest && event.target.closest('button, a')) return;
        const element = widgetRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startRight: window.innerWidth - rect.right,
          startBottom: window.innerHeight - rect.bottom,
          width: rect.width,
          height: rect.height,
          moved: false,
        };
        setPosition({ right: dragRef.current.startRight, bottom: dragRef.current.startBottom });
        setDragging(true);
        if (typeof element.setPointerCapture === 'function') {
          element.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
      }

      /** Move within the viewport while the pointer is captured. */
      function moveDrag(event) {
        const drag = dragRef.current;
        if (drag === null || event.pointerId !== drag.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) drag.moved = true;
        setPosition({
          right: clamp(drag.startRight - dx, 0, Math.max(0, window.innerWidth - drag.width)),
          bottom: clamp(drag.startBottom - dy, 0, Math.max(0, window.innerHeight - drag.height)),
        });
      }

      /** Finish a drag, clamp once more, and persist the dropped spot. */
      function endDrag(event) {
        const drag = dragRef.current;
        if (drag === null || event.pointerId !== drag.pointerId) return;
        dragRef.current = null;
        setDragging(false);
        const element = widgetRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const dropped = {
          right: Math.round(clamp(window.innerWidth - rect.right, 0, Math.max(0, window.innerWidth - rect.width))),
          bottom: Math.round(clamp(window.innerHeight - rect.bottom, 0, Math.max(0, window.innerHeight - rect.height))),
        };
        setPosition(dropped);
        writePosition(dropped);
        if (drag.moved) {
          suppressClickRef.current = true;
          window.setTimeout(() => { suppressClickRef.current = false; }, 0);
        }
      }

      /** Toggle the card, ignoring the click that ends a drag and inner controls. */
      function handleCardClick(event) {
        if (suppressClickRef.current) return;
        if (event.target && event.target.closest && event.target.closest('button, a')) return;
        toggleExpanded();
      }

      /** Keyboard activation for the compact card. */
      function handleCardKeyDown(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleExpanded();
      }

      return h(
        'div',
        {
          className: 'dsh-greeting-widget',
          ref: widgetRef,
          'data-dragging': dragging ? '' : undefined,
          'data-expanded': expanded ? '' : undefined,
          'data-low': low ? '' : undefined,
          'data-refreshing': refreshing ? '' : undefined,
          'data-disconnected': connectionState === 'disconnected' ? '' : undefined,
          style: position === null
            ? undefined
            : { right: position.right, bottom: position.bottom, left: 'auto', top: 'auto' },
          onPointerDown: beginDrag,
          onPointerMove: moveDrag,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
        },
        h('style', { key: 'styles' }, STYLES),
        h(
          'button',
          {
            className: 'dsh-greeting-avatar',
            type: 'button',
            title: greeting,
            'aria-label': greeting,
            'aria-expanded': expanded ? 'true' : 'false',
            onClick: toggleExpanded,
          },
          h(RobotAvatar),
        ),
        expanded
          ? h(
            'div',
            { className: 'dsh-greeting-card', key: 'card' },
            h(
              'div',
              { className: 'dsh-greeting-head' },
              h('span', { className: 'dsh-greeting-head-text', role: 'status', lang: 'zh-CN' }, greeting),
              h(
                'button',
                {
                  className: 'dsh-greeting-close',
                  type: 'button',
                  title: dismissLabel,
                  'aria-label': dismissLabel,
                  onClick: () => { setDismissed(true); },
                },
                h(
                  'svg',
                  { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': 'true' },
                  h('path', {
                    d: 'M2.5 2.5l7 7M9.5 2.5l-7 7',
                    fill: 'none',
                    stroke: 'currentColor',
                    strokeWidth: 1.4,
                    strokeLinecap: 'round',
                  }),
                ),
              ),
            ),
            h(
              'div',
              { className: 'dsh-greeting-details' },
              h(
                'div',
                { className: 'dsh-greeting-row' },
                h('span', { className: 'dsh-greeting-row-label' }, label('account', '账户')),
                h('span', { className: 'dsh-greeting-row-value' }, accountText),
              ),
              h(
                'div',
                { className: 'dsh-greeting-row' },
                h('span', { className: 'dsh-greeting-row-label' }, label('topUpBalance', '充值余额')),
                h('span', { className: 'dsh-greeting-row-value' }, privacy ? label('hidden', '••••') : (normalText ?? label('unavailable', '--'))),
              ),
              h(
                'div',
                { className: 'dsh-greeting-row' },
                h('span', { className: 'dsh-greeting-row-label' }, label('updated', '更新')),
                h('span', { className: 'dsh-greeting-row-value' }, formatTime(updatedAt)),
              ),
              h(
                'div',
                { className: 'dsh-greeting-row' },
                h('span', { className: 'dsh-greeting-row-label' }, label('connection', '连接')),
                h('span', { className: 'dsh-greeting-row-value' }, connectionText),
              ),
              h(
                'div',
                { className: 'dsh-greeting-row' },
                h('span', { className: 'dsh-greeting-row-label' }, label('today', '今日消费金额')),
                h('span', { className: 'dsh-greeting-row-value', 'data-nowrap': '' }, spentText),
              ),
              h(
                'div',
                { className: 'dsh-greeting-actions' },
                canReconnect && connectionState !== 'connected'
                  ? h(
                    'button',
                    { className: 'dsh-greeting-action', type: 'button', onClick: () => { connection.reconnect(); } },
                    label('reconnect', '重连'),
                  )
                  : null,
                h(
                  'button',
                  { className: 'dsh-greeting-action', type: 'button', onClick: handleRefresh },
                  label('refresh', '刷新'),
                ),
                h(
                  'button',
                  { className: 'dsh-greeting-action', type: 'button', onClick: handlePrivacy },
                  privacy ? label('showAmount', '显示金额') : label('hideAmount', '隐藏金额'),
                ),
                h('a', { className: 'dsh-greeting-action', href: USAGE_URL, target: '_blank', rel: 'noreferrer' }, label('usage', '用量')),
                h('a', { className: 'dsh-greeting-action', href: TOP_UP_URL, target: '_blank', rel: 'noreferrer' }, label('topUp', '充值')),
              ),
            ),
          )
          : h(
            'div',
            {
              className: 'dsh-greeting-card dsh-greeting-card-compact',
              key: 'compact',
              role: 'button',
              tabIndex: 0,
              'aria-label': collapsedLabel,
              'aria-expanded': 'false',
              onClick: handleCardClick,
              onKeyDown: handleCardKeyDown,
            },
            h('span', { className: 'dsh-greeting-greeting', role: 'status', lang: 'zh-CN' }, greeting),
            h('span', { className: 'dsh-greeting-amount' }, amountText),
            low ? h('span', { className: 'dsh-greeting-dot', 'aria-hidden': 'true' }) : null,
          ),
      );
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account', 'connection'],
      /**
       * Register the plugin's dictionary and its single overlay entry.
       * @param ctx - client plugin context.
       */
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, {
            // The greeting is the plugin's fixed signature phrase, so it stays
            // identical in every locale; only control labels are localized.
            zh: {
              greeting: '你好，腾盛',
              greetingMorning: '早上好，腾盛',
              greetingNoon: '中午好，腾盛',
              greetingAfternoon: '下午好，腾盛',
              greetingEvening: '晚上好，腾盛',
              dismiss: '关闭问候气泡',
              balance: '余额',
              topUpBalance: '充值余额',
              account: '账户',
              connection: '连接',
              connected: '已连接',
              connecting: '重连中',
              disconnected: '已断开',
              reconnect: '重连',
              updated: '更新',
              today: '今日消费金额',
              hidden: '••••',
              unavailable: '--',
              lowBalance: '余额不足',
              refresh: '刷新',
              hideAmount: '隐藏金额',
              showAmount: '显示金额',
              usage: '用量',
              topUp: '充值',
            },
            en: {
              greeting: '你好，腾盛',
              greetingMorning: '你好，腾盛',
              greetingNoon: '你好，腾盛',
              greetingAfternoon: '你好，腾盛',
              greetingEvening: '你好，腾盛',
              dismiss: 'Dismiss greeting',
              balance: 'Balance',
              topUpBalance: 'Top-up balance',
              account: 'Account',
              connection: 'Connection',
              connected: 'Connected',
              connecting: 'Reconnecting',
              disconnected: 'Disconnected',
              reconnect: 'Reconnect',
              updated: 'Updated',
              today: "Today's spend",
              hidden: '••••',
              unavailable: '--',
              lowBalance: 'Low balance',
              refresh: 'Refresh',
              hideAmount: 'Hide amounts',
              showAmount: 'Show amounts',
              usage: 'Usage',
              topUp: 'Top up',
            },
          }),
          'greeting-bubble: dictionaries',
        );
        /** Current request identity for the Host's Platform calls. */
        const metadata = () => {
          let version = '';
          try {
            version = (typeof process !== 'undefined' && process.env && process.env.DSH_CLIENT_VERSION) || '';
          } catch {
            // `process` is absent in some browser builds; an empty version is fine.
          }
          return {
            version,
            locale: ctx.locale.getSnapshot().active,
            timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
          };
        };
        const accountRemote = () => {
          const account = ctx.remote && ctx.remote.account;
          if (!account) throw new Error('account service unavailable');
          return account;
        };
        const loadBalance = () => {
          const account = accountRemote();
          if (typeof account.getBalance !== 'function') throw new Error('balance unavailable');
          return account.getBalance(metadata());
        };
        const loadProfile = () => {
          const account = accountRemote();
          if (typeof account.getProfile !== 'function') throw new Error('profile unavailable');
          return account.getProfile(metadata());
        };
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'greeting-bubble',
          order: 50,
          locale: NS,
          inject: () => ({ loadBalance, loadProfile, connection: ctx.connection }),
        }, GreetingBubble));
      },
    };
  },
});
