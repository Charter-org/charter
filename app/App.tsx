import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { signIn, signUp, type Wallet } from "./lib/wallet";
import { ausdBalance } from "./lib/tokens";
import { ensureExchangeAccount, openLong } from "./lib/trade";
import { PERPL, rawToUsd } from "./lib/perpl";

const MIN_AUSD = rawToUsd(PERPL.minAccountOpen); // 100

export default function App() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setStatus(label + "…");
    try {
      await fn();
    } catch (e: any) {
      setStatus("⚠ " + (e?.message ?? String(e)));
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

  const setupTrading = () =>
    run("Opening your Perpl account", async () => {
      if (!wallet) return;
      await ensureExchangeAccount(wallet);
      setAccountReady(true);
      setStatus("Trading account ready.");
    });

  const trade = () =>
    run("Opening BTC long on Perpl", async () => {
      if (!wallet) return;
      const tx = await openLong(wallet, { marketId: PERPL.marketIds.BTC, sizeScaled: 10 });
      setStatus("✓ Long opened on Perpl · tx " + tx.slice(0, 10) + "…");
      await refreshBalance(wallet);
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
              <Text style={styles.mono}>{short(wallet.address)}</Text>
              <Text style={styles.balance}>{balance ?? "—"} <Text style={styles.ausd}>AUSD</Text></Text>
              <Button label="Refresh" variant="ghost" onPress={() => run("Refreshing", () => refreshBalance(wallet))} disabled={busy} />
            </View>

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

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

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
});
