export async function searchCard(name: string) {
  const res = await fetch(
    `https://www.pokemonpricetracker.com/api/v2/cards?search=${name}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.POKEMON_PRICE_TRACKER_API_KEY}`,
      },
    }
  );

  return res.json();
}
