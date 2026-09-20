import fs from "fs/promises";
import "dotenv/config";

const API_TOKEN = process.env.TMDB_API_TOKEN;

interface Genre {
  id: number;
  name: string;
}

interface TMDBGenreResponse {
  genres: Genre[];
}

async function fetchGenres(
  outputFile: string = "data/genres.json"
): Promise<Genre[]> {
    
  if (!API_TOKEN) {
    throw new Error("TMDB_API_TOKEN is not defined");
  }

  console.log("Fetching movie genres...");
  
  const response = await fetch(
    "https://api.themoviedb.org/3/genre/movie/list?language=en",
    {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        accept: "application/json",
      },
    }
  );

  if (!response.ok) {

    throw new Error(
      `TMDB request failed: ${response.status} ${response.statusText}`
    );

  }
  const data: TMDBGenreResponse = await response.json();

  await fs.writeFile(outputFile, JSON.stringify(data.genres, null, 2), "utf-8");

  console.log(`Finished! Saved ${data.genres.length} genres to ${outputFile}`);

  return data.genres;
}

fetchGenres();
