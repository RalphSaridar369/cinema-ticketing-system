import fs from "fs/promises";
import "dotenv/config";

const API_TOKEN = process.env.TMDB_API_TOKEN;

interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
}

interface TMDBResponse {
  page: number;
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
}

async function fetchMovies(
  numberOfMovies: number,
  outputFile: string = "data/movies.json"
): Promise<TMDBMovie[]> {
  if (!API_TOKEN) {
    throw new Error("TMDB_API_TOKEN is not defined");
  }

  const movies: TMDBMovie[] = [];

  // TMDB returns 20 movies per page
  const pages = Math.ceil(numberOfMovies / 20);

  for (let page = 1; page <= pages; page++) {
    console.log(`Fetching page ${page}/${pages}...`);

    const response = await fetch(
      `https://api.themoviedb.org/3/discover/movie?include_adult=false&include_video=false&language=en-US&page=${page}&sort_by=popularity.desc`,
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `TMDB request failed on page ${page}: ${response.status} ${response.statusText}`
      );
    }

    const data: TMDBResponse = await response.json();

    movies.push(...data.results);
  }

  // In case numberOfMovies isn't a multiple of 20
  const selectedMovies = movies.slice(0, numberOfMovies);

  await fs.writeFile(
    outputFile,
    JSON.stringify(selectedMovies, null, 2),
    "utf-8"
  );

  console.log(
    `Finished! Saved ${selectedMovies.length} movies to ${outputFile}`
  );

  return selectedMovies;
}

fetchMovies(1000);
