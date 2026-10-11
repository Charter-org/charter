import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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
import { ensureExchangeAccount, openLong, enrollReadKey, fetchPortfolio, type Portfolio, type ReadCreds } from "./lib/trade";
import { readTerms, proposeTrade, recentDecisions, deployMandate, pauseAgent, resumeAgent, updateTerms, type Decision } from "./lib/mandate";
import { PERPL, rawToUsd } from "./lib/perpl";

const MIN_AUSD = rawToUsd(PERPL.minAccountOpen); // 100

// Design tokens — slate base, one trust-blue accent, semantic green/red. Swiss-minimal, fintech-grade.
const C = {
  bg: "#080B12",
  surface: "#10141E",
  inputBg: "#0A0E16",
  border: "#1E2636",
  borderSoft: "#171E2B",
  text: "#EEF2F8",
  muted: "#99A2B5",
  faint: "#5F6B80",
  accent: "#4E6FFF",
  accentSoft: "rgba(78,111,255,0.14)",
  pos: "#35D08A",
  posSoft: "rgba(53,208,138,0.12)",
  neg: "#FF5A5A",
  negSoft: "rgba(255,90,90,0.12)",
  warn: "#E8B04B",
};
const F = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
};

type MsgTone = "allowed" | "refused" | "paused";

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [terms, setTerms] = useState<{ maxLeverageX: number; maxSlippagePct: number; drawdownPct: number } | null>(null);
  const [mandateMsg, setMandateMsg] = useState<{ tone: MsgTone; text: string } | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [stats, setStats] = useState<{ total: number; acted: number; abstained: number; peakLeverageX: number; peakSlippagePct: number } | null>(null);
  const [creds, setCreds] = useState<ReadCreds | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
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
      setStatus("Error — " + msg);
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshBalance = useCallback(async (w: Wallet) => {
    setBalance(await ausdBalance(w.address));
  }, []);

  // One on-chain read feeds both the activity feed (newest 8) and the track-record stats.
  // Every logged Decision is within bounds by construction — a breach reverts and emits nothing.
  const loadActivity = useCallback(async () => {
    const all = await recentDecisions(200, 3000).catch(() => []);
    setDecisions(all.slice(0, 8));
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
    readTerms().then(setTerms).catch(() => {});
    loadActivity();
  }, [wallet, loadActivity]);

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
              text: `${x}× exceeds your ${terms?.maxLeverageX.toFixed(2)}× cap. The contract reverted on-chain — no trade happened.`,
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
        setStatus("Agent paused — no trades possible until you resume.");
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
      setStatus("Trading account ready.");
    });

  const trade = () =>
    run("Opening BTC long on Perpl", async () => {
      if (!wallet) return;
      const tx = await openLong(wallet, { marketId: PERPL.marketIds.BTC, sizeScaled: 10 });
      setStatus("Long opened on Perpl · tx " + tx.slice(0, 10) + "…");
      await refreshBalance(wallet);
      if (creds) setPortfolio(await fetchPortfolio(creds));
    });

  const funded = balance != null && Number(balance) >= MIN_AUSD;

  if (!fontsLoaded && !fontError) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.mark} />
            <Text style={styles.brand}>CHARTER</Text>
          </View>
          <Chip label="Monad testnet" tone="dot" />
        </View>
        <Text style={styles.tagline}>Automated investing, with a guarantee.</Text>

        {!wallet ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in</Text>
            <Text style={styles.body}>Your account is a passkey — no seed phrase, no password, no extension.</Text>
            <Button label="Enter with Face ID" onPress={() => enter(false)} disabled={busy} />
            <Button label="Create a new account" variant="ghost" onPress={() => enter(true)} disabled={busy} />
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.eyebrow}>ACCOUNT</Text>
                <Pressable
                  onPress={() => run("Refreshing", async () => {
                    await refreshBalance(wallet);
                    await loadActivity();
                    if (creds) setPortfolio(await fetchPortfolio(creds));
                  })}
                  disabled={busy}
                  hitSlop={10}
                >
                  <Text style={styles.link}>Refresh</Text>
                </Pressable>
              </View>
              <Text style={styles.balance}>
                {balance ?? "—"} <Text style={styles.unit}>AUSD</Text>
              </Text>
              <Text selectable style={styles.mono}>{wallet.address}</Text>
            </View>

            {terms && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Your mandate</Text>
                <View style={styles.metricRow}>
                  <Metric value={`${terms.maxLeverageX.toFixed(2)}×`} label="MAX LEVERAGE" />
                  <Metric value={`${terms.maxSlippagePct.toFixed(2)}%`} label="MAX SLIPPAGE" divider />
                  <Metric value={`${terms.drawdownPct.toFixed(0)}%`} label="HEDGE AT" divider />
                </View>
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
                    {agentPaused ? "Agent is paused — it cannot trade." : "Agent is active, bounded by your limits."}
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

            {stats && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Track record</Text>
                <Text style={styles.balance}>
                  {stats.total} <Text style={styles.unit}>decisions</Text>
                </Text>
                <View style={styles.seal}>
                  <View style={[styles.dot, { backgroundColor: C.pos }]} />
                  <Text style={styles.sealText}>0 breaches — every one stayed within your mandate</Text>
                </View>
                {terms && (
                  <View style={styles.metricRow}>
                    <Metric value={`${stats.peakLeverageX.toFixed(2)}×`} label={`PEAK · ${terms.maxLeverageX.toFixed(1)}× CAP`} />
                    <Metric value={`${stats.peakSlippagePct.toFixed(2)}%`} label={`PEAK · ${terms.maxSlippagePct.toFixed(1)}% CAP`} divider />
                    <Metric value={`${stats.acted}/${stats.abstained}`} label="ACTED / HELD" divider />
                  </View>
                )}
                <Text style={styles.bodyFaint}>All verifiable on-chain — not a self-reported number.</Text>
              </View>
            )}

            {decisions.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Agent activity</Text>
                <Text style={styles.bodyFaint}>Every decision your agent makes — recorded on-chain.</Text>
                <View style={styles.feed}>
                  {decisions.map((d) => (
                    <View key={d.seq} style={styles.decisionRow}>
                      <View style={[styles.dot, { backgroundColor: d.acted ? C.accent : C.faint }]} />
                      <Text style={styles.decisionSeq}>#{d.seq}</Text>
                      <Text style={styles.decisionText} numberOfLines={1}>
                        {d.acted
                          ? `${d.action} · ${d.leverageX.toFixed(2)}× · ${d.slippagePct}%`
                          : `Abstained — ${d.reason}`}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Trade on Perpl</Text>
              {!funded && (
                <Text style={styles.warn}>
                  Fund at least {MIN_AUSD} AUSD to this address (testnet.perpl.xyz) to open a trading account.
                </Text>
              )}
              <Button label="Set up trading account" onPress={setupTrading} disabled={busy || !funded} />
              <Button label="Open BTC long" onPress={trade} disabled={busy || !accountReady} variant="ghost" />
            </View>

            {portfolio && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Portfolio</Text>
                <Text style={styles.balance}>
                  {portfolio.accountValue.toFixed(2)} <Text style={styles.unit}>AUSD</Text>
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

        {busy && <ActivityIndicator style={{ marginTop: 8 }} color={C.accent} />}
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </ScrollView>
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
  return (
    <View style={[styles.metric, divider && styles.metricDivider]}>
      <Text style={[styles.metricValue, tone === "pos" && { color: C.pos }, tone === "neg" && { color: C.neg }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Chip({ label, tone }: { label: string; tone?: "accent" | "pos" | "dot" }) {
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: "center", justifyContent: "center" },
  container: { padding: 20, paddingTop: (RNStatusBar.currentHeight ?? 24) + 24, paddingBottom: 56, gap: 14 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { width: 22, height: 22, borderRadius: 7, backgroundColor: C.accent, transform: [{ rotate: "45deg" }] },
  brand: { color: C.text, fontSize: 22, fontFamily: F.extrabold, letterSpacing: 3 },
  tagline: { color: C.muted, fontFamily: F.regular, fontSize: 15, marginTop: -6, marginBottom: 6 },

  card: { backgroundColor: C.surface, borderRadius: 20, padding: 20, gap: 14, borderWidth: 1, borderColor: C.borderSoft },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: C.text, fontSize: 17, fontFamily: F.bold, letterSpacing: 0.2 },
  eyebrow: { color: C.faint, fontSize: 11, fontFamily: F.semibold, letterSpacing: 1.4 },
  body: { color: C.muted, fontFamily: F.regular, fontSize: 14, lineHeight: 21 },
  bodyFaint: { color: C.faint, fontFamily: F.regular, fontSize: 13, lineHeight: 19 },
  warn: { color: C.warn, fontFamily: F.medium, fontSize: 13.5, lineHeight: 20 },
  link: { color: C.accent, fontFamily: F.semibold, fontSize: 14 },

  balance: { color: C.text, fontSize: 40, fontFamily: F.bold, letterSpacing: -1, fontVariant: ["tabular-nums"] },
  unit: { color: C.accent, fontSize: 18, fontFamily: F.semibold, letterSpacing: 0 },
  mono: { color: C.muted, fontFamily: "monospace", fontSize: 12.5, letterSpacing: -0.2 },

  // metric row (Robinhood/Mercury-style stat strip)
  metricRow: { flexDirection: "row", backgroundColor: C.inputBg, borderRadius: 14, borderWidth: 1, borderColor: C.borderSoft, paddingVertical: 14 },
  metric: { flex: 1, alignItems: "center", gap: 3, paddingHorizontal: 6 },
  metricDivider: { borderLeftWidth: 1, borderLeftColor: C.border },
  metricValue: { color: C.text, fontSize: 18, fontFamily: F.bold, fontVariant: ["tabular-nums"] },
  metricLabel: { color: C.faint, fontSize: 9.5, fontFamily: F.semibold, letterSpacing: 0.6, textAlign: "center" },

  pillRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  dot: { width: 7, height: 7, borderRadius: 4 },

  btnRow: { flexDirection: "row", gap: 10 },
  btn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontSize: 15, fontFamily: F.semibold, letterSpacing: 0.2 },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: C.border },
  btnGhostText: { color: C.text },
  btnDanger: { backgroundColor: C.negSoft, borderWidth: 1, borderColor: "rgba(255,90,90,0.4)" },
  btnDangerText: { color: C.neg },

  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: C.border },
  chipAccent: { backgroundColor: C.accentSoft, borderColor: "transparent" },
  chipPos: { backgroundColor: C.posSoft, borderColor: "transparent" },
  chipText: { color: C.muted, fontSize: 11.5, fontFamily: F.semibold, letterSpacing: 0.2 },

  // the hero: refusal / allowed banner
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
});
