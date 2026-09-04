/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Both gates are enforced at build time. `npm run lint` currently reports zero
  // errors, so there is no reason to let a build through that lint would reject
  // — and a pre-demo commit is exactly when that safety net matters most.
  eslint: {
    ignoreDuringBuilds: false,
  },
};
export default nextConfig;
