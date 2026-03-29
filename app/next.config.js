/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@zkmelabs/widget"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Solana / spl-token / web3.js use Buffer and Node crypto at runtime.
      // Webpack 5 no longer polyfills these automatically.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,  // use browser's SubtleCrypto (web3.js handles this)
        stream: false,
        buffer: require.resolve("buffer/"),
      };

      const webpack = require("webpack");
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
        }),
      );
    }
    return config;
  },
};

module.exports = nextConfig;
