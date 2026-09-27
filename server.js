const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

/* =========================
   MIDDLEWARE
========================= */

app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

/* =========================
   DATABASE
========================= */

const db = new sqlite3.Database("./database.db", (err) => {
    if (err) {
        console.error("Database connection error:", err.message);
    } else {
        console.log("Database connected");
    }
});

/* =========================
   USERS TABLE
========================= */

db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
`, (err) => {

    if (err) {
        console.error("Users table error:", err.message);
    } else {
        console.log("Users table ready");
    }

});

/* =========================
   ADD PROFILE COLUMNS
========================= */

db.run(
    `ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''`,
    (err) => {

        if (
            err &&
            !err.message.includes("duplicate column")
        ) {
            console.error(
                "Avatar column error:",
                err.message
            );
        }

    }
);

db.run(
    `ALTER TABLE users ADD COLUMN aboutMe TEXT DEFAULT ''`,
    (err) => {

        if (
            err &&
            !err.message.includes("duplicate column")
        ) {
            console.error(
                "AboutMe column error:",
                err.message
            );
        }

    }
);

/* =========================
   FRIEND REQUESTS TABLE
========================= */

db.run(`
    CREATE TABLE IF NOT EXISTS friend_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT NOT NULL,
        receiver TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        UNIQUE(sender, receiver)
    )
`, (err) => {

    if (err) {
        console.error(
            "Friend requests table error:",
            err.message
        );
    } else {
        console.log(
            "Friend requests table ready"
        );
    }

});

/* =========================
   PRIVATE MESSAGES TABLE
========================= */

db.run(`
    CREATE TABLE IF NOT EXISTS private_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT NOT NULL,
        receiver TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {

    if (err) {
        console.error(
            "Private messages table error:",
            err.message
        );
    } else {
        console.log(
            "Private messages table ready"
        );
    }

});

/* =========================
   ONLINE USERS
========================= */

const connectedUsers = new Map();

function sendOnlineUsers() {

    io.emit(
        "online users",
        Array.from(connectedUsers.keys())
    );

}

/* =========================
   SERVER STATUS
========================= */

app.get("/api/status", (req, res) => {

    res.json({
        message: "TeenConnect server is working!"
    });

});

/* =========================
   REGISTER
========================= */

app.post("/api/register", (req, res) => {

    const {
        username,
        password
    } = req.body;

    if (!username || !password) {

        return res.status(400).json({
            success: false,
            message: "Username and password are required"
        });

    }

    db.run(
        `
        INSERT INTO users
        (username, password)
        VALUES (?, ?)
        `,
        [username, password],

        function (err) {

            if (err) {

                if (
                    err.message.includes(
                        "UNIQUE constraint failed"
                    )
                ) {

                    return res.json({
                        success: false,
                        message: "Username already exists"
                    });

                }

                console.error(
                    "Registration error:",
                    err.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Registration failed"
                });

            }

            res.json({
                success: true,
                message: "Account created successfully!"
            });

        }
    );

});

/* =========================
   LOGIN
========================= */

app.post("/api/login", (req, res) => {

    const {
        username,
        password
    } = req.body;

    if (!username || !password) {

        return res.status(400).json({
            success: false,
            message: "Username and password are required"
        });

    }

    db.get(
        `
        SELECT *
        FROM users
        WHERE username = ?
        AND password = ?
        `,
        [username, password],

        (err, user) => {

            if (err) {

                console.error(
                    "Login error:",
                    err.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Login failed"
                });

            }

            if (!user) {

                return res.json({
                    success: false,
                    message: "Invalid username or password"
                });

            }

            res.json({
                success: true,
                message: "Login successful!",
                username: user.username
            });

        }
    );

});

/* =========================
   GET ALL USERS
========================= */

app.get("/api/users", (req, res) => {

    db.all(
        `
        SELECT
            id,
            username,
            avatar,
            aboutMe
        FROM users
        ORDER BY username ASC
        `,
        [],
        (err, users) => {

            if (err) {

                console.error(
                    "Users error:",
                    err.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Could not load users"
                });

            }

            res.json(users);

        }
    );

});

/* =========================
   GET PROFILE
========================= */

app.get(
    "/api/profile/:username",
    (req, res) => {

        const username =
            req.params.username;

        db.get(
            `
            SELECT
                id,
                username,
                avatar,
                aboutMe
            FROM users
            WHERE username = ?
            `,
            [username],

            (err, user) => {

                if (err) {

                    console.error(
                        "Profile error:",
                        err.message
                    );

                    return res.status(500).json({
                        success: false,
                        message: "Could not load profile"
                    });

                }

                if (!user) {

                    return res.status(404).json({
                        success: false,
                        message: "User not found"
                    });

                }

                res.json({
                    success: true,
                    id: user.id,
                    username: user.username,
                    avatar: user.avatar || "",
                    aboutMe: user.aboutMe || ""
                });

            }
        );

    }
);

/* =========================
   UPDATE PROFILE
========================= */

app.post(
    "/api/profile/update",
    (req, res) => {

        const {
            username,
            avatar,
            aboutMe
        } = req.body;

        if (!username) {

            return res.status(400).json({
                success: false,
                message: "Username is required"
            });

        }

        db.run(
            `
            UPDATE users
            SET avatar = ?,
                aboutMe = ?
            WHERE username = ?
            `,
            [
                avatar || "",
                aboutMe || "",
                username
            ],

            function (err) {

                if (err) {

                    console.error(
                        "Profile update error:",
                        err.message
                    );

                    return res.status(500).json({
                        success: false,
                        message: "Failed to update profile"
                    });

                }

                if (this.changes === 0) {

                    return res.status(404).json({
                        success: false,
                        message: "User not found"
                    });

                }

                res.json({
                    success: true,
                    message: "Profile updated successfully!"
                });

            }
        );

    }
);

/* =========================
   SEND FRIEND REQUEST
========================= */

app.post(
    "/api/friend-request",
    (req, res) => {

        const {
            sender,
            receiver
        } = req.body;

        if (!sender || !receiver) {

            return res.status(400).json({
                success: false,
                message: "Sender and receiver are required"
            });

        }

        if (sender === receiver) {

            return res.json({
                success: false,
                message: "You cannot add yourself"
            });

        }

        db.get(
            `
            SELECT *
            FROM friend_requests
            WHERE
                (
                    sender = ?
                    AND receiver = ?
                )
                OR
                (
                    sender = ?
                    AND receiver = ?
                )
            `,
            [
                sender,
                receiver,
                receiver,
                sender
            ],

            (err, existing) => {

                if (err) {

                    console.error(
                        "Friend request check error:",
                        err.message
                    );

                    return res.status(500).json({
                        success: false,
                        message: "Could not send request"
                    });

                }

                if (existing) {

                    if (
                        existing.status === "accepted"
                    ) {

                        return res.json({
                            success: false,
                            message: "You are already friends"
                        });

                    }

                    if (
                        existing.sender === receiver &&
                        existing.status === "pending"
                    ) {

                        return res.json({
                            success: false,
                            message:
                                "This user already sent you a friend request"
                        });

                    }

                    return res.json({
                        success: false,
                        message:
                            "Friend request already sent"
                    });

                }

                db.run(
                    `
                    INSERT INTO friend_requests
                    (sender, receiver, status)
                    VALUES (?, ?, 'pending')
                    `,
                    [
                        sender,
                        receiver
                    ],

                    function (err) {

                        if (err) {

                            console.error(
                                "Friend request error:",
                                err.message
                            );

                            return res.status(500).json({
                                success: false,
                                message:
                                    "Could not send friend request"
                            });

                        }

                        io.emit(
                            "friend request",
                            {
                                from: sender,
                                sender: sender,
                                receiver: receiver,
                                message:
                                    `${sender} sent you a friend request`
                            }
                        );

                        res.json({
                            success: true,
                            message:
                                "Friend request sent!",
                            id: this.lastID
                        });

                    }
                );

            }
        );

    }
);

/* =========================
   GET FRIEND REQUESTS
========================= */

app.get(
    "/api/friend-requests",
    (req, res) => {

        const username =
            req.query.username;

        if (!username) {

            return res.status(400).json({
                success: false,
                message: "Username is required"
            });

        }

        db.all(
            `
            SELECT *
            FROM friend_requests
            WHERE sender = ?
               OR receiver = ?
            ORDER BY id DESC
            `,
            [
                username,
                username
            ],

            (err, requests) => {

                if (err) {

                    console.error(
                        "Friend requests error:",
                        err.message
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Could not load friend requests"
                    });

                }

                res.json(requests);

            }
        );

    }
);

/* =========================
   ACCEPT FRIEND REQUEST
========================= */

app.post(
    "/api/friend-request/accept",
    (req, res) => {

        const {
            id
        } = req.body;

        if (!id) {

            return res.status(400).json({
                success: false,
                message: "Request ID is required"
            });

        }

        db.get(
            `
            SELECT *
            FROM friend_requests
            WHERE id = ?
            `,
            [id],

            (err, request) => {

                if (err) {

                    console.error(
                        "Accept request lookup error:",
                        err.message
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Could not accept request"
                    });

                }

                if (!request) {

                    return res.status(404).json({
                        success: false,
                        message:
                            "Friend request not found"
                    });

                }

                db.run(
                    `
                    UPDATE friend_requests
                    SET status = 'accepted'
                    WHERE id = ?
                    `,
                    [id],

                    function (err) {

                        if (err) {

                            console.error(
                                "Accept request error:",
                                err.message
                            );

                            return res.status(500).json({
                                success: false,
                                message:
                                    "Could not accept request"
                            });

                        }

                        io.emit(
                            "friend accepted",
                            {
                                from: request.receiver,
                                sender: request.sender,
                                receiver: request.receiver,
                                message:
                                    `${request.receiver} accepted ${request.sender}'s friend request`
                            }
                        );

                        res.json({
                            success: true,
                            message:
                                "Friend request accepted!"
                        });

                    }
                );

            }
        );

    }
);

/* =========================
   DECLINE FRIEND REQUEST
========================= */

app.post(
    "/api/friend-request/decline",
    (req, res) => {

        const {
            id
        } = req.body;

        if (!id) {

            return res.status(400).json({
                success: false,
                message: "Request ID is required"
            });

        }

        db.run(
            `
            DELETE FROM friend_requests
            WHERE id = ?
            `,
            [id],

            function (err) {

                if (err) {

                    console.error(
                        "Decline request error:",
                        err.message
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Could not decline request"
                    });

                }

                res.json({
                    success: true,
                    message:
                        "Friend request declined"
                });

            }
        );

    }
);

/* =========================
   GET FRIENDS
========================= */

app.get(
    "/api/friends",
    (req, res) => {

        const username =
            req.query.username;

        if (!username) {

            return res.status(400).json({
                success: false,
                message: "Username is required"
            });

        }

        db.all(
            `
            SELECT
                CASE
                    WHEN sender = ?
                    THEN receiver
                    ELSE sender
                END AS friend
            FROM friend_requests
            WHERE
                (
                    sender = ?
                    OR receiver = ?
                )
                AND status = 'accepted'
            `,
            [
                username,
                username,
                username
            ],

            (err, friends) => {

                if (err) {

                    console.error(
                        "Friends error:",
                        err.message
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Could not load friends"
                    });

                }

                res.json(friends);

            }
        );

    }
);

/* =========================
   PRIVATE MESSAGE HISTORY
========================= */

app.get(
    "/api/private-messages",
    (req, res) => {

        const {
            user1,
            user2
        } = req.query;

        if (!user1 || !user2) {

            return res.status(400).json({
                success: false,
                message:
                    "Two usernames are required"
            });

        }

        db.all(
            `
            SELECT
                id,
                sender,
                receiver,
                message,
                created_at
            FROM private_messages
            WHERE
                (
                    sender = ?
                    AND receiver = ?
                )
                OR
                (
                    sender = ?
                    AND receiver = ?
                )
            ORDER BY id ASC
            `,
            [
                user1,
                user2,
                user2,
                user1
            ],

            (err, messages) => {

                if (err) {

                    console.error(
                        "Private messages error:",
                        err.message
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Could not load messages"
                    });

                }

                res.json(messages);

            }
        );

    }
);

/* =========================
   SOCKET.IO
========================= */

io.on("connection", (socket) => {

    console.log(
        "A user connected:",
        socket.id
    );

    /* =====================
       REGISTER ONLINE USER
    ===================== */

    socket.on(
        "register user",
        (username) => {

            if (!username) {
                return;
            }

            connectedUsers.set(
                username,
                socket.id
            );

            console.log(
                `${username} is now ONLINE`
            );

            sendOnlineUsers();

        }
    );

    /* =====================
       PUBLIC CHAT
    ===================== */

    socket.on(
        "chat message",
        (data) => {

            io.emit(
                "chat message",
                data
            );

        }
    );

    /* =====================
       PRIVATE MESSAGE
    ===================== */

    socket.on(
        "private message",
        (data) => {

            const {
                from,
                to,
                message
            } = data;

            if (
                !from ||
                !to ||
                !message
            ) {
                return;
            }

            db.run(
                `
                INSERT INTO private_messages
                (sender, receiver, message)
                VALUES (?, ?, ?)
                `,
                [
                    from,
                    to,
                    message
                ],

                function (err) {

                    if (err) {

                        console.error(
                            "Private message save error:",
                            err.message
                        );

                        return;
                    }

                    io.emit(
                        "new private message",
                        {
                            from: from,
                            sender: from,
                            receiver: to,
                            message: message
                        }
                    );

                }
            );

        }
    );

    /* =====================
       DISCONNECT
    ===================== */

    socket.on(
        "disconnect",
        () => {

            for (
                const [username, socketId]
                of connectedUsers.entries()
            ) {

                if (
                    socketId === socket.id
                ) {

                    connectedUsers.delete(
                        username
                    );

                    console.log(
                        `${username} is now OFFLINE`
                    );

                    break;
                }

            }

            sendOnlineUsers();

            console.log(
                "User disconnected:",
                socket.id
            );

        }
    );

});

/* =========================
   START SERVER
========================= */

server.listen(
    PORT,
    () => {

        console.log(
            "================================="
        );

        console.log(
            " TeenConnect is running!"
        );

        console.log(
            " http://localhost:" + PORT
        );

        console.log(
            "================================="
        );

    }
);