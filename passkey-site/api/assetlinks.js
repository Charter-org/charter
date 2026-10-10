// Serve assetlinks with EXACTLY `Content-Type: application/json` (no charset). Vercel's static
// handler appends `; charset=utf-8`, which GMS's on-device Digital Asset Links fetcher can reject
// during passkey RP-ID validation (while the lenient public assetlinks:check API accepts it).
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.statusCode = 200;
  res.end(
    JSON.stringify([
      {
        relation: ["delegate_permission/common.get_login_creds"],
        target: {
          namespace: "android_app",
          package_name: "xyz.charter.app",
          sha256_cert_fingerprints: [
            "5C:F3:94:74:A7:76:2E:54:97:65:A5:C4:F9:93:49:D0:2B:F0:BC:98:CA:C5:73:B7:B3:D2:9A:D3:0F:85:9A:8C",
          ],
        },
      },
    ]),
  );
}
