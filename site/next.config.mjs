/** @type {import('next').NextConfig} */

// The Android build lives in Vercel Blob (public). The on-domain /charter-android.apk path
// redirects to it, so the download link stays on our domain and the file is swappable here.
const APK_BLOB_URL = 'https://b7evlww1d4pfkopr.public.blob.vercel-storage.com/charter-v0.3.0.apk'

const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [{ source: '/charter-android.apk', destination: APK_BLOB_URL, permanent: false }]
  },
}
export default nextConfig
