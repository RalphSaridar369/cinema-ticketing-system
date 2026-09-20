import fs from "fs/promises";

interface Genre {
  id: number;
  name: string;
}

interface Movie {
  id: number;
  genre_ids: number[];
}

interface GenreMovies {
  id: number;
  name: string;
  movieIds: number[];
}

async function mapGenresToMovies(): Promise<void> {
  const [genresFile, moviesFile] = await Promise.all([
    fs.readFile("data/genres.json", "utf-8"),
    fs.readFile("data/movies.json", "utf-8"),
  ]);

  const genres: Genre[] = JSON.parse(genresFile);
  const movies: Movie[] = JSON.parse(moviesFile);

  const genreMovies: GenreMovies[] = genres.map((genre) => {
    const movieIds = movies
      .filter((movie) => movie.genre_ids.includes(genre.id))
      .map((movie) => movie.id);

    return {
      id: genre.id,
      name: genre.name,
      movieIds,
    };
  });

  await fs.writeFile(
    "data/genreMovies.json",
    JSON.stringify(genreMovies, null, 2),
    "utf-8"
  );

  console.log(
    `Finished! Saved ${genreMovies.length} genres to genreMovies.json`
  );
}

mapGenresToMovies();
