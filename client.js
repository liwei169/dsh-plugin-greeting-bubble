/**
 * Browser half of dsh-plugin-greeting-bubble.
 *
 * Loaded lazily by the DSH client module table: this file only registers a
 * factory. The factory returns a Cordis plugin whose `apply` owns every live
 * resource through `ctx.effect` / `ctx.slots.inject`, so disabling or removing
 * the bundle removes the bubble again without a reload.
 *
 * Rendering surface: the `shell.overlay` list slot declared by
 * `@deepseek-ai/dsh-client-ui-layout`. It is a frame-wide layer above every
 * column, so the bubble floats over the whole app without moving any host
 * control. Registering a fresh `id` adds an entry beside the shipped ones
 * instead of replacing them.
 *
 * Features:
 * - draggable, viewport-clamped, position remembered in localStorage;
 * - account balance from the Host `account` Remote (never the token itself),
 *   refreshed every 60s while visible, with backoff and a manual refresh;
 * - privacy mode hides amounts (remembered);
 * - a low-balance warning below 3 CNY;
 * - an expandable details panel with wallets, account, update time, version,
 *   and links to the Platform usage/top-up pages.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-greeting-bubble',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin (registered in `apply`). */
    const NS = 'greetingBubble';

    /** Keep in sync with package.json's version on every release. */
    const PLUGIN_VERSION = '1.3.0';

    /** Where the reader last dropped the bubble, as viewport px. */
    const POSITION_KEY = 'dsh-greeting-bubble:position:v1';

    /** Whether amounts are hidden. */
    const PRIVACY_KEY = 'dsh-greeting-bubble:privacy:v1';

    /** Refresh cadence while visible, and the cap after repeated failures. */
    const BALANCE_REFRESH_MS = 60_000;
    const BALANCE_MAX_BACKOFF_MS = 300_000;

    /** Below this CNY amount the bubble warns. */
    const LOW_BALANCE_CNY = 3;

    /** Platform pages linked from the details panel. */
    const USAGE_URL = 'https://platform.deepseek.com/usage';
    const TOP_UP_URL = 'https://platform.deepseek.com/top_up';

    /** Read the remembered spot; a corrupt or absent value means "default". */
    function readPosition() {
      try {
        const raw = window.localStorage.getItem(POSITION_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw);
        if (typeof value?.x === 'number' && typeof value?.y === 'number') {
          return { x: value.x, y: value.y };
        }
      } catch {
        // Private mode, blocked storage, or malformed JSON: fall through.
      }
      return null;
    }

    /** Persist the dropped spot; failures must never break the bubble. */
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

    /** Display a Platform decimal string with two fraction digits. */
    const AMOUNT_FORMAT = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    function formatAmount(value) {
      const amount = Number(value);
      return Number.isFinite(amount) ? AMOUNT_FORMAT.format(amount) : value;
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

    /**
     * Component-local stylesheet; unmounting the entry removes it with the
     * node.
     */
    const STYLES = `
.dsh-greeting-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.dsh-greeting-bubble {
  position: absolute;
  right: calc(20px + env(safe-area-inset-right, 0px));
  bottom: calc(84px + env(safe-area-inset-bottom, 0px));
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  box-sizing: border-box;
  max-width: min(380px, calc(100vw - 40px));
  padding: 8px 6px 8px 12px;
  border: 0;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-lg, 16px);
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-elevation-prominent, 0 4px 16px rgba(0, 0, 0, 0.12));
  font-size: 13px;
  line-height: 20px;
  cursor: grab;
  touch-action: none;
  user-select: none;
  pointer-events: auto;
  animation: dsh-greeting-in 320ms cubic-bezier(0.22, 0.8, 0.24, 1) 350ms both;
}
.dsh-greeting-bubble[data-dragging] {
  cursor: grabbing;
}
.dsh-greeting-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.dsh-greeting-wave {
  flex: none;
  font-size: 16px;
  line-height: 1;
}
.dsh-greeting-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
.dsh-greeting-close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
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
.dsh-greeting-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0 0 0 24px;
  border: 0;
  border-radius: var(--dsw-radius-xs, 4px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  text-align: left;
  width: fit-content;
  max-width: 100%;
  cursor: pointer;
  pointer-events: auto;
}
.dsh-greeting-toggle:hover {
  color: var(--dsw-alias-label-secondary);
}
.dsh-greeting-toggle[data-low] {
  color: var(--dsw-alias-state-warn-primary, #b26a00);
}
.dsh-greeting-chevron {
  display: inline-block;
  transition: transform 120ms ease;
}
.dsh-greeting-toggle[aria-expanded='true'] .dsh-greeting-chevron {
  transform: rotate(90deg);
}
.dsh-greeting-warn {
  flex: none;
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #b26a00) 14%, transparent);
  font-size: 11px;
  line-height: 16px;
}
.dsh-greeting-details {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 4px;
  padding: 6px 6px 2px 24px;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 17px;
  cursor: default;
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
.dsh-greeting-toggle:focus-visible,
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
@media (prefers-reduced-motion: reduce) {
  .dsh-greeting-bubble {
    animation: none;
  }
}
`;

    /**
     * The greeting bubble itself.
     *
     * @param props - the framework `t` seat plus injected balance/profile loaders.
     * @returns the bubble, or null once the reader dismissed it.
     */
    function GreetingBubble({ t, loadBalance, loadProfile }) {
      const [dismissed, setDismissed] = React.useState(false);
      const [position, setPosition] = React.useState(readPosition);
      const [dragging, setDragging] = React.useState(false);
      const [balance, setBalance] = React.useState(null);
      const [profile, setProfile] = React.useState(null);
      const [updatedAt, setUpdatedAt] = React.useState(null);
      const [expanded, setExpanded] = React.useState(false);
      const [privacy, setPrivacy] = React.useState(readPrivacy);
      const bubbleRef = React.useRef(null);
      const dragRef = React.useRef(null);
      const inFlightRef = React.useRef(null);
      const profileRef = React.useRef(null);
      const timerRef = React.useRef(null);
      const backoffRef = React.useRef(BALANCE_REFRESH_MS);
      const cancelledRef = React.useRef(false);

      const label = (key, fallback) => (typeof t === 'function' ? t(key) : fallback);

      /** Fetch once, deduplicating concurrent calls. */
      function readBalance() {
        if (typeof loadBalance !== 'function') return Promise.resolve(null);
        if (inFlightRef.current !== null) return inFlightRef.current;
        const run = Promise.resolve()
          .then(() => loadBalance())
          .then((result) => {
            if (!result || result.ok !== true) return null;
            const wallets = normalizeBalance(result.value);
            return wallets === null ? null : { wallets, at: Date.now() };
          })
          .catch(() => null)
          .finally(() => { inFlightRef.current = null; });
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

      // Keep a remembered spot on screen when the window shrinks.
      React.useEffect(() => {
        function handleResize() {
          setPosition((current) => {
            const element = bubbleRef.current;
            if (current === null || element === null) return current;
            const x = clamp(current.x, 0, window.innerWidth - element.offsetWidth);
            const y = clamp(current.y, 0, window.innerHeight - element.offsetHeight);
            return x === current.x && y === current.y ? current : { x, y };
          });
        }
        window.addEventListener('resize', handleResize);
        return () => { window.removeEventListener('resize', handleResize); };
      }, []);

      if (dismissed) return null;
      const greeting = label('greeting', '你好，腾盛');
      const dismissLabel = label('dismiss', '关闭问候气泡');
      const normalText = balance === null ? null : formatWallets(balance.normal);
      const bonusText = balance === null ? null : formatWallets(balance.bonus);
      const low = balance !== null && isLowBalance(balance.normal);
      const amountText = privacy
        ? label('hidden', '••••')
        : (normalText ?? label('unavailable', '--'));
      const accountText = profile && (profile.name || profile.contact)
        ? [profile.name, profile.contact].filter(Boolean).join(' · ')
        : label('unavailable', '--');

      /** Refresh now and reset the backoff. */
      function handleRefresh() {
        backoffRef.current = BALANCE_REFRESH_MS;
        void readBalance().then((result) => {
          if (cancelledRef.current || result === null) return;
          setBalance(result.wallets);
          setUpdatedAt(result.at);
        });
      }

      /** Expand/collapse; the first expansion loads the account profile. */
      function handleToggle() {
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

      /** Start a drag: switch to absolute coordinates and capture the pointer. */
      function handlePointerDown(event) {
        if (event.button !== undefined && event.button !== 0) return;
        if (event.target && event.target.closest && event.target.closest('button, a')) return;
        const element = bubbleRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
        setPosition({ x: rect.left, y: rect.top });
        setDragging(true);
        if (typeof element.setPointerCapture === 'function') {
          element.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
      }

      /** Move within the viewport while the pointer is captured. */
      function handlePointerMove(event) {
        const drag = dragRef.current;
        if (drag === null || event.pointerId !== drag.pointerId) return;
        const x = drag.left + event.clientX - drag.startX;
        const y = drag.top + event.clientY - drag.startY;
        setPosition({
          x: clamp(x, 0, window.innerWidth - drag.width),
          y: clamp(y, 0, window.innerHeight - drag.height),
        });
      }

      /** Finish a drag, clamp once more, and persist the dropped spot. */
      function handlePointerUp(event) {
        const drag = dragRef.current;
        if (drag === null || event.pointerId !== drag.pointerId) return;
        dragRef.current = null;
        setDragging(false);
        const element = bubbleRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const dropped = {
          x: Math.round(clamp(rect.left, 0, window.innerWidth - rect.width)),
          y: Math.round(clamp(rect.top, 0, window.innerHeight - rect.height)),
        };
        setPosition(dropped);
        writePosition(dropped);
      }

      return h(
        'div',
        { className: 'dsh-greeting-layer', style: { position: 'absolute', inset: 0, pointerEvents: 'none' } },
        h('style', { key: 'styles' }, STYLES),
        h(
          'div',
          {
            key: 'bubble',
            ref: bubbleRef,
            className: 'dsh-greeting-bubble',
            'data-dragging': dragging ? '' : undefined,
            style: position === null
              ? undefined
              : { left: position.x, top: position.y, right: 'auto', bottom: 'auto' },
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerCancel: handlePointerUp,
          },
          h(
            'div',
            { className: 'dsh-greeting-main', key: 'main' },
            h('span', { className: 'dsh-greeting-wave', 'aria-hidden': 'true' }, '👋'),
            h('span', { className: 'dsh-greeting-text', role: 'status', lang: 'zh-CN' }, greeting),
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
                { width: 13, height: 13, viewBox: '0 0 12 12', 'aria-hidden': 'true' },
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
            'button',
            {
              key: 'toggle',
              className: 'dsh-greeting-toggle',
              type: 'button',
              'data-low': low ? '' : undefined,
              'aria-expanded': expanded ? 'true' : 'false',
              title: label('details', '展开详情'),
              onClick: handleToggle,
            },
            h('span', { className: 'dsh-greeting-chevron', 'aria-hidden': 'true' }, '▸'),
            h('span', null, label('balance', '余额') + ' ' + amountText),
            low
              ? h('span', { className: 'dsh-greeting-warn' }, label('lowBalance', '余额不足'))
              : null,
          ),
          expanded
            ? h(
              'div',
              { className: 'dsh-greeting-details', key: 'details' },
              h(
                'div',
                { className: 'dsh-greeting-row' },
                h('span', { className: 'dsh-greeting-row-label' }, label('account', '账户')),
                h('span', { className: 'dsh-greeting-row-value' }, accountText),
              ),
              h(
                'div',
                { className: 'dsh-greeting-row' },
                h('span', { className: 'dsh-greeting-row-label' }, label('topUpBalance', '充值')),
                h('span', { className: 'dsh-greeting-row-value' }, privacy ? label('hidden', '••••') : (normalText ?? label('unavailable', '--'))),
              ),
              h(
                'div',
                { className: 'dsh-greeting-row' },
                h('span', { className: 'dsh-greeting-row-label' }, label('bonusBalance', '赠送')),
                h('span', { className: 'dsh-greeting-row-value' }, privacy ? label('hidden', '••••') : (bonusText ?? label('unavailable', '--'))),
              ),
              h(
                'div',
                { className: 'dsh-greeting-row' },
                h('span', { className: 'dsh-greeting-row-label' }, label('updated', '更新')),
                h('span', { className: 'dsh-greeting-row-value' }, formatTime(updatedAt) + ' · v' + PLUGIN_VERSION),
              ),
              h(
                'div',
                { className: 'dsh-greeting-actions' },
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
            )
            : null,
        ),
      );
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account'],
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
              dismiss: '关闭问候气泡',
              balance: '余额',
              bonus: '赠送',
              topUpBalance: '充值',
              bonusBalance: '赠送',
              account: '账户',
              updated: '更新',
              hidden: '••••',
              unavailable: '--',
              lowBalance: '余额不足',
              details: '展开详情',
              refresh: '刷新',
              hideAmount: '隐藏金额',
              showAmount: '显示金额',
              usage: '用量',
              topUp: '充值',
            },
            en: {
              greeting: '你好，腾盛',
              dismiss: 'Dismiss greeting',
              balance: 'Balance',
              bonus: 'Bonus',
              topUpBalance: 'Top-up',
              bonusBalance: 'Bonus',
              account: 'Account',
              updated: 'Updated',
              hidden: '••••',
              unavailable: '--',
              lowBalance: 'Low balance',
              details: 'Show details',
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
          inject: () => ({ loadBalance, loadProfile }),
        }, GreetingBubble));
      },
    };
  },
});
