import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Movie posters and backdrops referenced by movie.poster_path / backdrop_path.
    remotePatterns: [new URL("https://image.tmdb.org/t/p/**")],
    // A TMDB image never changes at a given path, so keep resized copies for
    // 30 days instead of the default 4 hours.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
