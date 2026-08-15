window.__ModuleLoader__.load({
  id: "dsh-balance-widget",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const { createElement, useState, useEffect } = require("react");

    const REFRESH_MS = 60000;
    const ERROR_THRESHOLD = 3;
    const ENDPOINT = "/dsh-balance-widget/balance";

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

    function BalanceWidget() {
      const [data, setData] = useState(null);
      useEffect(() => {
        let alive = true;
        const load = async () => {
          try {
            const res = await fetch(ENDPOINT, { cache: "no-store" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const json = await res.json();
            if (alive) setData(json);
          } catch (err) {
            if (alive) setData({ ok: false, consecutiveFailures: ERROR_THRESHOLD, lastGood: null });
          }
        };
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => { alive = false; clearInterval(timer); };
      }, []);

      // 行内紧凑芯片:透明、无边框、与访问模式按钮同排
      const baseStyle = {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "0 6px",
        color: "var(--dsw-alias-label-secondary)",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        fontSize: "13px",
        lineHeight: "20px",
        userSelect: "none"
      };
      const alertStyle = { color: "#d93025", fontWeight: 600 };
      const warnStyle = { color: "#e8710a", fontWeight: 600 };

      const { alert, warn, line } = buildContent(data);
      const text = alert || warn || line || "余额:—";
      const style = alert ? alertStyle : warn ? warnStyle : baseStyle;
      return createElement("div", { style }, text);
    }

    const name = "balance-widget";
    const inject = ["slots"];

    function apply(ctx) {
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
    return module.exports;
  }
});