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
 * The bubble is draggable (pointer capture, viewport clamp, remembered in
 * localStorage) and shows the signed-in account's wallet balance, which it
 * reads through the Host's `account` Remote — the browser never sees the
 * account token and never calls Platform directly.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-greeting-bubble',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin (registered in `apply`). */
    const NS = 'greetingBubble';

    /** Where the reader last dropped the bubble, as viewport px. */
    const POSITION_KEY = 'dsh-greeting-bubble:position:v1';

    /** Normal refresh cadence while the page is visible, and the failure cap. */
    const BALANCE_REFRESH_MS = 60_000;
    const BALANCE_MAX_BACKOFF_MS = 300_000;

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

    /** True when a wallet amount is exactly zero (Platform sends decimal strings). */
    function isZeroAmount(value) {
      return Number(value) === 0;
    }

    /**
     * Turn one `getBalance` result into the amount text for the second bubble
     * line, or null when nothing sensible can be shown (signed out, failed, or
     * empty wallets). The caller adds the localized "balance" label.
     * @param balance - `AccountDetails['balance']` or null.
     * @param bonusLabel - localized "bonus" word.
     */
    function formatBalance(balance, bonusLabel) {
      if (!balance || balance.status !== 'ready' || !Array.isArray(balance.value)) return null;
      const normal = balance.value
        .filter((wallet) => wallet && typeof wallet.balance === 'string')
        .map((wallet) => currencySymbol(wallet.currency) + formatAmount(wallet.balance));
      if (normal.length === 0) return null;
      const bonus = (balance.bonusWallets ?? [])
        .filter((wallet) => wallet && typeof wallet.balance === 'string' && !isZeroAmount(wallet.balance))
        .map((wallet) => currencySymbol(wallet.currency) + formatAmount(wallet.balance));
      return bonus.length === 0 ? normal.join(' / ') : normal.join(' / ') + '（' + bonusLabel + ' ' + bonus.join(' / ') + '）';
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
  max-width: min(340px, calc(100vw - 40px));
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
.dsh-greeting-balance {
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
  overflow-wrap: anywhere;
  cursor: pointer;
  pointer-events: auto;
}
.dsh-greeting-balance:hover {
  color: var(--dsw-alias-label-secondary);
}
.dsh-greeting-balance:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid
    var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
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
     * @param props - the framework `t` seat plus the injected balance loader.
     * @returns the bubble, or null once the reader dismissed it.
     */
    function GreetingBubble({ t, loadBalance }) {
      const [dismissed, setDismissed] = React.useState(false);
      const [position, setPosition] = React.useState(readPosition);
      const [dragging, setDragging] = React.useState(false);
      const [walletText, setWalletText] = React.useState(null);
      const bubbleRef = React.useRef(null);
      const dragRef = React.useRef(null);
      const inFlightRef = React.useRef(null);
      const timerRef = React.useRef(null);
      const backoffRef = React.useRef(BALANCE_REFRESH_MS);
      const cancelledRef = React.useRef(false);

      const label = (key, fallback) => (typeof t === 'function' ? t(key) : fallback);

      /** Fetch once, deduplicating concurrent calls; resolves to wallet text or null. */
      function readBalance() {
        if (typeof loadBalance !== 'function') return Promise.resolve(null);
        if (inFlightRef.current !== null) return inFlightRef.current;
        const run = Promise.resolve()
          .then(() => loadBalance())
          .then((result) => {
            if (!result || result.ok !== true) return null;
            return formatBalance(result.value, label('bonus', '赠送'));
          })
          .catch(() => null)
          .finally(() => { inFlightRef.current = null; });
        inFlightRef.current = run;
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
        void readBalance().then((text) => {
          if (cancelledRef.current) return;
          setWalletText(text);
          backoffRef.current = text === null
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
        // The loader is stable for the registration's lifetime.
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
      const text = label('greeting', '你好，腾盛');
      const dismissLabel = label('dismiss', '关闭问候气泡');
      const balanceLine = label('balance', '余额') + ' ' + (walletText ?? label('unavailable', '--'));

      /** Manual refresh: reset the backoff and read once. */
      function handleBalanceClick(event) {
        event.stopPropagation();
        backoffRef.current = BALANCE_REFRESH_MS;
        void readBalance().then((value) => {
          if (!cancelledRef.current) setWalletText(value);
        });
      }

      /** Start a drag: switch to absolute coordinates and capture the pointer. */
      function handlePointerDown(event) {
        if (event.button !== undefined && event.button !== 0) return;
        if (event.target && event.target.closest && event.target.closest('button')) return;
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
            // `lang` pins the reading voice for this fixed Chinese phrase; the
            // status role lives on the text so the controls stay outside the
            // live region.
            h('span', { className: 'dsh-greeting-text', role: 'status', lang: 'zh-CN' }, text),
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
              key: 'balance',
              className: 'dsh-greeting-balance',
              type: 'button',
              title: label('refreshBalance', '刷新余额'),
              onClick: handleBalanceClick,
            },
            balanceLine,
          ),
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
              unavailable: '--',
              refreshBalance: '刷新余额',
            },
            en: {
              greeting: '你好，腾盛',
              dismiss: 'Dismiss greeting',
              balance: 'Balance',
              bonus: 'Bonus',
              unavailable: '--',
              refreshBalance: 'Refresh balance',
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
        const loadBalance = () => {
          const account = ctx.remote && ctx.remote.account;
          if (!account || typeof account.getBalance !== 'function') {
            throw new Error('account service unavailable');
          }
          return account.getBalance(metadata());
        };
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'greeting-bubble',
          order: 50,
          locale: NS,
          inject: () => ({ loadBalance }),
        }, GreetingBubble));
      },
    };
  },
});
