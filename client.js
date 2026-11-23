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
 * The bubble is draggable: pointer capture keeps the drag smooth, the card is
 * clamped to the viewport, and the chosen spot is remembered in localStorage
 * under `POSITION_KEY`.
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

    /**
     * Component-local stylesheet; unmounting the entry removes it with the
     * node.
     *
     * Placement notes:
     * - The default spot is 84px above the bottom edge, which clears the
     *   composer's 34px send button and its card padding.
     * - Once dragged, the card switches to explicit `left`/`top` coordinates
     *   and the reader's choice is remembered.
     * - The card now receives pointer events itself (it must, to be dragged);
     *   only the layer around it stays click-through.
     * - Radii and elevation reuse the host tokens, so the bubble reads as one
     *   of the app's own floating surfaces in both themes.
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
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  max-width: min(320px, calc(100vw - 40px));
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
     * @param props - the framework `t` seat bound to {@link NS}.
     * @returns the bubble, or null once the reader dismissed it.
     */
    function GreetingBubble({ t }) {
      const [dismissed, setDismissed] = React.useState(false);
      const [position, setPosition] = React.useState(readPosition);
      const [dragging, setDragging] = React.useState(false);
      const bubbleRef = React.useRef(null);
      const dragRef = React.useRef(null);

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
      const text = typeof t === 'function' ? t('greeting') : '你好，腾盛';
      const dismissLabel = typeof t === 'function' ? t('dismiss') : '关闭问候气泡';

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
          h('span', { className: 'dsh-greeting-wave', 'aria-hidden': 'true' }, '👋'),
          // `lang` pins the reading voice for this fixed Chinese phrase; the
          // status role lives on the text so the dismiss button stays outside
          // the live region.
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
      );
    }

    return {
      inject: ['slots', 'locale'],
      /**
       * Register the plugin's dictionary and its single overlay entry.
       * @param ctx - client plugin context.
       */
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, {
            // The greeting is the plugin's fixed signature phrase, so it stays
            // identical in every locale; only the control labels are localized.
            zh: { greeting: '你好，腾盛', dismiss: '关闭问候气泡' },
            en: { greeting: '你好，腾盛', dismiss: 'Dismiss greeting' },
          }),
          'greeting-bubble: dictionaries',
        );
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'greeting-bubble',
          order: 50,
          locale: NS,
        }, GreetingBubble));
      },
    };
  },
});
