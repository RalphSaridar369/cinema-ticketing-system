import { SavedMovies } from "@/components/screens/saved-movies";

export function generateStaticParams() {
  return [{ list: "favorites" }, { list: "watchlist" }];
}

export default async function SavedPage({ params }: PageProps<"/profile/[list]">) {
  const { list } = await params;
  return <SavedMovies list={list === "favorites" ? "favorites" : "watchlist"} />;
}
