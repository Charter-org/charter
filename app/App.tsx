import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { isMeraError } from "@category-labs/mera";
import { signIn, signUp, type Wallet } from "./lib/wallet";
import { ausdBalance } from "./lib/tokens";
import { ensureExchangeAccount, openLong, enrollReadKey, fetchPortfolio, type Portfolio, type ReadCreds } from "./lib/trade";
import { readTerms, proposeTrade, recentDecisions, deployMandate, type Decision } from "./lib/mandate";
import { PERPL, rawToUsd } from "./lib/perpl";

const MIN_AUSD = rawToUsd(PERPL.minAccountOpen); // 100

export default function App() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [terms, setTerms] = useState<{ maxLeverageX: number; maxSlippagePct: number; drawdownPct: number } | null>(null);
  const [mandateMsg, setMandateMsg] = useState<{ text: string; refused: boolean } | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [creds, setCreds] = useState<ReadCreds | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [myLev, setMyLev] = useState("2");
  const [mySlip, setMySlip] = useState("0.5");
  const [myDd, setMyDd] = useState("10");
  const [myMandate, setMyMandate] = useState<string | null>(null);

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
      setStatus("⚠ " + msg);
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshBalance = useCallback(async (w: Wallet) => {
    setBalance(await ausdBalance(w.address));
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
    recentDecisions().then(setDecisions).catch(() => {});
  }, [wallet]);

  const propose = (leverageBps: number) => async () => {
    setBusy(true);
    setMandateMsg(null);
    try {
      const r = await proposeTrade(leverageBps);
      const x = (leverageBps / 10000).toFixed(2);
      setMandateMsg(
        r.allowed
          ? { refused: false, text: `✓ Allowed — ${x}× is within your mandate.` }
          : {
              refused: true,
              text: `⛔ Refused by your mandate — ${x}× exceeds your ${terms?.maxLeverageX.toFixed(
                2,
              )}× cap. The contract reverted on-chain; no trade happened.`,
            },
      );
    } catch (e: any) {
      setMandateMsg({ refused: true, text: "⚠ " + (e?.message ?? String(e)) });
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
      setMandateMsg(null);
      setTerms(await readTerms());
      setDecisions(await recentDecisions().catch(() => []));
      setStatus("✓ Your mandate is live at " + addr.slice(0, 10) + "…");
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
      setStatus("✓ Long opened on Perpl · tx " + tx.slice(0, 10) + "…");
      await refreshBalance(wallet);
      if (creds) setPortfolio(await fetchPortfolio(creds));
    });

  const funded = balance != null && Number(balance) >= MIN_AUSD;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>CHARTER</Text>
        <Text style={styles.tagline}>Automated investing, with a guarantee.</Text>

        {!wallet ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in</Text>
            <Text style={styles.muted}>Your account is a passkey — no seed phrase, no password.</Text>
            <Button label="Enter with Face ID" onPress={() => enter(false)} disabled={busy} />
            <Button label="Create a new account" variant="ghost" onPress={() => enter(true)} disabled={busy} />
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Account</Text>
              <Text selectable style={styles.mono}>{wallet.address}</Text>
              <Text style={styles.balance}>{balance ?? "—"} <Text style={styles.ausd}>AUSD</Text></Text>
              <Button label="Refresh" variant="ghost" onPress={() => run("Refreshing", () => refreshBalance(wallet))} disabled={busy} />
            </View>

            {terms && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Your mandate</Text>
                <Text style={styles.muted}>
                  Max {terms.maxLeverageX.toFixed(2)}× leverage · Max {terms.maxSlippagePct.toFixed(2)}% slippage · Hedge at {terms.drawdownPct.toFixed(0)}% drawdown
                </Text>
                <Text style={styles.muted}>Enforced on-chain — your agent cannot exceed it.</Text>
                <Button label="Agent: attempt a 3× long" onPress={propose(30000)} disabled={busy} />
                <Button label="Agent: a 1.5× long" variant="ghost" onPress={propose(15000)} disabled={busy} />
                {mandateMsg && (
                  <Text style={mandateMsg.refused ? styles.refused : styles.allowed}>{mandateMsg.text}</Text>
                )}
              </View>
            )}

            {terms && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Create your own mandate</Text>
                <Text style={styles.muted}>Set your limits and deploy a mandate you own, on-chain.</Text>
                <View style={styles.inputRow}>
                  <Field label="Max lev ×" value={myLev} onChange={setMyLev} />
                  <Field label="Max slip %" value={mySlip} onChange={setMySlip} />
                  <Field label="Hedge %" value={myDd} onChange={setMyDd} />
                </View>
                <Button label="Deploy my mandate" onPress={deployMine} disabled={busy} />
                {myMandate && <Text style={styles.allowed}>✓ Live at {myMandate.slice(0, 10)}… — you own it.</Text>}
              </View>
            )}

            {decisions.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Agent activity</Text>
                <Text style={styles.muted}>Every decision your agent makes — recorded on-chain.</Text>
                {decisions.map((d) => (
                  <View key={d.seq} style={styles.decisionRow}>
                    <Text style={styles.decisionSeq}>#{d.seq}</Text>
                    <Text style={styles.decisionText}>
                      {d.acted
                        ? `${d.action} · ${d.leverageX.toFixed(2)}× · ${d.slippagePct}%`
                        : `Abstained — ${d.reason}`}
                    </Text>
                  </View>
                ))}
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
              <Button label="Open BTC long" onPress={trade} disabled={busy || !accountReady} />
            </View>

            {portfolio && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Portfolio</Text>
                <Text style={styles.balance}>{portfolio.accountValue.toFixed(2)} <Text style={styles.ausd}>AUSD</Text></Text>
                <Text style={styles.muted}>
                  Realized PnL {portfolio.realizedPnl >= 0 ? "+" : ""}{portfolio.realizedPnl.toFixed(2)} AUSD · Volume {portfolio.volume.toFixed(0)} · {portfolio.openPositions} open position{portfolio.openPositions === 1 ? "" : "s"}
                </Text>
              </View>
            )}
          </>
        )}

        {busy && <ActivityIndicator style={{ marginTop: 16 }} color="#7C9CFF" />}
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </ScrollView>
    </View>
  );
}

function Button({ label, onPress, disabled, variant }: { label: string; onPress: () => void; disabled?: boolean; variant?: "ghost" }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        variant === "ghost" && styles.btnGhost,
        (disabled || pressed) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.btnText, variant === "ghost" && styles.btnGhostText]}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0D12" },
  container: { padding: 24, paddingTop: 72, gap: 16 },
  brand: { color: "#F5F7FF", fontSize: 28, fontWeight: "800", letterSpacing: 2 },
  tagline: { color: "#8A93A6", fontSize: 15, marginBottom: 12 },
  card: { backgroundColor: "#141822", borderRadius: 16, padding: 20, gap: 12, borderWidth: 1, borderColor: "#1F2533" },
  cardTitle: { color: "#F5F7FF", fontSize: 18, fontWeight: "700" },
  muted: { color: "#8A93A6", fontSize: 14 },
  warn: { color: "#E8B04B", fontSize: 14 },
  mono: { color: "#AEB6C7", fontFamily: "monospace", fontSize: 14 },
  balance: { color: "#F5F7FF", fontSize: 40, fontWeight: "800" },
  ausd: { color: "#7C9CFF", fontSize: 20, fontWeight: "700" },
  btn: { backgroundColor: "#3B61FF", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#2A3142" },
  btnGhostText: { color: "#AEB6C7" },
  status: { color: "#AEB6C7", fontSize: 14, marginTop: 16, textAlign: "center" },
  refused: { color: "#FF6B6B", fontSize: 15, fontWeight: "700" },
  allowed: { color: "#5BD6A0", fontSize: 15, fontWeight: "700" },
  decisionRow: { flexDirection: "row", gap: 10, alignItems: "baseline" },
  decisionSeq: { color: "#5A6478", fontFamily: "monospace", fontSize: 12, width: 28 },
  decisionText: { color: "#AEB6C7", fontSize: 14, flex: 1 },
  inputRow: { flexDirection: "row", gap: 10 },
  field: { flex: 1, gap: 4 },
  fieldLabel: { color: "#8A93A6", fontSize: 12 },
  input: { backgroundColor: "#0B0D12", borderWidth: 1, borderColor: "#2A3142", borderRadius: 10, color: "#F5F7FF", paddingVertical: 10, paddingHorizontal: 12, fontSize: 16 },
});
