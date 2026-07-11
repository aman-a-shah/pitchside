/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // three.js and its ecosystem ship ESM that Next can transpile directly.
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
  webpack: (config) => {
    // Allow importing .glsl/.vert/.frag as raw strings if we ever add them.
    config.module.rules.push({
      test: /\.(glsl|vert|frag)$/,
      type: 'asset/source',
    });
    return config;
  },
};

export default nextConfig;
