/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [],
  },
  // Route handler body size limits (App Router)
  // serverActions bodySizeLimit only applies to Server Actions, NOT route handlers
  // For route handlers, we handle size in the routes themselves
};

export default nextConfig;
