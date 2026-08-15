window.__ModuleLoader__.load({
  id: "dsh-balance-widget",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const { createElement, useState, useEffect } = require("react");

    const REFRESH_MS = 60000;
    const RETRY_MS = 10000;
    const ERROR_THRESHOLD = 3;
    const LOW_ORANGE = 5;
    const LOW_RED = 2;
    const BREATHE_BELOW = 1; // 余额 ≤ 1 元时芯片持续呼吸脉冲
    const ENDPOINT = "/dsh-balance-widget/balance";
    const PLATFORM_URL = "https://platform.deepseek.com/balance";

    function fmt(n, currency) {
      return (typeof n === "number" ? n.toFixed(2) : "—") + (currency ? " " + currency : "");
    }

    // 纯渲染逻辑:根据 host 返回的数据算出要显示的文本行与告警
    function buildContent(data) {
      const out = { alert: null, warn: null, line: null };
      if (data === null) return out;
      if (data.ok) {
        if (data.isAvailable === false) out.alert = "⚠️ 账户状态异常";
        const granted = Number(data.granted);
        if (granted > 0) {
          out.line = "余额:" + fmt(data.balance, "") + " · 充值:" + fmt(data.toppedUp, "") + " · 赠送:" + fmt(data.granted, data.currency);
        } else {
          out.line = "余额:" + fmt(data.balance, data.currency);
        }
        return out;
      }
      const lastGood = data.lastGood || null;
      if (data.consecutiveFailures >= ERROR_THRESHOLD) {
        out.warn = "⚠️ 余额接口无法访问,正在重试";
      }
      if (lastGood) {
        const granted = Number(lastGood.granted);
        if (granted > 0) {
          out.line = "余额:" + fmt(lastGood.balance, "") + " · 充值:" + fmt(lastGood.toppedUp, "") + " · 赠送:" + fmt(lastGood.granted, lastGood.currency);
        } else {
          out.line = "余额:" + fmt(lastGood.balance, lastGood.currency);
        }
      }
      return out;
    }

    // 状态分级:normal(正常) / low(低于¥5) / critical(低于¥2) / warn(接口异常) / alert(账户异常)
    function toneOf(data) {
      if (data === null) return "normal";
      let bal = null;
      if (data.ok) bal = Number(data.balance);
      else if (data.lastGood) bal = Number(data.lastGood.balance);
      if (data.ok && data.isAvailable === false) return "alert";
      if (!data.ok && data.consecutiveFailures >= ERROR_THRESHOLD) return "warn";
      if (bal !== null && bal < LOW_RED) return "critical";
      if (bal !== null && bal < LOW_ORANGE) return "low";
      return "normal";
    }

    // 极低余额:余额 ≤ ¥1 时芯片持续呼吸脉冲(接口失败时沿用最近一次好数据判断)
    function breatheOf(data) {
      if (data === null) return false;
      const bal = data.ok ? Number(data.balance) : data.lastGood ? Number(data.lastGood.balance) : null;
      return bal !== null && bal <= BREATHE_BELOW;
    }

    function BalanceWidget() {
      const [data, setData] = useState(null);
      useEffect(() => {
        let alive = true;
        let retryTimer = null;
        const scheduleRetry = () => {
          if (retryTimer === null) retryTimer = setTimeout(() => { retryTimer = null; load(); }, RETRY_MS);
        };
        const load = async () => {
          try {
            const res = await fetch(ENDPOINT, { cache: "no-store" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const json = await res.json();
            if (!alive) return;
            setData(json);
            if (json.ok) {
              if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null; }
            } else {
              scheduleRetry();
            }
          } catch (err) {
            if (!alive) return;
            setData({ ok: false, consecutiveFailures: ERROR_THRESHOLD, lastGood: null });
            scheduleRetry();
          }
        };
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => { alive = false; clearInterval(timer); if (retryTimer !== null) clearTimeout(retryTimer); };
      }, []);

      // 行内紧凑芯片:透明、无边框、状态色 + 单击打开官方余额页
      const chipStyle = {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "0 8px",
        height: "28px",
        borderRadius: "8px",
        textDecoration: "none",
        color: "var(--dsw-alias-label-secondary)",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        fontSize: "13px",
        lineHeight: "20px",
        userSelect: "none",
        cursor: "pointer"
      };
      const TONES = {
        normal:  "var(--dsw-alias-label-secondary)",
        low:     "#e8710a",
        critical:"#d93025",
        warn:    "#e8710a",
        alert:   "#d93025"
      };

      const { alert, warn, line } = buildContent(data);
      const tone = toneOf(data);
      const breathe = breatheOf(data);
      const text = alert || warn || line || "余额:—";
      const breatheStyle = breathe ? { animation: "dsh-balance-breathe 2s ease-in-out infinite" } : {};
      return createElement("a", {
        href: PLATFORM_URL,
        target: "_blank",
        rel: "noopener",
        title: "点击打开 DeepSeek 官方余额页",
        style: Object.assign({}, chipStyle, { color: TONES[tone] }, breatheStyle),
        ...breathe ? { "data-dsh-balance-breathe": "" } : {},
        onMouseEnter: (e) => { e.currentTarget.style.background = "rgba(128,128,128,0.15)"; },
        onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; }
      }, createElement("span", { key: "text" }, text));
    }

    const name = "balance-widget";
    const inject = ["slots"];

    function apply(ctx) {
      // 极低余额呼吸动画 + 无障碍(减少动态效果偏好)降级
      if (typeof document !== "undefined" && !document.getElementById("dsh-balance-widget-styles")) {
        const style = document.createElement("style");
        style.id = "dsh-balance-widget-styles";
        style.textContent = [
          "@keyframes dsh-balance-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }",
          "@media (prefers-reduced-motion: reduce) { [data-dsh-balance-breathe] { animation: none !important; } }"
        ].join("\n");
        document.head.appendChild(style);
      }
      ctx.effect(() => ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
        name: "conversation.input.left",
        id: "balance-widget",
        order: 10
      }, BalanceWidget)), "balance-widget: composer input left slot");
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.BalanceWidget = BalanceWidget;
    exports.buildContent = buildContent;
    exports.toneOf = toneOf;
    exports.breatheOf = breatheOf;
    return module.exports;
  }
});
