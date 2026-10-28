"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { posterUrl, useFeatured, type Featured } from "@/lib/catalog";

// Each sign-in screen takes its own slot in the shuffled list, so moving
// between them shows a different movie.
const SCREENS = ["/login", "/register", "/forgot-password", "/reset-password"];

// Sign-in key art: the backdrop of a popular movie playing in the next day.
// The panel stays empty until the image has loaded, then fades it in while
// sliding it up.
export function AuthArt() {
  const featured = useFeatured().data;
  const path = usePathname();
  if (!featured?.length) return null;
  const movie = featured[Math.max(0, SCREENS.indexOf(path)) % featured.length];
  // Keyed so a new screen's image starts hidden and fades in again.
  return <Art key={movie.backdrop} movie={movie} />;
}

function Art({ movie }: { movie: Featured }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className={`absolute inset-0 transition-[opacity,translate] duration-700 ease-out ${loaded ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}
    >
      {/* Lazy, not preloaded: phones hide this panel, and a lazy image there is never fetched. */}
      <Image
        src={posterUrl(movie.backdrop, "w1280")}
        alt=""
        fill
        fetchPriority="high"
        sizes="(min-width: 768px) 55vw, 100vw"
        onLoad={() => setLoaded(true)}
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-bg from-10% via-bg/50 via-40% to-transparent to-75%" />
      <span className="absolute left-6 top-6 rounded-md bg-scrim px-2.5 py-1 font-mono text-[11px] text-white backdrop-blur-md">
        NOW SHOWING · {movie.title.toUpperCase()}
      </span>
    </div>
  );
}
