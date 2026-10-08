// Passkey → EVM account via Mera. The private key is derived deterministically from the passkey PRF
// output (no stored secret), held in an in-memory signing session, and adapted to a viem account.
// Flow verified against Mera's React Native + viem recipes (docs at mera.category.xyz).
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  createSecp256k1SigningSession,
} from "@category-labs/mera";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";
import { toViemAccount } from "@category-labs/mera/viem";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";
import { createWalletClient, http, type LocalAccount, type WalletClient } from "viem";
import { monadTestnet } from "./tokens";

// The RP id is the HTTPS host the passkeys are scoped to; it MUST equal the domain that serves
// /.well-known/assetlinks.json (Android) — i.e. your Vercel deploy of ../../passkey-site. Change
// this string and the Vercel project name together.
export const RP = { id: "charter-passkeys.vercel.app", name: "Charter" } as const;
const EVM_PATH = "m/44'/60'/0'/0/0";

export interface Wallet {
  address: `0x${string}`;
  account: LocalAccount;
  client: WalletClient;
  credentialId: string;
  /** Zeroes the in-memory private key. Call on sign-out. */
  end: () => void;
}

function walletFromPrf(prfOutput: Uint8Array, credentialId: string): Wallet {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(EVM_PATH);
  if (!node.privateKey) throw new Error("HD derivation produced no key");
  const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  const account = toViemAccount(session);
  const client = createWalletClient({ account, chain: monadTestnet, transport: http() });
  return { address: account.address, account, client, credentialId, end: () => session.end() };
}

/** First run: create a passkey and derive the account. One Face ID / biometric prompt. */
export async function signUp(
  user = { name: "charter", displayName: "Charter" },
): Promise<Wallet> {
  const r = await createPasskeyWithPrfOutput({ rp: RP, user, webAuthnClient: reactNativeWebAuthnClient });
  return walletFromPrf(r.prfOutput, r.credentialId);
}

/** Returning user: assert the existing passkey and re-derive the same account. */
export async function signIn(): Promise<Wallet> {
  const r = await getPasskeyPrfOutput({ rpId: RP.id, webAuthnClient: reactNativeWebAuthnClient });
  return walletFromPrf(r.prfOutput, r.credentialId);
}
