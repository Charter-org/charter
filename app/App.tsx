import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { isMeraError } from "@category-labs/mera";
import { signIn, signUp, type Wallet } from "./lib/wallet";
import { ausdBalance } from "./lib/tokens";
import { ensureExchangeAccount, exchangeAccountId, openPosition, closePosition, enrollReadKey, fetchPortfolio, fetchPositions, fetchFills, type Portfolio, type ReadCreds, type OpenPosition, type Fill, type Side } from "./lib/trade";
import { readTerms, proposeTrade, recentDecisions, deployMandate, pauseAgent, resumeAgent, updateTerms, type Decision } from "./lib/mandate";
import { PERPL, rawToUsd } from "./lib/perpl";

const MIN_AUSD = rawToUsd(PERPL.minAccountOpen); // 100

// Two themed palettes. Translucent glass surfaces over a soft ambient; one trust-blue accent,
// semantic green/red. Same keys in both so makeStyles() stays theme-agnostic.
type Palette = typeof DARK;
const DARK = {
  bg: "#070A10",
  glass: "rgba(255,255,255,0.045)",
  glassBorder: "rgba(255,255,255,0.09)",
  glassHi: "rgba(255,255,255,0.16)",
  glassBar: "rgba(12,16,24,0.72)",
  inputBg: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  text: "#EEF2F8",
  muted: "#9AA4B6",
  faint: "#626E82",
  accent: "#5B7CFF",
  accentSoft: "rgba(91,124,255,0.16)",
  onAccent: "#FFFFFF",
  pos: "#35D08A",
  posSoft: "rgba(53,208,138,0.14)",
  neg: "#FF5C5C",
  negSoft: "rgba(255,92,92,0.14)",
  negBorder: "rgba(255,92,92,0.40)",
  warn: "#E8B04B",
  warnSoft: "rgba(232,176,75,0.12)",
  warnBorder: "rgba(232,176,75,0.30)",
  blobA: "rgba(91,124,255,0.18)",
  blobB: "rgba(45,212,191,0.10)",
};
const LIGHT: Palette = {
  bg: "#EEF1F7",
  glass: "rgba(255,255,255,0.66)",
  glassBorder: "rgba(16,24,40,0.08)",
  glassHi: "rgba(255,255,255,0.90)",
  glassBar: "rgba(255,255,255,0.74)",
  inputBg: "rgba(16,24,40,0.035)",
  border: "rgba(16,24,40,0.10)",
  borderSoft: "rgba(16,24,40,0.06)",
  text: "#0E1524",
  muted: "#55607A",
  faint: "#8A94A8",
  accent: "#3B5BFF",
  accentSoft: "rgba(59,91,255,0.12)",
  onAccent: "#FFFFFF",
  pos: "#0FA968",
  posSoft: "rgba(15,169,104,0.12)",
  neg: "#E5484D",
  negSoft: "rgba(229,72,77,0.12)",
  negBorder: "rgba(229,72,77,0.35)",
  warn: "#9A6700",
  warnSoft: "rgba(154,103,0,0.10)",
  warnBorder: "rgba(154,103,0,0.25)",
  blobA: "rgba(59,91,255,0.14)",
  blobB: "rgba(13,169,104,0.10)",
};

const F = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
};

const TOP_INSET = RNStatusBar.currentHeight ?? 24;
const TAB_BAR_H = 60;
const BOTTOM_INSET = 22; // ponytail: fixed; no safe-area-context installed. Generous so the bar clears gesture nav.

type Styles = ReturnType<typeof makeStyles>;
const ThemeCtx = createContext<{ C: Palette; styles: Styles; theme: "dark" | "light"; toggle: () => void }>(null as any);
const useTheme = () => useContext(ThemeCtx);

type TabKey = "home" | "mandate" | "activity" | "trade";
type IconName = "home" | "shield" | "activity" | "trade";
const TABS: { key: TabKey; label: string; icon: IconName; title: string }[] = [
  { key: "home", label: "Home", icon: "home", title: "CHARTER" },
  { key: "mandate", label: "Mandate", icon: "shield", title: "MANDATE" },
  { key: "activity", label: "Activity", icon: "activity", title: "ACTIVITY" },
  { key: "trade", label: "Trade", icon: "trade", title: "TRADE" },
];

type MsgTone = "allowed" | "refused" | "paused";
type Market = keyof typeof PERPL.marketIds;
const MARKETS = Object.keys(PERPL.marketIds) as Market[]; // BTC ETH SOL MON ZEC
const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const C = theme === "dark" ? DARK : LIGHT;
  const styles = useMemo(() => makeStyles(C), [C]);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  const ctx = useMemo(() => ({ C, styles, theme, toggle }), [C, styles, theme, toggle]);

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [tab, setTab] = useState<TabKey>("home");
  const [balance, setBalance] = useState<string | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");
  const [terms, setTerms] = useState<{ maxLeverageX: number; maxSlippagePct: number; drawdownPct: number } | null>(null);
  const [mandateMsg, setMandateMsg] = useState<{ tone: MsgTone; text: string } | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [stats, setStats] = useState<{ total: number; acted: number; abstained: number; peakLeverageX: number; peakSlippagePct: number } | null>(null);
  const [creds, setCreds] = useState<ReadCreds | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [fills, setFills] = useState<Fill[]>([]);
  const [market, setMarket] = useState<Market>("BTC");
  const [side, setSide] = useState<Side>("long");
  const [amount, setAmount] = useState("25");
  const [tradeLev, setTradeLev] = useState("2"); // synced to the mandate's leverage cap when terms load
  const [tradeMsg, setTradeMsg] = useState<{ tone: MsgTone; text: string } | null>(null);
  const [myLev, setMyLev] = useState("2");
  const [mySlip, setMySlip] = useState("0.5");
  const [myDd, setMyDd] = useState("10");
  const [myMandate, setMyMandate] = useState<string | null>(null);
  const [ownsMandate, setOwnsMandate] = useState(false);
  const [agentPaused, setAgentPaused] = useState(false);

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setStatus(label + "…");
    try {
      await fn();
    } catch (e: any) {
      // surface the native Credential Manager reason Mera wraps
      console.error(label, "code=", e?.code, "| cause=", e?.cause?.message ?? e?.cause, "| raw=", e);
      const cause = e?.cause?.message ?? e?.cause ? ` (${e?.cause?.message ?? e?.cause})` : "";
      const msg = isMeraError(e) ? `${e.code}: ${e.message}${cause}` : e?.message ?? String(e);
      setStatus("Error: " + msg);
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshBalance = useCallback(async (w: Wallet) => {
    setBalance(await ausdBalance(w.address));
  }, []);

  // One on-chain read feeds both the activity feed (newest 12) and the track-record stats.
  // Every logged Decision is within bounds by construction; a breach reverts and emits nothing.
  const loadActivity = useCallback(async () => {
    const all = await recentDecisions(200, 3000).catch(() => []);
    setDecisions(all.slice(0, 12));
    if (!all.length) return setStats(null);
    const acted = all.filter((d) => d.acted);
    setStats({
      total: all.length,
      acted: acted.length,
      abstained: all.length - acted.length,
      peakLeverageX: acted.reduce((m, d) => Math.max(m, d.leverageX), 0),
      peakSlippagePct: acted.reduce((m, d) => Math.max(m, d.slippagePct), 0),
    });
  }, []);

  const enter = (create: boolean) =>
    run(create ? "Creating your account" : "Signing in", async () => {
      const w = create ? await signUp() : await signIn();
      setWallet(w);
      setStatus("");
      await refreshBalance(w);
    });

  useEffect(() => {
    if (!wallet) return;
    readTerms().then((t) => { setTerms(t); setTradeLev(String(t.maxLeverageX)); }).catch(() => {});
    loadActivity();
    // Returning user: if the wallet already has a Perpl account, mark trading ready and load it.
    (async () => {
      try {
        if ((await exchangeAccountId(wallet.address)) === 0n) return;
        setAccountReady(true);
        const c = await enrollReadKey(wallet);
        setCreds(c);
        setPortfolio(await fetchPortfolio(c));
        setPositions(await fetchPositions(c));
        setFills(await fetchFills(c));
      } catch {
        /* best-effort; the Set up trading account button remains as fallback */
      }
    })();
  }, [wallet, loadActivity]);

  const refreshAll = useCallback(async () => {
    if (!wallet) return;
    setRefreshing(true);
    try {
      await refreshBalance(wallet);
      await loadActivity();
      if (creds) {
        setPortfolio(await fetchPortfolio(creds));
        setPositions(await fetchPositions(creds));
        setFills(await fetchFills(creds));
      }
    } catch {
      /* pull-to-refresh is best-effort */
    } finally {
      setRefreshing(false);
    }
  }, [wallet, creds, refreshBalance, loadActivity]);

  const propose = (leverageBps: number) => async () => {
    setBusy(true);
    setMandateMsg(null);
    try {
      const r = await proposeTrade(leverageBps, ownsMandate && wallet ? wallet.address : undefined);
      const x = (leverageBps / 10000).toFixed(2);
      setMandateMsg(
        r.allowed
          ? { tone: "allowed", text: `${x}× is within your mandate.` }
          : agentPaused
          ? { tone: "paused", text: "No trade is possible until you resume the agent." }
          : {
              tone: "refused",
              text: `${x}× exceeds your ${terms?.maxLeverageX.toFixed(2)}× cap. The contract reverted on-chain. No trade happened.`,
            },
      );
    } catch (e: any) {
      setMandateMsg({ tone: "refused", text: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  };

  const deployMine = () =>
    run("Deploying your mandate", async () => {
      if (!wallet) return;
      const addr = await deployMandate(wallet, {
        maxLeverageBps: Math.round(parseFloat(myLev) * 10000),
        maxSlippageBps: Math.round(parseFloat(mySlip) * 100),
        drawdownTriggerBps: Math.round(parseFloat(myDd) * 100),
      });
      setMyMandate(addr);
      setOwnsMandate(true);
      setAgentPaused(false);
      setMandateMsg(null);
      setTerms(await readTerms());
      await loadActivity();
      setStatus("Your mandate is live at " + addr.slice(0, 10) + "…");
    });

  const toggleAgent = () =>
    run(agentPaused ? "Resuming agent" : "Pausing agent", async () => {
      if (!wallet) return;
      if (agentPaused) {
        await resumeAgent(wallet);
        setAgentPaused(false);
        setStatus("Agent resumed.");
      } else {
        await pauseAgent(wallet);
        setAgentPaused(true);
        setStatus("Agent paused. No trades possible until you resume.");
      }
      setMandateMsg(null);
    });

  const updateLimits = () =>
    run("Updating your limits", async () => {
      if (!wallet) return;
      await updateTerms(wallet, {
        maxLeverageBps: Math.round(parseFloat(myLev) * 10000),
        maxSlippageBps: Math.round(parseFloat(mySlip) * 100),
        drawdownTriggerBps: Math.round(parseFloat(myDd) * 100),
      });
      setTerms(await readTerms());
      setMandateMsg(null);
      setStatus("Limits updated on-chain.");
    });

  const setupTrading = () =>
    run("Opening your Perpl account", async () => {
      if (!wallet) return;
      await ensureExchangeAccount(wallet);
      setAccountReady(true);
      const c = await enrollReadKey(wallet);
      setCreds(c);
      setPortfolio(await fetchPortfolio(c));
      setPositions(await fetchPositions(c));
      setFills(await fetchFills(c));
      setStatus("Trading account ready.");
    });

  const syncTrading = async (c: ReadCreds | null) => {
    if (!wallet) return;
    await refreshBalance(wallet);
    if (c) {
      setPortfolio(await fetchPortfolio(c));
      setPositions(await fetchPositions(c));
      setFills(await fetchFills(c));
    }
  };

  const trade = () =>
    run(`Opening ${market} ${side} on Perpl`, async () => {
      if (!wallet) return;
      setTradeMsg(null);
      const leverageX = Number(tradeLev);
      // Gate on the on-chain mandate first: it authorizes (or refuses) before any funds move. A trade
      // above your leverage cap is refused by the contract, so no order is ever placed out of bounds.
      const check = await proposeTrade(Math.round(leverageX * 10000), ownsMandate ? wallet.address : undefined);
      if (!check.allowed) {
        const why = check.reason === "LeverageExceeded" ? `${leverageX}× exceeds your ${terms?.maxLeverageX}× cap` : check.reason;
        setTradeMsg({ tone: "refused", text: `${why}. The mandate refused on-chain. No trade placed.` });
        setStatus(`Refused on-chain: ${why}. No trade placed.`);
        return;
      }
      const tx = await openPosition(wallet, { marketId: PERPL.marketIds[market], side, notionalUsd: Number(amount), leverageHdths: Math.round(leverageX * 100) });
      setStatus(`${market} ${side} opened at ${leverageX}× (within mandate) · tx ` + tx.slice(0, 10) + "…");
      await syncTrading(creds);
    });

  const close = (p: OpenPosition) =>
    run(`Closing ${p.symbol} ${p.side} on Perpl`, async () => {
      if (!wallet) return;
      const tx = await closePosition(wallet, { marketId: p.marketId, side: p.side, sizeScaled: p.sizeScaled });
      setStatus(`Position closed · tx ` + tx.slice(0, 10) + "…");
      await syncTrading(creds);
    });

  const funded = balance != null && Number(balance) >= MIN_AUSD;

  if (!fontsLoaded && !fontError) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  // ── Sign-in gate ──────────────────────────────────────────────
  if (!wallet) {
    return (
      <ThemeCtx.Provider value={ctx}>
        <View style={[styles.screen, styles.gate]}>
          <StatusBar style={theme === "dark" ? "light" : "dark"} />
          <Ambient />
          <View style={styles.gateToggle}>
            <ThemeToggle />
          </View>
          <View style={styles.gateBrand}>
            <View style={styles.markLg} />
            <Text style={styles.wordmark}>CHARTER</Text>
          </View>
          <Text style={styles.gateTagline}>Automated investing,{"\n"}with a guarantee.</Text>
          <Text style={styles.gateSub}>
            An autonomous agent trades for you on Monad, inside limits it cannot break. Enforced on-chain.
          </Text>
          <View style={styles.gateCard}>
            <Button label="Enter with Face ID" onPress={() => enter(false)} disabled={busy} />
            <Button label="Create a new account" variant="ghost" onPress={() => enter(true)} disabled={busy} />
            <Text style={styles.bodyFaint}>Your account is a passkey. No seed phrase, no password, no extension.</Text>
          </View>
          {busy && <ActivityIndicator color={C.accent} />}
          {status ? <Text style={styles.status}>{status}</Text> : <Chip label="Monad testnet" tone="dot" />}
        </View>
      </ThemeCtx.Provider>
    );
  }

  // ── Signed-in app: fixed header + tab content + fixed tab bar ──
  const title = TABS.find((t) => t.key === tab)!.title;
  return (
    <ThemeCtx.Provider value={ctx}>
      <View style={styles.screen}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <Ambient />

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.mark} />
            <Text style={styles.headerTitle}>{title}</Text>
          </View>
          <View style={styles.headerRight}>
            <ThemeToggle />
            <Chip label="Monad testnet" tone="dot" />
          </View>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.tabContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={C.accent} colors={[C.accent]} />
          }
        >
          {tab === "home" && (
            <>
              <View style={styles.hero}>
                <Text style={styles.heroLabel}>AVAILABLE BALANCE</Text>
                <Text style={styles.heroValue}>
                  {balance ?? "…"} <Text style={styles.heroUnit}>AUSD</Text>
                </Text>
                <View style={styles.addrRow}>
                  <View style={styles.pkChip}>
                    <View style={[styles.dot, { backgroundColor: C.pos }]} />
                    <Text style={styles.pkChipText}>PASSKEY</Text>
                  </View>
                  <Text selectable style={styles.addrText}>{short(wallet.address)}</Text>
                </View>
              </View>

              <View style={styles.pillActions}>
                <ActionPill name="trade" label="Trade" onPress={() => setTab("trade")} />
                <ActionPill name="shield" label="Mandate" onPress={() => setTab("mandate")} />
                <ActionPill name="activity" label="Activity" onPress={() => setTab("activity")} />
              </View>

              {!accountReady && !funded && (
                <Pressable style={({ pressed }) => [styles.hintCard, pressed && { opacity: 0.85 }]} onPress={() => setTab("trade")}>
                  <Text style={styles.hintText}>Fund {MIN_AUSD}+ AUSD to start trading on Perpl.</Text>
                  <Text style={styles.linkArrow}>Fund ›</Text>
                </Pressable>
              )}

              {terms && (
                <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} onPress={() => setTab("mandate")}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardTitle}>Your mandate</Text>
                    <Text style={styles.linkArrow}>Manage ›</Text>
                  </View>
                  <TermsStrip terms={terms} />
                  <View style={styles.statusRow}>
                    <View style={[styles.dot, { backgroundColor: agentPaused ? C.neg : C.pos }]} />
                    <Text style={styles.body}>
                      {agentPaused ? "Agent paused. It cannot trade." : "Agent active, bounded on-chain."}
                    </Text>
                  </View>
                </Pressable>
              )}

              {stats && (
                <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} onPress={() => setTab("activity")}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardTitle}>Track record</Text>
                    <Text style={styles.linkArrow}>View ›</Text>
                  </View>
                  <Text style={styles.balance}>
                    {stats.total} <Text style={styles.unit}>decisions</Text>
                  </Text>
                  <View style={styles.seal}>
                    <View style={[styles.dot, { backgroundColor: C.pos }]} />
                    <Text style={styles.sealText}>0 breaches. Every one stayed within your mandate.</Text>
                  </View>
                </Pressable>
              )}
            </>
          )}

          {tab === "mandate" && (
            <>
              {terms ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Your mandate</Text>
                  <TermsStrip terms={terms} />
                  <View style={styles.pillRow}>
                    <Chip label="Enforced on-chain" tone="accent" />
                    <Text style={styles.bodyFaint}>your agent cannot exceed it</Text>
                  </View>
                  <View style={styles.btnRow}>
                    <Button label="Attempt 3×" onPress={propose(30000)} disabled={busy} variant="ghost" flex />
                    <Button label="Try 1.5×" onPress={propose(15000)} disabled={busy} variant="ghost" flex />
                  </View>
                  {mandateMsg && <Banner tone={mandateMsg.tone} text={mandateMsg.text} />}
                </View>
              ) : (
                <View style={styles.card}>
                  <Text style={styles.body}>Loading your mandate…</Text>
                </View>
              )}

              {terms && !ownsMandate && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Create your own mandate</Text>
                  <Text style={styles.body}>Set your limits and deploy a mandate you own, on-chain.</Text>
                  <View style={styles.inputRow}>
                    <Field label="MAX LEV ×" value={myLev} onChange={setMyLev} />
                    <Field label="MAX SLIP %" value={mySlip} onChange={setMySlip} />
                    <Field label="HEDGE %" value={myDd} onChange={setMyDd} />
                  </View>
                  <Button label="Deploy my mandate" onPress={deployMine} disabled={busy} />
                </View>
              )}

              {terms && ownsMandate && (
                <View style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardTitle}>Manage your mandate</Text>
                    <Chip label="You own this" tone="pos" />
                  </View>
                  {myMandate && <Text style={styles.mono}>{myMandate}</Text>}
                  <View style={styles.statusRow}>
                    <View style={[styles.dot, { backgroundColor: agentPaused ? C.neg : C.pos }]} />
                    <Text style={styles.body}>
                      {agentPaused ? "Agent is paused. It cannot trade." : "Agent is active, bounded by your limits."}
                    </Text>
                  </View>
                  <Button
                    label={agentPaused ? "Resume agent" : "Pause agent · kill switch"}
                    onPress={toggleAgent}
                    disabled={busy}
                    variant={agentPaused ? "primary" : "danger"}
                  />
                  <View style={styles.divider} />
                  <Text style={styles.eyebrow}>ADJUST LIMITS</Text>
                  <Text style={styles.bodyFaint}>Enforced on-chain the moment you save.</Text>
                  <View style={styles.inputRow}>
                    <Field label="MAX LEV ×" value={myLev} onChange={setMyLev} />
                    <Field label="MAX SLIP %" value={mySlip} onChange={setMySlip} />
                    <Field label="HEDGE %" value={myDd} onChange={setMyDd} />
                  </View>
                  <Button label="Update limits" onPress={updateLimits} disabled={busy} variant="ghost" />
                </View>
              )}
            </>
          )}

          {tab === "activity" && (
            <>
              {stats ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Track record</Text>
                  <Text style={styles.heroValue}>
                    {stats.total} <Text style={styles.heroUnit}>decisions</Text>
                  </Text>
                  <View style={styles.seal}>
                    <View style={[styles.dot, { backgroundColor: C.pos }]} />
                    <Text style={styles.sealText}>0 breaches. Every one stayed within your mandate.</Text>
                  </View>
                  {terms && (
                    <View style={styles.metricRow}>
                      <Metric value={`${stats.peakLeverageX.toFixed(2)}×`} label={`PEAK · ${terms.maxLeverageX.toFixed(1)}× CAP`} />
                      <Metric value={`${stats.peakSlippagePct.toFixed(2)}%`} label={`PEAK · ${terms.maxSlippagePct.toFixed(1)}% CAP`} divider />
                      <Metric value={`${stats.acted}/${stats.abstained}`} label="ACTED / HELD" divider />
                    </View>
                  )}
                  <Text style={styles.bodyFaint}>All verifiable on-chain. Not a self-reported number.</Text>
                </View>
              ) : (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Track record</Text>
                  <Text style={styles.body}>No decisions recorded yet. Pull to refresh.</Text>
                </View>
              )}

              {fills.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Your trades</Text>
                  <Text style={styles.bodyFaint}>Your manual Perpl trades, settled on-chain.</Text>
                  <View style={styles.feed}>
                    {fills.map((f, i) => (
                      <View key={`${f.txid}-${i}`} style={styles.decisionRow}>
                        <View style={[styles.dot, { backgroundColor: f.side === "short" ? C.accent : C.pos }]} />
                        <Text style={styles.decisionText} numberOfLines={1}>
                          {f.action} {f.symbol} {f.side} · ${(f.size * f.priceUsd).toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Agent activity</Text>
                <Text style={styles.bodyFaint}>Every decision your agent makes, recorded on-chain.</Text>
                {decisions.length > 0 ? (
                  <View style={styles.feed}>
                    {decisions.map((d) => (
                      <View key={d.seq} style={styles.decisionRow}>
                        <View style={[styles.dot, { backgroundColor: d.acted ? C.accent : C.faint }]} />
                        <Text style={styles.decisionSeq}>#{d.seq}</Text>
                        <Text style={styles.decisionText} numberOfLines={1}>
                          {d.acted
                            ? `${d.action} · ${d.leverageX.toFixed(2)}× · ${d.slippagePct}%`
                            : `Abstained · ${d.reason}`}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.body}>No activity yet.</Text>
                )}
              </View>
            </>
          )}

          {tab === "trade" && (
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Trade on Perpl</Text>
                {!accountReady && !funded && (
                  <Text style={styles.warn}>
                    Fund at least {MIN_AUSD} AUSD to this address (testnet.perpl.xyz) to open a trading account.
                  </Text>
                )}
                <Text selectable style={styles.mono}>{wallet.address}</Text>
                {!accountReady && (
                  <Button label="Set up trading account" onPress={setupTrading} disabled={busy || !funded} />
                )}
                {accountReady && (
                  <>
                    <View style={styles.mktRow}>
                      {MARKETS.map((m) => (
                        <Pressable key={m} onPress={() => setMarket(m)} disabled={busy} style={[styles.mkt, market === m && styles.mktOn]}>
                          <Text style={[styles.mktText, market === m && styles.mktTextOn]}>{m}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.segment}>
                      <Button label="Long" flex onPress={() => setSide("long")} variant={side === "long" ? "primary" : "ghost"} disabled={busy} />
                      <Button label="Short" flex onPress={() => setSide("short")} variant={side === "short" ? "primary" : "ghost"} disabled={busy} />
                    </View>
                    <Field label="Notional (USD)" value={amount} onChange={setAmount} />
                    <Field label={`Leverage (×) · max ${terms ? terms.maxLeverageX : "?"}×`} value={tradeLev} onChange={setTradeLev} />
                    <Text style={styles.bodyFaint}>Every order is checked against your on-chain mandate before it is placed.</Text>
                  </>
                )}
                <Button label={`Open ${market} ${side}`} onPress={trade} disabled={busy || !accountReady || !(Number(amount) > 0) || !(Number(tradeLev) > 0)} variant={accountReady ? "primary" : "ghost"} />
                {tradeMsg && <Banner tone={tradeMsg.tone} text={tradeMsg.text} />}
              </View>

              {positions.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Open positions</Text>
                  {positions.map((p, i) => (
                    <View key={`${p.marketId}-${i}`} style={styles.segment}>
                      <View style={styles.posHead}>
                        <Chip label={p.side === "short" ? "SHORT" : "LONG"} tone={p.side === "short" ? "accent" : "pos"} />
                        <Text style={styles.body}>{p.symbol} · ${p.notionalUsd.toFixed(2)}</Text>
                      </View>
                      <Button label="Close" onPress={() => close(p)} disabled={busy} variant="danger" />
                    </View>
                  ))}
                </View>
              )}

              {portfolio && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Portfolio</Text>
                  <Text style={styles.heroValue}>
                    {portfolio.accountValue.toFixed(2)} <Text style={styles.heroUnit}>AUSD</Text>
                  </Text>
                  <View style={styles.metricRow}>
                    <Metric
                      value={`${portfolio.realizedPnl >= 0 ? "+" : ""}${portfolio.realizedPnl.toFixed(2)}`}
                      label="REALIZED PNL"
                      tone={portfolio.realizedPnl >= 0 ? "pos" : "neg"}
                    />
                    <Metric value={portfolio.volume.toFixed(0)} label="VOLUME" divider />
                    <Metric value={`${portfolio.openPositions}`} label="OPEN" divider />
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {(busy || !!status) && (
          <View style={styles.toast}>
            {busy && <ActivityIndicator size="small" color={C.accent} />}
            {status ? <Text style={styles.toastText} numberOfLines={2}>{status}</Text> : null}
          </View>
        )}

        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable key={t.key} style={styles.tabItem} onPress={() => setTab(t.key)} hitSlop={8}>
                {active && <View style={styles.tabIndicator} />}
                <Icon name={t.icon} color={active ? C.accent : C.faint} />
                <Text style={[styles.tabLabel, active && { color: C.accent }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ThemeCtx.Provider>
  );
}

// ── soft ambient tint behind the glass (no blur dep) ─────────────
function Ambient() {
  const { C } = useTheme();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ position: "absolute", top: -130, right: -90, width: 330, height: 330, borderRadius: 165, backgroundColor: C.blobA }} />
      <View style={{ position: "absolute", bottom: -150, left: -110, width: 360, height: 360, borderRadius: 180, backgroundColor: C.blobB }} />
    </View>
  );
}

function ThemeToggle() {
  const { styles, toggle } = useTheme();
  return (
    <Pressable onPress={toggle} hitSlop={8} style={styles.themeBtn}>
      <View style={styles.themeIconOuter}>
        <View style={styles.themeIconFill} />
      </View>
    </Pressable>
  );
}

// ── View-drawn icons (no icon dep) ───────────────────────────────
function Icon({ name, color, size = 22 }: { name: IconName; color: string; size?: number }) {
  const s = size;
  if (name === "home") {
    return (
      <View style={{ width: s, height: s, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 0, height: 0, borderLeftWidth: s * 0.34, borderRightWidth: s * 0.34, borderBottomWidth: s * 0.3, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: color }} />
        <View style={{ width: s * 0.5, height: s * 0.36, borderWidth: 2, borderTopWidth: 0, borderColor: color }} />
      </View>
    );
  }
  if (name === "shield") {
    // padlock: cannot break
    return (
      <View style={{ width: s, height: s, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: s * 0.4, height: s * 0.3, borderWidth: 2, borderBottomWidth: 0, borderTopLeftRadius: s * 0.2, borderTopRightRadius: s * 0.2, borderColor: color, marginBottom: -1 }} />
        <View style={{ width: s * 0.6, height: s * 0.46, borderRadius: 3, borderWidth: 2, borderColor: color }} />
      </View>
    );
  }
  if (name === "activity") {
    return (
      <View style={{ width: s, height: s, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: s * 0.12 }}>
        {[0.45, 0.78, 0.6].map((h, i) => (
          <View key={i} style={{ width: s * 0.15, height: s * h, borderRadius: 2, backgroundColor: color }} />
        ))}
      </View>
    );
  }
  // trade: up-right trend arrow
  return (
    <View style={{ width: s, height: s, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: s * 0.6, height: 2, backgroundColor: color, transform: [{ rotate: "-45deg" }] }} />
      <View style={{ position: "absolute", top: s * 0.26, right: s * 0.26, width: s * 0.26, height: s * 0.26, borderTopWidth: 2, borderRightWidth: 2, borderColor: color }} />
    </View>
  );
}

function ActionPill({ name, label, onPress }: { name: IconName; label: string; onPress: () => void }) {
  const { styles, C } = useTheme();
  return (
    <Pressable style={({ pressed }) => [styles.actionPill, pressed && { opacity: 0.8 }]} onPress={onPress} hitSlop={6}>
      <View style={styles.actionPillIcon}>
        <Icon name={name} color={C.accent} size={20} />
      </View>
      <Text style={styles.actionPillLabel}>{label}</Text>
    </Pressable>
  );
}

function TermsStrip({ terms }: { terms: { maxLeverageX: number; maxSlippagePct: number; drawdownPct: number } }) {
  const { styles } = useTheme();
  return (
    <View style={styles.metricRow}>
      <Metric value={`${terms.maxLeverageX.toFixed(2)}×`} label="MAX LEVERAGE" />
      <Metric value={`${terms.maxSlippagePct.toFixed(2)}%`} label="MAX SLIPPAGE" divider />
      <Metric value={`${terms.drawdownPct.toFixed(0)}%`} label="HEDGE AT" divider />
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
  variant = "primary",
  flex,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  flex?: boolean;
}) {
  const { styles } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        variant === "ghost" && styles.btnGhost,
        variant === "danger" && styles.btnDanger,
        flex && { flex: 1 },
        pressed && { opacity: 0.85 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text
        style={[
          styles.btnText,
          variant === "ghost" && styles.btnGhostText,
          variant === "danger" && styles.btnDangerText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { styles, C } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        selectTextOnFocus
        style={styles.input}
        placeholderTextColor={C.faint}
      />
    </View>
  );
}

function Metric({ value, label, divider, tone }: { value: string; label: string; divider?: boolean; tone?: "pos" | "neg" }) {
  const { styles, C } = useTheme();
  return (
    <View style={[styles.metric, divider && styles.metricDivider]}>
      <Text style={[styles.metricValue, tone === "pos" && { color: C.pos }, tone === "neg" && { color: C.neg }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Chip({ label, tone }: { label: string; tone?: "accent" | "pos" | "dot" }) {
  const { styles, C } = useTheme();
  return (
    <View style={[styles.chip, tone === "accent" && styles.chipAccent, tone === "pos" && styles.chipPos]}>
      {tone === "dot" && <View style={[styles.dot, { backgroundColor: C.pos }]} />}
      <Text
        style={[styles.chipText, tone === "accent" && { color: C.accent }, tone === "pos" && { color: C.pos }]}
      >
        {label}
      </Text>
    </View>
  );
}

function Banner({ tone, text }: { tone: MsgTone; text: string }) {
  const { styles, C } = useTheme();
  const pos = tone === "allowed";
  const title = tone === "allowed" ? "ALLOWED" : tone === "paused" ? "AGENT PAUSED" : "REFUSED ON-CHAIN";
  return (
    <View style={[styles.banner, { backgroundColor: pos ? C.posSoft : C.negSoft }]}>
      <View style={[styles.bannerBar, { backgroundColor: pos ? C.pos : C.neg }]} />
      <View style={styles.bannerBody}>
        <Text style={[styles.bannerTitle, { color: pos ? C.pos : C.neg }]}>{title}</Text>
        <Text style={styles.bannerText}>{text}</Text>
      </View>
    </View>
  );
}

function makeStyles(C: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg, overflow: "hidden" },
    flex: { flex: 1 },
    center: { alignItems: "center", justifyContent: "center" },

    // ── sign-in gate ──
    gate: { paddingHorizontal: 28, paddingTop: TOP_INSET + 40, justifyContent: "center", gap: 18, paddingBottom: 48 },
    gateToggle: { position: "absolute", top: TOP_INSET + 14, right: 22 },
    gateBrand: { flexDirection: "row", alignItems: "center", gap: 12 },
    gateTagline: { color: C.text, fontFamily: F.extrabold, fontSize: 32, lineHeight: 38, letterSpacing: -0.5 },
    gateSub: { color: C.muted, fontFamily: F.regular, fontSize: 15, lineHeight: 22 },
    gateCard: { backgroundColor: C.glass, borderRadius: 20, padding: 20, gap: 12, borderWidth: 1, borderColor: C.glassBorder, borderTopColor: C.glassHi, marginTop: 8 },
    markLg: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.accent, transform: [{ rotate: "45deg" }] },
    wordmark: { color: C.text, fontSize: 26, fontFamily: F.extrabold, letterSpacing: 4 },

    // ── fixed header ──
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: TOP_INSET + 12,
      paddingBottom: 14,
      backgroundColor: C.glassBar,
      borderBottomWidth: 1,
      borderBottomColor: C.glassBorder,
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 11 },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
    mark: { width: 20, height: 20, borderRadius: 6, backgroundColor: C.accent, transform: [{ rotate: "45deg" }] },
    headerTitle: { color: C.text, fontSize: 18, fontFamily: F.extrabold, letterSpacing: 2.5 },

    // ── theme toggle ──
    themeBtn: { width: 34, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassBorder },
    themeIconOuter: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.text, overflow: "hidden", alignItems: "flex-start", justifyContent: "center" },
    themeIconFill: { position: "absolute", left: 0, top: 0, bottom: 0, width: "50%", backgroundColor: C.text },

    // ── tab content scroll ──
    tabContent: { padding: 20, paddingTop: 18, paddingBottom: TAB_BAR_H + BOTTOM_INSET + 80, gap: 14 },

    // ── home hero ──
    hero: { paddingVertical: 8, gap: 10 },
    heroLabel: { color: C.faint, fontSize: 11, fontFamily: F.semibold, letterSpacing: 1.6 },
    heroValue: { color: C.text, fontSize: 46, fontFamily: F.extrabold, letterSpacing: -1.5, fontVariant: ["tabular-nums"] },
    heroUnit: { color: C.accent, fontSize: 20, fontFamily: F.bold, letterSpacing: 0 },
    addrRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    pkChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: C.posSoft },
    pkChipText: { color: C.pos, fontSize: 10, fontFamily: F.bold, letterSpacing: 1 },
    addrText: { color: C.muted, fontFamily: "monospace", fontSize: 13 },

    // ── action pills ──
    pillActions: { flexDirection: "row", gap: 12 },
    actionPill: { flex: 1, alignItems: "center", gap: 8, backgroundColor: C.glass, borderRadius: 16, paddingVertical: 16, borderWidth: 1, borderColor: C.glassBorder, borderTopColor: C.glassHi },
    actionPillIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.accentSoft, alignItems: "center", justifyContent: "center" },
    actionPillLabel: { color: C.text, fontSize: 13, fontFamily: F.semibold },

    // ── funding hint ──
    hintCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.warnSoft, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: C.warnBorder },
    hintText: { color: C.warn, fontFamily: F.medium, fontSize: 13.5, flex: 1 },

    // ── cards ──
    card: { backgroundColor: C.glass, borderRadius: 20, padding: 20, gap: 14, borderWidth: 1, borderColor: C.glassBorder, borderTopColor: C.glassHi },
    cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    cardTitle: { color: C.text, fontSize: 17, fontFamily: F.bold, letterSpacing: 0.2 },
    eyebrow: { color: C.faint, fontSize: 11, fontFamily: F.semibold, letterSpacing: 1.4 },
    body: { color: C.muted, fontFamily: F.regular, fontSize: 14, lineHeight: 21 },
    bodyFaint: { color: C.faint, fontFamily: F.regular, fontSize: 13, lineHeight: 19 },
    warn: { color: C.warn, fontFamily: F.medium, fontSize: 13.5, lineHeight: 20 },
    link: { color: C.accent, fontFamily: F.semibold, fontSize: 14 },
    linkArrow: { color: C.accent, fontFamily: F.semibold, fontSize: 13.5 },

    balance: { color: C.text, fontSize: 36, fontFamily: F.bold, letterSpacing: -1, fontVariant: ["tabular-nums"] },
    unit: { color: C.accent, fontSize: 17, fontFamily: F.semibold, letterSpacing: 0 },
    mono: { color: C.muted, fontFamily: "monospace", fontSize: 12.5, letterSpacing: -0.2 },

    metricRow: { flexDirection: "row", backgroundColor: C.inputBg, borderRadius: 14, borderWidth: 1, borderColor: C.borderSoft, paddingVertical: 14 },
    metric: { flex: 1, alignItems: "center", gap: 3, paddingHorizontal: 6 },
    metricDivider: { borderLeftWidth: 1, borderLeftColor: C.border },
    metricValue: { color: C.text, fontSize: 18, fontFamily: F.bold, fontVariant: ["tabular-nums"] },
    metricLabel: { color: C.faint, fontSize: 9.5, fontFamily: F.semibold, letterSpacing: 0.6, textAlign: "center" },

    pillRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 9 },
    dot: { width: 7, height: 7, borderRadius: 4 },

    btnRow: { flexDirection: "row", gap: 10 },
    btn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
    segment: { flexDirection: "row", gap: 10, alignItems: "center" },
    posHead: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
    mktRow: { flexDirection: "row", gap: 6 },
    mkt: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: "center" },
    mktOn: { backgroundColor: C.accentSoft, borderColor: C.accent },
    mktText: { color: C.muted, fontFamily: F.medium, fontSize: 13, letterSpacing: 0.3 },
    mktTextOn: { color: C.accent },
    btnText: { color: C.onAccent, fontSize: 15, fontFamily: F.semibold, letterSpacing: 0.2 },
    btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: C.border },
    btnGhostText: { color: C.text },
    btnDanger: { backgroundColor: C.negSoft, borderWidth: 1, borderColor: C.negBorder },
    btnDangerText: { color: C.neg },

    chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: C.border },
    chipAccent: { backgroundColor: C.accentSoft, borderColor: "transparent" },
    chipPos: { backgroundColor: C.posSoft, borderColor: "transparent" },
    chipText: { color: C.muted, fontSize: 11.5, fontFamily: F.semibold, letterSpacing: 0.2 },

    banner: { flexDirection: "row", borderRadius: 13, overflow: "hidden", marginTop: 2 },
    bannerBar: { width: 4 },
    bannerBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, gap: 3 },
    bannerTitle: { fontSize: 12, fontFamily: F.bold, letterSpacing: 1 },
    bannerText: { color: C.text, fontSize: 13.5, fontFamily: F.regular, lineHeight: 19 },

    seal: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: C.posSoft, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 13 },
    sealText: { color: C.pos, fontSize: 13.5, fontFamily: F.semibold, flex: 1 },

    feed: { gap: 11, marginTop: 2 },
    decisionRow: { flexDirection: "row", gap: 10, alignItems: "center" },
    decisionSeq: { color: C.faint, fontFamily: "monospace", fontSize: 12, width: 32, fontVariant: ["tabular-nums"] },
    decisionText: { color: C.muted, fontFamily: F.regular, fontSize: 13.5, flex: 1 },

    divider: { height: 1, backgroundColor: C.border, marginVertical: 2 },

    inputRow: { flexDirection: "row", gap: 10 },
    field: { flex: 1, gap: 6 },
    fieldLabel: { color: C.faint, fontSize: 10, fontFamily: F.semibold, letterSpacing: 0.6 },
    input: { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, borderRadius: 12, color: C.text, paddingVertical: 12, paddingHorizontal: 13, fontSize: 17, fontFamily: F.semibold, textAlign: "center", fontVariant: ["tabular-nums"] },

    status: { color: C.muted, fontFamily: F.regular, fontSize: 13.5, marginTop: 8, textAlign: "center" },

    // ── floating status toast ──
    toast: {
      position: "absolute",
      left: 16,
      right: 16,
      bottom: TAB_BAR_H + BOTTOM_INSET + 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: C.glassBar,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: C.border,
      paddingVertical: 12,
      paddingHorizontal: 15,
    },
    toastText: { color: C.text, fontFamily: F.medium, fontSize: 13, flex: 1 },

    // ── fixed bottom tab bar ──
    tabBar: {
      flexDirection: "row",
      height: TAB_BAR_H,
      paddingBottom: BOTTOM_INSET,
      backgroundColor: C.glassBar,
      borderTopWidth: 1,
      borderTopColor: C.glassBorder,
    },
    tabItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 5, paddingTop: 10 },
    tabIndicator: { position: "absolute", top: 0, width: 26, height: 2.5, borderRadius: 2, backgroundColor: C.accent },
    tabLabel: { color: C.faint, fontSize: 10.5, fontFamily: F.semibold, letterSpacing: 0.2 },
  });
}
