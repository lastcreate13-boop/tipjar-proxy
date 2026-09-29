const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

// ========================================================
// CACHE
// ========================================================

const cache = new Map();

const CACHE_TIME = 5 * 60 * 1000;

// ========================================================
// ROBLOX JSON
// ========================================================

async function getJSON(url, options = {}) {

    const response = await fetch(url, {
        ...options,

        headers: {
            "User-Agent": "TipJarProxy/1.0",
            ...(options.headers || {})
        }
    });

    if (!response.ok) {

        throw new Error(
            `Roblox HTTP ${response.status}`
        );

    }

    return await response.json();
}

// ========================================================
// USERNAME → USER ID
// ========================================================

async function getUser(username) {

    const data = await getJSON(
        "https://users.roblox.com/v1/usernames/users",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                usernames: [username],

                excludeBannedUsers: false

            })
        }
    );

    if (
        !data.data ||
        !data.data[0]
    ) {

        return null;

    }

    return data.data[0];
}

// ========================================================
// GET USER GAMES
// ========================================================

async function getGames(userId) {

    const games = [];

    let cursor = "";

    do {

        let url =
            `https://games.roblox.com/v2/users/${userId}/games` +
            `?accessFilter=Public` +
            `&sortOrder=Asc` +
            `&limit=50`;

        if (cursor) {

            url +=
                "&cursor=" +
                encodeURIComponent(cursor);

        }

        const data =
            await getJSON(url);

        if (Array.isArray(data.data)) {

            for (const game of data.data) {

                if (game.id) {

                    games.push({

                        id: Number(game.id),

                        name:
                            game.name ||
                            "Unknown Game"

                    });

                }

            }

        }

        cursor =
            data.nextPageCursor || "";

    } while (cursor);

    return games;
}

// ========================================================
// GET GAMEPASSES
// ========================================================

async function getGamepasses(universeId) {

    const passes = [];

    let token = "";

    do {

        let url =
            `https://apis.roblox.com/game-passes/v1/universes/${universeId}/game-passes` +
            `?passView=Full` +
            `&pageSize=100`;

        if (token) {

            url +=
                "&pageToken=" +
                encodeURIComponent(token);

        }

        const data =
            await getJSON(url);

        if (Array.isArray(data.gamePasses)) {

            for (const pass of data.gamePasses) {

                const price =
                    Number(pass.price || 0);

                if (
                    pass.id &&
                    price > 0
                ) {

                    passes.push({

                        id: Number(pass.id),

                        name:
                            pass.name ||
                            pass.displayName ||
                            "GamePass",

                        price: price,

                        universeId:
                            Number(universeId)

                    });

                }

            }

        }

        token =
            data.nextPageToken || "";

    } while (token);

    return passes;
}

// ========================================================
// MAIN API
// ========================================================

app.get(
    "/api/gamepasses",
    async (req, res) => {

        try {

            const username =
                String(
                    req.query.username || ""
                ).trim();

            if (!username) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Username is required"

                });

            }

            // ============================================
            // USER
            // ============================================

            const user =
                await getUser(username);

            if (!user) {

                return res.status(404).json({

                    success: false,

                    error:
                        "User not found"

                });

            }

            const userId =
                Number(user.id);

            // ============================================
            // CACHE
            // ============================================

            const old =
                cache.get(userId);

            if (
                old &&
                Date.now() - old.time <
                CACHE_TIME
            ) {

                return res.json({

                    success: true,

                    user: user,

                    games: old.games,

                    passes: old.passes,

                    cached: true

                });

            }

            // ============================================
            // GAMES
            // ============================================

            const games =
                await getGames(userId);

            const allPasses = [];

            // ============================================
            // PASS SEARCH
            // ============================================

            for (const game of games) {

                try {

                    const passes =
                        await getGamepasses(
                            game.id
                        );

                    for (const pass of passes) {

                        allPasses.push({

                            ...pass,

                            gameName:
                                game.name

                        });

                    }

                } catch (err) {

                    console.log(
                        "GamePass error:",
                        game.id,
                        err.message
                    );

                }

            }

            // ============================================
            // REMOVE DUPLICATES
            // ============================================

            const unique =
                new Map();

            for (const pass of allPasses) {

                if (
                    !unique.has(pass.id)
                ) {

                    unique.set(
                        pass.id,
                        pass
                    );

                }

            }

            const passes =
                Array.from(
                    unique.values()
                );

            // ============================================
            // SORT PRICE
            // ============================================

            passes.sort(
                (a, b) =>
                    a.price - b.price
            );

            // ============================================
            // SAVE CACHE
            // ============================================

            cache.set(
                userId,
                {

                    time: Date.now(),

                    games: games.length,

                    passes: passes

                }
            );

            // ============================================
            // RESPONSE
            // ============================================

            return res.json({

                success: true,

                user: user,

                games: games.length,

                passes: passes,

                cached: false

            });

        } catch (error) {

            console.error(
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    "Failed to get GamePasses"

            });

        }

    }
);

// ========================================================
// TEST PAGE
// ========================================================

app.get("/", (req, res) => {

    res.send(
        "Tip Jar GamePass Proxy is ONLINE!"
    );

});

// ========================================================
// START
// ========================================================

app.listen(
    PORT,
    () => {

        console.log(
            `Server running on port ${PORT}`
        );

    }
);
