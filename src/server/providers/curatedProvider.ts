import type { Anime, Episode } from "../../shared/anime.js";

function makeEpisodes(animeId: string, count: number): Episode[] {
  return Array.from({ length: count }, (_, idx) => {
    const number = idx + 1;
    const id = `${animeId}-ep-${number}`;
    return {
      id,
      animeId,
      number,
      title: `Episode ${number}`,
      durationMinutes: 24,
      playbackOptions: [],
    };
  });
}

export const CURATED_ANIME_CATALOG: Anime[] = [
  {
    id: "frieren-beyond-journeys-end",
    slug: "sousou-no-frieren",
    malId: 52991,
    anilistId: 154587,
    sourceProvider: "curated",
    title: {
      romaji: "Sousou no Frieren",
      english: "Frieren: Beyond Journey's End",
      native: "葬送のフリーレン",
    },
    synopsis:
      "Setelah mengalahkan Raja Iblis bersama kelompok pahlawannya, penyihir elf Frieren menempuh perjalanan baru untuk memahami makna kehidupan dan waktu bersama manusia.",
    status: "FINISHED",
    seasonYear: 2026,
    season: "FALL",
    score: 9.4,
    genres: ["Adventure", "Drama", "Fantasy"],
    studio: "Madhouse",
    artwork: {
      motif: "ridgelines",
      primaryHue: 195,
      posterUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-qQTzQnEJJ3oB.jpg",
      backdropUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587-ivXNJ23SM1xB.jpg",
    },
    episodes: makeEpisodes("frieren-beyond-journeys-end", 12),
  },
  {
    id: "dandadan",
    slug: "dandadan",
    malId: 57334,
    anilistId: 171018,
    sourceProvider: "curated",
    title: {
      romaji: "Dandadan",
      english: "DAN DA DAN",
      native: "ダンダダン",
    },
    synopsis:
      "Momo yang percaya pada hantu dan Okarun yang terobsesi dengan alien bertaruh untuk membuktikan keyakinan masing-masing hingga terseret ke dalam pertempuran supranatural.",
    status: "RELEASING",
    seasonYear: 2026,
    season: "FALL",
    score: 8.8,
    genres: ["Action", "Comedy", "Sci-Fi", "Supernatural"],
    studio: "Science SARU",
    artwork: {
      motif: "slash",
      primaryHue: 84,
      posterUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx171018-60q1B6GK2Ghb.jpg",
      backdropUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/171018-SpwPNAduszXl.jpg",
    },
    episodes: makeEpisodes("dandadan", 12),
  },
  {
    id: "kusuriya-no-hitorigoto",
    slug: "kusuriya-no-hitorigoto",
    malId: 54492,
    anilistId: 161645,
    sourceProvider: "curated",
    title: {
      romaji: "Kusuriya no Hitorigoto",
      english: "The Apothecary Diaries",
      native: "薬屋のひとりごと",
    },
    synopsis:
      "Maomao, seorang peracik obat muda dari distrik lampu merah, menggunakan kecerdasan medisnya untuk memecahkan berbagai misteri intrik di dalam istana kekaisaran.",
    status: "FINISHED",
    seasonYear: 2026,
    season: "FALL",
    score: 9.0,
    genres: ["Drama", "Mystery"],
    studio: "OLM",
    artwork: {
      motif: "sun",
      primaryHue: 140,
      posterUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx161645-QLbzHXiYRgV2.jpg",
      backdropUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/161645-oqzTZYIvviWI.jpg",
    },
    episodes: makeEpisodes("kusuriya-no-hitorigoto", 12),
  },
  {
    id: "dungeon-meshi",
    slug: "dungeon-meshi",
    malId: 52701,
    anilistId: 153518,
    sourceProvider: "curated",
    title: {
      romaji: "Dungeon Meshi",
      english: "Delicious in Dungeon",
      native: "ダンジョン飯",
    },
    synopsis:
      "Demi menyelamatkan adiknya dari perut naga merah sebelum dicerna, Laios dan timnya bertahan hidup di dalam labirin dengan memasak para monster yang mereka kalahkan.",
    status: "FINISHED",
    seasonYear: 2026,
    season: "FALL",
    score: 8.7,
    genres: ["Adventure", "Comedy", "Fantasy"],
    studio: "Trigger",
    artwork: {
      motif: "waves",
      primaryHue: 45,
      posterUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx153518-IVXPDY5ph3kO.jpg",
      backdropUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/153518-7uRvV7SLqmHV.jpg",
    },
    episodes: makeEpisodes("dungeon-meshi", 12),
  },
  {
    id: "jujutsu-kaisen",
    slug: "jujutsu-kaisen",
    malId: 40748,
    anilistId: 113415,
    sourceProvider: "curated",
    title: {
      romaji: "Jujutsu Kaisen",
      english: "JUJUTSU KAISEN",
      native: "呪術廻戦",
    },
    synopsis:
      "Yuji Itadori menelan jari kutukan tingkat tinggi demi menyelamatkan teman-temannya dan bergabung dengan Sekolah Tinggi Jujutsu Tokyo.",
    status: "FINISHED",
    seasonYear: 2026,
    season: "FALL",
    score: 8.8,
    genres: ["Action", "Drama", "Supernatural"],
    studio: "MAPPA",
    artwork: {
      motif: "slash",
      primaryHue: 220,
      posterUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415-LHBAeoZDIsnF.jpg",
      backdropUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/113415-jQBSkxWAAk83.jpg",
    },
    episodes: makeEpisodes("jujutsu-kaisen", 12),
  },
  {
    id: "chainsaw-man",
    slug: "chainsaw-man",
    malId: 44511,
    anilistId: 127230,
    sourceProvider: "curated",
    title: {
      romaji: "Chainsaw Man",
      english: "Chainsaw Man",
      native: "チェンソーマン",
    },
    synopsis:
      "Denji menyatu dengan iblis gergaji peliharaannya, Pochita, dan direkrut menjadi pemburu iblis keselamatan publik di Tokyo.",
    status: "FINISHED",
    seasonYear: 2026,
    season: "FALL",
    score: 8.6,
    genres: ["Action", "Horror", "Supernatural"],
    studio: "MAPPA",
    artwork: {
      motif: "slash",
      primaryHue: 15,
      posterUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx127230-DdP4vAdssLoz.png",
      backdropUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/127230-o8IRwCGVr9KW.jpg",
    },
    episodes: makeEpisodes("chainsaw-man", 12),
  },
  {
    id: "demon-slayer",
    slug: "kimetsu-no-yaiba",
    malId: 38000,
    anilistId: 101922,
    sourceProvider: "curated",
    title: {
      romaji: "Kimetsu no Yaiba",
      english: "Demon Slayer: Kimetsu no Yaiba",
      native: "鬼滅の刃",
    },
    synopsis:
      "Setelah keluarganya dibantai oleh iblis dan adik perempuannya Nezuko berubah menjadi iblis, Tanjiro Kamado memulai perjalanan untuk membalas dendam dan menyembuhkan adiknya.",
    status: "FINISHED",
    seasonYear: 2026,
    season: "SPRING",
    score: 8.9,
    genres: ["Action", "Fantasy", "Supernatural"],
    studio: "ufotable",
    artwork: {
      motif: "waves",
      primaryHue: 170,
      posterUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-WBsBl0ClmgYL.jpg",
      backdropUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/101922-33MtJGsUSxga.jpg",
    },
    episodes: makeEpisodes("demon-slayer", 12),
  },
  {
    id: "attack-on-titan",
    slug: "shingeki-no-kyojin",
    malId: 16498,
    anilistId: 16498,
    sourceProvider: "curated",
    title: {
      romaji: "Shingeki no Kyojin",
      english: "Attack on Titan",
      native: "進撃の巨人",
    },
    synopsis:
      "Setelah kampung halamannya dihancurkan dan ibunya tewas, Eren Jaeger bersumpah untuk membersihkan bumi dari para Titan raksasa pemakan manusia.",
    status: "FINISHED",
    seasonYear: 2026,
    season: "SPRING",
    score: 9.1,
    genres: ["Action", "Drama", "Fantasy", "Mystery"],
    studio: "WIT Studio",
    artwork: {
      motif: "slash",
      primaryHue: 30,
      posterUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-buvcRTBx4NSm.jpg",
      backdropUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg",
    },
    episodes: makeEpisodes("attack-on-titan", 12),
  },
  {
    id: "oshi-no-ko",
    slug: "oshi-no-ko",
    malId: 52034,
    anilistId: 150672,
    sourceProvider: "curated",
    title: {
      romaji: "Oshi no Ko",
      english: "[Oshi No Ko]",
      native: "【推しの子】",
    },
    synopsis:
      "Dua anak kembar yang terlahir kembali sebagai anak seorang idola legendaris terjun ke dalam gemerlap dan sisi kelam industri hiburan Jepang.",
    status: "FINISHED",
    seasonYear: 2026,
    season: "SPRING",
    score: 8.8,
    genres: ["Drama", "Mystery", "Supernatural"],
    studio: "Doga Kobo",
    artwork: {
      motif: "sun",
      primaryHue: 310,
      posterUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx150672-WqmmwZ4nMzAy.png",
      backdropUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/150672-ISwoA0eS722H.jpg",
    },
    episodes: makeEpisodes("oshi-no-ko", 12),
  },
  {
    id: "solo-leveling",
    slug: "solo-leveling",
    malId: 52299,
    anilistId: 151807,
    sourceProvider: "curated",
    title: {
      romaji: "Ore dake Level Up na Ken",
      english: "Solo Leveling",
      native: "俺だけレベルアップな件",
    },
    synopsis:
      "Di dunia di mana para pemburu melawan monster mematikan, Sung Jinwoo yang merupakan pemburu terlemah terpilih menerima kekuatan sistem misterius tanpa batas.",
    status: "FINISHED",
    seasonYear: 2026,
    season: "WINTER",
    score: 8.7,
    genres: ["Action", "Adventure", "Fantasy"],
    studio: "A-1 Pictures",
    artwork: {
      motif: "slash",
      primaryHue: 250,
      posterUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-it355ZgzquUd.png",
      backdropUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/151807-37yfQA3ym8PA.jpg",
    },
    episodes: makeEpisodes("solo-leveling", 12),
  },
  {
    id: "bocchi-the-rock",
    slug: "bocchi-the-rock",
    malId: 47917,
    anilistId: 130003,
    sourceProvider: "curated",
    title: {
      romaji: "Bocchi the Rock!",
      english: "BOCCHI THE ROCK!",
      native: "ぼっち・ざ・ろっく！",
    },
    synopsis:
      "Hitori Gotoh, gadis pemalu dengan kecemasan sosial yang mahir bermain gitar, diajak bergabung ke dalam grup Kessoku Band dan perlahan membuka dirinya.",
    status: "FINISHED",
    seasonYear: 2026,
    season: "FALL",
    score: 8.9,
    genres: ["Comedy", "Music"],
    studio: "CloverWorks",
    artwork: {
      motif: "waves",
      primaryHue: 340,
      posterUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx130003-HTDmeL4RGeJ4.png",
      backdropUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/130003-5F90a7BtsPQN.jpg",
    },
    episodes: makeEpisodes("bocchi-the-rock", 12),
  },
  {
    id: "spy-x-family",
    slug: "spy-x-family",
    malId: 50273,
    anilistId: 140960,
    sourceProvider: "curated",
    title: {
      romaji: "SPY×FAMILY",
      english: "SPY x FAMILY",
      native: "SPY×FAMILY",
    },
    synopsis:
      "Seorang mata-mata ulung, pembunuh bayaran rahasia, dan anak perempuan cenayang membentuk keluarga palsu demi menjaga perdamaian dunia.",
    status: "FINISHED",
    seasonYear: 2026,
    season: "SPRING",
    score: 8.7,
    genres: ["Action", "Comedy"],
    studio: "WIT Studio · CloverWorks",
    artwork: {
      motif: "sun",
      primaryHue: 120,
      posterUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx140960-Kb6R5nYQfjmP.jpg",
      backdropUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/140960-Z7xSvkRxHKfj.jpg",
    },
    episodes: makeEpisodes("spy-x-family", 12),
  },
  {
    id: "kanojo-ga-koushaku-tei-ni-itta-riyuu",
    slug: "kanojo-ga-koushaku-tei-ni-itta-riyuu",
    malId: 52308,
    anilistId: 151847,
    sourceProvider: "curated",
    title: {
      romaji: "Kanojo ga Koushaku-tei ni Itta Riyuu",
      english: "Why Raeliana Ended Up at the Duke's Mansion",
      native: "彼女が公爵邸に行った理由",
    },
    synopsis:
      "Setelah kematian misteriusnya, Park Eunha terlahir kembali sebagai Raeliana McMillan, karakter novel yang ditakdirkan dibunuh tunangannya sendiri. Demi mengubah takdir kelam itu, ia membuat kesepakatan rahasia dengan Duke Noah Wynknight.",
    status: "FINISHED",
    seasonYear: 2023,
    season: "SPRING",
    score: 7.4,
    genres: ["Isekai", "Romance", "Comedy", "Fantasy", "Mystery"],
    studio: "TYPHOON GRAPHICS",
    artwork: {
      motif: "sun",
      primaryHue: 280,
      posterUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151847-OnTYbvb4y4mp.jpg",
      backdropUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/151847-S1pTlfRY2DqB.jpg",
    },
    episodes: makeEpisodes("kanojo-ga-koushaku-tei-ni-itta-riyuu", 12),
  },
  {
    id: "otome-game-hametsu-flag",
    slug: "otome-game-no-hametsu-flag",
    malId: 38555,
    anilistId: 104647,
    sourceProvider: "curated",
    title: {
      romaji: "Otome Game no Hametsu Flag shika Nai Akuyaku Reijou ni Tensei shiteshimatta...",
      english: "My Next Life as a Villainess: All Routes Lead to Doom!",
      native: "乙女ゲームの破滅フラグしかない悪役令嬢に転生してしまった…",
    },
    synopsis:
      "Katarina Claes, putri bangsawan muda, tersadar bahwa dirinya bereinkarnasi sebagai tokoh antagonis utama dalam game otome kesukaannya yang hanya memiliki akhir pengasingan atau kematian. Ia pun berusaha sekuat tenaga menghindari semua bendera kehancuran tersebut.",
    status: "FINISHED",
    seasonYear: 2020,
    season: "SPRING",
    score: 7.3,
    genres: ["Isekai", "Romance", "Comedy", "Fantasy", "Slice of Life"],
    studio: "SILVER LINK.",
    artwork: {
      motif: "waves",
      primaryHue: 110,
      posterUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx104647-dMGZSavRxHcM.jpg",
      backdropUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/104647-emIYPiyZZJnl.jpg",
    },
    episodes: makeEpisodes("otome-game-hametsu-flag", 12),
  },
];
