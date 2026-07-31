import JapaneseMusic from './JapaneseMusic.jsx'
import SeasonalAnime from './SeasonalAnime.jsx'

/** 番・音 under the media tools. 言 stays at the top on its own. */
export default function TodayShelf({ hidden = false }) {
  if (hidden) return null

  return (
    <section className="today-shelf" aria-label="今日の棚">
      <SeasonalAnime />
      <JapaneseMusic />
    </section>
  )
}
