/**
 * Browser half of dsh-plugin-greeting-bubble.
 *
 * Loaded lazily by the DSH client module table: this file only registers a
 * factory. The factory returns a Cordis plugin whose `apply` owns every live
 * resource through `ctx.effect` / `ctx.slots.inject`, so disabling or removing
 * the bundle removes the bubble again without a reload.
 *
 * Rendering surface: the `shell.overlay` list slot declared by
 * `@deepseek-ai/dsh-client-ui-layout`. It is a frame-wide, click-through layer
 * above every column, so the bubble floats over the whole app without moving
 * any host control. Registering a fresh `id` adds an entry beside the shipped
 * ones instead of replacing them.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-greeting-bubble',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin (registered in `apply`). */
    const NS = 'greetingBubble';

    /**
     * Component-local stylesheet; unmounting the entry removes it with the
     * node.
     *
     * Placement notes:
     * - 84px above the bottom edge clears the composer's 34px send button and
     *   its card padding, so the greeting never covers the primary control.
     * - The card itself is click-through (`pointer-events: none`); only the
     *   dismiss button opts back in, so a residual overlap can never swallow a
     *   click meant for the app underneath.
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
  pointer-events: none;
  animation: dsh-greeting-in 320ms cubic-bezier(0.22, 0.8, 0.24, 1) 350ms both;
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
      if (dismissed) return null;
      const text = typeof t === 'function' ? t('greeting') : '你好，腾盛';
      const dismissLabel = typeof t === 'function' ? t('dismiss') : '关闭问候气泡';
      return h(
        'div',
        { className: 'dsh-greeting-layer', style: { position: 'absolute', inset: 0, pointerEvents: 'none' } },
        h('style', { key: 'styles' }, STYLES),
        h(
          'div',
          { className: 'dsh-greeting-bubble', key: 'bubble' },
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
