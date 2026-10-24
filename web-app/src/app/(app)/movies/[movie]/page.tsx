import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MovieDetails } from "@/components/screens/movie-details";
import { MOVIES, movieBySlug } from "@/lib/data";

export function generateStaticParams() {
  return MOVIES.map((m) => ({ movie: m.slug }));
}

export async function generateMetadata({ params }: PageProps<"/movies/[movie]">): Promise<Metadata> {
  const movie = movieBySlug((await params).movie);
  return { title: movie?.title, description: movie?.overview };
}

export default async function MoviePage({ params }: PageProps<"/movies/[movie]">) {
  const movie = movieBySlug((await params).movie);
  if (!movie) notFound();
  return <MovieDetails movieId={movie.id} />;
}
