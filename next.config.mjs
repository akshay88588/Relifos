/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ESLint stays off during builds (style rules should not block a deploy),
  // but type errors MUST fail the build - that is the check which catches real
  // bugs, and a pre-demo commit is exactly when it matters most.
  eslint: {
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;
